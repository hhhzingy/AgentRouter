import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('.local', { recursive: true });
await build({
  entryPoints: ['tests/e2e-j1/desktop.ts'],
  outfile: '.local/j1-desktop.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const result = spawnSync(process.execPath, ['.local/j1-desktop.mjs'], {
  stdio: 'inherit',
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
