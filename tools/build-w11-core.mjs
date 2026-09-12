import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
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
for (const name of ['001-baseline.sql', '002-w11-application.sql', '003-native-execution.sql', '004-external-api-journal.sql'])
  copyFileSync('packages/storage/migrations/' + name, resolve(out, 'migrations', name));
copyFileSync('packages/core-service/fixture-harness.mjs', resolve(out, 'fixture-harness.mjs'));
console.log(out);
