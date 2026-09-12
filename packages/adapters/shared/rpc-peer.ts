import { randomUUID } from 'node:crypto';
import { JsonLfDecoder } from '../../platform/framing.ts';
export class NativeRpcError extends Error {
  constructor(
    readonly code: string,
    readonly sideEffects: 'none-proven' | 'possible',
  ) {
    super(code);
  }
}
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
export interface NativeRpcOptions {
  write: (bytes: Buffer) => Promise<void>;
  onNotification: (method: string, params: unknown) => void;
  onRequest?: (method: string, params: unknown) => Promise<unknown>;
  onDisconnect: (reason: string) => void;
  jsonrpc?: '2.0';
  timeoutMs?: number;
  maxPending?: number;
}
export interface NativeRpcRequestOptions {
  /** 业务轮可以合法超过控制 RPC 的 30 秒活性界；仅显式传入者放宽。 */
  timeoutMs?: number;
}
/** 仅协议传输；无重试、无账号读取、无进程启动、无资源停止证明。 */
export class NativeRpcPeer {
  private decoder = new JsonLfDecoder();
  private pending = new Map<string, Pending>();
  private reverse = new Map<string, { request: string; response: Promise<object> }>();
  private closed = false;
  private observerFailed = false;
  get disconnectObserverFailed() { return this.observerFailed; }
  private writing = false;
  private writeQueue: Buffer[] = [];
  constructor(private readonly options: NativeRpcOptions) {}
  request(method: string, params: unknown, opts?: NativeRpcRequestOptions): Promise<unknown> {
    if (this.closed) return Promise.reject(new NativeRpcError('RPC_CLOSED', 'none-proven'));
    if (this.pending.size >= (this.options.maxPending ?? 64))
      return Promise.reject(new NativeRpcError('RPC_PENDING_LIMIT', 'none-proven'));
    const id = randomUUID();
    let bytes: Buffer;
    try {
      bytes = this.encode({ id, method, params });
    } catch {
      return Promise.reject(new NativeRpcError('RPC_REQUEST_INVALID', 'none-proven'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.disconnect('RPC_TIMEOUT'),
        opts?.timeoutMs ?? this.options.timeoutMs ?? 30000,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.write(bytes);
    });
  }
  notify(method: string, params: unknown) {
    if (this.closed) throw new NativeRpcError('RPC_CLOSED', 'none-proven');
    this.write(this.encode({ method, params }));
  }
  accept(bytes: Buffer) {
    if (this.closed) return;
    try {
      for (const message of this.decoder.push(bytes)) this.message(message);
    } catch {
      this.disconnect('RPC_INVALID_FRAME');
    }
  }
  end() {
    try {
      this.decoder.end();
      this.disconnect('RPC_DISCONNECTED');
    } catch {
      this.disconnect('RPC_TRUNCATED_FRAME');
    }
  }
  disconnect(reason = 'RPC_DISCONNECTED') {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new NativeRpcError(reason, 'possible'));
    }
    this.writeQueue = [];
    this.pending.clear();
    this.reverse.clear();
    try {
      this.options.onDisconnect(reason);
    } catch {
      // Already closed with every pending operation rejected; never leak callback errors.
      this.observerFailed = true;
    }
  }
  private encode(value: object) {
    const text = JSON.stringify({
      ...(this.options.jsonrpc ? { jsonrpc: this.options.jsonrpc } : {}),
      ...value,
    });
    if (Buffer.byteLength(text) > 262144) throw Error('FRAME_LIMIT');
    return Buffer.from(text + '\n');
  }
  private write(bytes: Buffer) {
    if (this.closed) return;
    if (this.writeQueue.length >= 256) {
      this.disconnect('RPC_WRITE_QUEUE_LIMIT');
      return;
    }
    this.writeQueue.push(bytes);
    this.flush();
  }
  private flush() {
    if (this.closed || this.writing) return;
    const bytes = this.writeQueue.shift();
    if (!bytes) return;
    this.writing = true;
    try {
      void this.options.write(bytes).then(
        () => {
          this.writing = false;
          this.flush();
        },
        () => this.disconnect('RPC_WRITE_FAILED'),
      );
    } catch {
      this.disconnect('RPC_WRITE_FAILED');
    }
  }
  private message(message: Record<string, any>) {
    if (this.closed) return;
    if (this.options.jsonrpc && message.jsonrpc !== this.options.jsonrpc)
      throw Error('INVALID_VERSION');
    if ('method' in message && ('result' in message || 'error' in message))
      throw Error('MIXED_ENVELOPE');
    if (
      'error' in message &&
      (!message.error ||
        typeof message.error !== 'object' ||
        Array.isArray(message.error) ||
        typeof message.error.code !== 'number' ||
        typeof message.error.message !== 'string')
    )
      throw Error('INVALID_ERROR');
    if ('method' in message) {
      if (typeof message.method !== 'string' || !message.method) throw Error('INVALID_METHOD');
      if (!('id' in message)) {
        this.options.onNotification(message.method, message.params);
        return;
      }
      if (
        !['string', 'number'].includes(typeof message.id) ||
        (typeof message.id === 'number' && !Number.isSafeInteger(message.id))
      )
        throw Error('INVALID_ID');
      const key = typeof message.id + ':' + message.id;
      const request = JSON.stringify([message.method, message.params]);
      let entry = this.reverse.get(key);
      if (entry && entry.request !== request) throw Error('REVERSE_ID_CONFLICT');
      if (!entry) {
        // Bounded for the connection lifetime; reconnect never replays a tool request.
        if (this.reverse.size >= 256) throw Error('REVERSE_REQUEST_LIMIT');
        const response = Promise.resolve()
          .then(() => {
            if (this.closed || !this.options.onRequest) throw Error('DENIED');
            return this.options.onRequest(message.method, message.params);
          })
          .then(
            (result) => ({ id: message.id, result }),
            () => ({ id: message.id, error: { code: -32000, message: 'REQUEST_REJECTED' } }),
          );
        entry = { request, response };
        this.reverse.set(key, entry);
      }
      void entry.response.then((response) => {
        if (!this.closed) {
          try {
            this.write(this.encode(response));
          } catch {
            this.disconnect('RPC_RESPONSE_INVALID');
          }
        }
      });
      return;
    }
    if (typeof message.id !== 'string' || 'result' in message === 'error' in message)
      throw Error('INVALID_RESPONSE');
    const entry = this.pending.get(message.id);
    if (!entry) return; // Repeated native replies cannot produce new work.
    clearTimeout(entry.timer);
    this.pending.delete(message.id);
    if ('error' in message) entry.reject(new NativeRpcError('RPC_NATIVE_REJECTED', 'possible'));
    else entry.resolve(message.result);
  }
}
