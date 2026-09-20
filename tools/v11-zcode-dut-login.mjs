import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// 隔离 DUT 的 Z.AI 浏览器登录。不读取、不复制生产 ~/.zcode。
const SRC_CLI = 'E:/software/ZCode/resources/glm/zcode.cjs';
const SRC_PROV = 'E:/software/ZCode/resources/config/provider/zcode-builtin.json';
const cliDir = resolve('.local-protected/zcode-dut/cli');
const RUNTIME = join(cliDir, 'zcode.cjs');
const home = resolve('.local-protected/zcode-dut/home');
mkdirSync(join(cliDir, 'provider'), { recursive: true });
mkdirSync(join(home, '.zcode', 'cli'), { recursive: true });
mkdirSync(join(home, 'tmp'), { recursive: true });
copyFileSync(SRC_CLI, RUNTIME);
copyFileSync(SRC_PROV, join(cliDir, 'provider', 'zcode-builtin.json'));
const configPath = join(home, '.zcode', 'cli', 'config.json');
const managed = {
  storage: {
    dir: join(home, '.zcode'),
    sessionDbPath: join(home, '.zcode', 'cli', 'db', 'db.sqlite'),
  },
  plugins: { enabled: false, dirs: [], enabledPlugins: {}, extraKnownMarketplaces: {} },
  hooks: { enabled: false, events: {} },
  mcp: { servers: {} },
  model: { main: 'zai/glm-4.6' },
  provider: {
    zai: {
      kind: 'openai-compatible',
      name: 'Z.AI',
      options: { baseURL: 'https://api.z.ai/api/paas/v4' },
    },
  },
};
if (!existsSync(configPath))
  writeFileSync(configPath, JSON.stringify(managed, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const legacy = join(home, '.zcode', 'config.json');
if (!existsSync(legacy)) writeFileSync(legacy, JSON.stringify(managed, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log('DUT_ZCODE_LOGIN_START isolated_home_ready');
console.log('Login ONLY the isolated AgentRouter ZCode DUT. Keep the desktop ZCode account unchanged.');
const child = spawn(process.execPath, [RUNTIME, 'login'], {
  cwd: home,
  windowsHide: false,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
    XDG_CONFIG_HOME: join(home, '.config'),
    TEMP: join(home, 'tmp'),
    TMP: join(home, 'tmp'),
    PATH: process.env.PATH,
  },
});
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const text = String(chunk);
    if (/sk-|api[_-]?key|Bearer |refresh_token|access_token/i.test(text)) {
      process.stdout.write('[redacted]\n');
      return;
    }
    process.stdout.write(text);
  });
}
child.on('close', (code) => {
  if (code === 0) console.log('DUT_ZCODE_LOGIN_COMPLETED. Report only this status. Never send tokens.');
  else console.log('DUT_ZCODE_LOGIN_FAILED');
  process.exit(code ?? 1);
});
