import {
  validateFrameForRevision,
  validateResponseForRevision,
} from '../../client-contract/c1r1p2.ts';
import {
  C1R1Error,
  methodMetadata,
  type Method,
  type MethodMap,
  type CoreHelloVM,
  type Event,
  type ConnectionState,
} from '../../client-contract/c1r1p1/index.ts';
import type { ClientSession, ClientTransport, ConnectOptions, RequestOptions } from '../p1/types.ts';
import { isExtensionMethod, validateExternalApiFrame, validateExtensionResult } from '../../client-contract/external-api-1.ts';

type WireReply = { id?: string; result?: unknown; error?: { code: string; category?: string } };

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (ev: { data?: unknown }) => void): void;
}
export interface RemoteTransportOptions {
  url: string;
  /** 桌面端经 Electron Main 注入(含安全存储的 token);移动端浏览器可留空,靠 HttpOnly cookie 自动认证。 */
  token?: string;
  WebSocketImpl?: new (url: string) => WebSocketLike;
  requestTimeoutMs?: number;
}
const OPEN = 1;
/** REMOTE_CORE 客户端:一条 message 对应一条 C1/C1R1P2 帧;request id 关联、事件游标续读、
 * 变更不自动重放;断线后需上层重新 connect→initialize→catchup。 */
export class RemoteWebSocketTransport implements ClientTransport {
  private ws?: WebSocketLike;
  private session?: RemoteSession;
  constructor(private readonly options: RemoteTransportOptions) {}
  async connect(o: ConnectOptions): Promise<ClientSession> {
    await this.close();
    const Ctor = this.options.WebSocketImpl ?? (globalThis as unknown as { WebSocket: new (u: string) => WebSocketLike }).WebSocket;
    if (!Ctor) throw Error('WEBSOCKET_IMPL_UNAVAILABLE');
    const ws = new Ctor(this.options.url);
    this.ws = ws;
    const session = new RemoteSession(ws, this.options.token, this.options.requestTimeoutMs ?? 15000, o.clientId);
    this.session = session;
    await session.opened;
    const revision = o.contractRevision ?? 'C1R1P1';
    const hello = await session.rawRequest('system.initialize', {
      client_protocol: 'agentrouter-client/1',
      client_version: o.clientVersion,
      client_id: o.clientId,
      requested_mode: o.requestedMode,
      contract_revision: revision,
    }, revision) as CoreHelloVM;
    session.hello = hello;
    session.revision = hello.contractRevision ?? revision;
    session.observedCursor = hello.eventCursor;
    return session;
  }
  async close() {
    try { this.ws?.close(); } catch {}
    this.session = undefined;
    this.ws = undefined;
  }
}
class RemoteSession implements ClientSession {
  hello!: CoreHelloVM;
  revision: 'C1R1P1' | 'C1R1' | 'C1' | 'C1R1P2' = 'C1R1P1';
  observedCursor = 0;
  private seq = 0;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
  private listeners = new Set<(event: Event) => void>();
  readonly opened: Promise<void>;
  constructor(private readonly ws: WebSocketLike, private readonly token: string | undefined, private readonly timeoutMs: number, private readonly clientId: string) {
    this.opened = new Promise((resolve, reject) => {
      let attached = false;
      ws.addEventListener('open', () => {
        if (this.token) ws.send(JSON.stringify({ remote_token: this.token }));
        else { attached = true; resolve(); } // 移动端:cookie 认证,直接开始 initialize
      });
      ws.addEventListener('message', ev => {
        const text = typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data as ArrayBuffer).toString('utf8');
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          let frame: Record<string, unknown>;
          try { frame = JSON.parse(line); } catch { continue; }
          if (frame.attached === true) { attached = true; resolve(); continue; }
          if (frame.eventCursor !== undefined && frame.id === undefined) { this.observedCursor = Math.max(this.observedCursor, Number(frame.eventCursor)); this.dispatch(frame as unknown as Event); continue; }
          if (typeof frame.id === 'string') {
            const p = this.pending.get(frame.id);
            if (p) { this.pending.delete(frame.id); clearTimeout(p.timer); p.resolve(frame); }
            else this.dispatch(frame as unknown as Event);
          } else this.dispatch(frame as unknown as Event);
        }
      });
      ws.addEventListener('close', () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new C1R1Error('CONNECTION_LOST')); } this.pending.clear(); });
      ws.addEventListener('error', () => { if (!attached) reject(new C1R1Error('CONNECTION_LOST')); });
      setTimeout(() => { if (!attached) reject(new C1R1Error('REQUEST_TIMEOUT', 'AMBIGUOUS')); }, this.timeoutMs);
    });
  }
  private dispatch(event: Event) { for (const fn of this.listeners) fn(event); }
  connectionState(): ConnectionState { return this.ws.readyState === OPEN ? (this.hello?.connectionState ?? 'CONNECTED_OBSERVER') : 'DISCONNECTED'; }
  subscribe(fn: (event: Event) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  async rawRequest(method: string, params: unknown, revision = this.revision): Promise<unknown> {
    const id = 'r_' + ++this.seq + '_' + Math.random().toString(36).slice(2);
    const reply = await this.exchange(id, { v: 1, id, method, params }, revision, this.timeoutMs);
    if ('error' in reply && reply.error) throw Object.assign(new Error(reply.error.code), reply.error);
    if (isExtensionMethod(method)) { validateExtensionResult(method, reply.result); return reply.result; }
    validateFrameForRevision(reply, revision);
    if ('error' in reply && reply.error) throw Object.assign(new Error(reply.error.code), reply.error);
    const result = reply.result;
    validateResponseForRevision(method as Method, result, revision);
    return result;
  }
  async request<M extends Method>(method: M, params: MethodMap[M]['params'], opts: RequestOptions = {}): Promise<MethodMap[M]['result']> {
    const id = 'r_' + ++this.seq + '_' + Math.random().toString(36).slice(2);
    const extension = isExtensionMethod(method as string);
    const isMutation = !!methodMetadata[method]?.mutation;
    const frame: Record<string, unknown> = { v: 1, id, method, params };
    // 查询变体禁止附加字段;仅变更/扩展帧携带 client_id(+变更的 operation_id/expected_revision/scope)。
    if (isMutation || extension) frame.client_id = this.clientId;
    if (isMutation) {
      frame.operation_id = opts.operationId;
      frame.expected_revision = opts.expectedRevision;
      frame.scope = opts.scope ?? {};
    }
    if (opts.leaseId) frame.lease_id = opts.leaseId;
    if (extension) validateExternalApiFrame(frame as never);
    else validateFrameForRevision(frame, this.revision);
    const reply = await this.exchange(id, frame, this.revision, opts.timeoutMs ?? this.timeoutMs);
    if ('error' in reply && reply.error) throw Object.assign(new Error(reply.error.code), reply.error);
    if (extension) { validateExtensionResult(method as string, reply.result); return reply.result as MethodMap[M]['result']; }
    validateFrameForRevision(reply, this.revision);
    validateResponseForRevision(method, reply.result, this.revision);
    if (method === 'system.snapshot') this.observedCursor = Math.max(this.observedCursor, (reply.result as { cursor: number }).cursor);
    return reply.result as MethodMap[M]['result'];
  }
  private exchange(id: string, frame: Record<string, unknown>, _revision: string, timeoutMs: number): Promise<WireReply> {
    return new Promise<WireReply>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new C1R1Error('REQUEST_TIMEOUT', 'AMBIGUOUS')); }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.ws.send(JSON.stringify(frame) + '\n');
    });
  }
}
