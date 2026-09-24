import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { RemoteDeviceStore } from '../../packages/remote/device-store.ts';
import { RemoteGateway, type RemoteCoreServer } from '../../packages/remote/remote-gateway.ts';
import { RemoteWebSocketTransport } from '../../packages/client-transport/remote/websocket.ts';
import WebSocket from 'ws';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput } from '../../packages/client-contract/c1r1p1/index.ts';

// Opt-in live test: requires a tailnet-only Tailscale Serve mapping HTTPS 443 -> 127.0.0.1:44568.
// All application data is placed under .local; no production HOME or projects are touched.
it.skipIf(!process.env.AR_TAILSCALE_SERVE_URL)(
  '真实 Tailscale Serve HTTPS/WSS: 配对、取消、UNKNOWN不重放、撤销、重启catchup',
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
    let dropAfterCommit = false;
    let droppedProjectCalls = 0;
    const remoteApp: RemoteCoreServer = {
      open: (...args) => app.open(...args),
      handle: async (connection, request) => {
        const result = await app.handle(connection, request);
        const frame = request as { method?: string; params?: { name?: string } };
        if (frame.method === 'project.create' && frame.params?.name === 'AR-V11-FINAL-REMOTE-UNKNOWN') {
          droppedProjectCalls++;
          if (dropAfterCommit) {
            dropAfterCommit = false;
            throw Error('AR_V11_DROP_AFTER_COMMIT');
          }
        }
        return result;
      },
      subscribe: (connection, handler) => app.subscribe(connection, handler as never),
      disconnect: connection => app.disconnect(connection),
      desktopContext: connection => app.desktopContext(connection),
    };
    const makeGateway = () => new RemoteGateway({ app: remoteApp, devices, allowedHosts: [host], allowedOrigins: [origin] });
    let gateway = makeGateway();
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
      let oldServerInstanceId = '';
      let catchupCursor = 0;
      try {
        expect(remote.session.hello.contractRevision).toBe('C1R1P1');
        oldServerInstanceId = remote.session.hello.serverInstanceId;
        const snapshot = await remote.session.request('system.snapshot', {}) as { revision: number; cursor: number; projects: unknown[] };
        catchupCursor = snapshot.cursor;
        expect(snapshot.projects).toHaveLength(0);
        const lease = await remote.session.request('control.acquire', {}, { operationId: 'ar-v11-remote-acquire', expectedRevision: snapshot.revision, scope: {} }) as { leaseId: string };
        expect(lease.leaseId).toBeTruthy();
        const roots = await remote.session.request('filesystem.listRoots', {}) as { items: { pathHandle: string }[] };
        const current = await remote.session.request('system.snapshot', {}) as { revision: number };
        const project = await remote.session.request('project.create', { name: 'AR-V11-FINAL-REMOTE-project', path_handle: roots.items[0].pathHandle }, { operationId: 'ar-v11-remote-project', expectedRevision: current.revision, scope: {}, leaseId: lease.leaseId }) as { id: string };
        expect(project.id).toBeTruthy();

        // Keep the task deterministically queued, then exercise a real business cancellation over WSS.
        let state = await remote.session.request('system.snapshot', {}) as { revision: number };
        await remote.session.request('runtime.pauseDispatch', {}, { operationId: 'ar-v11-remote-pause', expectedRevision: state.revision, scope: {}, leaseId: lease.leaseId });
        const workspaces = await remote.session.request('workspace.list', { project_id: project.id }) as { items: { id: string }[] };
        const plan = structuredClone(seed) as RolePlanInput;
        plan.project_id = project.id;
        plan.groups = plan.groups.slice(0, 1);
        plan.roles = plan.roles.slice(0, 1);
        plan.groups[0].workspace_ref = workspaces.items[0].id;
        plan.roles[0].workspace_ref = workspaces.items[0].id;
        const checked = await remote.session.request('rolePlan.validate', { plan }) as { planHash: string };
        state = await remote.session.request('system.snapshot', {}) as { revision: number };
        await remote.session.request('rolePlan.apply', { plan, plan_hash: checked.planHash, confirmed: true, permission_grants: [] }, { operationId: 'ar-v11-remote-plan', expectedRevision: state.revision, scope: { project_id: project.id }, leaseId: lease.leaseId });
        const roles = await remote.session.request('role.list', { scope: { project_id: project.id } }) as { items: { id: string; spaceId: string }[] };
        const role = roles.items[0];
        state = await remote.session.request('system.snapshot', {}) as { revision: number };
        const task = await remote.session.request('task.submitFromUser', { request: { kind: 'task.request', to: { type: 'role', id: role.id }, summary: 'AR-V11-FINAL-REMOTE-cancel', body: 'cancel verification', inputs: [], expected: ['cancelled'], completion: { mode: 'result', to: { type: 'user' } } } }, { operationId: 'ar-v11-remote-task', expectedRevision: state.revision, scope: { project_id: project.id, space_id: role.spaceId }, leaseId: lease.leaseId }) as { id: string };
        state = await remote.session.request('system.snapshot', {}) as { revision: number };
        await remote.session.request('task.cancel', { id: task.id }, { operationId: 'ar-v11-remote-cancel', expectedRevision: state.revision, scope: { project_id: project.id, space_id: role.spaceId }, leaseId: lease.leaseId });
        expect((await remote.session.request('task.get', { id: task.id, scope: { project_id: project.id, space_id: role.spaceId } }) as { state: string }).state).toBe('CANCELLED');

        // Commit succeeds but reply is deliberately dropped. The client must surface UNKNOWN/CONNECTION_LOST and never replay.
        state = await remote.session.request('system.snapshot', {}) as { revision: number };
        dropAfterCommit = true;
        await expect(remote.session.request('project.create', { name: 'AR-V11-FINAL-REMOTE-UNKNOWN', path_handle: roots.items[0].pathHandle }, { operationId: 'ar-v11-remote-unknown', expectedRevision: state.revision, scope: {}, leaseId: lease.leaseId })).rejects.toThrow('CONNECTION_LOST');
        expect(droppedProjectCalls).toBe(1);
      } finally { await remote.transport.close(); }

      const afterDrop = await connect(controllerBody.token, 'observer');
      try {
        const snapshot = await afterDrop.session.request('system.snapshot', {}) as { projects: { name: string }[] };
        expect(snapshot.projects.filter(project => project.name === 'AR-V11-FINAL-REMOTE-UNKNOWN')).toHaveLength(1);
        expect(droppedProjectCalls).toBe(1);
      } finally { await afterDrop.transport.close(); }

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
      gateway = makeGateway();
      await start();
      const resumed = await connect(controllerBody.token, 'observer');
      try {
        expect(resumed.session.hello.serverInstanceId).not.toBe(oldServerInstanceId);
        await expect(resumed.session.request('events.catchup', { after_cursor: catchupCursor, server_instance_id: oldServerInstanceId })).rejects.toThrow('CURSOR_EXPIRED');
        const caught = await resumed.session.request('events.catchup', { after_cursor: catchupCursor, server_instance_id: resumed.session.hello.serverInstanceId }) as { events: { event: string }[]; next_cursor: number };
        expect(caught.events.some(event => event.event === 'project.changed')).toBe(true);
        expect(caught.next_cursor).toBeGreaterThan(catchupCursor);
        const snapshot = await resumed.session.request('system.snapshot', {}) as { revision: number; projects: { name: string }[]; tasks: { summary: string; state: string }[] };
        expect(snapshot.revision).toBeGreaterThan(0);
        expect(snapshot.projects.some(project => project.name === 'AR-V11-FINAL-REMOTE-project')).toBe(true);
        expect(snapshot.projects.filter(project => project.name === 'AR-V11-FINAL-REMOTE-UNKNOWN')).toHaveLength(1);
        expect(snapshot.tasks.some(task => task.summary === 'AR-V11-FINAL-REMOTE-cancel' && task.state === 'CANCELLED')).toBe(true);
      }
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
