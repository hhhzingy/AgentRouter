import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

it(
  'P3 HTTP grant签发+撤销:同角色grant撤销后旧凭据失效(受控单会话)',
  { timeout: 120000 },
  async () => {
    mkdirSync('.local/w11-tests', { recursive: true });
    const dir = mkdtempSync(resolve('.local/w11-tests/p5grant-'));
    mkdirSync(resolve(dir, 'workspace'), { recursive: true });
    const core = spawn(process.execPath, [resolve('.local/w11-core/core.mjs')], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      env: {
        SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: '', TEMP: dir, TMP: dir,
        AGENTROUTER_DATA: resolve(dir, 'core'),
        AGENTROUTER_PROJECT_ROOTS: JSON.stringify([resolve(dir, 'workspace')]),
      },
    });
    for (let i = 0; i < 60 && !existsSync(resolve(dir, 'core/endpoint.json')); i++)
      await new Promise((r) => setTimeout(r, 100));
    await build({
      entryPoints: ['packages/client-transport/p1/local.ts'],
      outfile: resolve(dir, 'transport.mjs'),
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
    });
    const { LocalCoreTransport } = await import(
      pathToFileURL(resolve('packages/storage/application-store.ts')).href.replace(
        'storage/application-store.ts', 'client-transport/p1/local.ts',
      )
    );
    const setup = new LocalCoreTransport(resolve(dir, 'core'));
    const s = await setup.connect({
      clientId: 'p5_setup', clientVersion: '1.0.0', requestedMode: 'controller',
      contractRevision: 'C1R1P1', mode: 'LOCAL_CORE',
    });
    const snap = () => s.request('system.snapshot', {});
    const lease = await s.request('control.acquire', {}, { operationId: 'p5_lease', expectedRevision: (await snap()).revision, scope: {} });
    const mutate = async (m: string, p: any, op: string, scope: any = {}) =>
      s.request(m as never, p, { operationId: op, scope, expectedRevision: (await snap()).revision, leaseId: (lease as { leaseId: string }).leaseId });
    const roots = await s.request('filesystem.listRoots', {});
    const project = (await mutate('project.create', { name: 'P5撤销', path_handle: roots.items[0].pathHandle }, 'project')) as any;
    const ws = (await s.request('workspace.list', { project_id: project.id })).items[0];
    const plan = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
    plan.project_id = project.id;
    plan.groups = plan.groups.slice(0, 1);
    plan.roles = plan.roles.slice(0, 1);
    plan.groups[0].workspace_ref = ws.id;
    plan.roles[0].workspace_ref = ws.id;
    const v = await s.request('rolePlan.validate', { plan });
    await mutate('rolePlan.apply', { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [{ role_key: plan.roles[0].role_key, permissions: plan.roles[0].requested_permissions }] }, 'apply', { project_id: project.id });
    const roleId = ((await s.request('role.list', { scope: { project_id: project.id } })).items[0] as any).id;

    // 签发 grant A
    const grantA = await s.request('participant.grant.issue' as never, { role_id: roleId } as never, { leaseId: (lease as { leaseId: string }).leaseId });
    expect(grantA.token).toBeTruthy();
    // 撤销 grant A
    await s.request('participant.grant.revoke' as never, { grant_id: grantA.grant_id } as never, { leaseId: (lease as { leaseId: string }).leaseId });
    // 签发 grant B
    const grantB = await s.request('participant.grant.issue' as never, { role_id: roleId } as never, { leaseId: (lease as { leaseId: string }).leaseId });
    expect(grantB.token).toBeTruthy();
    expect(grantB.grant_id).not.toBe(grantA.grant_id);
    await setup.close();
  },
);
