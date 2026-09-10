/**
 * UI Baseline V1 截图脚本（真实渲染：esbuild bundle + Chromium）。
 * 用法：node tests/e2e-ui/shoot.mjs
 * 产物：docs/ui/baseline-v1/screenshots/*.png
 * 全部页面使用 packages/ui-mocks 假数据，不含任何真实凭据。
 */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.js',
  ),
);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'docs/ui/baseline-v1/screenshots');
mkdirSync(outDir, { recursive: true });

// 1) 打包（直接调用平台二进制，避免 JS wrapper 的 spawn 问题）
const esbuild = resolve(
  root,
  'node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe',
);
execFileSync(esbuild, [
  'apps/desktop/workbench.tsx',
  '--bundle',
  '--platform=browser',
  '--format=iife',
  '--outfile=apps/desktop/workbench.js',
  '--jsx=automatic',
], { cwd: root, stdio: 'inherit' });

// 2) 静态服务
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = url.pathname === '/' ? '/workbench.html' : url.pathname;
  const file = resolve(root, 'apps/desktop', '.' + path);
  if (!file.startsWith(resolve(root, 'apps/desktop')) || !existsSync(file)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': mime[file.slice(file.lastIndexOf('.'))] ?? 'text/plain' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/workbench.html`;

// 3) 场景 → 截图清单（8+ 张）
const shots = [
  { name: '01-home-project-cards', scenario: 'full', hash: '#/' },
  { name: '02-project-overview-two-groups', scenario: 'full', hash: '#/project/proj_atlas' },
  { name: '03-role-detail-settling', scenario: 'full', hash: '#/role/role_zhou' },
  { name: '04-role-plan-review', scenario: 'full', hash: '#/roleplan/proj_atlas', actions: 'roleplan' },
  { name: '05-unknown-approval', scenario: 'full', hash: '#/role/role_su' },
  { name: '06-reconfigure-blockers', scenario: 'full', hash: '#/reconfigure/proj_atlas', actions: 'reconfigure' },
  { name: '07-models-accounts', scenario: 'full', hash: '#/project/proj_atlas/models' },
  { name: '08-ssh-disconnected', scenario: 'ssh-disconnected', hash: '#/project/proj_atlas' },
  { name: '09-observer-readonly', scenario: 'observer', hash: '#/project/proj_atlas' },
  { name: '10-home-empty-create-card', scenario: 'empty', hash: '#/' },
  { name: '11-capability-gated', scenario: 'production-caps', hash: '#/project/proj_atlas' },
];

const browser = await chromium.launch({
  executablePath: `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`,
});
const zooms = [
  { label: '100%', deviceScaleFactor: 1, viewport: { width: 1440, height: 900 } },
  { label: '125%', deviceScaleFactor: 1.25, viewport: { width: 1152, height: 720 } },
  { label: '150%', deviceScaleFactor: 1.5, viewport: { width: 960, height: 600 } },
];

const manifest = [];
for (const shot of shots) {
  const page = await browser.newPage({ viewport: zooms[0].viewport, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`[console:${shot.name}]`, m.text());
  });
  await page.goto(`${base}?scenario=${shot.scenario}${shot.hash ? '&' : ''}`, { waitUntil: 'networkidle' });
  if (shot.hash) await page.evaluate((h) => (location.hash = h), shot.hash);
  await page.waitForSelector('.page', { timeout: 15000 });

  if (shot.actions === 'roleplan') {
    // 导入示例方案文件 → 进入 Review（权限对照 + 模型可用性）
    await page.setInputFiles('input[type="file"]', resolve(root, 'docs/ui/baseline-v1/example-plan.json'));
    await page.waitForSelector('[data-stage="review"]');
  }
  if (shot.actions === 'reconfigure') {
    await page.locator('.confirm-row input[type="checkbox"]').nth(0).check();
    await page.locator('.confirm-row input[type="checkbox"]').nth(1).check();
    await page.getByText('生成 Preview').click();
    await page.waitForSelector('[data-stage="preview"]');
  }
  await page.waitForTimeout(400);
  const file = resolve(outDir, `${shot.name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  manifest.push({ file: `screenshots/${shot.name}.png`, scenario: shot.scenario, route: shot.hash });
  console.log(`✓ ${shot.name}`);

  // 缩放检查：同一页面在 125%/150% 下不崩坏（仅首页与项目页产出缩放证据）
  if (shot.name === '01-home-project-cards' || shot.name === '02-project-overview-two-groups') {
    for (const z of zooms.slice(1)) {
      await page.setViewportSize(z.viewport);
      await page.waitForTimeout(250);
      const zf = resolve(outDir, `${shot.name}-zoom${z.label.replace('%', '')}.png`);
      await page.screenshot({ path: zf, fullPage: true });
      manifest.push({ file: `screenshots/${shot.name}-zoom${z.label.replace('%', '')}.png`, scenario: shot.scenario, route: shot.hash, zoom: z.label });
      console.log(`  ✓ zoom ${z.label}`);
    }
  }
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${manifest.length} screenshots → docs/ui/baseline-v1/screenshots/`);
