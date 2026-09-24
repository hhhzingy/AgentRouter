import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
mkdirSync('.local/client-c1r1', { recursive: true });
const outfile = resolve('.local/client-c1r1/fixture-mock.mjs');
await build({
  entryPoints: ['packages/core-api/mock-c1r1.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const { MockC1R1Server } = await import(pathToFileURL(outfile).href);
const server = new MockC1R1Server(() => 1000),
  cid = server.open('mock_fixture');
let counter = 0,
  lease;
async function call(method, params, mutation = false, global = false) {
  const raw = {
    v: 1,
    id: 'req_' + ++counter,
    method,
    params,
    ...(mutation
      ? {
          client_id: 'client_fixture',
          operation_id: 'op_' + counter,
          expected_revision: server.state.snapshot.revision,
          scope: global ? {} : { project_id: 'project_example' },
          ...(lease ? { lease_id: lease } : {}),
        }
      : {}),
  };
  const r = await server.handle(cid, raw);
  if (r.error) throw Error(r.error.code);
  return r.result;
}
const hello = await call('system.initialize', {
  client_protocol: 'agentrouter-client/1',
  client_version: '1.0.0-dev.0',
  client_id: 'client_fixture',
  requested_mode: 'controller',
  contract_revision: 'C1R1',
});
lease = (await call('control.acquire', {}, true, true)).leaseId;
const plan = JSON.parse(readFileSync('fixtures/client-c1r1/two-groups.plan.json', 'utf8'));
const validation = await call('rolePlan.validate', { plan });
const applied = await call(
  'rolePlan.apply',
  { plan, plan_hash: validation.planHash, confirmed: true, permission_grants: [] },
  true,
);
const snapshot = await call('system.snapshot', {});
let crossGroupError;
try {
  server.routeMock(snapshot.roles[0].id, snapshot.roles[3].id, 'notice');
} catch (e) {
  crossGroupError = e.code;
}
await call('runtime.drain', {}, true, true);
const reconfigure = {
  mode: 'MERGE',
  source_space_ids: applied.spaceIds,
  targets: [
    {
      group_key: 'merged',
      display_name: '合并组',
      purpose: '受控合并',
      rules: {
        handoff_requirements: [],
        completion_definition: ['用户验收'],
        parallelism_notes: '工作区保持独立',
      },
    },
  ],
  assignments: snapshot.roles.map((r) => ({
    role_id: r.id,
    target_group_key: 'merged',
    workspace_id: server.state.charters.find((c) => c.roleId === r.id).workspaceId,
  })),
  task_dispositions: [],
};
const preview = await call('space.reconfigure.preview', { plan: reconfigure }, true);
const committed = await call(
  'space.reconfigure.commit',
  { plan_id: preview.planId, plan_hash: preview.planHash, confirmed: true },
  true,
);
const value = {
  mock: true,
  realHarnessSupport: 0,
  hello,
  validation,
  applied,
  snapshot,
  crossGroupError,
  preview,
  committed,
};
writeFileSync('fixtures/client-c1r1/demo.json', JSON.stringify(value, null, 2) + '\n');
console.log('C1R1 mock fixtures generated; generated IDs are fixture IDs, not live entities.');
