import { build } from 'esbuild';
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve('.local/desktop-w11');
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ['apps/desktop/p1-main.ts'],
  outfile: resolve(out, 'p1-main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
await build({
  entryPoints: ['apps/desktop/p1-preload.ts'],
  outfile: resolve(out, 'p1-preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
if (existsSync('apps/desktop/workbench.tsx')) {
  await build({
    entryPoints: ['apps/desktop/workbench.tsx'],
    outfile: resolve(out, 'workbench.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    metafile: true,
  }).then((r) => writeFileSync(resolve(out, 'renderer-meta.json'), JSON.stringify(r.metafile)));
}
// B0 测试壳不是最终 Renderer；UIAI 提供 workbench.tsx 后由同一壳加载。
writeFileSync(
  resolve(out, 'workbench.html'),
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'"><title>AgentRouter</title><body><div id="backend-mode"></div><div id="root"></div><script src="mode.js"></script>' +
    (existsSync(resolve(out, 'workbench.js')) ? '<script src="workbench.js"></script>' : '') +
    '</body></html>',
);
writeFileSync(
  resolve(out, 'mode.js'),
  "document.getElementById('backend-mode').textContent=new URLSearchParams(location.search).get('mode');",
);
console.log(out);
