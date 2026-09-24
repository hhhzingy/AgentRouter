import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const entry = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw Error('EXPLICIT_PI_ENTRY_REQUIRED');
mkdirSync('.local/j3-native-probes', { recursive: true });
const root = mkdtempSync(resolve('.local/j3-native-probes/pi-'));
for (const name of ['home', 'appdata', 'localappdata', 'config', 'sessions', 'work'])
  mkdirSync(resolve(root, name));
await build({
  entryPoints: ['packages/adapters/pi/rpc-peer.ts'],
  outfile: resolve(root, 'peer.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { PiRpcPeer } = await import(pathToFileURL(resolve(root, 'peer.mjs')).href);
const args = [
  entry,
  '--mode',
  'rpc',
  '--no-session',
  '--no-tools',
  '--no-extensions',
  '--no-skills',
  '--no-prompt-templates',
  '--no-themes',
];
const child = spawn(process.execPath, args, {
  cwd: resolve(root, 'work'),
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: resolve(root, 'home'),
    USERPROFILE: resolve(root, 'home'),
    APPDATA: resolve(root, 'appdata'),
    LOCALAPPDATA: resolve(root, 'localappdata'),
    TEMP: root,
    TMP: root,
    PATH: '',
    PI_CODING_AGENT_DIR: resolve(root, 'config'),
    PI_CODING_AGENT_SESSION_DIR: resolve(root, 'sessions'),
    PI_OFFLINE: '1',
    PI_TELEMETRY: '0',
    PI_SKIP_VERSION_CHECK: '1',
  },
});
const started = Date.now();
let diagnosticBytes = 0;
const report = {
  scope: 'ACTUAL_PI_OFFLINE_RPC_NO_AUTH_NO_MODEL_CALL',
  entryHash: createHash('sha256').update(readFileSync(entry)).digest('hex'),
  newPaidCalls: 0,
  realHarnessCertified: false,
  status: 'FAIL',
  checks: [],
  durationMs: 0,
};
const peer = new PiRpcPeer({
  write: (b) =>
    new Promise((r, j) => child.stdin.write(b, (e) => (e ? j(Error('WRITE_FAILED')) : r()))),
  onEvent: () => {},
  onDisconnect: () => {},
  timeoutMs: 20000,
});
child.stdout.on('data', (b) => peer.accept(b));
child.stderr.on('data', (b) => (diagnosticBytes += b.length));
child.stdin.on('error', () => peer.disconnect('PIPE_CLOSED'));
child.on('error', () => peer.disconnect('PROCESS_FAILED'));
child.on('close', () => peer.end());
try {
  const state = await peer.request('get_state');
  if (
    typeof state.sessionId !== 'string' ||
    state.isStreaming !== false ||
    state.pendingMessageCount !== 0
  )
    throw Error('STATE_INVALID');
  report.checks.push('actual_rpc_state_idle');
  const models = await peer.request('get_available_models');
  if (!Array.isArray(models.models)) throw Error('MODEL_RESPONSE_INVALID');
  report.checks.push('actual_rpc_model_catalog_shape');
  report.availableModelCount = models.models.length;
  report.status = 'PASS';
} catch {
  process.exitCode = 1;
  report.failure = 'OFFLINE_RPC_CHECK_FAILED';
} finally {
  peer.disconnect();
  const closed = new Promise((r) => child.once('close', r));
  child.kill();
  await Promise.race([closed, new Promise((r) => setTimeout(r, 5000))]);
  report.durationMs = Date.now() - started;
  report.diagnosticBytes = diagnosticBytes;
  writeFileSync(resolve(root, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: report.status,
      newPaidCalls: 0,
      resultPath: resolve(root, 'result.json'),
    }),
  );
}
