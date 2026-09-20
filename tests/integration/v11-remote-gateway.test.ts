import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RemoteDeviceStore } from '../../packages/remote/device-store.ts';
import { RemoteGateway, type RemoteCoreServer } from '../../packages/remote/remote-gateway.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import { RemoteWebSocketTransport } from '../../packages/client-transport/remote/websocket.ts';
import { RemoteDeviceExtension } from '../../packages/remote/device-extension.ts';
import { WebSocket } from 'ws';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput } from '../../packages/client-contract/c1r1p1/index.ts';

async function env() {
  mkdirSync('.local/v11-remote-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/v11-remote-tests/gw-'));
  const db = openApplicationStore(dir);
  const app = new ApplicationService(db, [dir], true);
  const localTransport = new P1MemoryTransport(app, 'human_local');
  const devices = new RemoteDeviceStore(db);
  const s = await localTransport.connect({ clientId: 'local_w02', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
  let localLease: string | undefined;
  const ensureLease = async () => { if (!localLease) localLease = (await s.request('control.acquire', {}, { operationId: 'local_lease', expectedRevision: (await s.request('system.snapshot', {})).revision, scope: {} } as never)).leaseId; return localLease; };
  const write = async (method: string, params: Record<string, unknown>, scope: Record<string, unknown> = {}, op?: string) =>
    s.request(method as never, params as never, { operationId: op ?? ('op_' + Date.now()), expectedRevision: (await s.request('system.snapshot', {})).revision, scope, leaseId: await ensureLease() } as never);
  const releaseLease = async () => { if (!localLease) return;
  await s.request('control.release', { lease_id: localLease } as never, { operationId: 'op_rel_' + localLease, expectedRevision: (await s.request('system.snapshot', {})).revision, scope: {} } as never);
  localLease = undefined; };
return { dir, db, app, devices, s, localTransport, ensureLease, releaseLease, write };
}
let portSeq = 41000;
async function boot(o: { allowedHosts?: string[]; allowedOrigins?: string[] } = {}) {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices, allowedHosts: o.allowedHosts, allowedOrigins: o.allowedOrigins, pairRateLimitPerMinute: o.allowedHosts ? 8 : 8 });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/ws`;
  return { ...f, gateway, base, url, port, async stop() { await gateway.close(); f.localTransport.close?.(); f.db.close(); } };
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
async function provisionRole(f: Awaited<ReturnType<typeof env>>, name: string) {
  const roots = await f.s.request('filesystem.listRoots', {});
  const project = (await f.write(
    'project.create',
    { name, path_handle: (roots as { items: { pathHandle: string }[] }).items[0].pathHandle },
    {},
    'provision_' + name,
  )) as { id: string };
  const workspaces = await f.s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.groups[0].workspace_ref = workspaces.items[0].id;
  plan.roles[0].workspace_ref = workspaces.items[0].id;
  const checked = await f.s.request('rolePlan.validate', { plan });
  await f.write(
    'rolePlan.apply',
    { plan, plan_hash: checked.planHash, confirmed: true, permission_grants: [] },
    { project_id: project.id },
    'apply_' + name,
  );
  const roles = (await f.s.request('role.list', {
    scope: { project_id: project.id },
  })) as { items: { id: string }[] };
  return { projectId: project.id, roleId: roles.items[0].id };
}

it('REMOTE-01/03/05/06 + W06: 配对→controller→空scope不可见既有项目→自创建可见→幂等变更', async () => {
  const g = await boot();
  try {
    // 本机建一个项目:远程(空scope)必须看不到它(W06: 空scope不给未声明权限)
    const roots = await g.s.request('filesystem.listRoots', {});
    await g.write('project.create', { name: '本机私有项目', path_handle: (roots as any).items[0].pathHandle }, {}, 'op_localproj');
    await g.releaseLease();
    const p = g.devices.createPairing({ displayName: 'PC-A', kind: 'DESKTOP', canRequestController: true });
    const res = await pair(g.base, p.challenge);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    const { transport, session } = await connect(g.url, res.body.token, 'controller');
    try {
      expect(session.hello.contractRevision).toBe('C1R1P1');
      const snap = await session.request('system.snapshot', {}) as any;
      expect(snap.projects).toHaveLength(0);
      const lease = await session.request('control.acquire', {}, { operationId: 'acq', expectedRevision: snap.revision, scope: {} });
      const leaseId = (lease as { leaseId: string }).leaseId;
      expect(leaseId).toBeTruthy();
      const r2 = await session.request('filesystem.listRoots', {});
      const s2 = await session.request('system.snapshot', {}) as any;
      const mk = () => session.request('project.create', { name: '远程创建', path_handle: (r2 as { items: { pathHandle: string }[] }).items[0].pathHandle }, { operationId: 'idem', expectedRevision: s2.revision, scope: {}, leaseId });
      const a = await mk();
      const b = await mk();
      expect(b).toEqual(a); // 同 operation_id 幂等:返回同一结果,不重复创建
      const s3 = await session.request('system.snapshot', {}) as any;
      expect(s3.projects.filter((x: any) => x.name === '远程创建')).toHaveLength(1);
      // 自创建授权不外溢:本机私有项目仍不可见
      expect(s3.projects.some((x: any) => x.name === '本机私有项目')).toBe(false);
    } finally { await transport.close(); }
  } finally { await g.stop(); }
});
it('PAIR-01 single-use + K02 手机无token/桌面有token + PAIR-09 observer write rejected', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/ws`;
  try {
    const mp = f.devices.createPairing({ displayName: 'phone', kind: 'MOBILE', ttlMs: 30000 });
    const mres = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: mp.challenge }), headers: { host: '127.0.0.1' } });
    const mbody = await mres.json();
    expect(mbody.token).toBeUndefined();
    expect(mbody.paired).toBe(true);
    expect((mres.headers.get('set-cookie') ?? '').toLowerCase()).toContain('httponly');
    const p = f.devices.createPairing({ displayName: 'PC-A', kind: 'DESKTOP', canRequestController: true, ttlMs: 30000 });
    const first = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: p.challenge }), headers: { host: '127.0.0.1' } });
    const firstBody = (await first.json()) as any;
    expect(first.status).toBe(200);
    expect(typeof firstBody.token).toBe('string');
    const replay = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: p.challenge }), headers: { host: '127.0.0.1' } });
    expect(replay.status).toBe(400);
    const { transport, session } = await connect(url, firstBody.token, 'observer');
    try {
      const roots = await session.request('filesystem.listRoots', {});
      const s = await session.request('system.snapshot', {}) as any;
      let err: { code?: string } | undefined;
      try {
        await session.request('project.create', { name: 'nope', path_handle: roots.items[0].pathHandle }, { operationId: 'x', expectedRevision: s.revision, scope: {}, leaseId: 'no-such-lease' });
      } catch (e) { err = e as { code?: string }; }
      expect(['SCOPE_DENIED', 'CONTROL_LEASE_REQUIRED', 'CONTROL_LEASE_EXPIRED']).toContain(err?.code);
    } finally { await transport.close(); }
  } finally { await gateway.close(); f.db.close(); }
});

it('REMOTE: 未配对/坏 token 不得连接;坏 Origin 拒绝', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/ws`;
  try {
    await expect(connect(url, 'bogus-token-not-a-device', 'observer').then(s => s.session)).rejects.toBeTruthy();
    const bad = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: 'x' }), headers: { origin: 'https://evil.example.com', host: '127.0.0.1' } }).then(r => r.status).catch(() => 0);
    expect([403, 0]).toContain(bad);
    const ok = await fetch(base + '/health', { headers: { host: '127.0.0.1' } }).then(r => r.status);
    expect(ok).toBe(200);
  } finally { await gateway.close(); f.db.close(); }
});

it('Z6 静态控制台:GET / 返回带 CSP 的 HTML;HTTP 配对响应含 HttpOnly SameSite cookie', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices, consoleHtml: '<!doctype html><title>AR</title>' });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  try {
    const home = await fetch(`http://127.0.0.1:${port}/`, { headers: { host: '127.0.0.1' } });
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toContain('text/html');
    expect(home.headers.get('content-security-policy')).toContain("script-src 'self' 'unsafe-inline'");
    const p = f.devices.createPairing({ displayName: 'phone', kind: 'MOBILE', ttlMs: 30000 });
    const pr = await fetch(`http://127.0.0.1:${port}/pair`, { method: 'POST', body: JSON.stringify({ challenge: p.challenge }), headers: { host: '127.0.0.1' } });
    const hdr = pr.headers.get('set-cookie') ?? '';
    expect(hdr).toMatch(/ar_device=[^;]+/);
    expect(hdr.toLowerCase()).toContain('httponly');
    expect(hdr.toLowerCase()).toContain('samesite=strict');
    expect(hdr.toLowerCase()).not.toContain('secure');
    const p2 = f.devices.createPairing({ displayName: 'served-phone', kind: 'MOBILE', ttlMs: 30000 });
    const served = await fetch(`http://127.0.0.1:${port}/pair`, {
      method: 'POST',
      body: JSON.stringify({ challenge: p2.challenge }),
      headers: { host: '127.0.0.1', 'x-forwarded-proto': 'https' },
    });
    expect((served.headers.get('set-cookie') ?? '').toLowerCase()).toContain('secure');
  } finally { await gateway.close(); f.db.close(); }
});

it('PAIR-06 revoke: 撤销后凭据认证失败', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  try {
    const p = f.devices.createPairing({ displayName: 'd', kind: 'DESKTOP', canRequestController: true });
    const res = await fetch(`http://127.0.0.1:${port}/pair`, { method: 'POST', body: JSON.stringify({ challenge: p.challenge }), headers: { host: '127.0.0.1' } });
    const body = await res.json();
    expect(f.devices.authenticate(body.token)).toBeTruthy();
    expect(f.devices.revoke(body.deviceId)).toBe(true);
    expect(f.devices.authenticate(body.token)).toBe(null);
  } finally { await gateway.close(); f.db.close(); }
});

it('W06: scope 空=不给未声明权限;scope限定project后仅可见该项目;canRequestController=false 禁acquire', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/ws`;
  try {
    const roots = await f.s.request('filesystem.listRoots', {});
    const proj = (await f.write('project.create', { name: 'scope项目', path_handle: roots.items[0].pathHandle }, {}, 'op_scope')) as any;
    const emptyPair = f.devices.createPairing({ displayName: '空scope设备', kind: 'DESKTOP', canRequestController: false, scope: [] });
    const emptyRes = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: emptyPair.challenge }), headers: { host: '127.0.0.1' } });
    const emptyBody = await emptyRes.json();
    const t1 = new RemoteWebSocketTransport({ url, token: emptyBody.token, WebSocketImpl: globalThis.WebSocket as never, requestTimeoutMs: 8000 });
    const s1 = await t1.connect({ clientId: 'c_empty', clientVersion: '1.0.0', requestedMode: 'observer' });
    const snap1 = await s1.request('system.snapshot', {}) as any;
    expect(snap1.projects).toHaveLength(0);
    await t1.close();
    const scopedPair = f.devices.createPairing({ displayName: '限定设备', kind: 'DESKTOP', canRequestController: true, scope: ['project:' + proj.id] });
    const scopedRes = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: scopedPair.challenge }), headers: { host: '127.0.0.1' } });
    const scopedBody = await scopedRes.json();
    const t2 = new RemoteWebSocketTransport({ url, token: scopedBody.token, WebSocketImpl: globalThis.WebSocket as never, requestTimeoutMs: 8000 });
    const s2 = await t2.connect({ clientId: 'c_scoped', clientVersion: '1.0.0', requestedMode: 'observer' });
    const snap2 = await s2.request('system.snapshot', {}) as any;
    expect(snap2.projects.map((x: any) => x.id)).toContain(proj.id);
    await t2.close();
    const noCtrlPair = f.devices.createPairing({ displayName: '只读设备', kind: 'DESKTOP', canRequestController: false, scope: ['project:' + proj.id] });
    const noCtrl = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: noCtrlPair.challenge }), headers: { host: '127.0.0.1' } });
    const noCtrlBody = await noCtrl.json();
    const t3 = new RemoteWebSocketTransport({ url, token: noCtrlBody.token, WebSocketImpl: globalThis.WebSocket as never, requestTimeoutMs: 8000 });
    const s3 = await t3.connect({ clientId: 'c_noctrl', clientVersion: '1.0.0', requestedMode: 'controller' });
    let acqErr: string | undefined;
    try { await s3.request('control.acquire', {}, { operationId: 'acq1', expectedRevision: 1, scope: {} }); } catch (e) { acqErr = (e as Error).message; }
    expect(['SCOPE_DENIED', 'CONTROL_LEASE_REQUIRED']).toContain(acqErr);
    await t3.close();
  } finally { await gateway.close(); f.db.close(); }
});

it('N5: Remote authenticated observer 可读 scoped Slot；controller 扩展写携带 metadata 并持久幂等', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = 'http://127.0.0.1:' + port;
  const url = 'ws://127.0.0.1:' + port + '/ws';
  try {
    const target = await provisionRole(f, 'remote-slot-scope');
    await f.releaseLease();

    const readPair = f.devices.createPairing({
      displayName: 'slot-observer',
      kind: 'DESKTOP',
      canRequestController: false,
      scope: ['project:' + target.projectId],
    });
    const readBody = (await pair(base, readPair.challenge)).body as { token: string };
    const read = await connect(url, readBody.token, 'observer');
    expect(read.session.hello.capabilities.controller_lease).toBe(false);
    await expect(
      read.session.request(
        'participant.slot.list' as never,
        { role_id: target.roleId } as never,
      ),
    ).resolves.toMatchObject({ slots: expect.any(Array) });
    await read.transport.close();

    const writePair = f.devices.createPairing({
      displayName: 'slot-controller',
      kind: 'DESKTOP',
      canRequestController: true,
      scope: ['project:' + target.projectId],
    });
    const writeBody = (await pair(base, writePair.challenge)).body as { token: string };
    const write = await connect(url, writeBody.token, 'controller');
    expect(write.session.hello.capabilities.controller_lease).toBe(true);
    const revision = ((await write.session.request('system.snapshot', {})) as { revision: number }).revision;
    const lease = (await write.session.request(
      'control.acquire',
      {},
      { operationId: 'remote-slot-lease', expectedRevision: revision, scope: {} },
    )) as { leaseId: string };
    const mutationRevision = ((await write.session.request('system.snapshot', {})) as { revision: number }).revision;
    const options = {
      leaseId: lease.leaseId,
      requestKey: 'remote-slot-create',
      operationId: 'remote-slot-create-op',
      expectedRevision: mutationRevision,
    };
    const params = {
      role_id: target.roleId,
      name: 'Remote Web Slot',
      participant_kind: 'CHATGPT_WEB',
    };
    const created = await write.session.request(
      'participant.slot.create' as never,
      params as never,
      options as never,
    );
    expect(
      await write.session.request(
        'participant.slot.create' as never,
        params as never,
        options as never,
      ),
    ).toEqual(created);
    await expect(
      write.session.request(
        'participant.slot.create' as never,
        { ...params, name: 'drifted' } as never,
        options as never,
      ),
    ).rejects.toThrow('OPERATION_CONFLICT');
    await write.transport.close();
  } finally {
    await gateway.close();
    f.localTransport.close?.();
    f.db.close();
  }
});


it('WC03: Origin 精确匹配(跨网主机不再被 hostname 自动放行);loopback+端口默认放行', async () => {
  const f = await env();
  const port = ++portSeq;
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices, allowedOrigins: ['https://tailnet.example.ts.net'] });
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  try {
    // 同端口不同主机名的 Origin:拒绝(精确匹配,不再按 hostname 放行)
    const evil = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: 'x' }), headers: { origin: 'http://127.0.0.1.evil.com', host: '127.0.0.1' } }).then(r => r.status).catch(() => 0);
    expect([403, 0]).toContain(evil);
    // 显式声明的跨网 Origin:接受
    const good = await fetch(base + '/health', { headers: { origin: 'https://tailnet.example.ts.net', host: '127.0.0.1' } }).then(r => r.status);
    expect(good).toBe(200);
    // 同 loopback+端口(默认精确匹配):接受
    const local = await fetch(base + '/health', { headers: { origin: base, host: '127.0.0.1' } }).then(r => r.status);
    expect(local).toBe(200);
  } finally { await gateway.close(); f.db.close(); }
});

it('WC03/W-05: 远程设备自创建项目跨重连持久可见(按 principal 审计恢复,不外溢)', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/ws`;
  try {
    const p = f.devices.createPairing({ displayName: '持久设备', kind: 'DESKTOP', canRequestController: true, ttlMs: 60000 });
    const res = await pair(base, p.challenge);
    const token = (res.body as { token: string }).token;
    const c1 = await connect(url, token, 'controller');
    const lease = await c1.session.request('control.acquire', {}, { operationId: 'a1', expectedRevision: ((await c1.session.request('system.snapshot', {})) as any).revision, scope: {} });
    const roots = (await c1.session.request('filesystem.listRoots', {})) as { items: { pathHandle: string }[] };
    await c1.session.request('project.create', { name: '自创建持久项目', path_handle: roots.items[0].pathHandle }, { operationId: 'pc1', expectedRevision: ((await c1.session.request('system.snapshot', {})) as any).revision, scope: {}, leaseId: (lease as { leaseId: string }).leaseId });
    await c1.transport.close();
    // 重连(同设备 token):自创建项目按 principal 审计恢复可见
    const c2 = await connect(url, token, 'controller');
    const snap = (await c2.session.request('system.snapshot', {})) as { projects: { name: string }[] };
    expect(snap.projects.some((x) => x.name === '自创建持久项目')).toBe(true);
    await c2.transport.close();
  } finally { await gateway.close(); f.db.close(); }
});
it('W09: remoteDevice 扩展——本机可生成配对码且网关可消费;远程设备连接被拒', async () => {
  const f = await env();
  f.app.remoteDevices = new RemoteDeviceExtension(f.devices);
  const port = ++portSeq;
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  try {
    const leaseId = await f.ensureLease();
    const p = (await f.s.request(
      'remoteDevice.createPairing' as never,
      { displayName: '手机配对码走Core', kind: 'MOBILE', ttlMs: 300000 } as never,
      { leaseId } as never,
    )) as {
      challenge: string;
      expiresAtMs: number;
    };
    expect(typeof p.challenge).toBe('string');
    expect(p.expiresAtMs).toBeGreaterThan(Date.now());
    const res = await pair(base, p.challenge);
    expect(res.status).toBe(200);
    expect(res.body.paired).toBe(true);
    const list = (await f.s.request('remoteDevice.listDevices' as never, {} as never)) as { devices: { displayName: string; state: string }[] };
    expect(list.devices.some((d) => d.displayName === '手机配对码走Core' && d.state === 'ACTIVE')).toBe(true);
    // 远程设备连接绝不许自我配对(防权限升级)
    const evil = new P1MemoryTransport(f.app, 'remote_device_evil', true, 'REMOTE_DEVICE');
    const es = await evil.connect({ clientId: 'evil', clientVersion: '1.0.0', requestedMode: 'controller' });
    await expect(
      es.request('remoteDevice.createPairing' as never, { displayName: 'x', kind: 'DESKTOP' } as never),
    ).rejects.toThrow('SCOPE_DENIED');
    evil.close?.();
    await expect(
      f.s.request('remoteDevice.createPairing' as never, { displayName: 'x', kind: 'DESKTOP' } as never),
    ).rejects.toThrow(/CONTROL_LEASE/);
    // 参数拒绝:未知 kind / 无名称
    await expect(
      f.s.request(
        'remoteDevice.createPairing' as never,
        { displayName: 'x', kind: 'TABLET' } as never,
        { leaseId } as never,
      ),
    ).rejects.toThrow('INVALID_PARAMS');
  } finally {
    await gateway.close();
    f.localTransport.close?.();
    f.db.close();
  }
});

it('F10: 畸形 cookie 不得 URIError 打崩网关', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`, { headers: { host: '127.0.0.1' } });
    expect(health.status).toBe(200);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { host: '127.0.0.1', cookie: 'ar_device=%E0%A4%A' },
    });
    const code = await new Promise<number>((resolve) => {
      ws.once('close', (c) => resolve(c));
      ws.once('error', () => resolve(-1));
      setTimeout(() => resolve(-2), 5000);
    });
    expect(code).toBe(4003);
    const health2 = await fetch(`http://127.0.0.1:${port}/health`, { headers: { host: '127.0.0.1' } });
    expect(health2.status).toBe(200);
  } finally {
    await gateway.close();
    f.localTransport.close?.();
    f.db.close();
  }
});

it('F11: remoteDevice.revoke 经 onRevoke 立即关闭 live WSS', async () => {
  const f = await env();
  const gateway = new RemoteGateway({ app: f.app, devices: f.devices });
  f.app.remoteDevices = new RemoteDeviceExtension(f.devices, {
    onRevoke: (deviceId) => gateway.revokeLive(deviceId),
  });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const url = `ws://127.0.0.1:${port}/ws`;
  try {
    const p = f.devices.createPairing({ displayName: 'live-revoke', kind: 'DESKTOP', canRequestController: true });
    const res = await pair(base, p.challenge);
    const token = (res.body as { token: string; deviceId: string }).token;
    const deviceId = (res.body as { deviceId: string }).deviceId;
    const { transport, session } = await connect(url, token, 'observer');
    await session.request('system.snapshot', {});
    const leaseId = await f.ensureLease();
    const revoked = (await f.s.request(
      'remoteDevice.revoke' as never,
      { deviceId } as never,
      { leaseId } as never,
    )) as { revoked: boolean };
    expect(revoked.revoked).toBe(true);
    await expect(session.request('system.ping', {})).rejects.toBeTruthy();
    await transport.close().catch(() => undefined);
  } finally {
    await gateway.close();
    f.localTransport.close?.();
    f.db.close();
  }
});

it('N5/F11: revoke 后已排队但未执行的 Remote mutation 必须在 Core 前被丢弃', async () => {
  const f = await env();
  let releasePing!: () => void;
  let pingEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    pingEntered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    releasePing = resolve;
  });
  const app: RemoteCoreServer = {
    open: (principal, mayAcquire, scope, authenticated, principalKind) =>
      f.app.open(principal, mayAcquire, scope, authenticated, principalKind),
    handle: async (connection, request) => {
      if ((request as { method?: string })?.method === 'system.ping') {
        pingEntered();
        await hold;
      }
      return f.app.handle(connection, request);
    },
    subscribe: (connection, handler) => f.app.subscribe(connection, handler as never),
    disconnect: (connection) => f.app.disconnect(connection),
    desktopContext: (connection) => f.app.desktopContext(connection),
  };
  const gateway = new RemoteGateway({ app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = 'http://127.0.0.1:' + port;
  const url = 'ws://127.0.0.1:' + port + '/ws';
  try {
    const p = f.devices.createPairing({
      displayName: 'queued-revoke',
      kind: 'DESKTOP',
      canRequestController: true,
    });
    const paired = (await pair(base, p.challenge)).body as { token: string; deviceId: string };
    const remote = await connect(url, paired.token, 'controller');
    const revision = ((await remote.session.request('system.snapshot', {})) as { revision: number }).revision;
    const lease = (await remote.session.request(
      'control.acquire',
      {},
      { operationId: 'queued-revoke-lease', expectedRevision: revision, scope: {} },
    )) as { leaseId: string };
    const roots = (await remote.session.request('filesystem.listRoots', {})) as {
      items: { pathHandle: string }[];
    };
    const mutationRevision = ((await remote.session.request('system.snapshot', {})) as {
      revision: number;
    }).revision;
    const ping = remote.session.request('system.ping', {}).catch((error) => error);
    await entered;
    const queued = remote.session
      .request(
        'project.create',
        { name: 'MUST-NOT-EXIST-AFTER-REVOKE', path_handle: roots.items[0].pathHandle },
        {
          operationId: 'queued-after-revoke',
          expectedRevision: mutationRevision,
          scope: {},
          leaseId: lease.leaseId,
        },
      )
      .catch((error) => error);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.devices.revoke(paired.deviceId)).toBe(true);
    gateway.revokeLive(paired.deviceId);
    releasePing();
    await Promise.all([ping, queued]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      (
        f.db
          .prepare("select count(*) c from projects where name='MUST-NOT-EXIST-AFTER-REVOKE'")
          .get() as { c: number }
      ).c,
    ).toBe(0);
    await remote.transport.close().catch(() => undefined);
  } finally {
    releasePing?.();
    await gateway.close();
    f.localTransport.close?.();
    f.db.close();
  }
});

it('N5: mutation 已提交但响应丢失为 UNKNOWN；同 transport 重连不自动重放写入', async () => {
  const f = await env();
  let projectCalls = 0;
  let loseFirstResponse = true;
  const app: RemoteCoreServer = {
    open: (principal, mayAcquire, scope, authenticated, principalKind) =>
      f.app.open(principal, mayAcquire, scope, authenticated, principalKind),
    handle: async (connection, request) => {
      const result = await f.app.handle(connection, request);
      if (
        (request as { method?: string })?.method === 'project.create' &&
        loseFirstResponse
      ) {
        loseFirstResponse = false;
        projectCalls++;
        throw Error('DROP_AFTER_COMMIT');
      }
      if ((request as { method?: string })?.method === 'project.create') projectCalls++;
      return result;
    },
    subscribe: (connection, handler) => f.app.subscribe(connection, handler as never),
    disconnect: (connection) => f.app.disconnect(connection),
    desktopContext: (connection) => f.app.desktopContext(connection),
  };
  const gateway = new RemoteGateway({ app, devices: f.devices });
  const port = ++portSeq;
  await gateway.listen(port, '127.0.0.1');
  const base = 'http://127.0.0.1:' + port;
  const url = 'ws://127.0.0.1:' + port + '/ws';
  try {
    const p = f.devices.createPairing({
      displayName: 'unknown-no-replay',
      kind: 'DESKTOP',
      canRequestController: true,
    });
    const paired = (await pair(base, p.challenge)).body as { token: string };
    const transport = new RemoteWebSocketTransport({
      url,
      token: paired.token,
      WebSocketImpl: globalThis.WebSocket as never,
      requestTimeoutMs: 8000,
    });
    const options = {
      clientId: 'remote_unknown_no_replay',
      clientVersion: '1.0.0',
      requestedMode: 'controller' as const,
      mode: 'LOCAL_CORE' as const,
    };
    const first = await transport.connect(options);
    const revision = ((await first.request('system.snapshot', {})) as { revision: number }).revision;
    const lease = (await first.request(
      'control.acquire',
      {},
      { operationId: 'unknown-lease', expectedRevision: revision, scope: {} },
    )) as { leaseId: string };
    const roots = (await first.request('filesystem.listRoots', {})) as {
      items: { pathHandle: string }[];
    };
    const mutationRevision = ((await first.request('system.snapshot', {})) as {
      revision: number;
    }).revision;
    await expect(
      first.request(
        'project.create',
        { name: 'UNKNOWN-COMMITTED-ONCE', path_handle: roots.items[0].pathHandle },
        {
          operationId: 'unknown-project-create',
          expectedRevision: mutationRevision,
          scope: {},
          leaseId: lease.leaseId,
        },
      ),
    ).rejects.toThrow('CONNECTION_LOST');
    expect(projectCalls).toBe(1);
    expect(
      (
        f.db
          .prepare("select count(*) c from projects where name='UNKNOWN-COMMITTED-ONCE'")
          .get() as { c: number }
      ).c,
    ).toBe(1);

    const reconnected = await transport.connect(options);
    const snap = (await reconnected.request('system.snapshot', {})) as {
      projects: { name: string }[];
    };
    expect(snap.projects.filter((x) => x.name === 'UNKNOWN-COMMITTED-ONCE')).toHaveLength(1);
    expect(projectCalls).toBe(1);
    await transport.close();
  } finally {
    await gateway.close();
    f.localTransport.close?.();
    f.db.close();
  }
});
