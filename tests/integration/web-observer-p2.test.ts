import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';

it('已鉴权只读 observer 可升级 P2，但仍不能获取控制租约', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentrouter-observer-'));
  const db = openApplicationStore(dir);
  const app = new ApplicationService(db, [dir], false);
  const transport = new P1MemoryTransport(app);
  try {
    app.registeredHarnesses = () => ['pi', 'zcode'];
    const s = await transport.connect({ clientId: 'web-test', clientVersion: '1.0.0-dev.0', requestedMode: 'observer', contractRevision: 'C1R1P1' });
    expect((await s.request('system.snapshot', {})).roles).toEqual([]);
    await expect((s.request as any)('contract.upgrade', { revision: 'C1R1P2' })).resolves.toMatchObject({ revision: 'C1R1P2' });
    const snapshot = await s.request('system.snapshot', {});
    expect(snapshot.roles).toEqual([]);
    await expect(s.request('control.acquire', {}, { operationId: 'web-no-control', expectedRevision: snapshot.revision, scope: {} }))
      .rejects.toMatchObject({ code: 'CONTROL_LEASE_REQUIRED' });
    expect(s.connectionState()).toBe('CONNECTED_OBSERVER');
    const uninitialized = app.open('web-uninitialized', true);
    const unauthorized = app.open('web-unauthorized', false);
    for (const connection of [uninitialized, unauthorized]) {
      await expect(app.handle(connection, { v: 1, id: 'upgrade-denied', method: 'contract.upgrade', params: { revision: 'C1R1P2' } }))
        .rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
      app.disconnect(connection);
    }
  } finally { await transport.close(); db.close(); }
});
