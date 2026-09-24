import { build } from 'esbuild';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  copyFileSync,
  unlinkSync,
  existsSync,
  readFileSync,
  readdirSync,
  cpSync,
  realpathSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
mkdirSync('.local/j3-kimi', { recursive: true });
const root = mkdtempSync(resolve('.local/j3-kimi/probe-'));
const resumeIndex = process.argv.indexOf('--resume-root');
let resumeRoot;
if (resumeIndex >= 0) {
  resumeRoot = realpathSync(process.argv[resumeIndex + 1]);
  if (!resumeRoot.toLowerCase().startsWith(realpathSync('.local/j3-kimi').toLowerCase() + '\\'))
    throw Error('RESUME_SCOPE_DENIED');
}
const work = resumeRoot ? resolve(resumeRoot, 'work') : resolve(root, 'work');
mkdirSync(work, { recursive: true });
await build({
  entryPoints: ['packages/adapters/kimi/lifecycle.ts'],
  outdir: resolve(root, 'lib'),
  outbase: 'packages',
  bundle: true,
  platform: 'node',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
});
const { KimiLifecycle } = await import(
  pathToFileURL(resolve(root, 'lib/adapters/kimi/lifecycle.mjs'))
);
const live = process.argv.includes('--live');
const home = resolve(root, 'home'),
  kimiHome = resolve(home, '.kimi-code');
for (const dir of [
  home,
  kimiHome,
  resolve(kimiHome, 'agents'),
  resolve(kimiHome, 'credentials'),
  resolve(home, '.codex'),
  resolve(work, '.git'),
])
  mkdirSync(dir, { recursive: true });
writeFileSync(
  resolve(kimiHome, 'agents/agent.md'),
  '---\nname: agent\ndescription: AgentRouter arithmetic only\noverride: true\ntools: []\nsubagents: []\n---\nAnswer arithmetic questions directly. No tools are available.\n',
);
const credentialCopy = resolve(kimiHome, 'credentials/kimi-code.json');
let nativeSessionId;
if (resumeRoot) {
  const source = resolve(resumeRoot, 'home/.kimi-code/sessions');
  const groups = readdirSync(source).filter((x) => x.startsWith('wd_'));
  const states = groups.flatMap((g) =>
    readdirSync(resolve(source, g))
      .filter((s) => s.startsWith('session_'))
      .map((s) => resolve(source, g, s, 'state.json')),
  );
  if (states.length !== 1) throw Error('RESUME_SESSION_AMBIGUOUS');
  nativeSessionId = JSON.parse(readFileSync(states[0], 'utf8')).id;
  cpSync(source, resolve(kimiHome, 'sessions'), { recursive: true, errorOnExist: true });
}
if (live) {
  const prepared = spawnSync(
    'D:/Software/anaconda3/python.exe',
    [resolve('tools/prepare-kimi-probe.py'), kimiHome],
    { windowsHide: true, stdio: 'ignore' },
  );
  if (prepared.status !== 0) throw Error('KIMI_CONFIG_PREPARATION_FAILED');
  copyFileSync('C:/Users/hap_p/.kimi-code/credentials/kimi-code.json', credentialCopy);
}
const child = spawn('C:/Users/hap_p/.kimi-code/bin/kimi.exe', ['acp'], {
  cwd: work,
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: resolve(home, '.codex'),
    KIMI_CODE_HOME: kimiHome,
    APPDATA: home,
    LOCALAPPDATA: home,
    TEMP: root,
    TMP: root,
    PATH: resolve(root, 'empty-bin'),
    KIMI_CODE_NO_AUTO_UPDATE: '1',
    KIMI_DISABLE_TELEMETRY: '1',
    KIMI_DISABLE_CRON: '1',
    AGENTROUTER_MANAGED_ROLE: '1',
  },
});
const processHandle = {
  stdout: child.stdout,
  stderr: child.stderr,
  write: (b) =>
    new Promise((r, j) => child.stdin.write(b, (e) => (e ? j(Error('PIPE_FAILED')) : r()))),
  closed: new Promise((r) => child.once('close', r)),
  stop: async () => {
    child.kill();
    return { kind: 'unknown', epoch: 1 };
  },
};
child.stdin.on('error', () => {});
let resultText = '';
const lifecycle = new KimiLifecycle({
  epoch: '1',
  write: processHandle.write,
  onEvent: (e) => {
    if (e.type === 'TextDelta') resultText += e.text;
  },
  timeoutMs: 60000,
});
child.on('error', () => lifecycle.peer.disconnect());
let diagnosticBuffer = '';
processHandle.stdout.on('data', (b) => {
  diagnosticBuffer += b.toString('utf8');
  if (diagnosticBuffer.length > 262144) diagnosticBuffer = '';
  while (diagnosticBuffer.includes('\n')) {
    const end = diagnosticBuffer.indexOf('\n'),
      line = diagnosticBuffer.slice(0, end);
    diagnosticBuffer = diagnosticBuffer.slice(end + 1);
    try {
      const frame = JSON.parse(line);
      if (frame.result?.modes?.currentModeId)
        report.nativeMode = String(frame.result.modes.currentModeId).replace(/[^a-z_-]/g, '');
      if (frame.error) {
        const message = JSON.stringify(frame.error).toLowerCase();
        report.nativeError = {
          code: frame.error.code,
          categories: [
            'unknown session',
            'session not found',
            'mode',
            'unsupported',
            'permission',
            'agent',
            'read-only',
            'not found',
            'internal',
            'invalid',
            'already',
            'plan',
            'file',
            'enoent',
            'restore',
            'permission',
            'directory',
          ].filter((x) => message.includes(x)),
        };
      }
    } catch {}
  }
  lifecycle.peer.accept(b);
});
processHandle.stderr.on('data', () => {});
processHandle.closed.then(() => lifecycle.peer.end());
const report = {
  scope: 'ACTUAL_KIMI_ISOLATED_NO_CREDENTIAL_NO_PROMPT',
  status: 'FAIL',
  submittedTasks: 0,
  realHarnessCertified: false,
  fullIsolationCertified: false,
};
try {
  const hello = await lifecycle.initialize();
  report.agentInfo = hello.agentInfo;
  report.protocolVersion = hello.protocolVersion;
  const session = await lifecycle.open({ cwd: work, mcpServers: [], nativeSessionId });
  report.nativeSessionId = session.sessionId;
  report.configOptions = session.configOptions;
  if (live) {
    report.scope = 'ACTUAL_KIMI_ISOLATED_SESSION_READY';
    if (process.argv.includes('--task')) {
      if (!nativeSessionId) await lifecycle.configure('mode', 'plan');
      else report.modeConfiguration = 'PRESERVED_SESSION_NATIVE_MODE_REPORT_INCONSISTENCY';
      report.scope = 'ACTUAL_KIMI_K27_ARITHMETIC_COMPONENT';
      report.thinking = 'on_only_native_available';
      report.submittedTasks = 1;
      const cancelling = process.argv.includes('--cancel');
      const running = lifecycle.start({
        runId: 'arithmetic',
        epoch: '1',
        text: nativeSessionId
          ? '上一轮口算结果是什么？只输出那个整数，不调用工具。'
          : '这是一个无需工具的口算问题：17加25等于多少？只回答十进制整数，不制定计划、不调用工具。',
      });
      if (cancelling) {
        await new Promise((r) => setTimeout(r, 250));
        report.cancelRequest = lifecycle.cancel('1');
      }
      const result = await running;
      report.nativeOutcome = result.outcome;
      report.correctResult = resultText.trim() === '42';
      if (
        cancelling
          ? result.outcome !== 'cancelled'
          : result.outcome !== 'succeeded' || !report.correctResult
      )
        throw Error('ARITHMETIC_RESULT_MISMATCH');
      if (cancelling) report.scope = 'ACTUAL_KIMI_K27_CANCEL_COMPONENT';
      else if (nativeSessionId) report.scope = 'ACTUAL_KIMI_K27_RECOVERY_COMPONENT';
    }
  }
  report.status = 'PASS';
} catch (e) {
  report.failure = /^[A-Z_]+$/.test(e.message) ? e.message : 'ACP_CHECK_FAILED';
  process.exitCode = 1;
} finally {
  lifecycle.peer.disconnect();
  report.stop = await processHandle.stop();
  await processHandle.closed;
  if (existsSync(credentialCopy)) unlinkSync(credentialCopy);
  writeFileSync(resolve(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      report: resolve(root, 'report.json'),
      failure: report.failure,
    }),
  );
}
