import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, readFileSync } from 'node:crypto';
import { prepareManagedZcodeProfile } from '../packages/platform/zcode-managed-profile.ts';
// Z2 DUT 登录助手:准备固定受管 HOME 的非秘密 model/provider 配置,
// 再以该 HOME 启动官方 zcode 交互式 REPL 供用户完成 /login。
// 不读取/复制桌面认证;密钥仅写入本受管 HOME 的 config.json(0600,不入 Git/日志)。
const RUNTIME = process.env.AGENTROUTER_ZCODE_CLI ?? 'E:/software/ZCode/resources/glm/zcode.cjs';
const EXPECTED_SHA = 'e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8';
const home = resolve('.local/zcode-dut/home');
mkdirSync(home, { recursive: true });
const actual = createHash('sha256').update(readFileSync(RUNTIME)).digest('hex');
if (actual !== EXPECTED_SHA) throw Error('ZCODE_RUNTIME_SHA_MISMATCH:' + actual.slice(0, 12));
prepareManagedZcodeProfile(home, {
  main: 'zai/glm-4.6',
  provider: { id: 'zai', kind: 'openai-compatible', baseURL: 'https://api.z.ai/api/paas/v4', name: 'Z.AI' },
});
console.log('DUT HOME 已就绪:', home);
console.log('即将以该 HOME 启动官方 ZCode 交互会话。请在会话内执行:');
console.log('  /login zai-coding-plan   (或 bigmodel-coding-plan,按你的 Coding Plan 归属)');
console.log('完成浏览器授权、看到登录成功后,输入 /exit 退出。');
console.log('不要粘贴或转发任何 token/key 给助手。');
const child = spawn(process.execPath, [RUNTIME], {
  cwd: home,
  stdio: 'inherit',
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: join(home, '.config'),
    TEMP: home,
    TMP: home,
    PATH: process.env.PATH,
  },
});
child.on('close', (code) => process.exit(code ?? 0));
