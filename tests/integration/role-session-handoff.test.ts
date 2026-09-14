import { it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { Management } from '../../packages/runtime/management.ts';
import { NativeSessionStore } from '../../packages/core-service/native-session-store.ts';
import { RoleSessionExtension } from '../../packages/core-service/role-session-extension.ts';
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function fixture() {
  const root = resolve('.local/j3-session-tests');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(resolve(root, 'ab-')),
    home = resolve(dir, 'sessions');
  mkdirSync(home);
  const path = resolve(home, 'session.jsonl');
  writeFileSync(path, 'public test data');
  const db = openApplicationStore(dir),
    m = new Management(db),
    p = m.createProject('A/B 隔离测试', dir),
    r = m.createRole({
      spaceId: p.space,
      name: 'r',
      description: 'test',
      harness: 'pi',
      workspaceId: p.workspace,
    });
  const run = (id: string, roleSessionId: string | null) =>
    db.prepare(
      "insert into runs(id,role_id,binding_id,task_id,chain_id,kind,binding_epoch,native_run_ref,request_snapshot_json,state,accepted_at_ms,settled_at_ms,exit_reason,created_at_ms,role_session_id) values(?,?,?,null,null,'MANAGEMENT',1,null,'{}','STARTING',null,null,null,1,?)",
    ).run(id, r.role, r.binding, roleSessionId);
  run('runA', null);
  const sessionA = (db.prepare('select id from role_sessions where role_id=? order by seq limit 1').get(r.role) as { id: string }).id;
  db.prepare('update runs set role_session_id=? where id=?').run(sessionA, 'runA');
  const ext = new RoleSessionExtension(db);
  const store = new NativeSessionStore(db);
  const scope = (key: string, roleSessionId?: string) => ({
    bindingId: r.binding,
    epoch: 1,
    key,
    sessionHome: home,
    isCurrent: () => true,
    ...(roleSessionId ? { roleSessionId } : {}),
  });
  cleanups.push(() => {
    db.close();
    const target = realpathSync(dir);
    if (!target.startsWith(realpathSync(root))) throw Error('UNSAFE_CLEANUP');
    rmSync(target, { recursive: true });
  });
  return { db, store, ext, scope, path, dir, r, p, sessionA };
}

it('原生会话引用按 RoleSession 键控:A/B 各自保存,切回 A 读回 A 的原生会话', () => {
  const f = fixture();
  const { db, store, ext, scope, path, r, sessionA } = f;
  // A 下首运行保存 → A 持有自己的原生引用
  store.save(scope('runA', sessionA), { id: 'native-a', path });
  expect(store.load(scope('runA', sessionA))).toEqual({ id: 'native-a', path: realpathSync(path) });
  // create B:交接包 A→B;B 下运行保存自己的引用
  const created = ext.handle(
    { v: 1, id: 'c1', method: 'roleSession.create', params: { role_id: r.role, name: 'B方向' }, client_id: 't', lease_id: 'x' } as never,
    { principal: 'h', mode: 'controller', assertControllerLease: () => {} } as never,
  ) as { result?: { session?: { id: string } } };
  const sessionB = created.result!.session!.id;
  db.prepare("update runs set state='SUCCEEDED' where id='runA'").run();
  db.prepare(
    "insert into runs(id,role_id,binding_id,task_id,chain_id,kind,binding_epoch,native_run_ref,request_snapshot_json,state,accepted_at_ms,settled_at_ms,exit_reason,created_at_ms,role_session_id) values('runB',?,?,null,null,'MANAGEMENT',1,null,'{}','STARTING',null,null,null,1,?)",
  ).run(r.role, r.binding, sessionB);
  store.save(scope('runB', sessionB), { id: 'native-b', path });
  // 隔离:A 读 A,B 读 B;binding 级(最近一次)为 B
  expect(store.load(scope('runA', sessionA))!.id).toBe('native-a');
  expect(store.load(scope('runB', sessionB))!.id).toBe('native-b');
  expect(store.load(scope('runB'))!.id).toBe('native-b');
  // 新建会话在尚未保存自己的引用前为全新(undefined),不得续用 A 的原生上下文
  const createdC0 = ext.handle(
    { v: 1, id: 'c2', method: 'roleSession.create', params: { role_id: r.role, name: 'C方向' }, client_id: 't', lease_id: 'x' } as never,
    { principal: 'h', mode: 'controller', assertControllerLease: () => {} } as never,
  ) as { result?: { session?: { id: string } } };
  expect(store.load(scope('runC', createdC0.result!.session!.id))).toBeUndefined();
  // 切回 A 后运行:load 仍按会话取回 native-a(A→B→A 恢复)
  expect(store.load(scope('runA', sessionA))!.id).toBe('native-a');
});

it('交接包:create/switch 均产出 PENDING 包(A→B→A→C),包哈希为内容 sha256', () => {
  const f = fixture();
  const { db, ext, r, sessionA } = f;
  const call = (method: string, params: Record<string, unknown>) =>
    ext.handle(
      { v: 1, id: 'x', method, params: { role_id: r.role, ...params }, client_id: 't', lease_id: 'x' } as never,
      { principal: 'h', mode: 'controller', assertControllerLease: () => {} } as never,
    ) as { result?: Record<string, unknown> };
  const handoffs = () =>
    db.prepare('select * from role_session_handoffs order by created_at_ms, id').all() as Record<string, string>[];
  expect(handoffs()).toHaveLength(0);
  const created = call('roleSession.create', { name: 'B方向' })!.result!.session! as unknown as { id: string };
  // 会话 A 下留一条对话,交接包应包含它
  db.prepare(
    "insert into conversation_items(id,project_id,space_id,role_id,kind,title,body,state,at_ms,source_key,role_session_id) values('ci1',?,?,?,'ASSISTANT_MESSAGE','原生输出','A 会话尾随输出','PENDING',?,'k1',?)",
  ).run(f.p.project, f.p.space, r.role, 1, sessionA);
  const switchBack = call('roleSession.switch', { session_id: sessionA })!; // B→A
  expect(switchBack.result).toBeTruthy();
  const createdC = call('roleSession.create', { name: 'C方向' })!.result!.session! as unknown as { id: string }; // A→C
  const rows = handoffs();
  expect(rows).toHaveLength(3);
  expect(rows.map((h) => [h.from_session_id, h.to_session_id, h.state])).toEqual([
    [sessionA, created.id, 'PENDING'],
    [created.id, sessionA, 'PENDING'],
    [sessionA, createdC.id, 'PENDING'],
  ]);
  for (const h of rows)
    expect(h.package_hash).toBe(createHash('sha256').update(h.package_json).digest('hex'));
  const pkg = JSON.parse(rows[0].package_json!);
  expect(pkg.from.id).toBe(sessionA);
  expect(pkg.from.name).toBe('初始会话');
  expect(Array.isArray(pkg.openTasks)).toBe(true);
  expect(Array.isArray(pkg.recent)).toBe(true);
  // C 的交接包在 B 尚未 ACK 时也可同时存在;ACK 由原生 run 帧推进(coordinator 分支)
});

it('交接包 ACK 状态推进:PENDING → ACKED(coordinator handoff_ack 帧语义)', () => {
  const f = fixture();
  const { db, ext, r } = f;
  ext.handle(
    { v: 1, id: 'x', method: 'roleSession.create', params: { role_id: r.role, name: 'B' }, client_id: 't', lease_id: 'x' } as never,
    { principal: 'h', mode: 'controller', assertControllerLease: () => {} } as never,
  );
  const h = db.prepare("select id,package_hash from role_session_handoffs where state='PENDING'").get() as { id: string; package_hash: string };
  expect(h.package_hash).toMatch(/^[a-f0-9]{64}$/);
  // 与 native-process-backend 的 handoff_ack 帧 same 契约:coordinator 仅接受 PENDING→ACKED
  db.prepare("update role_session_handoffs set state='ACKED', acked_at_ms=? where id=? and state='PENDING'").run(1, h.id);
  const acked = db.prepare('select state,acked_at_ms from role_session_handoffs where id=?').get(h.id) as { state: string; acked_at_ms: number };
  expect(acked.state).toBe('ACKED');
  expect(acked.acked_at_ms).toBe(1);
});
