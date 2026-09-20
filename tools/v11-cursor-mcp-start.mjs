// 启动 Cursor Management MCP 专用 Core：隔离数据根 + 可选 Remote 网关。
// 不复制百炼密钥；不碰生产 Codex/ZCode HOME。
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

const ROOT = resolve('.local/v11-cursor-mcp');
const DATA = resolve(ROOT, 'core');
const WORK = resolve(ROOT, 'workspace');
const CORE = resolve('.local/w11-core/core.mjs');
const MCP = resolve('.local/management-mcp/main.mjs');
const NATIVE = resolve('.local/v11-c7-dut/native-runtime.json');
const PORT = Number(process.env.AGENTROUTER_REMOTE_PORT ?? '8787');

if (!existsSync(CORE)) execFileSync(process.execPath, [resolve('tools/build-w11-core.mjs')], { stdio: 'inherit' });
if (!existsSync(MCP)) execFileSync(process.execPath, [resolve('tools/build-management-mcp.mjs')], { stdio: 'inherit' });
if (!existsSync(NATIVE))
  execFileSync(process.execPath, [resolve('tools/v11-c7-dut-setup.mjs')], { stdio: 'inherit' });

mkdirSync(WORK, { recursive: true });
mkdirSync(DATA, { recursive: true });

const endpoint = resolve(DATA, 'endpoint.json');
if (existsSync(endpoint)) {
  try {
    const snap = JSON.parse(readFileSync(endpoint, 'utf8'));
    if (snap.pid && Number.isInteger(snap.pid)) {
      try {
        process.kill(snap.pid, 0);
        console.log(JSON.stringify({ status: 'ALREADY_RUNNING', pid: snap.pid, data: DATA }));
        process.exit(0);
      } catch {
        /* stale endpoint */
      }
    }
  } catch {
    /* ignore */
  }
}

const hosts = ['127.0.0.1', 'localhost'];
for (const list of Object.values(networkInterfaces())) {
  for (const n of list ?? []) {
    if (n.family === 'IPv4' && !n.internal) hosts.push(n.address);
  }
}
const origins = [
  ...new Set(
    hosts.flatMap((h) => [
      `http://${h}:${PORT}`,
      `https://${h}:${PORT}`,
      `http://${h}`,
      `https://${h}`,
    ]),
  ),
];

const child = spawn(process.execPath, [CORE], {
  detached: true,
  windowsHide: true,
  stdio: 'ignore',
  env: {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: ROOT,
    TMP: ROOT,
    PATH: process.env.PATH,
    AGENTROUTER_DATA: DATA,
    AGENTROUTER_PROJECT_ROOTS: JSON.stringify([WORK]),
    AGENTROUTER_NATIVE_CONFIG: NATIVE,
    AGENTROUTER_REMOTE_ENABLED: '1',
    AGENTROUTER_REMOTE_HOST: '0.0.0.0',
    AGENTROUTER_REMOTE_PORT: String(PORT),
    AGENTROUTER_REMOTE_ALLOWED_HOSTS: hosts.join(','),
    AGENTROUTER_REMOTE_ALLOWED_ORIGINS: origins.join(','),
    AGENTROUTER_REMOTE_CONSOLE: resolve('.local/w11-core/console.html'),
  },
});
child.unref();
for (let i = 0; i < 80 && !existsSync(endpoint); i++) await new Promise((r) => setTimeout(r, 100));
if (!existsSync(endpoint)) throw Error('CORE_START_FAILED');
const remote = existsSync(resolve(DATA, 'remote-gateway.json'))
  ? JSON.parse(readFileSync(resolve(DATA, 'remote-gateway.json'), 'utf8'))
  : null;
writeFileSync(
  resolve(ROOT, 'owner.json'),
  JSON.stringify(
    {
      pid: child.pid,
      data: DATA,
      workspace: WORK,
      nativeConfig: NATIVE,
      remote,
      lanHosts: hosts.filter((h) => h !== '127.0.0.1' && h !== 'localhost'),
      mcp: {
        command: process.execPath,
        args: [MCP, DATA, 'observer', 'mcp_management_cursor'],
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    status: 'STARTED',
    pid: child.pid,
    data: DATA,
    remote,
    phoneUrls: (hosts.filter((h) => h !== 'localhost') ?? []).map((h) => `http://${h}:${remote?.port ?? PORT}/`),
  }),
);
