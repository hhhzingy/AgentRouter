import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RemoteDeviceStore } from '../../packages/remote/device-store.ts';
import { RemoteGateway } from '../../packages/remote/remote-gateway.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';

const require = createRequire(import.meta.url);
// 与 tests/e2e-ui/shoot.mjs 同一 Playwright 发行(真实 Chromium,非模拟)。
const { chromium } = require(
  resolve('node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.js'),
);
const CHROME = `${process.env.LOCALAPPDATA}/ms-playwright/chromium-1243/chrome-win64/chrome.exe`;

it(
  'W07 手机控制台真实浏览器:配对→cookie WSS→快照→controller→K04 断线自动重连',
  async () => {
    mkdirSync('.local/v11-remote-tests', { recursive: true });
    const dir = mkdtempSync(resolve('.local/v11-remote-tests/browser-'));
    const db = openApplicationStore(dir);
    const app = new ApplicationService(db, [dir], true);
    const localTransport = new P1MemoryTransport(app, 'human_local');
    const devices = new RemoteDeviceStore(db);
    const ls = await localTransport.connect({ clientId: 'local_w07', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    const localSnap = await ls.request('system.snapshot', {});
    const lease = await ls.request('control.acquire', {}, { operationId: 'l07', expectedRevision: localSnap.revision, scope: {} } as never);
    const roots = await ls.request('filesystem.listRoots', {});
    const proj = (await ls.request('project.create', { name: '手机可见项目', path_handle: (roots as { items: { pathHandle: string }[] }).items[0].pathHandle }, { operationId: 'p07', expectedRevision: (await ls.request('system.snapshot', {})).revision, scope: {}, leaseId: (lease as { leaseId: string }).leaseId } as never)) as { id: string };
    await ls.request('control.release', { lease_id: (lease as { leaseId: string }).leaseId }, { operationId: 'r07', expectedRevision: (await ls.request('system.snapshot', {})).revision, scope: {} } as never);

    const port = 43777;
    const gateway = new RemoteGateway({ app, devices, consoleHtml: readFileSync(resolve('packages/remote/console.html'), 'utf8') });
    await gateway.listen(port, '127.0.0.1');
    const base = `http://127.0.0.1:${port}`;
    // DESKTOP 配对(浏览器仍走 cookie 路径):K07 要求 canRequestController 才能拿租约。
    const pairing = devices.createPairing({ displayName: 'console-w07', kind: 'DESKTOP', canRequestController: true, ttlMs: 120000, scope: ['project:' + proj.id] });
    const browser = await chromium.launch({ executablePath: CHROME });
    const pageErrors: string[] = [];
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.on('pageerror', (e: Error) => pageErrors.push('pageerror:' + e.message));
      page.on('console', (m: { type(): string; text(): string }) => { if (m.type() === 'error') pageErrors.push('console:' + m.text()); });
      // 未认证首连→4003/4004→K01 配对界面(全程不读 HttpOnly cookie)
      await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#code', { timeout: 10000 });
      expect(await page.evaluate(() => document.cookie)).not.toMatch(/ar_device/);
      await page.fill('#code', pairing.challenge);
      await page.click('#go');
      // 配对 cookie→WSS attached→initialize→快照渲染:项目数=1
      await page.waitForSelector('#nav button[data-v="home"].on', { timeout: 15000 });
      await page.waitForFunction(
        () => {
          const rows = [...document.querySelectorAll('.row')];
          return rows.some((r) => r.textContent?.includes('项目') && r.textContent?.includes('1'));
        },
        undefined,
        { timeout: 15000 },
      );
      expect((await page.textContent('#mode')) ?? '').toBe('观察者');
      // 控制视图→获取控制器(共享 /meta.js 元数据使 mutation 帧合法)
      await page.click('#nav button[data-v="me"]');
      await page.click('text=获取控制器');
      await page.waitForFunction(() => document.querySelector('#mode')?.textContent === '控制器', undefined, { timeout: 10000 });
      // K04:服务器单方面断链→冻结横幅→指数退避自动重连(同一 cookie 再认证)
      const sockets = (gateway as unknown as { liveSockets: Map<string, Set<any>> }).liveSockets;
      for (const set of sockets.values()) for (const ws of set) ws.terminate();
      await page.waitForSelector('.frozen', { timeout: 10000 });
      expect((await page.textContent('#frozen')) ?? '').toContain('正在自动重连');
      await page.waitForFunction(
        () =>
          document.querySelector('#dot')?.className === 'dot on' &&
          getComputedStyle(document.querySelector('#frozen')!).display === 'none' &&
          (document.querySelector('#mode')?.textContent ?? '') === '观察者',
        undefined,
        { timeout: 20000 },
      );
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
      await gateway.close();
      localTransport.close?.();
      db.close();
    }
  },
  120_000,
);
