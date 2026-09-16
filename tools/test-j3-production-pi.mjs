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
const kimiBailian = process.argv.includes('--kimi-bailian'); // W05 kimi→百炼(官方 openai-wire provider)
const kimi = process.argv.includes('--kimi') || kimiBailian;
const codex = process.argv.includes('--codex');
if(kimi&&codex)throw Error('ONE_HARNESS_PER_TEST');
const dsh = process.argv.includes('--dsh');
const zcode = process.argv.includes('--zcode'); // W11 ZCode→百炼(官方 openai-compatible provider)
const bailian = process.argv.includes('--bailian'); // pi→百炼(DashScope MaaS)绑定
const harnessLabel=codex?'Codex':kimi?(kimiBailian?'Kimi(百炼)':'Kimi'):dsh?'DeepSeek Harness':zcode?'ZCode(百炼)':'pi';
const harness=codex?'codex':kimi?'kimi_code':dsh?'deepseek_harness':zcode?'zcode':'pi';
const providerId=codex?'agentrouter-codex':kimi?(kimiBailian?'agentrouter-bailian':'agentrouter-kimi'):zcode?'agentrouter-zcode':bailian?'agentrouter-dashscope':'agentrouter-deepseek';
const modelId=codex?'gpt-5.6-luna':kimi?(kimiBailian?'bailian/qwen3.8-flash':'kimi-code/kimi-for-coding'):zcode?'zcode-managed':bailian?'qwen3.8-flash':'deepseek-v4-flash';
const effort=codex?'low':kimi?'on':'off';
const executable=codex?'C:/Users/hap_p/AppData/Local/OpenAI/Codex/bin/12219cbfbcbddde7/codex.exe':kimi?'C:/Users/hap_p/.kimi-code/bin/kimi.exe':process.execPath;
const dshBin='C:/Users/hap_p/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const zcodeCli='E:/software/ZCode/resources/glm/zcode.cjs';
const credFile='E:/AgentRouter/账号信息/通用API/百炼.txt';
const maasBase=(zcode?readFileSync(credFile,'utf8').split(/\r?\n/).map(l=>l.trim()).find(l=>/^https:\/\//.test(l)):undefined);
if(zcode&&!maasBase)throw Error('BAILIAN_BASE_MISSING');
if([kimi,codex,dsh,zcode,bailian].filter(Boolean).length>1)throw Error('ONE_HARNESS_PER_TEST');
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
    managedRoot: codex?resolve('.local-protected/codex-dut'):kimi?resolve('.local/j3-kimi'):zcode?resolve('.local/j3-zcode'):path('managed'),
    // 端点从受控凭据文件运行时解析,绝不写进 Git 可见的常量。
    ...(zcode?{zcodeCli,zcodeCredentialFile:credFile,zcodeProvider:{main:'bailian/qwen3.8-flash',provider:{id:'bailian',kind:'openai-compatible',baseURL:maasBase,name:'Bailian MaaS'}}}:{}),
    dshBin: dshBin,
    dshHome: dsh?'C:/Users/hap_p/.dsh':undefined,
    workspaceRoot: path('workspace'),
    supervisorExecutable: supervisor,
    supervisorSha256: sha(supervisor),
    piEntry: entry,
    piEntrySha256: sha(entry),
    piExtension: extension,
    piExtensionSha256: sha(extension),
    credentialFile: bailian?'E:/AgentRouter/账号信息/通用API/百炼.txt':'E:/AgentRouter/账号信息/通用API/Deepseek.txt',
    ...(bailian?{piProvider:{providerId:'agentrouter-dashscope',modelId:'qwen3.8-flash',contextWindowTokens:131072,maxOutputTokens:4096},piCredentialFile:'E:/AgentRouter/账号信息/通用API/百炼.txt',dshCredentialFile:'E:/AgentRouter/账号信息/通用API/百炼.txt'}:{}),
    ...(kimiBailian?{kimiBailianCredentialFile:'E:/AgentRouter/账号信息/通用API/百炼.txt'}:{kimiCredentialSource:'C:/Users/hap_p/.kimi-code/credentials/kimi-code.json'}),
    codexApprovedIdentityFile:resolve('.local-protected/codex-dut/dut-fj/approved-identity.json'),
    roleBridge:resolve('.local/w11-core/role-bridge.mjs'),roleBridgeSha256:sha(resolve('.local/w11-core/role-bridge.mjs')),
    profiles: [
      {
        id: 'production_'+harness,
        harness, executable, executableSha256:sha(executable),
        version: codex?'0.154.0-alpha.6.2':kimi?'0.42.0':dsh?'0.1.5-rc.1':zcode?'0.16.5':'0.85.1',
        providerId, modelId, effort,
        sessionHome: codex?resolve('.local-protected/codex-dut/dut-fj/home'):kimi?resolve('.local/j3-kimi/dut/home'):zcode?resolve('.local/j3-zcode/dut/home'):path('managed/pi'),
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
    ...(process.env.AR_ZCODE_DEBUG ? { AR_ZCODE_DEBUG: process.env.AR_ZCODE_DEBUG } : {}),
  },
});
// Do not persist raw stderr or any credential-bearing transport body.
const coreErrChunks = [];
  core.stderr.on('data', (d) => coreErrChunks.push(d));
let didClose = false;
const closed = new Promise((r) =>
  core.once('close', (code) => {
    didClose = true;
    r(code);
  }),
);
const report = {
  scope: codex?'PRODUCTION_CORE_REAL_CODEX':kimi?'PRODUCTION_CORE_REAL_KIMI':dsh?'PRODUCTION_CORE_REAL_DEEPSEEK_HARNESS':zcode?'PRODUCTION_CORE_REAL_ZCODE':'PRODUCTION_CORE_REAL_PI',
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
  if (dsh || zcode) {
    // C1R1P2:动态 HarnessId 计划需先升级连接协议
    const up = await s.request('contract.upgrade', { revision: 'C1R1P2' });
    report.p2upgrade = up && up.revision === 'C1R1P2';
  }
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
  role.mission = '只完成最小算术任务；业务任务使用获授权的 Route 工具提交结果。';
  role.runtime = {
    harness, provider_profile_id:providerId, model_id:modelId, reasoning_effort:effort,
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
  report.checks.push('真实'+harnessLabel+' Bootstrap原生结算和Windows Job全树收尾');
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
    if (r.isError) throw Error(name + ' -> ' + v.error);
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
  if (process.argv.includes('--ab')) {
    // R4:A→B→A→C 原生会话隔离+交接包 ACK——切回必须恢复各自原生会话
    const abListA = await call('router_role_session_list', { params: { role_id: target.id } });
    const sessionA = abListA.active_session_id;
    const abTask = async (summary, body, expectedSummary, key) => {
      await call('router_task_dispatch', {
        request_key: key,
        expected_revision: (await call('router_status')).snapshot.revision,
        scope,
        params: { request: { kind: 'task.request', to: { type: 'role', id: target.id }, summary, body, inputs: [], expected: [expectedSummary], completion: { mode: 'result', to: { type: 'user' } } } },
      });
      for (let i = 0; i < 150; i++) {
        const db = new Database(path('core/router.db'), { readonly: true });
        const run = db.prepare("select state from runs where task_id=(select id from tasks where summary=?) order by created_at_ms desc limit 1").get(summary);
        const result = db.prepare('select publication_state,summary from results where task_id=(select id from tasks where summary=?)').get(summary);
        db.close();
        if (run && ['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(run.state)) return { run: run.state, result };
        await new Promise((r) => setTimeout(r, 1000));
      }
      return { run: 'TIMEOUT', result: null };
    };
    const abExpect = (r, want) => {
      if (!r || r.run !== 'SUCCEEDED' || !r.result || r.result.publication_state !== 'PUBLISHED' || r.result.summary !== want)
        throw Error('AB_RUN_NOT_VERIFIED');
    };
    const createdB = await call('router_role_session_create', { params: { role_id: target.id, name: 'B方向' } });
    const sessionB = createdB.session.id;
    abExpect(await abTask('AB任务一', 'Calculate 8+9. Call route_context then route_finish with outcome succeeded, summary 17, body 17, outputs []. The session handoff acknowledgment must be the first line of your reply. After tool success, stop.', '17', 'ab-task-b'), '17');
    const backA = await call('router_role_session_switch', { params: { role_id: target.id, session_id: sessionA } });
    if (backA.id !== sessionA) throw Error('AB_SWITCH_BACK_FAILED');
    abExpect(await abTask('AB任务二', 'Calculate 5+6. Call route_context then route_finish with outcome succeeded, summary 11, body 11, outputs []. The session handoff acknowledgment must be the first line of your reply. After tool success, stop.', '11', 'ab-task-a2'), '11');
    const createdC = await call('router_role_session_create', { params: { role_id: target.id, name: 'C方向' } });
    const sessionC = createdC.session.id;
    abExpect(await abTask('AB任务三', 'Calculate 3+4. Call route_context then route_finish with outcome succeeded, summary 7, body 7, outputs []. The session handoff acknowledgment must be the first line of your reply. After tool success, stop.', '7', 'ab-task-c'), '7');
    const dbh = new Database(path('core/router.db'), { readonly: true });
    const acked = dbh.prepare("select count(*) n from role_session_handoffs where state='ACKED'").get().n;
    const refs = dbh.prepare('select id, native_session_ref from role_sessions where role_id=?').all(target.id);
    dbh.close();
    if (acked < 3) throw Error('AB_HANDOFF_ACK_NOT_VERIFIED');
    const refIds = refs.filter((r) => r.native_session_ref).map((r) => JSON.parse(r.native_session_ref).id);
    if (refIds.length < 3 || new Set(refIds).size < 3) throw Error('AB_NATIVE_ISOLATION_BROKEN');
    report.ab = { sessions: [sessionA, sessionB, sessionC], handoffsAcked: acked, nativeRefs: refIds.length };
    report.checks.push('真实A→B→A→C原生会话隔离与交接包ACK');
  }
  if (process.argv.includes('--cancel')) {
    const next = await call('router_status');
    const cancelledTask = await call('router_task_dispatch', {
      request_key: 'cancel-task', expected_revision: next.snapshot.revision, scope,
      params: {request: {...request, summary:'取消验证',body:'List prime numbers below 200 and explain the calculation, then report with route_finish. This is a cancellation test.'}},
    });
    let running;
    for (let i=0;i<1000;i++) {
      const db=new Database(path('core/router.db'),{readonly:true});
      running=db.prepare('select id,state from runs where task_id=? order by created_at_ms desc limit 1').get(cancelledTask.id);db.close();
      if (running?.state === 'RUNNING') break;
      if (running && ['UNKNOWN','SUCCEEDED','FAILED','CANCELLED'].includes(running.state)) throw Error('CANCEL_WINDOW_NOT_OBSERVED');
      await new Promise(r=>setTimeout(r,20));
    }
    if (running?.state !== 'RUNNING') throw Error('CANCEL_RUN_NOT_ACCEPTED');
    const current=await call('router_status');
    await call('router_run_cancel',{request_key:'cancel-run',expected_revision:current.snapshot.revision,scope,params:{id:running.id}});
    for (let i=0;i<120;i++) {
      const db=new Database(path('core/router.db'),{readonly:true});
      const ended=db.prepare('select state from runs where id=?').get(running.id);db.close();
      if (['UNKNOWN','SUCCEEDED','FAILED','CANCELLED'].includes(ended.state)){report.cancel=ended.state;break;}
      await new Promise(r=>setTimeout(r,500));
    }
    if(report.cancel!=='CANCELLED')throw Error('NATIVE_CANCEL_NOT_VERIFIED');
    report.checks.push('Management MCP运行中取消、原生取消终态和Job屏障');
  }
  report.status = 'PASS_TASK_AND_BOOTSTRAP';
} catch (error) {
  report.error = /^[A-Z0-9_]{1,96}$/.test(error.message) ? error.message : 'CHECK_FAILED';
  report.error_stack = String(error.stack ?? '').split('\n').slice(0, 6).join(' | ');
} finally {
  try {
    await shutdown?.();
  } catch {}
  await client?.close();
  await transport?.close();
  if (!didClose) core.kill('SIGTERM');
  await Promise.race([closed, new Promise((r) => setTimeout(r, 10000))]);
  report.coreExited = didClose;
  try { report.core_stderr = coreErrChunks.join('').slice(-2000); } catch {}
  writeFileSync(path('report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: path('report.json'), ...report }));
}
if (report.status === 'FAIL') process.exitCode = 1;
