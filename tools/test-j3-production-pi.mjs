import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import Database from 'better-sqlite3';
import { piEntry } from './pi-location.mjs';
if (!process.argv.includes('--live')) throw Error('EXPLICIT_LIVE_FLAG_REQUIRED');
mkdirSync('.local/j3-production-pi', { recursive: true });
const root = mkdtempSync(resolve('.local/j3-production-pi/run-'));
const path = (n) => resolve(root, n),
  sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
for (const dir of ['core', 'workspace', 'managed', 'managed/pi'])
  mkdirSync(path(dir), { recursive: true });
const supervisor = path('supervisor.exe'),
  entry = piEntry();
execFileSync(
  resolve(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
  [
    '/nologo',
    '/target:exe',
    '/out:' + supervisor,
    resolve('native/windows-supervisor/Supervisor.cs'),
  ],
  { windowsHide: true, stdio: 'pipe' },
);
const extension = resolve('.local/w11-core/role-tools.mjs');
writeFileSync(
  path('runtime.json'),
  JSON.stringify({
    isolation: 'LIMITED_ISOLATION',
    managedRoot: path('managed'),
    workspaceRoot: path('workspace'),
    supervisorExecutable: supervisor,
    supervisorSha256: sha(supervisor),
    piEntry: entry,
    piEntrySha256: sha(entry),
    piExtension: extension,
    piExtensionSha256: sha(extension),
    credentialFile: 'E:/AgentRouter/账号信息/通用API/Deepseek.txt',
    profiles: [
      {
        id: 'production_pi',
        harness: 'pi',
        executable: process.execPath,
        executableSha256: sha(process.execPath),
        version: '0.85.1',
        providerId: 'agentrouter-deepseek',
        modelId: 'deepseek-v4-flash',
        effort: 'off',
        sessionHome: path('managed/pi'),
      },
    ],
  }),
);
await build({
  entryPoints: ['packages/client-transport/p1/local.ts'],
  outfile: path('transport.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const { LocalCoreTransport } = await import(pathToFileURL(path('transport.mjs')));
const core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
  windowsHide: true,
  stdio: ['ignore', 'ignore', 'pipe'],
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    PATH: '',
    TEMP: root,
    TMP: root,
    AGENTROUTER_DATA: path('core'),
    AGENTROUTER_PROJECT_ROOTS: JSON.stringify([path('workspace')]),
    AGENTROUTER_NATIVE_CONFIG: path('runtime.json'),
  },
});
// Do not persist raw stderr or any credential-bearing transport body.
core.stderr.resume();
let didClose = false;
const closed = new Promise((r) =>
  core.once('close', (code) => {
    didClose = true;
    r(code);
  }),
);
const report = {
  scope: 'PRODUCTION_CORE_REAL_PI',
  status: 'FAIL',
  code_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty_source: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  checks: [],
  fullIsolationCertified: false,
};
let transport, shutdown, client;
try {
  for (let i = 0; i < 100 && !existsSync(path('core/endpoint.json')); i++) {
    if (core.exitCode !== null) throw Error('CORE_START_FAILED');
    await new Promise((r) => setTimeout(r, 100));
  }
  const endpoint = JSON.parse(readFileSync(path('core/endpoint.json'), 'utf8'));
  if (endpoint.source !== 'NATIVE_LIMITED_ISOLATION') throw Error('NATIVE_RUNTIME_NOT_ACTIVE');
  transport = new LocalCoreTransport(path('core'));
  const s = await transport.connect({
    clientId: 'j3_live_pi',
    clientVersion: '1.0.0',
    requestedMode: 'controller',
    contractRevision: 'C1R1P1',
    mode: 'LOCAL_CORE',
  });
  const snapshot = () => s.request('system.snapshot', {});
  let snap = await snapshot();
  const lease = await s.request(
    'control.acquire',
    {},
    { operationId: 'acquire', expectedRevision: snap.revision, scope: {} },
  );
  const mutate = async (method, params, scope, operationId) =>
    s.request(method, params, {
      operationId,
      expectedRevision: (await snapshot()).revision,
      scope,
      leaseId: lease.leaseId,
    });
  shutdown = () => mutate('runtime.shutdownCore', {}, {}, 'shutdown');
  const roots = await s.request('filesystem.listRoots', {});
  const project = await mutate(
    'project.create',
    { name: '真实pi生产入口验证', path_handle: roots.items[0].pathHandle },
    {},
    'project',
  );
  const ws = await s.request('workspace.list', { project_id: project.id });
  const plan = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.groups[0].workspace_ref = ws.items[0].id;
  const role = plan.roles[0];
  role.workspace_ref = ws.items[0].id;
  role.mission = '只完成最小算术任务。Bootstrap请确认已理解章程，不调用工具。';
  role.runtime = {
    harness: 'pi',
    provider_profile_id: 'agentrouter-deepseek',
    model_id: 'deepseek-v4-flash',
    reasoning_effort: 'off',
    selection_source: 'runtime',
  };
  role.requested_permissions = {
    workspace_access: 'read_only',
    allowed_paths: [],
    tool_profiles: ['route_context', 'route_finish'],
    network_profile: 'none',
  };
  const v = await s.request('rolePlan.validate', { plan });
  if (!v.valid) throw Error('PLAN_INVALID');
  const applied = await mutate(
    'rolePlan.apply',
    {
      plan,
      plan_hash: v.planHash,
      confirmed: true,
      permission_grants: [{ role_key: role.role_key, permissions: role.requested_permissions }],
    },
    { project_id: project.id },
    'apply',
  );
  report.checks.push('真实产品入口Plan应用并注册Native配置');
  for (let i = 0; i < 180; i++) {
    const db = new Database(path('core/router.db'), { readonly: true });
    const init = db
      .prepare('select state from initialization_attempts order by created_at_ms desc limit 1')
      .get();
    db.close();
    if (init && ['DELIVERED', 'FAILED', 'UNKNOWN'].includes(init.state)) {
      report.bootstrap = init.state;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (report.bootstrap !== 'DELIVERED') throw Error('BOOTSTRAP_NOT_DELIVERED');
  report.checks.push('真实pi Bootstrap原生结算和Windows Job全树收尾');
  const roles = await s.request('role.list', { scope: { project_id: project.id }, limit: 100 });
  const target = roles.items[0],
    scope = { project_id: project.id, space_id: target.spaceId };
  const request = {
    kind: 'task.request',
    to: { type: 'role', id: target.id },
    summary: '17+25',
    body: 'Calculate 17+25. Call route_context then route_finish with outcome succeeded, summary 42, body 42, outputs []. Do not use any other tools. After tool success, stop.',
    inputs: [],
    expected: ['42'],
    completion: { mode: 'result', to: { type: 'user' } },
  };
  await transport.close();
  client = new Client({ name: 'j3-production-pi', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve('.local/management-mcp/main.mjs'), path('core'), 'controller'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        PATH: '',
        TEMP: root,
        TMP: root,
      },
      stderr: 'pipe',
    }),
  );
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const v = JSON.parse(r.content[0].text);
    if (r.isError) throw Error(v.error);
    return v;
  };
  const status = await call('router_status');
  await call('router_control_acquire', {
    request_key: 'mcp-acquire',
    scope: {},
    expected_revision: status.snapshot.revision,
  });
  const dispatch = {
    request_key: 'mcp-task',
    expected_revision: status.snapshot.revision,
    scope,
    params: { request },
  };
  const task = await call('router_task_dispatch', dispatch);
  const replay = await call('router_task_dispatch', dispatch);
  if (JSON.stringify(task) !== JSON.stringify(replay)) throw Error('MCP_IDEMPOTENCY_FAILED');
  report.checks.push('STDIO SDK Management MCP真实派发与同key幂等');
  for (let i = 0; i < 120; i++) {
    const db = new Database(path('core/router.db'), { readonly: true });
    const run = db
      .prepare('select state from runs where task_id=? order by created_at_ms desc limit 1')
      .get(task.id);
    const result = db
      .prepare('select publication_state,summary from results where task_id=?')
      .get(task.id);
    db.close();
    if (run && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(run.state)) {
      report.run = run.state;
      report.result = result;
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (
    report.run !== 'SUCCEEDED' ||
    report.result?.publication_state !== 'PUBLISHED' ||
    report.result?.summary !== '42'
  )
    throw Error('TASK_RESULT_NOT_VERIFIED');
  report.checks.push('真实Route工具、指定用户结果、原生终态与全树屏障');
  report.status = 'PASS_TASK_AND_BOOTSTRAP';
} catch (error) {
  report.error = /^[A-Z0-9_]{1,96}$/.test(error.message) ? error.message : 'CHECK_FAILED';
} finally {
  try {
    await shutdown?.();
  } catch {}
  await client?.close();
  await transport?.close();
  if (!didClose) core.kill('SIGTERM');
  await Promise.race([closed, new Promise((r) => setTimeout(r, 10000))]);
  report.coreExited = didClose;
  writeFileSync(path('report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: path('report.json'), ...report }));
}
if (report.status === 'FAIL') process.exitCode = 1;
