import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RemoteDeviceStore } from '../../packages/remote/device-store.ts';
import { RemoteGateway } from '../../packages/remote/remote-gateway.ts';
import { RemoteWebSocketTransport } from '../../packages/client-transport/remote/websocket.ts';
import WebSocket from 'ws';

// Opt-in live test: requires a tailnet-only Tailscale Serve mapping HTTPS 443 -> 127.0.0.1:44568.
// All application data is placed under .local; no production HOME or projects are touched.
it.skipIf(!process.env.AR_TAILSCALE_SERVE_URL)(
  '真实 Tailscale Serve HTTPS/WSS: 配对、observer、controller、撤销、重启重连',
  async () => {
    const base = process.env.AR_TAILSCALE_SERVE_URL!;
    const host = new URL(base).hostname;
    const origin = new URL(base).origin;
    const wsUrl = base.replace(/^https:/, 'wss:') + '/ws';
    const port = 44568;
    mkdirSync('.local/v11-tailscale-serve', { recursive: true });
    const data = mkdtempSync(resolve('.local/v11-tailscale-serve/run-'));
    let db = openApplicationStore(data);
    let app = new ApplicationService(db, [data], true);
    let devices = new RemoteDeviceStore(db);
    let gateway = new RemoteGateway({ app, devices, allowedHosts: [host], allowedOrigins: [origin] });
    const start = () => gateway.listen(port, '127.0.0.1');
    const connect = async (token: string, mode: 'observer' | 'controller') => {
      const transport = new RemoteWebSocketTransport({ url: wsUrl, token, WebSocketImpl: globalThis.WebSocket as never, requestTimeoutMs: 8000 });
      const session = await transport.connect({ clientId: 'tailscale_live_' + mode, clientVersion: '1.0.0', requestedMode: mode, mode: 'LOCAL_CORE' });
      return { transport, session };
    };
    await start();
    try {
      const health = await fetch(base + '/health', { signal: AbortSignal.timeout(10000) });
      expect(health.status).toBe(200);
      expect((await health.json()).kind).toBe('agentrouter-remote-gateway');
      expect((await fetch(base + '/', { signal: AbortSignal.timeout(10000) })).status).toBe(404);

      const observerPair = devices.createPairing({ displayName: 'AR-V11-FINAL-REMOTE-observer', kind: 'MOBILE' });
      const observerResponse = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: observerPair.challenge }), signal: AbortSignal.timeout(10000) });
      expect(observerResponse.status).toBe(200);
      expect((observerResponse.headers.get('set-cookie') ?? '').toLowerCase()).toContain('secure');
      const observerBody = await observerResponse.json() as { deviceId: string; token?: string; paired: boolean };
      expect(observerBody.paired).toBe(true);
      expect(observerBody.token).toBeUndefined();

      // Browser-equivalent WSS handshake: exact HTTPS Origin and HttpOnly pairing cookie.
      const cookie = (observerResponse.headers.get('set-cookie') ?? '').split(';')[0];
      const browserWs = new WebSocket(wsUrl, { origin, headers: { cookie } });
      const attached = await new Promise<Record<string, unknown>>((resolveAttached, reject) => {
        const timer = setTimeout(() => reject(Error('WSS_ATTACH_TIMEOUT')), 10000);
        browserWs.once('message', raw => { clearTimeout(timer); resolveAttached(JSON.parse(String(raw))); });
        browserWs.once('error', reject);
      });
      expect(attached.attached).toBe(true);
      expect(attached.canRequestController).toBe(false);

      const controllerPair = devices.createPairing({ displayName: 'AR-V11-FINAL-REMOTE-controller', kind: 'DESKTOP', canRequestController: true });
      const controllerResponse = await fetch(base + '/pair', { method: 'POST', body: JSON.stringify({ challenge: controllerPair.challenge }), signal: AbortSignal.timeout(10000) });
      expect(controllerResponse.status).toBe(200);
      const controllerBody = await controllerResponse.json() as { deviceId: string; token: string };
      const remote = await connect(controllerBody.token, 'controller');
      try {
        expect(remote.session.hello.contractRevision).toBe('C1R1P1');
        const snapshot = await remote.session.request('system.snapshot', {}) as { revision: number; projects: unknown[] };
        expect(snapshot.projects).toHaveLength(0);
        const lease = await remote.session.request('control.acquire', {}, { operationId: 'ar-v11-remote-acquire', expectedRevision: snapshot.revision, scope: {} }) as { leaseId: string };
        expect(lease.leaseId).toBeTruthy();
        const roots = await remote.session.request('filesystem.listRoots', {}) as { items: { pathHandle: string }[] };
        const current = await remote.session.request('system.snapshot', {}) as { revision: number };
        const project = await remote.session.request('project.create', { name: 'AR-V11-FINAL-REMOTE-project', path_handle: roots.items[0].pathHandle }, { operationId: 'ar-v11-remote-project', expectedRevision: current.revision, scope: {}, leaseId: lease.leaseId }) as { id: string };
        expect(project.id).toBeTruthy();
      } finally { await remote.transport.close(); }

      const revokedSocket = new Promise<number>((resolveClose, reject) => {
        const timer = setTimeout(() => reject(Error('WSS_REVOKE_TIMEOUT')), 10000);
        browserWs.once('close', code => { clearTimeout(timer); resolveClose(code); });
      });
      expect(devices.revoke(observerBody.deviceId)).toBe(true);
      gateway.revokeLive(observerBody.deviceId);
      expect(await revokedSocket).toBe(4001);

      // Recreate application and gateway over the same isolated database: remote credential survives restart.
      await gateway.close();
      db.close();
      db = openApplicationStore(data);
      app = new ApplicationService(db, [data], true);
      devices = new RemoteDeviceStore(db);
      gateway = new RemoteGateway({ app, devices, allowedHosts: [host], allowedOrigins: [origin] });
      await start();
      const resumed = await connect(controllerBody.token, 'observer');
      try { expect((await resumed.session.request('system.snapshot', {})).revision).toBeGreaterThan(0); }
      finally { await resumed.transport.close(); }

      expect(devices.revoke(controllerBody.deviceId)).toBe(true);
      await expect(connect(controllerBody.token, 'observer')).rejects.toBeTruthy();
    } finally {
      await gateway.close();
      db.close();
    }
  },
  120_000,
);
