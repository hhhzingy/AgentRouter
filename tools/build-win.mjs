import { build } from 'esbuild';
import { cpSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dest = resolve('release/AgentRouter-preview');
mkdirSync(dest, { recursive: true });
cpSync('node_modules/electron/dist', dest, { recursive: true });
const app = resolve(dest, 'resources/app');
mkdirSync(app, { recursive: true });
mkdirSync(resolve(dest, 'resources/runtime'), { recursive: true });
copyFileSync('.local/runtime/node.exe', resolve(dest, 'resources/runtime/node.exe'));
copyFileSync('.local/runtime/LICENSE', resolve(dest, 'resources/runtime/LICENSE'));
copyFileSync(
  '.local/native/agentrouter-supervisor.exe',
  resolve(dest, 'resources/runtime/agentrouter-supervisor.exe'),
);
writeFileSync(
  resolve(app, 'package.json'),
  JSON.stringify({
    name: 'agentrouter',
    version: '1.0.0-dev.0',
    main: 'main.mjs',
    type: 'module',
    private: true,
  }),
);
await build({
  entryPoints: ['apps/desktop/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['electron'],
  outfile: resolve(app, 'main.mjs'),
});
await build({
  entryPoints: ['apps/desktop/preload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  outfile: resolve(app, 'preload.cjs'),
});
await build({
  entryPoints: ['apps/desktop/renderer.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: resolve(app, 'renderer.js'),
});
await build({
  entryPoints: ['apps/core-daemon/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['better-sqlite3'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  outfile: resolve(app, 'core.mjs'),
});
for (const name of ['index.html', 'style.css'])
  copyFileSync(`apps/desktop/${name}`, resolve(app, name));
mkdirSync(resolve(app, 'migrations'), { recursive: true });
copyFileSync(
  'packages/storage/migrations/001-baseline.sql',
  resolve(app, 'migrations/001-baseline.sql'),
);
const sqliteDir = dirname(require.resolve('better-sqlite3/package.json'));
cpSync(sqliteDir, resolve(app, 'node_modules/better-sqlite3'), {
  recursive: true,
  dereference: true,
});
writeFileSync(
  resolve(dest, '开发预览说明.txt'),
  'AgentRouter V1.0 开发预览，非完整发行版。真实 Harness 未完成验收。启动 electron.exe。项目数据不随归档删除。\n',
);
writeFileSync(
  'evidence/M00/build.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      exit_code: 0,
      output: dest,
      node: '24.14.0',
      electron: JSON.parse(readFileSync('node_modules/electron/package.json')).version,
      scope: '开发预览便携目录，非正式安装包',
    },
    null,
    2,
  ) + '\n',
);
console.log(dest);
