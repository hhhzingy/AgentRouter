import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const exe = process.env.AGENTROUTER_CODEX_EXE ??
  'C:/Users/hap_p/AppData/Local/OpenAI/Codex/bin/247581e40ee272fb/codex.exe';
const home = resolve(process.env.AGENTROUTER_CODEX_SESSION_HOME ??
  '.local-protected/codex-dut/dut-fj/home');
const codexHome = join(home, '.codex');
const identityPath = resolve(process.env.AGENTROUTER_CODEX_APPROVED_IDENTITY ??
  '.local-protected/codex-dut/dut-fj/approved-identity.json');
const root = resolve('.local/codex-raw-appserver-probe');
const workspace = join(root, 'workspace');
const reportPath = join(root, 'report.json');
const model = process.env.AGENTROUTER_CODEX_MODEL ?? 'gpt-5.6-luna';
const effort = process.env.AGENTROUTER_CODEX_EFFORT ?? 'low';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const git = (args) =>
  spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
const head = git(['rev-parse', 'HEAD']);
const status = git(['status', '--porcelain']);
if (head.status !== 0 || status.status !== 0) throw Error('GIT_STATE_UNAVAILABLE');
const safe = (value) => {
  const text = typeof value === 'string' ? value : '';
  return text && text.length <= 160 &&
    !/[@\\/]|bearer|token|secret|authorization|api.?key|users[\\/]/i.test(text)
    ? text.replace(/[^A-Za-z0-9 _.:;(),-]/g, '?')
    : 'REDACTED';
};
if (!existsSync(join(codexHome, 'auth.json')) || !existsSync(identityPath))
  throw Error('CODEX_PROTECTED_DUT_UNAVAILABLE');
for (const path of [workspace, join(workspace, '.git'), join(home, 'tmp'), join(home, 'bin')])
  mkdirSync(path, { recursive: true });

const report = {
  schema: 'agentrouter-codex-raw-appserver-probe/1',
  source_sha: head.stdout.trim(),
  source_dirty: status.stdout.trim().length > 0,
  executable_sha256: hash(readFileSync(exe)),
  installed_version: '0.155.0-alpha.9.2',
  protocol: 'codex app-server JSONL',
  model, effort, attempts: 1, reset_credit_used: false, router_used: false,
  production_home_touched: false, raw_thread_id_persisted: false,
  raw_model_text_persisted: false, status: 'FAIL', phases: [],
};

class Peer {
  constructor(child, phase) {
    this.child = child; this.phase = phase; this.id = 0; this.buffer = '';
    this.pending = new Map(); this.notes = []; this.waiters = [];
    child.stdout.on('data', (bytes) => this.accept(bytes));
    child.on('close', () => this.failAll('PROCESS_CLOSED'));
    child.on('error', () => this.failAll('PROCESS_ERROR'));
  }
  send(value) { this.child.stdin.write(JSON.stringify(value) + '\n'); }
  request(method, params, timeoutMs = 30000) {
    const id = String(++this.id);
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(Error('RPC_TIMEOUT:' + method));
      }, timeoutMs);
      this.pending.set(id, { method, resolve: resolvePromise, reject, timer });
      this.send({ id, method, params });
    });
  }
  notify(method, params) { this.send({ method, params }); }
  accept(bytes) {
    this.buffer += bytes.toString('utf8');
    if (Buffer.byteLength(this.buffer) > 1048576) return this.failAll('FRAME_BUFFER_LIMIT');
    for (;;) {
      const n = this.buffer.indexOf('\n'); if (n < 0) return;
      const line = this.buffer.slice(0, n).replace(/\r$/, '');
      this.buffer = this.buffer.slice(n + 1); if (!line) continue;
      let message; try { message = JSON.parse(line); } catch { return this.failAll('INVALID_JSON'); }
      this.message(message);
    }
  }
  message(message) {
    if (typeof message?.method === 'string') {
      if ('id' in message) {
        if (/^[A-Za-z0-9_./-]{1,120}$/.test(message.method))
          this.phase.reverse_requests.push(message.method);
        return this.send({ id: message.id,
          error: { code: -32000, message: 'REQUEST_REJECTED_BY_NO_TOOL_PROBE' } });
      }
      const note = { method: message.method, params: message.params };
      this.notes.push(note); if (this.notes.length > 512) this.notes.shift();
      for (const waiter of [...this.waiters])
        if (waiter.method === note.method && waiter.test(note.params)) {
          clearTimeout(waiter.timer); this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(note.params);
        }
      return;
    }
    const pending = this.pending.get(String(message?.id)); if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(String(message.id));
    if (message.error) {
      const error = Error('NATIVE_REQUEST_REJECTED'); error.method = pending.method;
      error.nativeCode = message.error.code; error.nativeMessage = safe(message.error.message);
      error.nativeDataKeys = message.error.data && typeof message.error.data === 'object'
        ? Object.keys(message.error.data).filter((k) => /^[A-Za-z0-9_.-]{1,80}$/.test(k)).slice(0, 32) : [];
      pending.reject(error);
    } else pending.resolve(message.result);
  }
  wait(method, test, timeoutMs = 120000) {
    const note = this.notes.find((entry) => entry.method === method && test(entry.params));
    if (note) return Promise.resolve(note.params);
    return new Promise((resolvePromise, reject) => {
      const waiter = { method, test, resolve: resolvePromise, reject };
      waiter.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(Error('NOTIFICATION_TIMEOUT:' + method));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
  failAll(reason) {
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(Error(reason)); }
    for (const item of this.waiters) { clearTimeout(item.timer); item.reject(Error(reason)); }
    this.pending.clear(); this.waiters = [];
  }
}

function launch(name) {
  const phase = { name, initialized: false, reverse_requests: [], clean_stdio_exit: false };
  report.phases.push(phase);
  const child = spawn(exe, [
    '-c', 'cli_auth_credentials_store="file"', '-c', 'sandbox_mode="read-only"',
    '-c', 'approval_policy="never"', '-c', 'features.apps=false',
    '-c', 'features.plugins=false', '-c', 'features.remote_plugin=false',
    '-c', 'web_search="disabled"', 'app-server',
  ], {
    cwd: workspace, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      SYSTEMROOT: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      HOME: home, USERPROFILE: home, CODEX_HOME: codexHome,
      APPDATA: join(home, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(home, 'AppData', 'Local'),
      XDG_CONFIG_HOME: join(home, '.config'), TEMP: join(home, 'tmp'),
      TMP: join(home, 'tmp'), PATH: join(home, 'bin'),
      AGENTROUTER_MANAGED_ROLE: '1', AGENTROUTER_ISOLATION: 'LIMITED_ISOLATION',
    },
  });
  let stderr = Buffer.alloc(0);
  child.stderr.on('data', (bytes) => { stderr = Buffer.concat([stderr, bytes]).subarray(-65536); });
  child.stdin.on('error', () => {});
  const closed = new Promise((resolvePromise) => child.once('close', (code, signal) =>
    resolvePromise({ code, signal, stderrHash: hash(stderr) })));
  return { child, peer: new Peer(child, phase), phase, closed };
}
async function initialize(server) {
  const result = await server.peer.request('initialize', {
    clientInfo: { name: 'agentrouter-raw-probe', version: '1.1.0' }, capabilities: null,
  });
  server.peer.notify('initialized', {}); server.phase.initialized = true;
  server.phase.server_info_present = !!result && typeof result === 'object';
}
async function stop(server) {
  server.child.stdin.end();
  let closed = await Promise.race([server.closed,
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(null), 10000))]);
  if (!closed) { server.child.kill(); closed = await server.closed; }
  else server.phase.clean_stdio_exit = true;
  Object.assign(server.phase, { exit_code: closed.code, exit_signal: closed.signal,
    stderr_sha256: closed.stderrHash });
}
async function verifyIdentityAndModel(server) {
  const approved = JSON.parse(readFileSync(identityPath, 'utf8'));
  const account = await server.peer.request('account/read', { refreshToken: false });
  const email = account?.account?.email;
  if (typeof email !== 'string' || hash(email.trim().toLowerCase()) !== approved.emailSha256)
    throw Error('DUT_ACCOUNT_IDENTITY_UNVERIFIED');
  server.phase.account_identity_hash_match = true;
  const models = await server.peer.request('model/list', {});
  const selected = models?.data?.find((entry) => entry?.model === model);
  const efforts = selected?.supportedReasoningEfforts?.map((entry) => entry.reasoningEffort) ?? [];
  if (!selected) throw Error('REQUESTED_MODEL_UNAVAILABLE');
  if (!efforts.includes(effort)) throw Error('REQUESTED_EFFORT_UNAVAILABLE');
  server.phase.model_and_effort_available = true;
}
async function runTurn(server, threadId, expected) {
  let text = '';
  server.peer.wait('item/agentMessage/delta', (params) => {
    if (params?.threadId === threadId && typeof params.delta === 'string' && text.length < 1024)
      text += params.delta;
    return false;
  }).catch(() => {});
  const started = await server.peer.request('turn/start', {
    threadId, input: [{ type: 'text', text: 'Reply exactly ' + expected +
      '. Do not use tools, files, commands, network, apps, plugins, or MCP.' }], effort,
  });
  const turnId = started?.turn?.id;
  if (typeof turnId !== 'string' || !turnId) throw Error('TURN_ID_MISSING');
  const done = await server.peer.wait('turn/completed',
    (params) => params?.threadId === threadId && params?.turn?.id === turnId);
  if (done?.turn?.status !== 'completed') throw Error('TURN_NOT_COMPLETED:' + safe(done?.turn?.status));
  return { turn_id_sha256: hash(turnId), completed: true,
    exact_expected_token: text.trim() === expected, output_sha256: hash(text.trim()) };
}

let first, second;
try {
  first = launch('new-thread'); await initialize(first); await verifyIdentityAndModel(first);
  const opened = await first.peer.request('thread/start', {
    cwd: workspace, model, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: false,
    developerInstructions: 'No-tool protocol probe. Follow the requested response format exactly.',
  });
  const threadId = opened?.thread?.id;
  if (typeof threadId !== 'string' || !threadId) throw Error('THREAD_ID_MISSING');
  report.thread_id_sha256 = hash(threadId);
  report.first_turn = await runTurn(first, threadId, 'CODEX_RAW_1');
  if (!report.first_turn.exact_expected_token) throw Error('FIRST_TURN_OUTPUT_MISMATCH');
  await stop(first); first = null;

  second = launch('resume-thread'); await initialize(second);
  const resumed = await second.peer.request('thread/resume', { threadId, cwd: workspace, model });
  if (resumed?.thread?.id !== threadId) throw Error('RESUME_ID_MISMATCH');
  second.phase.resume_same_thread = true;
  second.phase.resume_returned_turn_count = Array.isArray(resumed?.thread?.turns)
    ? resumed.thread.turns.length : null;
  report.second_turn = await runTurn(second, threadId, 'CODEX_RAW_2');
  if (!report.second_turn.exact_expected_token) throw Error('SECOND_TURN_OUTPUT_MISMATCH');
  await stop(second); second = null; report.status = 'PASS';
} catch (error) {
  report.failure = error?.message === 'NATIVE_REQUEST_REJECTED'
    ? { class: error.message, method: error.method, native_code: error.nativeCode,
        native_message: error.nativeMessage, native_data_keys: error.nativeDataKeys }
    : { class: safe(error?.message ?? 'UNKNOWN_FAILURE') };
  process.exitCode = 1;
} finally {
  if (first) await stop(first).catch(() => {});
  if (second) await stop(second).catch(() => {});
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, report: reportPath, failure: report.failure }));
}
