import { MockP1Server } from './mock-p1.ts';
import { P1MemoryTransport } from '../client-transport/p1/memory.ts';
import plan from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput } from '../client-contract/c1r1p1/generated.ts';
/** 仅 Main 启动参数/测试导入，没有 Client API 控制口。 */
export async function loadP1Scenario(server: MockP1Server, name: string) {
  if (name !== 'two-groups') throw Error('UNKNOWN_PREVIEW_SCENARIO');
  const t = new P1MemoryTransport(server);
  const s = await t.connect({
    clientId: 'client_scenario',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'controller',
  });
  const before = await s.request('system.snapshot', {});
  const lease = await s.request(
    'control.acquire',
    {},
    { operationId: 'op_scenario_lease', scope: {}, expectedRevision: before.revision },
  );
  const input = structuredClone(plan) as RolePlanInput;
  const checked = await s.request('rolePlan.validate', { plan: input });
  await s.request(
    'rolePlan.apply',
    { plan: input, plan_hash: checked.planHash, confirmed: true, permission_grants: [] },
    {
      operationId: 'op_scenario_apply',
      expectedRevision: before.revision,
      scope: { project_id: input.project_id },
      leaseId: lease.leaseId,
    },
  );
  await s.request(
    'control.release',
    { lease_id: lease.leaseId },
    {
      operationId: 'op_scenario_release',
      expectedRevision: (await s.request('system.snapshot', {})).revision,
      scope: {},
    },
  );
  await t.close();
}
