import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { prepareManagedZcodeProfile } from '../../packages/platform/zcode-managed-profile.ts';
import { ZcodeLifecycle } from '../../packages/adapters/zcode/lifecycle.ts';

it.skipIf(process.env.AGENTROUTER_V11_ZCODE_ISOLATED_PROBE !== '1').each(['session/list', 'session/create'])('官方 ZCode 独立 HOME 无模型请求：%s', { timeout: 30000 }, async method => {
  const runtime = 'E:/software/ZCode/resources/glm/zcode.cjs';
  const expectedRuntimeSha256 = process.env.AGENTROUTER_V11_ZCODE_RUNTIME_SHA256;
  expect(expectedRuntimeSha256, '真实探针必须显式绑定本次已核对的 runtime SHA-256')
    .toMatch(/^[0-9a-f]{64}$/);
  expect(createHash('sha256').update(readFileSync(runtime)).digest('hex'))
    .toBe(expectedRuntimeSha256);
  mkdirSync('.local/zcode-isolated-probes', { recursive: true });
  const root = mkdtempSync(resolve('.local/zcode-isolated-probes/list-'));
  const home = join(root, 'home'), workspace = join(root, 'workspace');
  mkdirSync(home); mkdirSync(workspace); mkdirSync(join(workspace, '.git'));
  // create 需非秘密 model/provider 配置(实测:缺 model 键即 -32603 Model config is missing)。
  // 无 apiKey、不发 prompt:create 仅物化 runtime,不需认证。
  const builtinProviderConfigFile = 'E:/software/ZCode/resources/config/provider/zcode-builtin.json';
  const prepared = prepareManagedZcodeProfile(home, undefined, {
    builtinProviderConfigFile,
    defaultModelSelection: {
      providerId: 'account:bigmodel-individual-coding-plan',
      modelId: 'GLM-5.3-Flash',
    },
  });
  const child = spawn(process.execPath, [runtime, 'app-server'], { cwd: workspace, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'], env: {
      SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(home, 'AppData', 'Local'), XDG_CONFIG_HOME: join(home, '.config'),
      TEMP: home, TMP: home, PATH: '', AGENTROUTER_MANAGED_ROLE: '1',
      ...prepared.providerEnv,
    } });
  const closed = new Promise<void>(r => child.once('close', () => r()));
  child.stdin.on('error', () => {});
  // 消费日志但不打印，避免发行物日志意外包含机密。
  child.stderr.on('data', () => {});
  const lifecycle = new ZcodeLifecycle({ write: async bytes => { child.stdin.write(bytes); }, onEvent: () => {}, onDisconnect: () => {} });
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
          try { const frame = JSON.parse(line); if (frame.id === 'isolated-list') resolveReply(frame);
            else if (frame.id !== undefined && typeof frame.method === 'string') lifecycle.accept(Buffer.from(line + '\n'));
          } catch { /* 非协议日志不输出 */ }
        }
      });
      child.stdin.write(JSON.stringify({ id: 'isolated-list', method, params: method === 'session/list' ? {} : {
        workspace: { workspacePath: workspace, workspaceKey: workspace }, titleGenerationEnabled: false,
        mcpServers: [], toolAllowlist: [],
      } }) + '\n');
    });
    if (reply.error) writeFileSync(join(root, 'probe-error.json'), JSON.stringify({ method, code: reply.error.code, pid: child.pid }));
    expect(Boolean(reply.error), '协议不得拒绝隔离请求').toBe(false);
    expect(reply.result && typeof reply.result === 'object').toBeTruthy();
    if (method === 'session/list') expect(reply.result.sessions).toEqual([]);
    else expect(typeof reply.result.session?.sessionId).toBe('string');
    writeFileSync(join(root, 'probe-evidence.json'), JSON.stringify({ scope: 'OFFICIAL_RUNTIME_ISOLATED_NO_PROMPT', method,
      nativeSessionId: reply.result.session?.sessionId,
      resultKeys: Object.keys(reply.result), arrays: Object.fromEntries(Object.entries(reply.result).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k, (v as unknown[]).length])),
      pid: child.pid, runtimeSha256: expectedRuntimeSha256 }, null, 2));
    console.log(JSON.stringify({ scope: 'OFFICIAL_RUNTIME_ISOLATED_LIST_ONLY', resultKeys: Object.keys(reply.result), root, pid: child.pid }));
  } finally {
    clearTimeout(timer!);
    lifecycle.disconnect();
    child.kill(); await closed;
  }
});
