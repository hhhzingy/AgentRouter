// C7:装配隔离五 Harness native-runtime(Codex 无独立 DUT 身份则省略)。
// 百炼.txt 只引用绝对路径,不复制;不碰生产 Codex/ZCode/Kimi/DSH HOME。
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { piEntry } from './pi-location.mjs';

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const BASE = resolve('.local/v11-c7-dut');
const CRED = 'E:/AgentRouter/账号信息/通用API/百炼.txt';
const ZCLI_SRC = 'E:/software/ZCode/resources/glm/zcode.cjs';
const ZPROV_SRC = 'E:/software/ZCode/resources/config/provider/zcode-builtin.json';
const DSH_BIN = 'C:/Users/hap_p/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js';
const KIMI_EXE = 'C:/Users/hap_p/.kimi-code/bin/kimi.exe';
const SUPERVISOR_CS = resolve('native/windows-supervisor/Supervisor.cs');
const CSC = resolve(process.env.WINDIR ?? 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');

if (!existsSync(CRED)) throw Error('BAILIAN_CREDENTIAL_PATH_MISSING');
if (!existsSync(ZCLI_SRC) || !existsSync(ZPROV_SRC)) throw Error('ZCODE_INSTALL_MISSING');
if (!existsSync(DSH_BIN)) throw Error('DSH_BIN_MISSING');
if (!existsSync(KIMI_EXE)) throw Error('KIMI_EXE_MISSING');
if (!existsSync(CSC)) throw Error('BLOCKED_ENV_SUPERVISOR_COMPILER');

for (const d of [
  'core',
  'workspace',
  'managed/pi',
  'managed/dsh',
  'managed/dsh-home/profiles',
  'managed/kimi',
  'managed/zcode',
  'managed/zcode-cli/provider',
])
  mkdirSync(resolve(BASE, d), { recursive: true });

copyFileSync(ZCLI_SRC, resolve(BASE, 'managed/zcode-cli/zcode.cjs'));
copyFileSync(ZPROV_SRC, resolve(BASE, 'managed/zcode-cli/provider/zcode-builtin.json'));

const supervisor = resolve(BASE, 'supervisor.exe');
execFileSync(CSC, ['/nologo', '/platform:x64', '/target:exe', '/out:' + supervisor, SUPERVISOR_CS], {
  windowsHide: true,
  stdio: 'pipe',
});

const lines = readFileSync(CRED, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const urlLine = lines.find((l) => /^https?:\/\//.test(l));
if (!urlLine) throw Error('CRED_URL_LINE_MISSING');
const baseURL = urlLine.replace(/\/$/, '');

const entry = piEntry();
const roleBridge = resolve('packages/role-bridge/stdio.mjs');
const piExtension = resolve('packages/pi-extension/agentrouter-tools.mjs');
const nodeSha = sha(process.execPath);

const cfg = {
  isolation: 'LIMITED_ISOLATION',
  managedRoot: resolve(BASE, 'managed'),
  workspaceRoot: resolve(BASE, 'workspace'),
  supervisorExecutable: supervisor,
  supervisorSha256: sha(supervisor),
  zcodeCli: resolve(BASE, 'managed/zcode-cli/zcode.cjs'),
  zcodeCredentialFile: CRED,
  credentialFile: CRED,
  dshBin: DSH_BIN,
  dshHome: resolve(BASE, 'managed/dsh-home'),
  dshCredentialFile: CRED,
  kimiBailianCredentialFile: CRED,
  piEntry: entry,
  piEntrySha256: sha(entry),
  piExtension,
  piExtensionSha256: sha(piExtension),
  piCredentialFile: CRED,
  piProvider: {
    providerId: 'agentrouter-dashscope',
    modelId: 'qwen3.8-flash',
    contextWindowTokens: 131072,
    maxOutputTokens: 4096,
  },
  roleBridge,
  roleBridgeSha256: sha(roleBridge),
  zcodeProvider: {
    main: 'bailian/qwen3.8-flash',
    provider: { id: 'bailian', kind: 'openai-compatible', baseURL, name: 'Bailian' },
  },
  zcodeModelSelection: { providerId: 'zai', modelId: 'glm-4.6' },
  profiles: [
    {
      id: 'dut_pi',
      harness: 'pi',
      providerId: 'agentrouter-dashscope',
      modelId: 'qwen3.8-flash',
      effort: 'off',
      version: '0.85.1',
      executable: process.execPath,
      executableSha256: nodeSha,
      sessionHome: resolve(BASE, 'managed/pi'),
    },
    {
      id: 'dut_dsh',
      harness: 'deepseek_harness',
      providerId: 'agentrouter-dashscope',
      modelId: 'qwen3.8-flash',
      effort: 'off',
      version: '0.1.5-rc.1',
      executable: process.execPath,
      executableSha256: nodeSha,
      sessionHome: resolve(BASE, 'managed/dsh'),
    },
    {
      id: 'dut_kimi',
      harness: 'kimi_code',
      providerId: 'agentrouter-bailian',
      modelId: 'bailian/qwen3.8-flash',
      effort: 'on',
      version: '0.42.0',
      executable: KIMI_EXE,
      executableSha256: sha(KIMI_EXE),
      sessionHome: resolve(BASE, 'managed/kimi'),
    },
    {
      id: 'dut_zcode',
      harness: 'zcode',
      providerId: 'agentrouter-zcode',
      modelId: 'zcode-managed',
      effort: 'off',
      version: '0.16.5',
      executable: process.execPath,
      executableSha256: nodeSha,
      sessionHome: resolve(BASE, 'managed/zcode'),
    },
  ],
};

writeFileSync(resolve(BASE, 'native-runtime.json'), JSON.stringify(cfg, null, 2) + '\n');
writeFileSync(
  resolve(BASE, 'inventory.json'),
  JSON.stringify(
    {
      native_config: resolve(BASE, 'native-runtime.json'),
      isolation: cfg.isolation,
      harnesses: cfg.profiles.map((p) => p.harness),
      omitted: [{ harness: 'codex', reason: 'BLOCKED_USER_NO_DUT_IDENTITY' }],
      credential_copied: false,
      production_homes_used: false,
      supervisor_sha12: cfg.supervisorSha256.slice(0, 12),
      role_bridge_sha12: cfg.roleBridgeSha256.slice(0, 12),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    ok: true,
    native_config: resolve(BASE, 'native-runtime.json'),
    harnesses: cfg.profiles.map((p) => p.harness),
    omitted: ['codex'],
    credential_copied: false,
  }),
);
