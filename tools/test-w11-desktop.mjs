import { _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.local/w11-desktop-tests', { recursive: true });
mkdirSync('evidence/W11A', { recursive: true });
const data = mkdtempSync(resolve('.local/w11-desktop-tests/lifecycle-'));
const checks = [];
let app, ownedPid;
const guard = setTimeout(() => {
  console.error('DESKTOP_TEST_TIMEOUT');
  process.exit(1);
}, 45000);
const stage = (name) => console.log(name);
const launch = () =>
  electron.launch({
    executablePath: resolve('node_modules/electron/dist/electron.exe'),
    args: [resolve('.local/desktop-w11/p1-main.mjs')],
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      TEMP: data,
      TMP: data,
      AGENTROUTER_DATA: data,
      AGENTROUTER_MODE: 'LOCAL_CORE',
    },
    timeout: 30000,
  });
const inspect = (page) =>
  page.evaluate(async () => {
    const s = await window.agentrouterClient.connect({
      clientId: 'client_w11_desktop',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
      mode: 'LOCAL_CORE',
    });
    window.testSession = s;
    return {
      hello: s.hello,
      snapshot: await s.request('system.snapshot', {}),
      keys: Object.keys(window.agentrouterClient).sort(),
      node: typeof window.require,
    };
  });
try {
  stage('launch');
  app = await launch();
  stage('launched');
  let page = await app.firstWindow();
  await page.waitForLoadState();
  stage('inspect');
  let state = await inspect(page);
  stage('connected');
  ownedPid = JSON.parse(readFileSync(resolve(data, 'core/endpoint.json'), 'utf8')).pid;
  assert.equal(state.hello.capabilities.mock, false);
  assert.equal(state.hello.capabilities.space_reconfiguration, false);
  assert.deepEqual(state.keys, ['close', 'connect']);
  assert.equal(state.node, 'undefined');
  const project = await page.evaluate(async () => {
    const s = window.testSession;
    const snap = await s.request('system.snapshot', {}),
      lease = await s.request(
        'control.acquire',
        {},
        { operationId: 'op_lease', expectedRevision: snap.revision, scope: {} },
      ),
      roots = await s.request('filesystem.listRoots', {});
    return s.request(
      'project.create',
      { name: '桌面持久化项目', path_handle: roots.items[0].pathHandle },
      {
        operationId: 'op_create',
        expectedRevision: snap.revision,
        scope: {},
        leaseId: lease.leaseId,
      },
    );
  });
  checks.push({ id: 'LOCAL_CORE_MAIN_PRELOAD', status: 'PASS' });
  await page.reload();
  await page.waitForLoadState();
  state = await inspect(page);
  assert.equal(state.snapshot.projects[0].id, project.id);
  const instance = state.hello.serverInstanceId;
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].hide();
  });
  process.kill(ownedPid, 0);
  checks.push({ id: 'RELOAD_HIDE_KEEP_CORE', status: 'PASS' });
  await Promise.all([
    page.waitForEvent('crash'),
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer(),
    ),
  ]);
  process.kill(ownedPid, 0);
  checks.push({ id: 'RENDERER_CRASH_KEEP_CORE', status: 'PASS' });
  stage('close');
  const guiProcess = app.process();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  if (guiProcess.exitCode === null && guiProcess.signalCode === null)
    await new Promise((resolve) => guiProcess.once('exit', resolve));
  app = undefined;
  stage('closed');
  process.kill(ownedPid, 0);
  app = await launch();
  page = await app.firstWindow();
  await page.waitForLoadState();
  state = await inspect(page);
  assert.equal(state.hello.serverInstanceId, instance);
  assert.equal(state.snapshot.projects[0].id, project.id);
  checks.push({ id: 'WINDOW_CLOSE_REOPEN_ATTACH_SAME_CORE', status: 'PASS' });
} catch (error) {
  checks.push({ id: 'DESKTOP_LOCAL_CORE', status: 'FAIL', error: error.message });
  process.exitCode = 1;
} finally {
  stage('cleanup');
  if (ownedPid) {
    try {
      process.kill(ownedPid);
    } catch {}
  }
  await app?.close();
  clearTimeout(guard);
  writeFileSync(
    'evidence/W11A/desktop-lifecycle.json',
    JSON.stringify(
      { scope: 'REAL_ELECTRON_LOCAL_CORE_NO_EXECUTOR', realHarnessSupport: 0, checks },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(checks));
}
