import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import Database from 'better-sqlite3';

if (!process.argv.includes('--live')) throw Error('EXPLICIT_LIVE_FLAG_REQUIRED');
const ownerIndex = process.argv.indexOf('--runtime');
if (ownerIndex < 0 || !process.argv[ownerIndex + 1]) throw Error('OWNER_RUNTIME_REQUIRED');
const owner = JSON.parse(readFileSync(resolve(process.argv[ownerIndex + 1]), 'utf8'));
const supportedProfile = {
  pi: p => p.providerId === 'agentrouter-deepseek' && p.modelId === 'deepseek-v4-flash' && p.effort === 'off',
  kimi_code: p => p.providerId === 'agentrouter-kimi' && p.modelId === 'kimi-code/kimi-for-coding' && p.effort === 'on',
  codex: p => p.providerId === 'agentrouter-codex' && p.modelId === 'gpt-5.6-luna' && p.effort === 'low',
};
const profiles = (owner.profiles ?? []).filter(p => supportedProfile[p.harness]?.(p));
if (profiles.length < 2) throw Error('APPROVED_PAIR_PROFILES_REQUIRED');
mkdirSync('.local/j3-production-pair', { recursive: true });
const root = mkdtempSync(resolve('.local/j3-production-pair/run-'));
const path = name => resolve(root, name), sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
for (const name of ['core', 'workspace', 'managed/pi']) mkdirSync(path(name), { recursive: true });
const runtime = { ...owner, managedRoot: resolve('.local'), workspaceRoot: path('workspace'), profiles: profiles.map(p => p.harness === 'pi' ? { ...p, sessionHome: path('managed/pi') } : { ...p }) };
writeFileSync(path('runtime.json'), JSON.stringify(runtime));
await build({ entryPoints: ['packages/client-transport/p1/local.ts'], outfile: path('transport.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const { LocalCoreTransport } = await import(pathToFileURL(path('transport.mjs')));
const report = { scope: 'PRODUCTION_CORE_REAL_BIDIRECTIONAL_HANDOFF', status: 'FAIL', code_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty_source: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), artifact_hashes: { core: sha('.local/w11-core/core.mjs'), mcp: sha('.local/management-mcp/main.mjs') }, fullIsolationCertified: false, rounds: [], nativeBootstrap: [], automaticRetry: false };
const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: '', TEMP: root, TMP: root };
const core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...env, AGENTROUTER_DATA: path('core'), AGENTROUTER_PROJECT_ROOTS: JSON.stringify([path('workspace')]), AGENTROUTER_NATIVE_CONFIG: path('runtime.json') } });
core.stderr.resume();
let closed = false, transport, client;
core.once('close', () => { closed = true; });
core.once('error', () => { report.error = 'CORE_SPAWN_FAILED'; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function read(fn) { const db = new Database(path('core/router.db'), { readonly: true }); try { return fn(db); } finally { db.close(); } }
async function poll(fn, seconds = 240) { for (let i = 0; i < seconds; i++) { const value = fn(); if (value) return value; if (closed) throw Error('CORE_EXITED'); await pause(1000); } throw Error('OBSERVATION_TIMEOUT'); }
try {
  await poll(() => existsSync(path('core/endpoint.json')), 20);
  if (JSON.parse(readFileSync(path('core/endpoint.json'), 'utf8')).source !== 'NATIVE_LIMITED_ISOLATION') throw Error('NATIVE_RUNTIME_NOT_ACTIVE');
  transport = new LocalCoreTransport(path('core'));
  const session = await transport.connect({ clientId: 'j3_pair_setup', clientVersion: '1.0.0', requestedMode: 'controller', contractRevision: 'C1R1P1', mode: 'LOCAL_CORE' });
  const snap = () => session.request('system.snapshot', {});
  const lease = await session.request('control.acquire', {}, { operationId: 'setup-acquire', expectedRevision: (await snap()).revision, scope: {} });
  const mutate = async (method, params, scope, operationId) => session.request(method, params, { operationId, scope, expectedRevision: (await snap()).revision, leaseId: lease.leaseId });
  const roots = await session.request('filesystem.listRoots', {});
  const project = await mutate('project.create', { name: 'pi Codex 双向真实交接', path_handle: roots.items[0].pathHandle }, {}, 'project');
  const workspace = (await session.request('workspace.list', { project_id: project.id })).items[0];
  const plan = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1); plan.groups[0].workspace_ref = workspace.id;
  const template = plan.roles[0];
  plan.roles = profiles.map((profile, i) => ({ ...structuredClone(template), role_key: `pair_role_${i}`, display_name: `Pair ${profile.harness}`, group_key: plan.groups[0].group_key, workspace_ref: workspace.id, mission: 'Only perform the explicitly requested minimal Route handoff; no filesystem or network tools.', runtime: { harness: profile.harness, provider_profile_id: profile.providerId, model_id: profile.modelId, reasoning_effort: profile.effort, selection_source: 'runtime' }, requested_permissions: { workspace_access: 'read_only', allowed_paths: [], tool_profiles: ['route_context','route_send','route_finish','route_wait'], network_profile: 'none' } }));
  const validated = await session.request('rolePlan.validate', { plan });
  if (!validated.valid) throw Error('PAIR_PLAN_INVALID');
  await mutate('rolePlan.apply', { plan, plan_hash: validated.planHash, confirmed: true, permission_grants: plan.roles.map(role => ({ role_key: role.role_key, permissions: role.requested_permissions })) }, { project_id: project.id }, 'pair-apply');
  await poll(() => {
    report.nativeBootstrap = read(db => db.prepare('select role_id,state,source from initialization_attempts').all());
    if (report.nativeBootstrap.some(row => ['FAILED','UNKNOWN'].includes(row.state))) throw Error('BOOTSTRAP_FAILED');
    return report.nativeBootstrap.length === profiles.length && report.nativeBootstrap.every(row => row.state === 'DELIVERED' && row.source === 'NATIVE');
  });
  const pair = read(db => db.prepare('select r.id,r.space_id,b.harness from roles r join bindings b on b.role_id=r.id where b.is_current=1').all());
  if (pair.length !== profiles.length || !pair.every(row => row.space_id === pair[0].space_id)) throw Error('PAIR_NOT_SAME_GROUP');
  await transport.close(); transport = undefined;
  client = new Client({ name: 'j3-production-pair', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('.local/management-mcp/main.mjs'), path('core'), 'controller'], env, stderr: 'pipe' }));
  const call = async (name, args = {}) => { const result = await client.callTool({ name, arguments: args }); const value = JSON.parse(result.content[0].text); if (result.isError) throw Error('MANAGEMENT_CALL_FAILED'); return value; };
  await call('router_control_acquire', { request_key: 'pair-acquire', scope: {}, expected_revision: (await call('router_status')).snapshot.revision });
  for (const source of pair) for (const target of pair) {
    if (source.id === target.id) continue;
    const round = { direction: `${source.harness}_to_${target.harness}`, status: 'FAIL' }; report.rounds.push(round);
    const before = read(db => db.prepare("select coalesce(max(seq),0) seq from messages where to_kind='user'").get().seq);
    const child = { kind: 'task.request', to: { type: 'role', id: target.id }, summary: '17+25', body: 'Calculate 17+25. Call route_context then route_finish outcome succeeded, summary 42, body 42, outputs []. Stop after success. No other tools.', inputs: [], expected: ['42'], completion: { mode: 'result', to: { type: 'user' } } };
    const request = { kind: 'task.request', to: { type: 'role', id: source.id }, summary: round.direction, body: `Call route_context then complete this handoff using route_finish with outcome succeeded, summary handoff, body handoff, outputs [], and next_request exactly ${JSON.stringify(child)}. Do not send a notice or user receipt. Stop after the tool succeeds.`, inputs: [], expected: ['handoff'], completion: { mode: 'handoff', to: { type: 'role', id: target.id }, instruction: 'Delegate the arithmetic result directly to the user, without an intermediate user receipt.' } };
    const task = await call('router_task_dispatch', { request_key: `pair-${round.direction}`, expected_revision: (await call('router_status')).snapshot.revision, scope: { project_id: project.id, space_id: source.space_id }, params: { request } });
    round.rootTaskId = task.id;
    await poll(() => {
      const state = read(db => {
        const tasks = db.prepare('select id,parent_task_id,assignee_role_id,state,completion_json from tasks where id=? or parent_task_id=? order by seq').all(task.id,task.id);
        const runs = db.prepare('select r.id,r.task_id,r.role_id,r.state,s.source,s.native_terminal,s.resources_stopped from runs r join run_sources s on s.run_id=r.id where r.task_id in(select id from tasks where id=? or parent_task_id=?)').all(task.id,task.id);
        const results = db.prepare('select id,task_id,run_id,outcome,publication_state,summary from results where task_id in(select id from tasks where id=? or parent_task_id=?)').all(task.id,task.id).map(({summary,...safe})=>({...safe, summaryKind:summary==='42'?'42':summary==='handoff'?'handoff':'OTHER_REDACTED'}));
        return { tasks, runs, results };
      });
      Object.assign(round,state);
      if (state.runs.some(run => ['UNKNOWN','FAILED','CANCELLED'].includes(run.state))) throw Error('PAIR_NATIVE_RUN_FAILED');
      return state.tasks.length === 2 && state.tasks[0].state === 'HANDED_OFF' && state.tasks[1].state === 'DELIVERED' && state.runs.length === 2 && state.runs.every(run => run.state === 'SUCCEEDED' && run.source === 'NATIVE' && run.native_terminal === 1 && run.resources_stopped === 1);
    });
    await poll(()=>read(db=>db.prepare("select count(*) n from messages m join outbox o on o.message_id=m.id where m.to_kind='user' and m.seq>? and o.state='DELIVERED'").get(before).n>0),30);
    const userMessages = read(db => db.prepare("select m.id,m.kind,m.from_role_id,m.task_id,m.payload_json,o.state delivery_state from messages m left join outbox o on o.message_id=m.id where m.to_kind='user' and m.seq>? order by m.seq").all(before));
    const expected = userMessages.length === 1 && userMessages[0].kind === 'task.result' && userMessages[0].from_role_id === target.id && JSON.parse(userMessages[0].payload_json).summary === '42';
    round.userMessages = userMessages.map(({payload_json,...safe}) => ({...safe, correctResult: JSON.parse(payload_json).summary === '42'}));
    if (!expected) throw Error('EXPLICIT_DESTINATION_OR_SILENT_SUCCESS_FAILED');
    round.status = 'PASS';
  }
  report.status = 'PASS';
} catch(error) { report.error = /^[A-Z0-9_]{1,96}$/.test(error.message) ? error.message : 'PAIR_CHECK_FAILED'; }
finally {
  await client?.close().catch(() => {}); await transport?.close().catch(() => {});
  if (!closed) core.kill('SIGTERM');
  for(let i=0;i<100&&!closed;i++) await pause(100);
  report.coreExited = closed;
  writeFileSync(path('report.json'), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ report: path('report.json'), status: report.status, error: report.error }));
}
if(report.status!=='PASS')process.exitCode=1;
