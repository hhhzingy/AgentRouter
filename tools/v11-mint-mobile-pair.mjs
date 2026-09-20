import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const data = resolve('.local/v11-cursor-mcp/core');
if (!existsSync(resolve(data, 'endpoint.json'))) throw Error('CORE_NOT_RUNNING');
await build({
  entryPoints: ['packages/client-transport/p1/local.ts'],
  outfile: resolve('.local/v11-cursor-mcp/transport.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const { LocalCoreTransport } = await import(
  pathToFileURL(resolve('.local/v11-cursor-mcp/transport.mjs')).href
);
const transport = new LocalCoreTransport(data);
const s = await transport.connect({
  clientId: 'mcp_management_cursor',
  clientVersion: '1.0.0-dev.0',
  requestedMode: 'controller',
  contractRevision: 'C1R1P1',
  mode: 'LOCAL_CORE',
});
const snap = await s.request('system.snapshot', {});
const lease = await s.request(
  'control.acquire',
  {},
  { operationId: 'pair-lease', expectedRevision: snap.revision, scope: {} },
);
const pair = await s.request(
  'remoteDevice.createPairing',
  { displayName: '手机', kind: 'MOBILE', canRequestController: true, ttlMs: 600000 },
  {
    operationId: 'pair-mint',
    expectedRevision: (await s.request('system.snapshot', {})).revision,
    scope: {},
    leaseId: lease.leaseId,
  },
);
await s.request(
  'control.release',
  { lease_id: lease.leaseId },
  {
    operationId: 'pair-release',
    expectedRevision: (await s.request('system.snapshot', {})).revision,
    scope: {},
  },
);
await transport.close();
const remote = existsSync(resolve(data, 'remote-gateway.json'))
  ? JSON.parse(readFileSync(resolve(data, 'remote-gateway.json'), 'utf8'))
  : null;
const out = {
  challenge: pair.challenge,
  expiresAtMs: pair.expiresAtMs,
  remote,
};
writeFileSync(resolve('.local/v11-cursor-mcp/mobile-pair.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out));
