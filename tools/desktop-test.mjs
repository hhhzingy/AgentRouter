import { _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.local/desktop-tests', { recursive: true });
const data = mkdtempSync(resolve('.local/desktop-tests/profile-'));
const source = resolve(data, '源项目');
mkdirSync(source);
writeFileSync(resolve(source, 'keep.txt'), '用户源文件测试标记');
const env = {
  ...process.env,
  AGENTROUTER_DATA: data,
  AGENTROUTER_SOFTWARE_RENDERING: '1',
  TEMP: data,
  TMP: data,
};
delete env.ELECTRON_RUN_AS_NODE;
const report = {
  at: new Date().toISOString(),
  status: 'FAIL',
  exit_code: 1,
  scope: '开发机打包 Electron 窗口与隔离检查；非完整桌面验收',
};
let app;
try {
  app = await electron.launch({
    executablePath: resolve('release/AgentRouter-preview/electron.exe'),
    args: [`--user-data-dir=${data}`],
    env,
    timeout: 20000,
  });
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: '项目', exact: true }).waitFor();
  await page.getByText('Core 已连接', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await app.evaluate(({ dialog }, source) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
  }, source);
  await page.getByRole('button', { name: '＋ 登记项目目录', exact: true }).click();
  await page.getByRole('heading', { name: '源项目', exact: true }).waitFor();
  await page.getByRole('button', { name: '角色与队列', exact: true }).click();
  await page.getByLabel('展示名', { exact: true }).fill('离线复核角色');
  await page.getByLabel('职责说明', { exact: true }).fill('检查离线产物并明确结果去向');
  await page.getByRole('button', { name: '保存角色', exact: true }).click();
  await page.getByRole('heading', { name: '离线复核角色', exact: true }).waitFor();
  await page.getByRole('button', { name: '暂停新派发', exact: true }).click();
  await page.getByRole('button', { name: '恢复排队', exact: true }).waitFor();
  const before = await page.evaluate(() => window.router.snapshot());
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    BrowserWindow.getAllWindows()[0].close();
  });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  const after = await page.evaluate(() => window.router.snapshot());
  assert.equal(after.runtime.processId, before.runtime.processId);
  assert.equal(after.roles.length, 1);
  await page.screenshot({ path: 'evidence/M07/roles.png', fullPage: true });
  Object.assign(report, {
    projectCreated: true,
    roleCreated: true,
    rolePaused: true,
    backgroundCorePreserved: true,
    directoryDialog: 'stubbed with isolated fixture',
  });
  await page.getByRole('button', { name: '兼容性', exact: true }).click();
  await page.getByText('Node v24.14.0 · SQLite 3.53.4').waitFor();
  await page.screenshot({ path: 'evidence/M00/desktop.png', fullPage: true });
  Object.assign(report, {
    status: 'PASS',
    exit_code: 0,
    rendererNodeDisabled: true,
    coreConnected: true,
  });
} catch (e) {
  Object.assign(report, { error: String(e) });
  process.exitCode = 1;
} finally {
  await app?.close();
  writeFileSync('evidence/M00/desktop.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
}
