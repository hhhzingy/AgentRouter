import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
mkdirSync('.local/mcp-tests', { recursive: true });
const dir = mkdtempSync(resolve('.local/mcp-tests/actual-'));
const data = resolve(dir, 'core'),
  workspace = resolve(dir, 'workspace');
mkdirSync(workspace);
const env = {
  SystemRoot: process.env.SystemRoot,
  WINDIR: process.env.WINDIR,
  TEMP: dir,
  TMP: dir,
  PATH: '',
  AGENTROUTER_DATA: data,
  AGENTROUTER_PROJECT_ROOTS: JSON.stringify([workspace]),
};
const core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
  env,
  stdio: 'ignore',
  windowsHide: true,
});
let client, setupTransport;
const checks = [];
async function attach(mode = 'controller') {
  client = new Client({ name: 'agentrouter-mcp-smoke', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve('.local/management-mcp/main.mjs'), data, mode],
      env: { SystemRoot: env.SystemRoot, WINDIR: env.WINDIR, PATH: '', TEMP: dir, TMP: dir },
      stderr: 'pipe',
    }),
  );
}
async function call(name, args = {}) {
  const reply = await client.callTool({ name, arguments: args });
  const value = JSON.parse(reply.content[0].text);
  if (reply.isError) throw Error(value.error);
  return value;
}
try {
  for (let i = 0; i < 100 && !existsSync(resolve(data, 'endpoint.json')); i++)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(existsSync(resolve(data, 'endpoint.json')));
  await build({
    entryPoints: ['packages/client-transport/p1/local.ts'],
    outfile: resolve(dir, 'transport.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  });
  const { LocalCoreTransport } = await import(pathToFileURL(resolve(dir, 'transport.mjs')).href);
  setupTransport = new LocalCoreTransport(data);
  const s = await setupTransport.connect({
    clientId: 'mcp_smoke_setup',
    clientVersion: '1.0.0',
    requestedMode: 'controller',
    contractRevision: 'C1R1P1',
    mode: 'LOCAL_CORE',
  });
  const snap = await s.request('system.snapshot', {}),
    lease = await s.request(
      'control.acquire',
      {},
      { operationId: 'setup_acquire', expectedRevision: snap.revision, scope: {} },
    );
  const roots = await s.request('filesystem.listRoots', {});
  const project = await s.request(
    'project.create',
    { name: 'Management MCP 专用验证', path_handle: roots.items[0].pathHandle },
    {
      operationId: 'setup_project',
      expectedRevision: snap.revision,
      scope: {},
      leaseId: lease.leaseId,
    },
  );
  const ws = await s.request('workspace.list', { project_id: project.id });
  await setupTransport.close();
  await attach();
  const status = await call('router_status');
  assert.equal(status.hello.capabilities.mock, false);
  checks.push('真实STDIO MCP连接LOCAL_CORE');
  const tools = await client.listTools();
  assert.ok(tools.tools.some((t) => t.name === 'router_plan_apply'));
  assert.ok(!tools.tools.some((t) => t.name === 'route_send'));
  checks.push('Management工具与RoleBridge分离');
  assert.equal(
    (
      await call('router_project_get', {
        params: { id: project.id, scope: { project_id: project.id } },
      })
    ).id,
    project.id,
  );
  const plan = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
  plan.project_id = project.id;
  for (const g of plan.groups) g.workspace_ref = ws.items[0].id;
  for (const r of plan.roles) r.workspace_ref = ws.items[0].id;
  const validation = await call('router_plan_validate', { params: { plan } });
  assert.equal(validation.valid, true);
  checks.push('Role Plan真实Core validate');
  await call('router_control_acquire', {
    request_key: 'acquire1',
    scope: {},
    expected_revision: status.snapshot.revision,
  });
  const input = {
    params: { plan, plan_hash: validation.planHash, confirmed: true, permission_grants: [] },
    request_key: 'apply1',
    expected_revision: status.snapshot.revision,
    scope: { project_id: project.id },
  };
  const applied = await call('router_plan_apply', input);
  assert.deepEqual(await call('router_plan_apply', input), applied);
  checks.push('apply同request_key同payload幂等');
  await assert.rejects(
    call('router_plan_apply', { ...input, params: { ...input.params, plan_hash: 'changed' } }),
    /OPERATION_CONFLICT/,
  );
  checks.push('同key不同payload冲突');
  await client.close();
  process.kill(core.pid, 0);
  await attach();
  const after = await call('router_status');
  const roles = await call('router_roles', {
    params: { scope: { project_id: project.id }, limit: 100 },
  });
  assert.equal(roles.items.length, plan.roles.length);
  checks.push('重启MCP后真实SQLite角色持久，Core未被关闭');
  await call('router_control_acquire', {
    request_key: 'acquire2',
    scope: {},
    expected_revision: after.snapshot.revision,
  });
  await new Promise((r) => setTimeout(r, 32000));
  checks.push('租约持有超过30秒后继续写入验证续租');
  const row = roles.items[0],
    scope = { project_id: project.id, space_id: row.spaceId };
  const dispatch = {
    request_key: 'dispatch_smoke',
    expected_revision: after.snapshot.revision,
    scope,
    params: {
      request: {
        kind: 'task.request',
        to: { type: 'role', id: row.id },
        summary: 'MCP排队验证',
        body: '不要求真实Harness执行；只验证持久派发和取消。',
        inputs: [],
        expected: ['持久任务记录'],
        completion: { mode: 'result', to: { type: 'user' } },
      },
    },
  };
  const task = await call('router_task_dispatch', dispatch);
  assert.equal(task.state, 'QUEUED');
  assert.deepEqual(await call('router_task_dispatch', dispatch), task);
  checks.push('真实任务排队与派发幂等（未执行Harness）');
  assert.equal(
    (await call('router_wait', { params: { id: task.id, scope, wait_ms: 0 } })).timedOut,
    true,
  );
  const results = await call('router_results', { params: { scope, limit: 100 } });
  assert.equal(results.items.length, 0);
  checks.push('等待读取QUEUED、结果为空，不伪造完成');
  const pendingWait = call('router_wait', { params: { id: task.id, scope, wait_ms: 10000 } });
  const beforeCancel = await call('router_status');
  await call('router_task_cancel', {
    request_key: 'cancel_smoke',
    expected_revision: beforeCancel.snapshot.revision,
    scope,
    params: { id: task.id },
  });
  assert.equal((await pendingWait).task.state, 'CANCELLED');
  checks.push('等待期间取消不被MCP串行队列阻塞');
  const terminal = await call('router_wait', { params: { id: task.id, scope, wait_ms: 0 } });
  assert.equal(terminal.timedOut, false);
  assert.equal(terminal.task.state, 'CANCELLED');
  checks.push('实际Core取消与零等待终态');
  const page1 = await call('router_roles', {
      params: { scope: { project_id: project.id }, limit: 1 },
    }),
    page2 = await call('router_roles', {
      params: { scope: { project_id: project.id }, limit: 1, after_id: page1.items[0].id },
    });
  assert.notEqual(page1.items[0].id, page2.items[0].id);
  checks.push('角色分页第二页');
  const lastStatus = await call('router_status');
  await call('router_control_release', {
    request_key: 'release2',
    scope: {},
    expected_revision: lastStatus.snapshot.revision,
  });
  await call('router_control_release', {
    request_key: 'release2',
    scope: {},
    expected_revision: lastStatus.snapshot.revision,
  });
  checks.push('重启后新租约可获取释放');
  checks.push('释放租约重复key幂等');
  await client.close();
  await attach('observer');
  const observerTools = await client.listTools();
  assert.ok(!observerTools.tools.some((t) => t.name === 'router_task_dispatch'));
  await assert.rejects(
    () =>
      call('router_control_acquire', { request_key: 'forbidden', scope: {}, expected_revision: 0 }),
    /TOOL_UNAVAILABLE/,
  );
  assert.equal((await call('router_status')).hello.capabilities.mock, false);
  checks.push('Observer仅只读且显式拒绝控制工具');
  writeFileSync(
    resolve(dir, 'report.json'),
    JSON.stringify(
      {
        scope: 'ACTUAL_STDIO_MCP_LOCAL_CORE_NO_HARNESS',
        sdk: '1.30.0',
        checks,
        realHarnessSupport: 0,
        status: 'PASS',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ status: 'PASS', checks, dir }));
} finally {
  await client?.close();
  await setupTransport?.close();
  core.kill();
}
