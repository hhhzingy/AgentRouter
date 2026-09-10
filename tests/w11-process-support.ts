import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalCoreTransport } from '../packages/client-transport/p1/local.ts';
import type { ClientSession } from '../packages/client-transport/p1/types.ts';
import type { Method, Scope, RolePlanInput } from '../packages/client-contract/c1r1p1/index.ts';
import seed from '../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export async function until<T>(
  get: () => Promise<T>,
  test: (x: T) => boolean,
  ms = 12000,
): Promise<T> {
  const end = Date.now() + ms;
  let x: T;
  do {
    x = await get();
    if (test(x)) return x;
    await delay(40);
  } while (Date.now() < end);
  throw Error('CONDITION_TIMEOUT:' + JSON.stringify(x!));
}
export async function startCore(dir?: string) {
  mkdirSync('.local/w11-tests', { recursive: true });
  dir ??= mkdtempSync(resolve('.local/w11-tests/process-'));
  writeFileSync(resolve(dir, 'fixture-data.marker'), 'AGENTROUTER_ISOLATED_FIXTURE');
  const child = fork(resolve('.local/w11-core/core.mjs'), [], {
    execPath: process.execPath,
    windowsHide: true,
    silent: true,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      TEMP: dir,
      TMP: dir,
      AGENTROUTER_DATA: dir,
      AGENTROUTER_PROJECT_ROOTS: JSON.stringify([dir]),
      AGENTROUTER_FIXTURE: '1',
    },
  } as ForkOptions & { windowsHide: boolean });
  let diagnostics = '';
  child.stderr!.on('data', (b) => (diagnostics += b.toString()));
  await new Promise<void>((res, rej) => {
    const timer = setTimeout(() => rej(Error('CORE_READY_TIMEOUT:' + diagnostics)), 10000);
    child.on('message', (m: any) => {
      if (m.ready) {
        clearTimeout(timer);
        res();
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      rej(Error('CORE_EXIT:' + diagnostics));
    });
  });
  let n = 0;
  const pending = new Map<string, { resolve: (x: any) => void; reject: (e: Error) => void }>();
  child.on('message', (m: any) => {
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
    }
  });
  const control = (action: string, p: Record<string, unknown> = {}) =>
    new Promise<any>((resolve, reject) => {
      const id = 'test_' + ++n;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('TEST_CONTROL_TIMEOUT:' + action + ':' + diagnostics));
      }, 5000);
      pending.set(id, {
        resolve: (x) => {
          clearTimeout(timer);
          resolve(x);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      child.send({ id, action, ...p });
    });
  const transport = new LocalCoreTransport(dir),
    session = await transport.connect({
      clientId: 'client_process',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
      mode: 'LOCAL_CORE',
    });
  const snapshot = await session.request('system.snapshot', {}),
    lease = await session.request(
      'control.acquire',
      {},
      { operationId: 'op_lease', expectedRevision: snapshot.revision, scope: {} },
    );
  let op = 0;
  const write = (m: Method, p: any, scope: Scope = {}, operation?: string, revision?: number) =>
    session.request(m, p, {
      operationId: operation ?? 'op_cmd_' + ++op,
      expectedRevision: revision ?? undefined,
      scope,
      leaseId: lease.leaseId,
    });
  async function mutate(
    m: Method,
    p: any,
    scope: Scope = {},
    operation?: string,
    revision?: number,
  ) {
    return write(
      m,
      p,
      scope,
      operation,
      revision ?? (await session.request('system.snapshot', {})).revision,
    );
  }
  async function stop() {
    await transport.close();
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((res) => {
        child.once('exit', () => res());
        child.kill();
      });
    }
  }
  return { dir, child, control, transport, session, lease, write: mutate, stop };
}
export async function createProjectAndPlan(
  f: Awaited<ReturnType<typeof startCore>>,
  separateWorkspaces = false,
  failApply = false,
) {
  const roots = await f.session.request('filesystem.listRoots', {}),
    project = (await f.write('project.create', {
      name: '真实进程项目',
      path_handle: roots.items[0].pathHandle,
    })) as any;
  const ws = await f.session.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  for (const g of plan.groups) g.workspace_ref = ws.items[0].id;
  for (const r of plan.roles)
    r.workspace_ref = separateWorkspaces
      ? (await f.control('createFixtureWorkspace', { projectId: project.id })).id
      : ws.items[0].id;
  const checked = await f.session.request('rolePlan.validate', { plan });
  if (failApply) await f.control('failNextCommit');
  const applied = (await f.write(
    'rolePlan.apply',
    { plan, plan_hash: checked.planHash, confirmed: true, permission_grants: [] },
    { project_id: project.id },
  )) as any;
  const snapshot = await f.session.request('system.snapshot', {});
  const roleIds = applied.roleIds as string[];
  return {
    project,
    plan,
    applied,
    roles: roleIds.map((id) => snapshot.roles.find((r) => r.id === id)!),
  };
}
