// P4 手机仿真:Playwright 设备视口(iPhone/Pixel)打开只读控制台,验证响应式与可读性并截图。
// 仅验证 Chromium 视口布局；不是 iOS/WebKit、Android 系统或真机验收。
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
const devices = [
  { name: 'iPhone-13', viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  { name: 'Pixel-7', viewport: { width: 412, height: 915 }, isMobile: true, deviceScaleFactor: 2.6, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' },
];
mkdirSync('.local/w11-tests', { recursive: true });
const dir = mkdtempSync(resolve('.local/w11-tests/mob-'));
mkdirSync(resolve(dir, 'workspace'), { recursive: true });
cpSync('packages/storage/migrations', resolve(dir, 'migrations'), { recursive: true });
await build({ entryPoints: ['apps/core-daemon/w11-main.ts'], outfile: resolve(dir, 'core.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const core = spawn(process.execPath, [resolve(dir, 'core.mjs')], {
  windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'],
  env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: '', TEMP: dir, TMP: dir,
    AGENTROUTER_DATA: resolve(dir, 'core'), AGENTROUTER_PROJECT_ROOTS: JSON.stringify([resolve(dir, 'workspace')]) },
});
for (let i = 0; i < 60 && !existsSync(resolve(dir, 'core/endpoint.json')); i++) await new Promise((r) => setTimeout(r, 100));
await build({ entryPoints: ['apps/web-console/main.mjs'], outfile: resolve(dir, 'web-server.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external' });
const server = spawn(process.execPath, [resolve(dir, 'web-server.mjs'), resolve(dir, 'core'), '0'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let address = '';
server.stdout.on('data', (d) => { const m = /"address":"http:\/\/127\.0\.0\.1:(\d+)"/.exec(d.toString()); if (m) address = 'http://127.0.0.1:' + m[1]; });
for (let i = 0; i < 100 && !address; i++) await new Promise((r) => setTimeout(r, 100));
if (!address) { console.error('WEB SERVER FAILED'); process.exit(1); }
const report = { scope: 'P4_MOBILE_EMULATION_READONLY_CONSOLE', address, devices: [], status: 'FAIL' };
try {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  for (const d of devices) {
    const ctx = await browser.newContext({ viewport: d.viewport, isMobile: d.isMobile, deviceScaleFactor: d.deviceScaleFactor, userAgent: d.userAgent });
    const page = await ctx.newPage();
    await page.goto(address, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    await page.getByText('Core 已连接', { exact: true }).waitFor({ timeout: 15000 });
    const metrics = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      sections: document.querySelectorAll('main section').length,
      headerVisible: !!document.querySelector('header'),
      title: document.title,
      connected: document.getElementById('health').textContent === 'Core 已连接',
      identityVisible: document.getElementById('host').textContent.includes('数据集 '),
    }));
    const shot = resolve(dir, d.name + '.png');
    await page.screenshot({ path: shot, fullPage: true });
    report.devices.push({ device: d.name, ...metrics, screenshot: shot });
    await ctx.close();
  }
  await browser.close();
  report.status = report.devices.every((x) => !x.horizontalOverflow && x.sections >= 4 && x.headerVisible && x.connected && x.identityVisible) ? 'PASS' : 'FAIL';
} catch (e) {
  report.error = String(e).slice(0, 300);
} finally {
  server.kill(); core.kill();
  await new Promise((r) => setTimeout(r, 500));
}
writeFileSync(resolve(dir, 'mobile-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
process.exit(report.status === 'PASS' ? 0 : 1);
