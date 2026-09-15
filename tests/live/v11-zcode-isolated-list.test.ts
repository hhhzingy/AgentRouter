import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { prepareManagedZcodeProfile } from '../../packages/platform/zcode-managed-profile.ts';

it.skipIf(process.env.AGENTROUTER_V11_ZCODE_ISOLATED_PROBE !== '1')('官方 ZCode 独立 HOME app-server 仅列举新目录会话', { timeout: 30000 }, async () => {
  const runtime = 'E:/software/ZCode/resources/glm/zcode.cjs';
  expect(createHash('sha256').update(readFileSync(runtime)).digest('hex'))
    .toBe('e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8');
  mkdirSync('.local/zcode-isolated-probes', { recursive: true });
  const root = mkdtempSync(resolve('.local/zcode-isolated-probes/list-'));
  const home = join(root, 'home'), workspace = join(root, 'workspace');
  mkdirSync(home); mkdirSync(workspace); mkdirSync(join(workspace, '.git'));
  prepareManagedZcodeProfile(home);
  const child = spawn(process.execPath, [runtime, 'app-server'], { cwd: workspace, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'], env: {
      SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(home, 'AppData', 'Local'), XDG_CONFIG_HOME: join(home, '.config'),
      TEMP: home, TMP: home, PATH: '', AGENTROUTER_MANAGED_ROLE: '1',
    } });
  const closed = new Promise<void>(r => child.once('close', () => r()));
  child.stdin.on('error', () => {});
  // 消费日志但不打印，避免发行物日志意外包含机密。
  child.stderr.on('data', () => {});
  let timer: ReturnType<typeof setTimeout>;
  try {
    const reply = await new Promise<any>((resolveReply, reject) => {
      let buffer = '';
      timer = setTimeout(() => reject(Error('ISOLATED_ZCODE_LIST_TIMEOUT')), 20000);
      child.once('error', () => reject(Error('ISOLATED_ZCODE_START_FAILED')));
      child.once('exit', () => reject(Error('ISOLATED_ZCODE_EXITED')));
      child.stdout.on('data', bytes => {
        buffer += bytes.toString();
        if (buffer.length > 1048576) { reject(Error('ISOLATED_ZCODE_OUTPUT_LIMIT')); return; }
        const lines = buffer.split('\n'); buffer = lines.pop()!;
        for (const line of lines) {
          try { const frame = JSON.parse(line); if (frame.id === 'isolated-list') resolveReply(frame); } catch { /* 非协议日志不输出 */ }
        }
      });
      child.stdin.write(JSON.stringify({ id: 'isolated-list', method: 'session/list', params: {} }) + '\n');
    });
    expect(Boolean(reply.error), '协议不得拒绝 session/list').toBe(false);
    expect(reply.result && typeof reply.result === 'object').toBeTruthy();
    writeFileSync(join(root, 'probe-evidence.json'), JSON.stringify({ scope: 'OFFICIAL_RUNTIME_ISOLATED_LIST_ONLY',
      resultKeys: Object.keys(reply.result), arrays: Object.fromEntries(Object.entries(reply.result).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k, (v as unknown[]).length])),
      pid: child.pid, runtimeSha256: 'e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8' }, null, 2));
    console.log(JSON.stringify({ scope: 'OFFICIAL_RUNTIME_ISOLATED_LIST_ONLY', resultKeys: Object.keys(reply.result), root, pid: child.pid }));
  } finally {
    clearTimeout(timer!);
    child.kill(); await closed;
  }
});
