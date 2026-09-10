import { _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('.local/b0-tests', { recursive: true });
mkdirSync('evidence/B0', { recursive: true });
const data = mkdtempSync(resolve('.local/b0-tests/desktop-'));
let app;
const checks = [];
try {
  app = await electron.launch({
    executablePath: resolve('node_modules/electron/dist/electron.exe'),
    args: [resolve('.local/desktop-w11/p1-main.mjs'), '--user-data-dir=' + data],
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      TEMP: data,
      TMP: data,
      AGENTROUTER_DATA: data,
      AGENTROUTER_MODE: 'PREVIEW_MOCK',
      AGENTROUTER_PREVIEW_SCENARIO: 'two-groups',
    },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState();
  const result = await page.evaluate(async () => {
    const t = window.agentrouterClient,
      s = await t.connect({
        clientId: 'client_desktop',
        clientVersion: '1.0.0-dev.0',
        requestedMode: 'controller',
        mode: 'PREVIEW_MOCK',
      });
    const snap = await s.request('system.snapshot', {}),
      lease = await s.request(
        'control.acquire',
        {},
        { operationId: 'op_desktop', expectedRevision: snap.revision, scope: {} },
      );
    const models = await s.request('model.list', {}),
      charter = await s.request('roleCharter.get', {
        project_id: 'project_example',
        role_id: snap.roles[0].id,
      });
    await t.close();
    let oldDenied = false;
    try {
      await s.request('system.snapshot', {});
    } catch {
      oldDenied = true;
    }
    const next = await t.connect({
      clientId: 'client_desktop',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
    const newLease = await next.request(
      'control.acquire',
      {},
      { operationId: 'op_newlease', expectedRevision: snap.revision, scope: {} },
    );
    return {
      revision: s.hello.contractRevision,
      mock: s.hello.capabilities.mock,
      roles: snap.roles.length,
      models: models.items.length,
      bootstrap: charter.bootstrapState,
      node: typeof window.require,
      keys: Object.keys(t).sort(),
      oldDenied,
      newLease: newLease.leaseId !== lease.leaseId,
      mode: document.getElementById('backend-mode').textContent,
    };
  });
  assert.deepEqual(result, {
    revision: 'C1R1P1',
    mock: true,
    roles: 6,
    models: 6,
    bootstrap: 'PENDING',
    node: 'undefined',
    keys: ['close', 'connect'],
    oldDenied: true,
    newLease: true,
    mode: 'PREVIEW_MOCK',
  });
  checks.push({ id: 'B0_PRELOAD_REAL_ELECTRON', status: 'PASS', ...result });
  await page.reload();
  await page.waitForLoadState();
  const h = await page.evaluate(async () => {
    const s = await window.agentrouterClient.connect({
      clientId: 'client_reload',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'observer',
    });
    return (await s.request('system.snapshot', {})).roles.length;
  });
  assert.equal(h, 6);
  checks.push({ id: 'B0_RENDERER_RELOAD', status: 'PASS' });
} catch (e) {
  checks.push({ id: 'B0_DESKTOP', status: 'FAIL', error: e.code ?? e.message });
  process.exitCode = 1;
} finally {
  await app?.close();
  writeFileSync(
    'evidence/B0/desktop.json',
    JSON.stringify(
      { scope: 'REAL_ELECTRON_PREVIEW_MOCK', realHarnessSupport: 0, checks },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify(checks));
}
