import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  copyFileSync,
  unlinkSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
mkdirSync('.local/j3-codex', { recursive: true });
const root = mkdtempSync(resolve('.local/j3-codex/probe-')),
  home = resolve(root, 'home'),
  work = resolve(root, 'work'),
  codexHome = resolve(home, '.codex');
for (const p of [home, work, codexHome, resolve(work, '.git')]) mkdirSync(p, { recursive: true });
writeFileSync(
  resolve(codexHome, 'config.toml'),
  'cli_auth_credentials_store = "file"\nsandbox_mode = "read-only"\napproval_policy = "never"\n[features]\napps = false\nplugins = false\nremote_plugin = false\n',
);
await build({
  entryPoints: ['packages/adapters/codex/lifecycle.ts'],
  outfile: resolve(root, 'lifecycle.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { CodexLifecycle } = await import(pathToFileURL(resolve(root, 'lifecycle.mjs')));
const report = {
  scope: 'CODEX_DUT_ISOLATED_PREFLIGHT',
  status: 'FAIL',
  submittedTasks: 0,
  developerAccountTouched: false,
  fullIsolationCertified: false,
  routeCoreCertified: false,
};
async function phase(live) {
  // Preserve refreshed credentials in the single managed DUT; never replay the rejected seed.
  const activeHome = live ? resolve('.local/j3-codex/dut-fj/home') : home;
  const activeCodexHome = live ? resolve(activeHome, '.codex') : codexHome;
  const auth = resolve(activeCodexHome, 'auth.json');
  if (live && !existsSync(auth)) throw Error('FRESH_DUT_LOGIN_REQUIRED');
  const child = spawn(
    'C:/Users/hap_p/AppData/Local/OpenAI/Codex/bin/7ac07f4ce733f89a/codex.exe',
    ['-c', 'cli_auth_credentials_store="file"', 'app-server'],
    {
      cwd: work,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        HOME: activeHome,
        USERPROFILE: activeHome,
        CODEX_HOME: activeCodexHome,
        APPDATA: activeHome,
        LOCALAPPDATA: activeHome,
        PATH: resolve(root, 'empty-bin'),
        TEMP: root,
        TMP: root,
        AGENTROUTER_MANAGED_ROLE: '1',
      },
    },
  );
  let resultText = '',
    finish;
  const settled = new Promise((r) => (finish = r));
  const lifecycle = new CodexLifecycle({
    write: (b) =>
      new Promise((r, j) => child.stdin.write(b, (e) => (e ? j(Error('PIPE_FAILED')) : r()))),
    onEvent: (e) => {
      if (e.type === 'TextDelta') resultText += e.text;
      if (e.type === 'RunSettled') finish(e);
    },
    timeoutMs: 30000,
  });
  child.stdout.on('data', (b) => lifecycle.peer.accept(b));
  child.stderr.on('data', () => {});
  child.stdin.on('error', () => {});
  child.on('error', () => lifecycle.peer.disconnect());
  const closed = new Promise((r) => child.once('close', r));
  let timer;
  try {
    await lifecycle.initialize();
    const mcp = await lifecycle.peer.request('mcpServerStatus/list', {});
    report.nativeMcpNames = (mcp.data ?? []).map((x) =>
      /^[A-Za-z0-9_-]{1,80}$/.test(x.name) ? x.name : 'REDACTED',
    );
    report.emptyNativeMcpVerified = Array.isArray(mcp.data) && mcp.data.length === 0;
    if (!Array.isArray(mcp.data) || mcp.data.length !== 0)
      throw Error('MANAGEMENT_MCP_INHERITANCE_DENIED');
    report.emptyNativeMcpVerified = true;
    if (live) {
      report.scope = 'ACTUAL_CODEX_APPROVED_DUT_LUNA_COMPONENT';
      const approved = JSON.parse(
        readFileSync(resolve('.local/j3-codex/dut-fj/approved-identity.json'), 'utf8'),
      );
      const current = JSON.parse(readFileSync(auth, 'utf8'));
      const claims = JSON.parse(
        Buffer.from(current.tokens.id_token.split('.')[1], 'base64url').toString('utf8'),
      );
      const hash = (value) => createHash('sha256').update(value).digest('hex');
      const identity = await lifecycle.peer.request('account/read', { refreshToken: false });
      if (
        typeof identity.account?.email !== 'string' ||
        hash(identity.account.email.trim().toLowerCase()) !== approved.emailSha256 ||
        hash(current.tokens.account_id) !== approved.accountIdSha256 ||
        hash(claims.sub) !== approved.subjectSha256
      )
        throw Error('DUT_ACCOUNT_IDENTITY_UNVERIFIED');
      report.accountIdentityMatchesAuthorizedDut = true;
      const models = await lifecycle.peer.request('model/list', {});
      const luna = models.data?.find((m) => m.model === 'gpt-5.6-luna');
      if (!luna) throw Error('REQUESTED_MODEL_UNAVAILABLE');
      const supported = luna.supportedReasoningEfforts?.map((x) => x.reasoningEffort) ?? [];
      const effort = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].find((e) =>
        supported.includes(e),
      );
      if (!effort) throw Error('REASONING_UNVERIFIED');
      report.model = luna.model;
      report.effort = effort;
      await lifecycle.open({
        cwd: work,
        model: luna.model,
        instructions:
          'Only answer the arithmetic question. Do not use tools, files, network or commands.',
      });
      report.submittedTasks++;
      await lifecycle.start({ runId: 'arithmetic', text: '计算17加25，只输出整数。', effort });
      const cancelling = process.argv.includes('--cancel');
      if (cancelling) {
        await new Promise((r) => setTimeout(r, 250));
        report.cancelAcknowledgement = await lifecycle.cancel();
      }
      const terminal = await Promise.race([
        settled,
        new Promise((_, j) => (timer = setTimeout(() => j(Error('TURN_TIMEOUT')), 90000))),
      ]);
      report.outcome = terminal.outcome;
      report.correctResult = resultText.trim() === '42';
      if (
        cancelling
          ? terminal.outcome !== 'cancelled'
          : terminal.outcome !== 'succeeded' || !report.correctResult
      )
        throw Error('TASK_RESULT_MISMATCH');
      if (cancelling) report.scope = 'ACTUAL_CODEX_APPROVED_DUT_CANCEL_COMPONENT';
    }
  } finally {
    clearTimeout(timer);
    lifecycle.peer.disconnect();
    child.kill();
    await closed;
    if (!live && existsSync(auth)) unlinkSync(auth);
  }
}
try {
  await phase(false);
  if (process.argv.includes('--live')) await phase(true);
  report.status = 'PASS';
} catch (e) {
  report.failure = /^[A-Z_]+$/.test(e.message) ? e.message : 'CODEX_CHECK_FAILED';
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      report: resolve(root, 'report.json'),
      failure: report.failure,
    }),
  );
}
