// W10:三轮固定负载与故障集合(fixture 驱动,零付费调用)。
// 覆盖:任务完成/幂等重放/运行中取消/断线重连 mutation 不重复/历史可读/
// 内存与子进程与队列观测/DB 迁移与完整性/关停 Job 屏障。
import { fork, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import Database from 'better-sqlite3';

const ROUNDS = 3;
const TASKS_PER_ROUND = 6;
if (!existsSync(resolve('.local/w11-core/core.mjs'))) throw Error('BUILD_W11_CORE_REQUIRED');
mkdirSync('.local/v10-load', { recursive: true });

await build({
  entryPoints: ['packages/client-transport/p1/local.ts'],
  outfile: '.local/v10-load/transport.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  absWorkingDir: process.cwd(),
});
const { LocalCoreTransport } = await import(pathToFileURL(resolve('.local/v10-load/transport.mjs')).href);
const seed = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(get, ok, ms = 20000, tag = 'COND') {
  const end = Date.now() + ms;
  let x;
  do {
    x = await get();
    if (ok(x)) return x;
    await delay(50);
  } while (Date.now() < end);
  throw Error('LOAD_' + tag + '_TIMEOUT');
}

async function round(n) {
  mkdirSync('.local/v10-load', { recursive: true });
  const dir = mkdtempSync(resolve('.local/v10-load/round-'));
  writeFileSync(resolve(dir, 'fixture-data.marker'), 'AGENTROUTER_ISOLATED_FIXTURE');
  const child = fork(resolve('.local/w11-core/core.mjs'), [], {
    execPath: process.execPath,
    windowsHide: true,
    silent: true,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      TEMP: dir,
      TMP: dir,
      AGENTROUTER_DATA: dir,
      AGENTROUTER_PROJECT_ROOTS: JSON.stringify([dir]),
      AGENTROUTER_FIXTURE: '1',
    },
  });
  let stderr = '';
  child.stderr?.on('data', (b) => (stderr += b.toString()));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(Error('LOAD_CORE_READY_TIMEOUT:' + stderr.slice(0, 200))), 12000);
    child.on('message', (m) => { if (m?.ready) { clearTimeout(t); res(); } });
    child.once('exit', (c) => { clearTimeout(t); rej(Error('LOAD_CORE_EXIT_EARLY:' + c)); });
  });
  let rss0 = null; try { const o0 = execFileSync(resolve(process.env.WINDIR, 'System32/tasklist.exe'), ['/FI', 'PID eq ' + child.pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }); const m0 = o0.match(/"(d[d,.]*) K"/); rss0 = m0 ? Number(m0[1].replaceAll(/[,.]/g, '')) : null; } catch {}
  const report = { round: n, rssStartKb: rss0, checks: [] };
  const transport = new LocalCoreTransport(dir);
  try {
    const s = await transport.connect({ clientId: 'load_client_' + n, clientVersion: '1.0.0-dev.0', requestedMode: 'controller', mode: 'LOCAL_CORE' });
    let snap = await s.request('system.snapshot', {});
    const lease = await s.request('control.acquire', {}, { operationId: 'lease', expectedRevision: snap.revision, scope: {} });
    let op = 0;
    const write = async (m, p, scope = {}) =>
      s.request(m, p, { operationId: 'op_' + ++op + '_' + n, expectedRevision: (await s.request('system.snapshot', {})).revision, scope, leaseId: lease.leaseId });
    const roots = await s.request('filesystem.listRoots', {});
    const project = await write('project.create', { name: '固定负载项目', path_handle: roots.items[0].pathHandle });
    const ws = await s.request('workspace.list', { project_id: project.id });
    const plan = structuredClone(seed);
    plan.project_id = project.id;
    for (const g of plan.groups) g.workspace_ref = ws.items[0].id;
    for (const r of plan.roles) r.workspace_ref = ws.items[0].id;
    const v = await s.request('rolePlan.validate', { plan });
    const applied = await write('rolePlan.apply', { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] }, { project_id: project.id });
    const roleIds = applied.roleIds;
    snap = await s.request('system.snapshot', {});
    const role = (id) => snap.roles.find((r) => r.id === id);
    const spaceOf = (r) => snap.spaces.find((x) => x.id === r.spaceId);
    report.checks.push('plan_applied_roles=' + roleIds.length); console.log('R'+n,'phase plan-applied');
    // bootstrap 结算:fixture 角色需先注入场景,再等待 roleCharter.bootstrapState=DELIVERED
    for (const rid of roleIds) child.send({ id: 'cfgb_' + rid, action: 'configureFixture', roleId: rid, scenario: {} });
    await delay(200);
    for (const rid of roleIds) {
      await until(
        () => s.request('roleCharter.get', { project_id: project.id, role_id: rid }),
        (c) => c.bootstrapState === 'DELIVERED',
        20000,
        'BOOTSTRAP_' + rid.slice(-4),
      );
    }
    report.checks.push('bootstrap_delivered=' + roleIds.length); console.log('R'+n,'phase bootstrap');
    const dbq = (sql, ...a) => { const db = new Database(resolve(dir, 'router.db'), { readonly: true }); try { return db.prepare(sql).all(...a); } finally { db.close(); } };
    // 固定集合:4 完成 + 1 幂等重放(同 operation 双发返回同结果且不重复建任务)+ 1 运行中取消。
    const mkReq = (roleId, key) => ({
      request: { kind: 'task.request', to: { type: 'role', id: roleId }, summary: key, body: 'fixture', inputs: [], expected: ['x'], completion: { mode: 'result', to: { type: 'user' } } },
      scope: { project_id: project.id, space_id: role(roleId).spaceId },
    });
    const task = async (roleId, key) => {
      const q = mkReq(roleId, key);
      return s.request('task.submitFromUser', { request: q.request }, { operationId: 't_' + key + '_' + n, expectedRevision: (await s.request('system.snapshot', {})).revision, scope: q.scope, leaseId: lease.leaseId });
    };
    console.log('R'+n,'phase submit');
    const traceTry = async (tag, fn) => { try { return await fn(); } catch (e) { console.log('TR', tag, e.message, e.frame ?? '', e.ajv ?? '', String(e.stack).split(String.fromCharCode(10)).slice(1,3).join(' | ').slice(0,200)); throw e; } };
    const done = [];
    for (let i = 0; i < 4; i++) done.push(await traceTry('done'+i, () => task(roleIds[i % roleIds.length], 'done' + i)));
    const iq = mkReq(roleIds[0], 'idem');
    const idemRev = (await s.request('system.snapshot', {})).revision;
    const idem = await s.request('task.submitFromUser', { request: iq.request }, { operationId: 't_idem_' + n, expectedRevision: idemRev, scope: iq.scope, leaseId: lease.leaseId });
    const idemAgain = await s.request('task.submitFromUser', { request: iq.request }, { operationId: 't_idem_' + n, expectedRevision: idemRev, scope: iq.scope, leaseId: lease.leaseId });
    report.idemReplay = JSON.stringify(idemAgain) === JSON.stringify(idem) ? 'SAME' : 'DIFF';
    if (report.idemReplay !== 'SAME') throw Error('LOAD_IDEMPOTENT_REPLAY_DIFF');
    await until(
      () => Promise.resolve(dbq("select count(*) c from runs where state='SUCCEEDED'")),
      (x) => Number(x[0].c) >= 5,
      20000,
      'RUNS_SUCCEED',
    );
    const succeeded = Number(dbq("select count(*) c from runs where state='SUCCEEDED'")[0].c);
    if (succeeded < 5) throw Error('LOAD_RUN_NOT_SUCCEEDED');
    const published = Number(dbq("select count(*) c from results where publication_state='PUBLISHED'")[0].c);
    if (published < 5) throw Error('LOAD_RESULT_NOT_PUBLISHED');
    const dupTasks = Number(dbq("select count(*) c from tasks where summary='idem'")[0].c);
    if (dupTasks !== 1) throw Error('LOAD_IDEMPOTENT_REPLAY_CREATED_DUPLICATE');
    report.checks.push('completed=' + succeeded + ' published=' + published + ' idem_single_task=1');
    // 取消:慢场景角色 + 运行中取消
    child.send({ id: 'cfg1', action: 'configureFixture', roleId: roleIds[0], scenario: { delayMs: 5000, steps: [] } });
    await new Promise((r) => setTimeout(r, 200));
    await task(roleIds[0], 'cancelme');
    const runId = await until(
      () => Promise.resolve(dbq("select id,state from runs where task_id=(select id from tasks where summary='cancelme') order by created_at_ms desc limit 1")),
      (x) => x[0] && x[0].state === 'RUNNING',
      15000,
      'RUN_RUNNING',
    ).then((x) => x[0].id);
    await write('run.cancel', { id: runId }, { project_id: project.id, space_id: spaceOf(role(roleIds[0])).id });
    await until(() => Promise.resolve(dbq('select state from runs where id=?', runId)), (x) => x[0]?.state === 'CANCELLED', 15000, 'RUN_CANCELLED');
    report.checks.push('cancel_native_settled'); console.log('R'+n,'phase cancelled');
    child.send({ id: 'cfg2', action: 'configureFixture', roleId: roleIds[0], scenario: {} });
    // 断线重连:旧连接关闭→新连接同身份;不得复活/复制历史 mutation(任务总数稳定)
    console.log('R'+n,'phase reconnect');
    const tasksBefore = Number(dbq('select count(*) c from tasks')[0].c);
    await transport.close();
    const transport2 = new LocalCoreTransport(dir);
    const s2 = await transport2.connect({ clientId: 'load_client_' + n, clientVersion: '1.0.0-dev.0', requestedMode: 'controller', mode: 'LOCAL_CORE' });
    await delay(500);
    const tasksAfter = Number(dbq('select count(*) c from tasks')[0].c);
    if (tasksAfter !== tasksBefore) throw Error('LOAD_RECONNECT_DUPLICATED_MUTATION');
    report.checks.push('reconnect_no_resurrect count=' + tasksAfter);
    // 历史可读(新语义):完成任务的 conversation.read 返回条目
    const taskId0 = dbq("select id from tasks where summary='done0'")[0].id;
    const conv = await s2.request('conversation.read', { task_id: taskId0, limit: 50 }).catch((e) => 'ERR:' + e.message);
    report.historyReadable = Array.isArray(conv?.items) ? conv.items.length > 0 : conv;
    if (report.historyReadable !== true) throw Error('LOAD_HISTORY_NOT_READABLE');
    // 队列/子进程观测:活动工作(非终态 run)已清空;fixture 无子进程
    const active = await s2.request('runtime.getActiveWork', {});
    const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN']);
    const actCount = (active?.runs ?? active?.items ?? []).filter((r) => r?.state && !TERMINAL.has(r.state)).length;
    report.activeAfterSettle = actCount;
    if (actCount !== 0) throw Error('LOAD_ACTIVE_WORK_NOT_DRAINED:' + actCount);
    try {
      const out = execFileSync(resolve(process.env.WINDIR, 'System32/tasklist.exe'), ['/FI', 'PID eq ' + child.pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
      const m = out.match(/"(\d[\d,.]*) K"/);
      report.rssEndKb = m ? Number(m[1].replaceAll(/[,.]/g, '')) : null;
    } catch { report.rssEndKb = null; }
    report.checks.push('active_work_drained rss_kb=' + report.rssEndKb);
    report.dbTables = Number(dbq("select count(*) c from sqlite_master where type='table'")[0].c);
    report.integrity = dbq('pragma integrity_check')[0].integrity_check;
    // 关停:shutdownCore + 进程退出屏障(重连后须用新租约)
    const snap2 = await s2.request('system.snapshot', {});
    const lease2 = await s2.request('control.acquire', {}, { operationId: 'lease2_' + n, expectedRevision: snap2.revision, scope: {} });
    await s2.request('runtime.shutdownCore', {}, { operationId: 'sd_' + n, expectedRevision: snap2.revision, scope: {}, leaseId: lease2.leaseId }).catch(() => {});
    await until(() => Promise.resolve(child.exitCode !== null || child.signalCode !== null), (x) => x === true, 12000, 'CORE_EXIT');
    try { await transport2.close(); } catch {}
    report.checks.push('shutdown_job_barrier_clean');
    return report;
  } catch (e) {
    report.error = String(e.message).slice(0, 160);
    report.error_at = String(e.stack ?? '').split('\n').slice(1, 4).join(' | ').slice(0, 300);
    console.log('ROUND', n, 'ERROR_AT', report.error_at);
    try { child.kill(); } catch {}
    throw e;
  } finally {
    try { transport.close?.(); } catch {}
    if (child.exitCode === null && child.signalCode === null) { try { child.kill(); } catch {} }
  }
}

const results = [];
let failed = false;
for (let i = 1; i <= ROUNDS; i++) {
  try {
    const r = await round(i);
    results.push(r);
    console.log('ROUND', i, 'OK', JSON.stringify({ checks: r.checks.length, rss: r.rssEndKb, tables: r.dbTables, integrity: r.integrity }));
  } catch (e) {
    failed = true;
    results.push({ round: i, error: String(e.message).slice(0, 200) });
    console.log('ROUND', i, 'FAIL', String(e.message).slice(0, 200));
  }
}
writeFileSync(resolve('.local/v10-load/fixed-load-report.json'), JSON.stringify({ at: new Date().toISOString(), rounds: results }, null, 2) + '\n');
if (failed) process.exitCode = 1;
