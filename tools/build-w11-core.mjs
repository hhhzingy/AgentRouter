import { build } from 'esbuild';
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve('.local/w11-core');
mkdirSync(resolve(out, 'migrations'), { recursive: true });
await build({
  entryPoints: ['apps/core-daemon/w11-main.ts'],
  outfile: resolve(out, 'core.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
await build({
  entryPoints: ['packages/pi-extension/agentrouter-tools.mjs'],
  outfile: resolve(out, 'role-tools.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
await build({
  entryPoints: ['packages/role-bridge/stdio.mjs'],
  outfile: resolve(out, 'role-bridge.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
});
for (const name of readdirSync('packages/storage/migrations').filter((f) => f.endsWith('.sql')).sort())
  copyFileSync('packages/storage/migrations/' + name, resolve(out, 'migrations', name));
copyFileSync('packages/core-service/fixture-harness.mjs', resolve(out, 'fixture-harness.mjs'));
// SSH stdio 桥:无第三方依赖,原样分发(sshd forced command 调起)。
copyFileSync('apps/ssh-bridge/main.mjs', resolve(out, 'ssh-bridge.mjs'));
console.log(out);
