import { _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const packagePath = process.argv[2];
if (!packagePath) throw Error('EXPLICIT_PACKAGE_PATH_REQUIRED');
const packagedElectron = resolve(packagePath, 'electron.exe');
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
let page;
let stage = 'launch';
try {
  app = await electron.launch({
    executablePath: packagedElectron,
    args: [`--user-data-dir=${data}`],
    env,
    timeout: 20000,
  });
  stage = 'first-window';
  page = await app.firstWindow();
  stage = 'project-page';
  await page.getByText('项目', { exact: true }).first().waitFor();
  await page.getByText('Core 正常', { exact: true }).waitFor();
  await page.getByRole('button', { name: '申请控制', exact: true }).click();
  await page.getByRole('button', { name: '转为只读', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await app.evaluate(({ dialog }, source) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
  }, source);
  await page.getByRole('button', { name: '选择目录…', exact: true }).click();
  stage = 'project-created';
  await page.getByRole('heading', { name: /^源项目/ }).waitFor();
  const before = await page.evaluate(() => window.agentrouterDesktop.getContext());
  await page.getByRole('button', { name: '添加角色', exact: true }).click();
  stage = 'role-plan-page';
  await page.getByRole('heading', { name: '添加角色（Role Plan）', exact: true }).waitFor();
  await page.getByRole('link', { name: '源项目', exact: true }).click();
  await page.getByRole('heading', { name: /^源项目/ }).waitFor();
  const after = await page.evaluate(() => window.agentrouterDesktop.getContext());
  assert.equal(after.serverInstanceId, before.serverInstanceId);
  assert.equal(after.dataId, before.dataId);
  await page.getByRole('heading', { name: /^源项目/ }).waitFor();
  await page.screenshot({ path: 'evidence/M07/roles.png', fullPage: true });
  Object.assign(report, {
    projectCreated: true,
    rolePlanPageOpened: true,
    navigationContextPreserved: true,
    directoryDialog: 'stubbed with isolated fixture',
  });
  stage = 'footer-identity';
  await page.getByText(/Host win32 · Core dataset_/).waitFor();
  await page.screenshot({ path: 'evidence/M00/desktop.png', fullPage: true });
  Object.assign(report, {
    status: 'PASS',
    exit_code: 0,
    rendererNodeDisabled: true,
    coreConnected: true,
  });
} catch (e) {
  const bodyText = await page?.locator('body').innerText().catch(() => '');
  await page?.screenshot({ path: 'evidence/M00/desktop-failure.png', fullPage: true }).catch(() => {});
  Object.assign(report, {
    code: 'CHECK_FAILED',
    stage,
    error: e instanceof Error ? e.message.split('\n')[0] : 'UNKNOWN',
    pageTitle: await page?.title().catch(() => '') ?? '',
    bodyText: bodyText?.slice(0, 1000) ?? '',
    redacted: true,
  });
  process.exitCode = 1;
} finally {
  if (app) {
    const pid = app.process().pid;
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } catch {
      app.process().kill();
    }
    Object.assign(report, { electronProcessStopped: true });
  }
  writeFileSync('evidence/M00/desktop.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
  process.exit(report.exit_code);
}
