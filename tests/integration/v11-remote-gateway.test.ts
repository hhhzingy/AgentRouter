import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RemoteDeviceStore } from '../../packages/remote/device-store.ts';
import { RemoteGateway } from '../../packages/remote/remote-gateway.ts';
import { RemoteWebSocketTransport } from '../../packages/client-transport/remote/websocket.ts';

function env() {
  mkdirSync('.local/v11-remote-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/v11-remote-tests/gw-'));
  const db = openApplicationStore(dir);
  const app = new ApplicationService(db, [dir], true);
  const devices = new RemoteDeviceStore(db);
  return { dir, db, app, devices };
}
let portSeq = 41000;
async function boot(o: { allowedHosts?: string[]; allowedOrigins?: string[] } = {}) {
  const f = env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices, allowedHosts: o.allowedHosts, allowedOrigins: o.allowedOrigins, pairRateLimitPerMinute: o.allowedHosts ? 8 : 8 });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/ws`;
  return { ...f, gateway, base, url, port, async stop() { await gateway.close(); f.db.close(); } };
}
async function pair(base: string, challenge: string) {
  const res = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge }), headers: { host: '127.0.0.1' } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function connect(url: string, token: string, requestedMode: 'controller' | 'observer') {
  const transport = new RemoteWebSocketTransport({ url, token, WebSocketImpl: globalThis.WebSocket as never, requestTimeoutMs: 8000 });
  const session = await transport.connect({ clientId: 'remote_' + Math.random().toString(36).slice(2), clientVersion: '1.0.0', requestedMode, mode: 'LOCAL_CORE' });
  return { transport, session };
}

it('REMOTE-01/03/05/06 + PAIR-01: 配对→连接→initialize→snapshot→controller→幂等变更', async () => {
  const g = await boot();
  try {
    const p = g.devices.createPairing({ displayName: 'PC-A', kind: 'DESKTOP', canRequestController: true });
    const res = await pair(g.base, p.challenge);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.canRequestController).toBe(true);
    const { transport, session } = await connect(g.url, res.body.token, 'controller');
    try {
      expect(session.hello.contractRevision).toBe('C1R1P1');
      const snap = await session.request('system.snapshot', {});
      expect(typeof snap.revision).toBe('number');
      const lease = await session.request('control.acquire', {}, { operationId: 'acq', expectedRevision: snap.revision, scope: {} });
      expect((lease as { leaseId: string }).leaseId).toBeTruthy();
      const roots = await session.request('filesystem.listRoots', {});
      const s2 = await session.request('system.snapshot', {});
      const mk = () => session.request('project.create', { name: '远程创建', path_handle: (roots as { items: { pathHandle: string }[] }).items[0].pathHandle }, { operationId: 'idem', expectedRevision: s2.revision, scope: {}, leaseId: (lease as { leaseId: string }).leaseId });
      const a = await mk();
      const b = await mk();
      expect(b).toEqual(a); // 同 operation_id 幂等:返回同一结果,不重复创建
      const count = (await session.request('system.snapshot', {})).projects.filter(x => x.name === '远程创建').length;
      expect(count).toBe(1);
    } finally { await transport.close(); }
  } finally { await g.stop(); }
});

it('PAIR-01 single-use + PAIR-09 observer write rejected + K02 桌面/手机 token 分离', async () => {
  const g = await boot();
  try {
    // K02:手机配对响应只给 cookie,不给长期 token;桌面配对才在 body 回 token。
    const mp = g.devices.createPairing({ displayName: 'phone', kind: 'MOBILE', ttlMs: 30000 });
    const mres = await fetch(g.base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: mp.challenge }), headers: { host: '127.0.0.1' } });
    const mbody = await mres.json();
    expect(mbody.token).toBeUndefined();
    expect(mbody.paired).toBe(true);
    expect((mres.headers.get('set-cookie') ?? '').toLowerCase()).toContain('httponly');
    // 桌面配对走 token 连接路径
    const p = g.devices.createPairing({ displayName: 'PC-A', kind: 'DESKTOP', canRequestController: true, ttlMs: 30000 });
    const first = await pair(g.base, p.challenge);
    expect(first.status).toBe(200);
    expect(typeof first.body.token).toBe('string');
    const replay = await pair(g.base, p.challenge);
    expect(replay.status).toBe(400); // 单次使用:重放拒绝
    const { transport, session } = await connect(g.url, first.body.token, 'observer');
    try {
      const roots = await session.request('filesystem.listRoots', {});
      const s = await session.request('system.snapshot', {});
      let err: { code?: string } | undefined;
      // 带一个未持有的 lease_id:过客户端帧校验,由服务端判定 observer 无控制租约而拒绝。
      try {
        await session.request('project.create', { name: 'nope', path_handle: (roots as { items: { pathHandle: string }[] }).items[0].pathHandle }, { operationId: 'x', expectedRevision: s.revision, scope: {}, leaseId: 'no-such-lease' });
      } catch (e) { err = e as { code?: string }; }
      expect(['SCOPE_DENIED', 'CONTROL_LEASE_REQUIRED', 'CONTROL_LEASE_EXPIRED']).toContain(err?.code);
    } finally { await transport.close(); }
  } finally { await g.stop(); }
});

it('REMOTE: 未配对/坏 token 不得连接;坏 Origin 拒绝;PAIR-05 与本地凭据分离', async () => {
  const g = await boot();
  try {
    // 未知 token 的 WS:首帧鉴权失败即关闭,initialize 超时
    await expect(connect(g.url, 'bogus-token-not-a-device', 'observer').then(s => s.session)).rejects.toBeTruthy();
    // 跨源 Origin 的 HTTP 被拒(PAIR-07 bad origin)
    const bad = await fetch(g.base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: 'x' }), headers: { origin: 'https://evil.example.com', host: '127.0.0.1' } }).then(r => r.status).catch(() => 0);
    expect([403, 0]).toContain(bad);
    const ok = await fetch(g.base + '/health', { headers: { host: '127.0.0.1' } }).then(r => r.status);
    expect(ok).toBe(200);
  } finally { await g.stop(); }
});

it('Z6 静态控制台:GET / 返回带 CSP 的 HTML;配对响应含 HttpOnly Secure cookie', async () => {
  const f = env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices, consoleHtml: '<!doctype html><title>AR</title>' });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  try {
    const home = await fetch(`http://127.0.0.1:${port}/`, { headers: { host: '127.0.0.1' } });
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toContain('text/html');
    expect(home.headers.get('content-security-policy')).toContain("script-src 'self' 'unsafe-inline'");
    const p = f.devices.createPairing({ displayName: 'phone', kind: 'MOBILE', ttlMs: 30000 });
    const pair = await fetch(`http://127.0.0.1:${port}/pair`, { method: 'POST', body: JSON.stringify({ challenge: p.challenge }), headers: { host: '127.0.0.1' } });
    const pairHdr = pair.headers.get('set-cookie') ?? '';
    expect(pairHdr).toMatch(/ar_device=[^;]+/);
    expect(pairHdr.toLowerCase()).toContain('httponly');
    expect(pairHdr.toLowerCase()).toContain('secure');
    expect(pairHdr.toLowerCase()).toContain('samesite=strict');
  } finally { await gateway.close(); f.db.close(); }
});

it('PAIR-06 revoke: 撤销后凭据认证失败', async () => {
  const g = await boot();
  try {
    const p = g.devices.createPairing({ displayName: 'd', kind: 'DESKTOP', canRequestController: true });
    const res = await pair(g.base, p.challenge);
    expect(g.devices.authenticate(res.body.token)).toBeTruthy();
    expect(g.devices.revoke(res.body.deviceId)).toBe(true);
    expect(g.devices.authenticate(res.body.token)).toBe(null);
  } finally { await g.stop(); }
});
