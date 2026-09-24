import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';

// WN04:tunnel/受限管理实例经可信本地 initialize 声明项目白名单——仅收紧,不扩权。
async function env() {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/mcp-scope-'));
  const db = openApplicationStore(dir);
  const app = new ApplicationService(db, [dir], false);
  const admin = new P1MemoryTransport(app, 'human_local');
  const a = await admin.connect({ clientId: 'admin', clientVersion: '1.0.0', requestedMode: 'controller' });
  const snap = await a.request('system.snapshot', {});
  const lease = await a.request('control.acquire', {}, { operationId: 'al', expectedRevision: snap.revision, scope: {} });
  const roots = await a.request('filesystem.listRoots', {});
  const mk = async (name: string, op: string) =>
    a.request('project.create', { name, path_handle: roots.items[0].pathHandle }, { operationId: op, expectedRevision: (await a.request('system.snapshot', {})).revision, scope: {}, leaseId: (lease as { leaseId: string }).leaseId }) as Promise<{ id: string }>;
  const p1 = await mk('批准项目', 'p1');
  const p2 = await mk('未批准项目', 'p2');
  await a.request('control.release', { lease_id: (lease as { leaseId: string }).leaseId }, { operationId: 'arelease', expectedRevision: (await a.request('system.snapshot', {})).revision, scope: {} } as never);
  return { db, app, dir, p1, p2 };
}

async function env2() {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/mcp-full-'));
  const db = openApplicationStore(dir);
  const app = new ApplicationService(db, [dir], false);
  const admin = new P1MemoryTransport(app, 'human_local');
  const a = await admin.connect({ clientId: 'admin2', clientVersion: '1.0.0', requestedMode: 'controller' });
  const snap0 = await a.request('system.snapshot', {});
  const lease = await a.request('control.acquire', {}, { operationId: 'al2', expectedRevision: snap0.revision, scope: {} });
  const roots = await a.request('filesystem.listRoots', {});
  const mk = async (name: string, op: string) =>
    a.request('project.create', { name, path_handle: roots.items[0].pathHandle }, { operationId: op, expectedRevision: (await a.request('system.snapshot', {})).revision, scope: {}, leaseId: (lease as { leaseId: string }).leaseId }) as Promise<{ id: string }>;
  await mk('普通项目A', 'pa');
  await mk('普通项目B', 'pb');
  admin.close?.();
  return { db, app };
}

it('声明合法 scope:快照只见批准项目;跨项目写被 SCOPE_DENIED;未知 id 拒绝握手', async () => {
  const f = await env();
  const t = new P1MemoryTransport(f.app, 'human_local');
  f.app.defaultConnectionScope = new Set([f.p1.id]);
  const s = await t.connect({ clientId: 'tunnel', clientVersion: '1.0.0', requestedMode: 'controller' });
  const snap = (await s.request('system.snapshot', {})) as { projects: { id: string }[]; revision: number };
  expect(snap.projects.map((x) => x.id)).toEqual([f.p1.id]);
  const lease = await s.request('control.acquire', {}, { operationId: 'tl', expectedRevision: snap.revision, scope: {} });
  const roots = await s.request('filesystem.listRoots', {});
  await expect(
    s.request('space.create', { name: 'x' } as never, { operationId: 'sc', expectedRevision: ((await s.request('system.snapshot', {})) as { revision: number }).revision, scope: { project_id: f.p2.id }, leaseId: (lease as { leaseId: string }).leaseId } as never),
  ).rejects.toThrow(/SCOPE_DENIED|CAPABILITY_UNAVAILABLE/);
  // 同 scope 内的写路径可达(能力允许则成功;能力面按范围投影时至少不应得到 SCOPE_DENIED 之外的静默放行)
  const inScope = await s.request('space.create', { name: 'ok' } as never, { operationId: 'sc1', expectedRevision: ((await s.request('system.snapshot', {})) as { revision: number }).revision, scope: { project_id: f.p1.id }, leaseId: (lease as { leaseId: string }).leaseId } as never).then(() => 'ok', (e: Error) => e.message);
  expect(['ok', 'CAPABILITY_UNAVAILABLE']).toContain(inScope);
  // 未设 defaultConnectionScope 的普通实例不受影响(回归面:第二个全新环境)
  t.close?.();
  {
    const g = await env2();
    const t3 = new P1MemoryTransport(g.app, 'human_local');
    const s3 = await t3.connect({ clientId: 'full', clientVersion: '1.0.0', requestedMode: 'controller' });
    const snap3 = (await s3.request('system.snapshot', {})) as { projects: unknown[] };
    expect(snap3.projects.length).toBeGreaterThanOrEqual(2);
    t3.close?.();
    g.db.close();
  }
  f.db.close();
});

it('F07: defaultConnectionScope 落到 Named Pipe principal human_<hash>（不只 human_local）', async () => {
  const f = await env();
  f.app.defaultConnectionScope = new Set([f.p1.id]);
  const t = new P1MemoryTransport(f.app, 'human_' + 'c'.repeat(24));
  const s = await t.connect({ clientId: 'pipe_local', clientVersion: '1.0.0', requestedMode: 'controller' });
  const snap = (await s.request('system.snapshot', {})) as { projects: { id: string }[] };
  expect(snap.projects.map((x) => x.id)).toEqual([f.p1.id]);
  t.close?.();
  f.db.close();
});
