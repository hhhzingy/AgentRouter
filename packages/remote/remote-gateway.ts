import { createServer, type Server, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RemoteDeviceStore } from './device-store.ts';

export interface RemoteCoreServer {
  open(principal?: string, authorized?: boolean): string;
  handle(connection: string, request: unknown): Promise<unknown>;
  subscribe(connection: string, handler: (event: unknown) => void): () => void;
  disconnect(connection: string): void;
  desktopContext(connection: string): unknown;
}
export interface RemoteGatewayOptions {
  app: RemoteCoreServer;
  devices: RemoteDeviceStore;
  /** 仅接受这些 Host(:port 可含)与 Origin(tailnet 主机名)。默认仅 loopback。 */
  allowedHosts?: string[];
  allowedOrigins?: string[];
  maxFrameBytes?: number;
  pairRateLimitPerMinute?: number;
  clock?: () => number;
}
const MAX_FRAME_DEFAULT = 262144;
const pairKey = (req: IncomingMessage) => (req.socket.remoteAddress ?? 'unknown');
function hostAllowed(header: string | undefined, allow: Set<string>) {
  if (!header) return false;
  return allow.has(header.toLowerCase()) || allow.has(header.toLowerCase().split(':')[0]);
}
export class RemoteGateway {
  readonly server: Server;
  private readonly wss: WebSocketServer;
  private readonly devices: RemoteDeviceStore;
  private readonly allowHost: Set<string>;
  private readonly allowOrigin: Set<string>;
  private readonly maxFrame: number;
  private readonly rate: number;
  private readonly clock: () => number;
  private readonly pairWindow = new Map<string, { count: number; windowStart: number }>();
  private readonly liveSockets = new Map<string, Set<WebSocket>>();
  constructor(private readonly options: RemoteGatewayOptions) {
    this.devices = options.devices;
    this.allowHost = new Set((options.allowedHosts ?? ['127.0.0.1', 'localhost', '[::1]']).map(h => h.toLowerCase()));
    this.allowOrigin = new Set((options.allowedOrigins ?? []).map(o => o.toLowerCase()));
    this.maxFrame = options.maxFrameBytes ?? MAX_FRAME_DEFAULT;
    this.rate = options.pairRateLimitPerMinute ?? 8;
    this.clock = options.clock ?? (() => Date.now());
    this.server = createServer((req, res) => void this.http(req, res));
    this.wss = new WebSocketServer({ noServer: true, maxPayload: this.maxFrame });
    this.server.on('upgrade', (req, socket, head) => {
      if (!this.requestAuthorized(req)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
      if (!req.url?.startsWith('/ws')) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket as never, head, ws => this.onSocket(req, ws));
    });
  }
  listen(port: number, host = '127.0.0.1') {
    return new Promise<void>(resolve => this.server.listen(port, host, () => resolve()));
  }
  close() {
    for (const set of this.liveSockets.values()) for (const ws of set) { try { ws.close(4000, 'gateway_shutdown'); } catch {} }
    return new Promise<void>(resolve => this.wss.close(() => this.server.close(() => resolve())));
  }
  /** 撤销后:活动 socket 立即关闭(下一帧前)。 */
  revokeLive(deviceId: string) {
    const set = this.liveSockets.get(deviceId);
    if (set) for (const ws of set) { try { ws.close(4001, 'device_revoked'); } catch {} }
  }
  private requestAuthorized(req: IncomingMessage) {
    const host = req.headers.host;
    if (!hostAllowed(host, this.allowHost)) return false;
    const origin = req.headers.origin;
    if (origin !== undefined && !this.allowOrigin.has(String(origin).toLowerCase())) return false;
    return true;
  }
  private async http(req: IncomingMessage, res: import('node:http').ServerResponse) {
    const send = (code: number, body: unknown) => {
      const text = JSON.stringify(body);
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(text);
    };
    if (!this.requestAuthorized(req)) return send(403, { error: 'SCOPE_DENIED' });
    const url = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && url === '/health') return send(200, { status: 'ok', kind: 'agentrouter-remote-gateway' });
    if (req.method === 'POST' && url === '/pair') {
      const key = pairKey(req);
      const now = this.clock();
      const w = this.pairWindow.get(key);
      if (w && now - w.windowStart < 60_000) {
        if (w.count >= this.rate) { this.pairWindow.set(key, { ...w, count: w.count + 1 }); return send(429, { error: 'PAIR_RATE_LIMITED' }); }
        w.count++;
      } else this.pairWindow.set(key, { count: 1, windowStart: now });
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) return send(413, { error: 'PAIR_BODY_TOO_LARGE' }); }
      let challenge: string | undefined;
      try { challenge = JSON.parse(body || '{}').challenge; } catch { /* ignore */ }
      if (typeof challenge !== 'string') return send(400, { error: 'PAIR_CHALLENGE_REQUIRED' });
      try {
        const result = this.devices.consumePairing(challenge, this.clock());
        // HttpOnly Secure SameSite=Strict:浏览器 JS 拿不到 token,后续 WSS 由 cookie 自动携带。
        res.setHeader('set-cookie', `ar_device=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict`);
        return send(200, { deviceId: result.deviceId, token: result.token, kind: result.kind, displayName: result.displayName, scope: result.scope, canRequestController: result.canRequestController });
      } catch (error) {
        const code = error instanceof Error && /^REMOTE_/.test(error.message) ? error.message : 'REMOTE_PAIR_INVALID';
        return send(400, { error: code });
      }
    }
    return send(404, { error: 'NOT_FOUND' });
  }
  private onSocket(req: IncomingMessage, ws: WebSocket) {
    let device: import('./device-store.ts').RemoteDevice | null = null;
    let connection: string | undefined;
    let unsubscribe: (() => void) | undefined;
    let chain: Promise<void> = Promise.resolve();
    let buffer = '';
    const app = this.options.app;
    const sendFrame = (value: unknown) => {
      if (ws.readyState !== ws.OPEN) return;
      const text = JSON.stringify(value);
      if (Buffer.byteLength(text) > this.maxFrame) { ws.close(4002, 'frame_too_large'); return; }
      ws.send(text);
    };
    const startSession = (authed: NonNullable<typeof device>) => {
      device = authed;
      connection = app.open('remote_' + randomUUID(), true);
      unsubscribe = app.subscribe(connection, event => sendFrame(event));
      sendFrame({ attached: true, deviceId: device.deviceId, kind: device.kind, scope: device.scope, canRequestController: device.canRequestController });
      const set = this.liveSockets.get(device.deviceId) ?? new Set<WebSocket>();
      set.add(ws);
      this.liveSockets.set(device.deviceId, set);
    };
    ws.once('close', () => {
      if (device) { const set = this.liveSockets.get(device.deviceId); if (set) { set.delete(ws); if (!set.size) this.liveSockets.delete(device.deviceId); } }
      unsubscribe?.();
      if (connection) { app.disconnect(connection); connection = undefined; }
    });
    // 浏览器 WSS 无法自定义 header:配对成功后 cookie 自动携带;Electron 亦可 cookie 或首帧 token。
    const cookie = /(?:^|;\s*)ar_device=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
    if (cookie) {
      const authed = this.devices.authenticate(decodeURIComponent(cookie), this.clock());
      if (!authed) { ws.close(4003, 'auth_failed'); return; }
      startSession(authed);
    }
    ws.on('message', data => {
      const text = String(data);
      if (!device) {
        // 首帧:桌面端 token 交换(移动端已走 cookie)。仅接受 {remote_token}。
        try {
          const first = JSON.parse(text);
          if (typeof first.remote_token === 'string') {
            const authed = this.devices.authenticate(first.remote_token, this.clock());
            if (!authed) { ws.close(4003, 'auth_failed'); return; }
            startSession(authed);
          } else ws.close(4004, 'auth_required');
        } catch { ws.close(4004, 'auth_required'); }
        return;
      }
      buffer += text;
      if (buffer.length > this.maxFrame * 2) { ws.close(4002, 'frame_too_large'); return; }
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        chain = chain.then(async () => {
          let frame: Record<string, unknown>;
          try { frame = JSON.parse(line); } catch { return; }
          if (frame.desktop_directory !== undefined || frame.desktop_context !== undefined) {
            // 远程模式禁用主机本地能力(locality):目录选择/桌面上下文不下发到远端 Core。
            if (typeof frame.id === 'string') sendFrame({ v: 1, id: frame.id, error: { code: 'CAPABILITY_UNAVAILABLE', category: 'AUTHORIZATION' } });
            return;
          }
          if (!connection) return;
          const response = await app.handle(connection, frame);
          sendFrame(response);
        }).catch(() => { try { ws.close(4005, 'internal'); } catch {} });
      }
    });
  }
}
