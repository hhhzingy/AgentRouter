import { _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { diagnosticSummary } from '../packages/security/diagnostics.mjs';
mkdirSync('.local/desktop-tests', { recursive: true });
let status = 'PASS';
for (const enabled of ['0', '1']) {
  const data = mkdtempSync(resolve('.local/desktop-tests/c1-'));
  const env = {
    ...process.env,
    AGENTROUTER_DATA: data,
    AGENTROUTER_C1_MOCK: enabled,
    AGENTROUTER_SOFTWARE_RENDERING: '1',
    TEMP: data,
    TMP: data,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({
      executablePath: resolve('release/AgentRouter-preview/electron.exe'),
      args: [`--user-data-dir=${data}`],
      env,
      timeout: 20000,
    });
    const page = await app.firstWindow();
    const result = await page.evaluate(async (enabled) => {
      const client = window.agentrouterClient;
      try {
        const session = await client.connect({
          clientId: 'client_preload',
          clientVersion: '1.0.0-dev.0',
          requestedMode: 'controller',
        });
        const snapshot = await session.request('system.snapshot', {});
        const lease = await session.request(
          'control.acquire',
          {},
          { operationId: 'op_preload', expectedRevision: snapshot.revision, scope: {} },
        );
        const changed = await session.request(
          'role.rename',
          { id: 'role_reviewer', name: 'Preload 检查' },
          {
            operationId: 'op_rename',
            expectedRevision: snapshot.revision,
            scope: { project_id: 'project_demo', space_id: 'space_demo' },
            leaseId: lease.leaseId,
          },
        );
        const state = session.connectionState();
        await client.close();
        return {
          enabled,
          mock: session.hello.capabilities.mock,
          state,
          revision: changed.revision,
          node: typeof window.require,
        };
      } catch {
        return { enabled, denied: true };
      }
    }, enabled);
    if (enabled === '0') assert.equal(result.denied, true);
    else
      assert.deepEqual(result, {
        enabled: '1',
        mock: true,
        state: 'CONNECTED_CONTROLLER',
        revision: 2,
        node: 'undefined',
      });
  } catch {
    status = 'FAIL';
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}
const report = diagnosticSummary({
  test: 'C1_PRELOAD',
  status,
  exit_code: status === 'PASS' ? 0 : 1,
  at: new Date().toISOString(),
  test_count: 2,
  passed_count: status === 'PASS' ? 2 : 0,
});
writeFileSync('evidence/W10/preload.json', JSON.stringify(report, null, 2));
console.log(report);
