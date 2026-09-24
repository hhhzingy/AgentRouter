import { build } from 'esbuild';
await build({
  entryPoints: ['apps/management-mcp/main.ts'],
  outfile: '.local/management-mcp/main.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
