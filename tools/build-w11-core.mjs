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
for (const name of ['001-baseline.sql', '002-w11-application.sql'])
  copyFileSync('packages/storage/migrations/' + name, resolve(out, 'migrations', name));
copyFileSync('packages/core-service/fixture-harness.mjs', resolve(out, 'fixture-harness.mjs'));
console.log(out);
