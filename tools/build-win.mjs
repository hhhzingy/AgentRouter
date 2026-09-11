import { build } from 'esbuild';
import {
  cpSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  lstatSync,
} from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw Error('WINDOWS_X64_BUILD_REQUIRED');
const git = (...args) =>
  execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
const sourceSHA = git('rev-parse', 'HEAD');
const sourceDirty = Boolean(
  git(
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--',
    'apps',
    'packages',
    'tools',
    'native',
    'package.json',
    'pnpm-lock.yaml',
  ),
);
const dest = resolve('release', `AgentRouter-j3-${sourceSHA.slice(0, 12)}-${randomUUID()}`);
mkdirSync(dest, { recursive: true });
// 白名单复制：不遍历仓库数据目录，不携带认证或原始日志。
cpSync('node_modules/electron/dist', dest, { recursive: true, dereference: true });
const app = resolve(dest, 'resources/app'),
  core = resolve(dest, 'resources/w11-core');
mkdirSync(app, { recursive: true });
mkdirSync(resolve(core, 'migrations'), { recursive: true });
copyFileSync(process.execPath, resolve(app, 'core-node.exe'));
writeFileSync(
  resolve(app, 'package.json'),
  JSON.stringify({
    name: 'agentrouter',
    version: '1.0.0-dev.0',
    main: 'p1-main.mjs',
    type: 'module',
    private: true,
  }),
);
const define = {
  'process.env.AGENTROUTER_MODE': '"LOCAL_CORE"',
  'process.env.AGENTROUTER_FIXTURE': '"0"',
};
await build({
  entryPoints: ['apps/desktop/p1-main.ts'],
  outfile: resolve(app, 'p1-main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['electron'],
  define,
});
await build({
  entryPoints: ['apps/desktop/p1-preload.ts'],
  outfile: resolve(app, 'p1-preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  define,
});
await build({
  entryPoints: ['apps/desktop/workbench.tsx'],
  outfile: resolve(app, 'workbench.js'),
  bundle: true,
  platform: 'browser',
  jsx: 'automatic',
  format: 'iife',
  define,
});
copyFileSync('apps/desktop/workbench.css', resolve(app, 'workbench.css'));
writeFileSync(
  resolve(app, 'workbench.html'),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"><title>AgentRouter</title><link rel="stylesheet" href="workbench.css"><body><div id="backend-mode">LOCAL_CORE</div><div id="root"></div><script src="workbench.js"></script></body></html>`,
);
await build({
  entryPoints: ['apps/core-daemon/w11-main.ts'],
  outfile: resolve(core, 'core.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['better-sqlite3'],
  define,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
for (const name of ['001-baseline.sql', '002-w11-application.sql', '003-native-execution.sql'])
  copyFileSync(resolve('packages/storage/migrations', name), resolve(core, 'migrations', name));
const sqlite = dirname(require.resolve('better-sqlite3/package.json'));
const sqliteOut = resolve(core, 'node_modules/better-sqlite3');
mkdirSync(sqliteOut, { recursive: true });
for (const name of ['package.json', 'LICENSE', 'lib', 'prebuilds/win32-x64.node'])
  cpSync(resolve(sqlite, name), resolve(sqliteOut, name), { recursive: true, dereference: true });
writeFileSync(
  resolve(dest, '候选包说明.txt'),
  '启动 electron.exe。新工作台 LOCAL_CORE 与生产注册入口；真实 OS 运行器未装，BLOCKED_IMPLEMENTATION。不是正式支持认证，不含用户账号或数据。\n',
);
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const files = [];
function index(dir) {
  for (const item of readdirSync(dir)) {
    const file = join(dir, item);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) throw Error('PACKAGE_SYMLINK_FORBIDDEN');
    if (stat.isDirectory()) index(file);
    else
      files.push({
        path: relative(dest, file).replaceAll('\\', '/'),
        bytes: stat.size,
        sha256: sha256(file),
      });
  }
}
index(dest);
files.sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  at: new Date().toISOString(),
  sourceSHA,
  sourceDirty,
  status: 'BLOCKED_IMPLEMENTATION',
  scope: '开发机候选包；非正式支持认证或干净机验证',
  entry: 'resources/app/p1-main.mjs',
  core: 'resources/w11-core/core.mjs',
  backendMode: 'LOCAL_CORE',
  fixtureEnabled: false,
  node: process.version,
  files,
  artifactHash: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
};
writeFileSync(resolve(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(dest);
