import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
mkdirSync('.local/client-c1', { recursive: true });
const file = resolve('.local/client-c1/mock.mjs');
await build({
  entryPoints: ['packages/core-api/mock-stdio.ts'],
  outfile: file,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const child = spawn(process.execPath, [file], { stdio: 'inherit', windowsHide: true });
child.on('error', () => {
  process.stderr.write('MOCK_START_FAILED\n');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
