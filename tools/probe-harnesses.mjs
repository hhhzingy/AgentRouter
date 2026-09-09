import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const lock = JSON.parse(readFileSync('compatibility-lock.json', 'utf8'));
const envBase = Object.fromEntries(
  ['SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA']
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
async function probe(h) {
  const home = resolve(`.local/probes/${h.id}`);
  mkdirSync(home, { recursive: true });
  const env = {
    ...envBase,
    TEMP: resolve('.local/tmp'),
    TMP: resolve('.local/tmp'),
    CODEX_HOME: home,
    KIMI_CODE_HOME: home,
    PI_CODING_AGENT_DIR: home,
    PI_OFFLINE: '1',
    PI_TELEMETRY: '0',
  };
  const file = h.id === 'pi' ? process.execPath : h.binary_path;
  const args =
    h.id === 'codex'
      ? ['app-server']
      : h.id === 'kimi_code'
        ? ['acp']
        : [
            h.binary_path,
            '--mode',
            'rpc',
            '--offline',
            '--no-extensions',
            '--no-skills',
            '--no-prompt-templates',
            '--no-themes',
            '--no-context-files',
            '--no-approve',
            '--session-dir',
            resolve(home, 'sessions'),
          ];
  const request =
    h.id === 'codex'
      ? {
          id: 1,
          method: 'initialize',
          params: { clientInfo: { name: 'agentrouter_probe', version: '1.0.0' } },
        }
      : h.id === 'kimi_code'
        ? {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: 1,
              clientCapabilities: {
                fs: { readTextFile: false, writeTextFile: false },
                terminal: false,
              },
              clientInfo: { name: 'agentrouter', version: '1.0.0' },
            },
          }
        : { id: '1', type: 'get_state' };
  const output = {
    harness: h.id,
    at: new Date().toISOString(),
    mode: 'PROBED_NO_ACCOUNT_NO_MODEL',
    request,
    responses: [],
    exit_code: null,
    timeout: false,
  };
  await new Promise((resolveDone) => {
    const p = spawn(file, args, {
      cwd: home,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let pending = Buffer.alloc(0);
    let finished = false;
    const timer = setTimeout(() => {
      output.timeout = true;
      p.kill();
    }, 20000);
    p.on('error', (e) => {
      output.error = e.code;
      clearTimeout(timer);
      resolveDone();
    });
    p.stdout.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      let end;
      while ((end = pending.indexOf(10)) >= 0) {
        const line = pending.subarray(0, end).toString('utf8');
        pending = pending.subarray(end + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          output.responses.push(msg);
          if (msg.id === 1 || msg.id === '1') {
            if (h.id === 'codex' && !msg.error)
              p.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
            finished = true;
            p.stdin.end();
            setTimeout(() => {
              if (p.exitCode === null) p.kill();
            }, 500);
          }
        } catch {
          output.invalid_frame = true;
        }
      }
    });
    // Do not persist arbitrary native stderr (may contain environment/configuration).
    let stderrBytes = 0;
    p.stderr.on('data', (b) => {
      stderrBytes += b.length;
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      output.exit_code = code;
      output.received_handshake = finished;
      output.stderr_bytes = stderrBytes;
      resolveDone();
    });
    p.stdin.on('error', () => {});
    p.stdin.write(JSON.stringify(request) + '\n');
  });
  writeFileSync(`evidence/M00/${h.id}-handshake.json`, JSON.stringify(output, null, 2) + '\n');
  console.log(h.id, JSON.stringify(output));
}
for (const h of lock.harnesses) await probe(h);
