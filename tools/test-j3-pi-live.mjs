import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { build } from 'esbuild';
import { piEntry } from './pi-location.mjs';
const live = process.argv.includes('--live');
const cancelling = process.argv.includes('--cancel');
const resumeIndex = process.argv.indexOf('--resume');
mkdirSync('.local/j3-pi-live', { recursive: true });
const root = mkdtempSync(resolve('.local/j3-pi-live/run-'));
for (const n of ['home', 'config', 'work', 'sessions']) mkdirSync(resolve(root, n));
await build({
  entryPoints: ['packages/adapters/pi/lifecycle.ts', 'packages/security/approved-provider.ts'],
  outdir: resolve(root, 'lib'),
  outbase: 'packages',
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
});
const { PiLifecycle } = await import(pathToFileURL(resolve(root, 'lib/adapters/pi/lifecycle.mjs')));
const { ApprovedProvider, deepSeekPolicy } = await import(
  pathToFileURL(resolve(root, 'lib/security/approved-provider.mjs'))
);
// Only this trusted parent reads an explicitly authorized source. Never send it to pi.
let secret;
const provider = new ApprovedProvider({ ...deepSeekPolicy, timeoutMs: 60000 }, async () => {
  if (!live) throw Error('CANARY_HAS_NO_REAL_CREDENTIAL');
  if (!secret) {
    const source = readFileSync('E:/AgentRouter/账号信息/通用API/Deepseek.txt', 'utf8');
    const matches = [...new Set(source.match(/sk-[A-Za-z0-9_-]{16,}/g) ?? [])];
    if (matches.length !== 1) throw Error('CREDENTIAL_FORMAT_UNRECOGNIZED');
    secret = matches[0];
  }
  return secret;
});
const capability = randomBytes(24).toString('hex');
let upstream;
const report = {
  scope: live ? 'ACTUAL_PI_DEEPSEEK_COMPONENT' : 'ACTUAL_PI_CANARY_PROVIDER',
  isolation: 'LIMITED_ISOLATION',
  status: 'FAIL',
  requests: 0,
  paidRequests: 0,
  routeCoreCertified: false,
  fullIsolationCertified: false,
  upstreamCancellationCertified: false,
  checks: [],
};
const server = createServer(async (req, res) => {
  try {
    if (
      req.method !== 'POST' ||
      req.url !== '/v1/chat/completions' ||
      req.headers.authorization !== `Bearer ${capability}`
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let raw = '';
    for await (const b of req) {
      raw += b;
      if (Buffer.byteLength(raw) > 262144) throw Error('BODY_LIMIT');
    }
    const body = JSON.parse(raw);
    if (
      body.model !== 'deepseek-v4-flash' ||
      !Array.isArray(body.messages) ||
      report.requests !== 0
    )
      throw Error('REQUEST_DENIED_NO_RETRY');
    report.requests++;
    let events;
    if (live) {
      report.paidRequests++;
      upstream = provider.bufferedStream({
        model: body.model,
        messages: body.messages,
        stream: true,
        max_tokens: 96,
        thinking: { type: 'disabled' },
      });
      const result = await upstream;
      report.upstreamOutcome = result.ok ? 'COMPLETED' : result.code;
      if (!result.ok) {
        report.providerFailure = result.code;
        throw Error('PROVIDER_FAILED');
      }
      events = result.response.events;
    } else
      events = [
        {
          id: 'canary',
          object: 'chat.completion.chunk',
          created: 1,
          model: body.model,
          choices: [{ index: 0, delta: { role: 'assistant', content: '42' }, finish_reason: null }],
        },
        {
          id: 'canary',
          object: 'chat.completion.chunk',
          created: 1,
          model: body.model,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      ];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const event of events) res.write(`data: ${JSON.stringify(event)}\n\n`);
    res.end('data: [DONE]\n\n');
  } catch {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'REGISTERED_PROVIDER_REQUEST_FAILED' } }));
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
writeFileSync(
  resolve(root, 'config/models.json'),
  JSON.stringify({
    providers: {
      'agentrouter-deepseek': {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        api: 'openai-completions',
        apiKey: capability,
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        models: [
          {
            id: 'deepseek-v4-flash',
            name: 'DeepSeek controlled probe',
            reasoning: false,
            input: ['text'],
            contextWindow: 65536,
            maxTokens: 96,
          },
        ],
      },
    },
  }),
);
const entry = piEntry();
report.entrySha256 = createHash('sha256').update(readFileSync(entry)).digest('hex');
const child = spawn(
  process.execPath,
  [
    entry,
    '--mode',
    'rpc',
    '--no-tools',
    '--no-extensions',
    '--no-skills',
    '--no-prompt-templates',
    '--no-themes',
  ],
  {
    cwd: resolve(root, 'work'),
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      HOME: resolve(root, 'home'),
      USERPROFILE: resolve(root, 'home'),
      APPDATA: resolve(root, 'home'),
      LOCALAPPDATA: resolve(root, 'home'),
      TEMP: root,
      TMP: root,
      PATH: resolve(root, 'empty-bin'),
      PI_CODING_AGENT_DIR: resolve(root, 'config'),
      PI_CODING_AGENT_SESSION_DIR: resolve(root, 'sessions'),
      PI_OFFLINE: '1',
      PI_TELEMETRY: '0',
      PI_SKIP_VERSION_CHECK: '1',
      AGENTROUTER_MANAGED_ROLE: '1',
    },
  },
);
let text = '',
  settle;
const settled = new Promise((r) => (settle = r));
const lifecycle = new PiLifecycle({
  write: (b) =>
    new Promise((r, j) => child.stdin.write(b, (e) => (e ? j(Error('PIPE_FAILED')) : r()))),
  onEvent: (e) => {
    if (e.type === 'TextDelta') text += e.text;
    if (e.type === 'RunSettled') settle(e);
  },
  timeoutMs: 20000,
});
child.stdout.on('data', (b) => lifecycle.peer.accept(b));
child.stderr.on('data', () => {});
child.stdin.on('error', () => lifecycle.peer.disconnect());
child.on('error', () => lifecycle.peer.disconnect());
child.on('close', () => lifecycle.peer.end());
let timer;
try {
  let sessionPath;
  if (resumeIndex >= 0) {
    const source = realpathSync(process.argv[resumeIndex + 1]);
    if (!source.toLowerCase().startsWith(realpathSync('.local/j3-pi-live').toLowerCase() + '\\'))
      throw Error('RESUME_SCOPE_DENIED');
    sessionPath = resolve(root, 'sessions/resumed.jsonl');
    copyFileSync(source, sessionPath);
  }
  const opened = await lifecycle.open({
    provider: 'agentrouter-deepseek',
    modelId: 'deepseek-v4-flash',
    thinkingLevel: 'off',
    sessionPath,
  });
  report.sessionId = opened.sessionId;
  report.checks.push('actual_pi_model_and_thinking_verified');
  await lifecycle.start({
    runId: 'minimal-arithmetic',
    text: cancelling
      ? '从1开始逐个列出到10000的整数，不调用工具。'
      : sessionPath
        ? '上一轮算术任务的结果是什么？只输出那个整数，不重新计算。'
        : '计算 17 + 25。只输出十进制整数，不调用工具。',
  });
  if (cancelling) {
    const deadline = Date.now() + 10000;
    while (report.requests === 0 && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 10));
    if (report.requests === 0) throw Error('CANCEL_REQUEST_NOT_STARTED');
    report.cancelAcknowledgement = await lifecycle.cancel();
  }
  const terminal = await Promise.race([
    settled,
    new Promise((_, j) => (timer = setTimeout(() => j(Error('SETTLE_TIMEOUT')), 90000))),
  ]);
  if (
    cancelling
      ? terminal.outcome !== 'cancelled'
      : terminal.outcome !== 'succeeded' || text.trim() !== '42'
  )
    throw Error('TASK_RESULT_MISMATCH');
  report.checks.push(
    cancelling
      ? 'native_cancelled_observed_no_tree_certificate'
      : sessionPath
        ? 'recovered_session_result_42'
        : 'arithmetic_result_42',
    'native_agent_settled_observed',
  );
  const stats = await lifecycle.stats();
  report.usage = stats.tokens;
  report.nativeReportedCost = stats.cost;
  report.actualBilledCost = null;
  report.costCertification = 'NOT_VERIFIED_MODEL_CATALOG_PRICING';
  report.status = 'PASS';
} catch (e) {
  report.failure = /^[A-Z_]+$/.test(e.message) ? e.message : 'PI_CHECK_FAILED';
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  lifecycle.peer.disconnect();
  child.kill();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  if (upstream) await upstream;
  secret = undefined;
  writeFileSync(resolve(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      report: resolve(root, 'report.json'),
      paidRequests: report.paidRequests,
      failure: report.failure,
      providerFailure: report.providerFailure,
    }),
  );
}
