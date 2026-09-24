import { _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const dest = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(resolve(dest, 'manifest.json'), 'utf8'));
assert.equal(manifest.sourceDirty, false);
assert.equal(manifest.fixtureEnabled, false);
mkdirSync('.local/j3-packaged-gui', { recursive: true });
const data = mkdtempSync(resolve('.local/j3-packaged-gui/run-'));
const report = { codeSHA: manifest.sourceSHA, artifactHash: manifest.artifactHash, scope: 'REAL_PACKAGED_ELECTRON_LOCAL_CORE_NO_HARNESS', realHarnessSupport: 0, checks: [], status: 'FAIL' };
let app, ownedPid;
try {
  app = await electron.launch({ executablePath: resolve(dest, 'electron.exe'), args: [], env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: '', TEMP: data, TMP: data, AGENTROUTER_DATA: data }, timeout: 30000 });
  const page = await app.firstWindow();
  await page.waitForLoadState();
  const state = await page.evaluate(async () => {
    const s = await window.agentrouterClient.connect({ clientId: 'packaged_j3', clientVersion: '1.0.0-dev.0', requestedMode: 'controller', mode: 'LOCAL_CORE' });
    const snap = await s.request('system.snapshot', {});
    const lease = await s.request('control.acquire', {}, { operationId: 'packaged_lease', expectedRevision: snap.revision, scope: {} });
    const roots = await s.request('filesystem.listRoots', {});
    const created = await s.request('project.create', { name: 'J3 生产包本地持久化验证', path_handle: roots.items[0].pathHandle }, { operationId: 'packaged_create', expectedRevision: snap.revision, scope: {}, leaseId: lease.leaseId });

    return { mock: s.hello.capabilities.mock, created, node: typeof window.require };
  });
  ownedPid = JSON.parse(readFileSync(resolve(data, 'core/endpoint.json'), 'utf8')).pid;
  assert.equal(state.mock, false); assert.equal(state.node, 'undefined'); assert.ok(state.created.id);
  report.checks.push('打包Electron通过Main/preload连接生产Core并创建真实SQLite项目');
  await page.reload(); await page.getByText('J3 生产包本地持久化验证', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: resolve(data, 'workbench.png'), fullPage: true });
  report.checks.push('重载后项目卡真实渲染并持久化；有内容截图');
  report.status = 'PASS';
} catch (error) { report.error = 'PACKAGED_GUI_CHECK_FAILED'; console.error(error.message); process.exitCode = 1; }
finally {
  if (!ownedPid) { try { ownedPid = JSON.parse(readFileSync(resolve(data, 'core/endpoint.json'), 'utf8')).pid; } catch {} }
  if (app) { const gui = app.process(); gui.kill(); }
  if (ownedPid) { try { process.kill(ownedPid); } catch {} }
  writeFileSync(resolve(data, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, evidenceDirectory: data }));
  process.exit(process.exitCode ?? 0);
}
