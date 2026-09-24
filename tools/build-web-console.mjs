import { build } from 'esbuild';
await build({
  entryPoints: ['apps/web-console/main.mjs'],
  outfile: '.local/web-console/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
console.log('.local/web-console/server.mjs');
