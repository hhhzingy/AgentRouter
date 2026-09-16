import { createServer, type Server, type IncomingMessage } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';
import { RemoteDeviceStore } from './device-store.ts';
import { methodMetadata } from '../client-contract/c1r1p1/generated.ts';

export interface RemoteCoreServer {
  open(principal?: string, authorized?: boolean, allowedProjects?: Set<string>): string;
  handle(connection: string, request: unknown): Promise<unknown>;
  subscribe(connection: string, handler: (event: unknown) => void): () => void;
  disconnect(connection: string): void;
  desktopContext(connection: string): unknown;
}
export interface RemoteGatewayOptions {
  app: RemoteCoreServer;
  devices: RemoteDeviceStore;
  /** 手机远程控制台静态首页(单文件 HTML);GET / 返回。 */
  consoleHtml?: string;
  /** 仅接受这些 Host(:port 可含)与 Origin(tailnet 主机名)。默认仅 loopback。 */
  allowedHosts?: string[];
  allowedOrigins?: string[];
  maxFrameBytes?: number;
  pairRateLimitPerMinute?: number;
  clock?: () => number;
}
// W07 共享元数据:浏览器控制台与 Node 传输使用同一份 client-contract 方法元数据,
// 经 GET /meta.js 暴露 window.METHOD_METADATA(仅 mutation 布尔表,非秘密)。
const METHOD_MUTATION: Record<string, boolean> = {};
for (const m of Object.keys(methodMetadata))
  METHOD_MUTATION[m] = !!(methodMetadata as Record<string, { mutation?: boolean }>)[m].mutation;
const META_JS = 'window.METHOD_METADATA=' + JSON.stringify(METHOD_MUTATION) + ';\n';
const MAX_FRAME_DEFAULT = 262144;
const AUTH_DEADLINE_MS = 10000;
const MAX_PENDING_PER_SOCKET = 64;
const MAX_TOTAL_CONNECTIONS = 32;
const MAX_SEND_BUFFERED_BYTES = 1048576;
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
  private liveTotal = 0;
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
  /** 实际绑定端口(port=0 时由系统分配)。 */
  boundPort(): number | undefined {
    const a = this.server.address();
    return a && typeof a === 'object' ? a.port : undefined;
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
    if (origin !== undefined) {
      const o = String(origin).toLowerCase();
      if (!this.allowOrigin.has(o)) {
        // 浏览器控制台默认允许 loopback Origin(主机名命中 allowedHosts,端口任意);跨网访问仍须显式 allowedOrigins。
        let host: string | undefined;
        try { host = new URL(o).hostname.toLowerCase(); } catch { host = undefined; }
        if (!host || !this.allowHost.has(host)) return false;
      }
    }
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
    if (req.method === 'GET' && url === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && (url === '/' || url === '/index.html') && this.options.consoleHtml) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; connect-src 'self' ws: wss:; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'", 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      return res.end(this.options.consoleHtml);
    }
    if (req.method === 'GET' && url === '/meta.js' && this.options.consoleHtml) {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      return res.end(META_JS);
    }
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
        // K02:HttpOnly Secure cookie 对手机与桌面都写;但 token 明文只回给 DESKTOP(Electron Main 用 safeStorage 保管)。
        // kind 由本机 GUI 生成配对挑战时决定(受信),不采信客户端自报,手机页面 JS 永远拿不到长期 token。
        res.setHeader('set-cookie', `ar_device=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict`);
        const publicMeta = { deviceId: result.deviceId, kind: result.kind, displayName: result.displayName, scope: result.scope, canRequestController: result.canRequestController };
        if (result.kind === 'DESKTOP') return send(200, { ...publicMeta, token: result.token });
        return send(200, { ...publicMeta, paired: true });
      } catch (error) {
        const code = error instanceof Error && /^REMOTE_/.test(error.message) ? error.message : 'REMOTE_PAIR_INVALID';
        return send(400, { error: code });
      }
    }
    return send(404, { error: 'NOT_FOUND' });
  }
  private onSocket(req: IncomingMessage, ws: WebSocket) {
    if (this.liveTotal >= MAX_TOTAL_CONNECTIONS) { ws.close(4010, 'connection_limit'); return; }
    this.liveTotal++;
    const authTimer = setTimeout(() => { if (!device) ws.close(4004, 'auth_required'); }, AUTH_DEADLINE_MS);
    ws.once('close', () => { this.liveTotal--; clearTimeout(authTimer); });
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
      if (ws.bufferedAmount > MAX_SEND_BUFFERED_BYTES) { ws.close(4009, 'backpressure'); return; }
      ws.send(text);
    };
    const stillActive = (d0: { deviceId: string }) => {
      const cur = this.devices.listDevices().find(x => x.deviceId === d0.deviceId);
      return !!cur && cur.state === 'ACTIVE';
    };
    const projectIdsOf = (d0: { scope: string[] }) => new Set(d0.scope.filter(x => x.startsWith('project:')).map(x => x.slice('project:'.length)));
    const startSession = (authed: NonNullable<typeof device>) => {
      device = authed;
      // K07:把设备授权能力(是否可申请 controller)作为权威 authorized 传入 Core 连接,
      // 非 UI 标签;不可申请的设备的 control.acquire/写路径在 Core 端被拒(见 application:641/766)。
      // K08:principal 用设备稳定身份(跨重连保留命令账本幂等身份);连接 id 仍唯一区分活动连接。
      // K07: 授权三态进权威连接——authorized=canRequestController;project scope → allowedProjects(空scope=不给未声明权限)。
      connection = app.open(
        'remote_device_' + authed.deviceId,
        authed.canRequestController,
        projectIdsOf(authed).size ? projectIdsOf(authed) : new Set<string>(),
      );
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
    // 无 cookie:提示未认证(手机控制台立即进配对界面);桌面端仍可继续走首帧 token,10s 截止仍在。
    if (!device) sendFrame({ auth_required: true });
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
      let queued = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        if (++queued > MAX_PENDING_PER_SOCKET) { ws.close(4008, 'pending_overflow'); return; }
        chain = chain.then(async () => {
          queued--;
          // W06:撤销后已排队未执行的帧在执行前复验设备状态(不只关socket)。
          if (device && !stillActive(device)) { try { ws.close(4001, 'device_revoked'); } catch {} return; }
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
        }).catch((err) => { if (process.env.AR_GW_DEBUG) console.error('GWCHAIN', line.slice(0, 200), String((err as Error).stack ?? err).slice(0, 400)); try { ws.close(4005, 'internal'); } catch {} });
      }
    });
  }
}
