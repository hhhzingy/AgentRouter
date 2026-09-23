import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { ParticipantExtension } from '../../packages/core-service/participant-extension.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';
import { assertManagementLauncher } from '../../apps/management-mcp/launcher-guard.ts';

async function fixture() {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/c6-joint-'));
  const db = openApplicationStore(dir);
  const server = new ApplicationService(db, [dir], false);
  const transport = new P1MemoryTransport(server, 'human_mgmt');
  const s = await transport.connect({
    clientId: 'mcp_management_cursor',
    clientVersion: '1.0.0-dev.0',
    requestedMode: 'controller',
  });
  server.participant = new ParticipantExtension(db);
  const lease = await s.request('control.acquire', {}, {
    operationId: 'op_lease',
    expectedRevision: (await s.request('system.snapshot', {})).revision,
    scope: {},
  });
  const leaseId = (lease as { leaseId: string }).leaseId;
  let n = 0;
  const write = async (m: Method, p: any, scope: Scope = {}, op?: string) =>
    s.request(m, p, {
      operationId: op ?? 'op_' + ++n,
      expectedRevision: (await s.request('system.snapshot', {})).revision,
      scope,
      leaseId,
    });
  const roots = await s.request('filesystem.listRoots', {});
  const project = (await write('project.create', { name: 'C6联合', path_handle: roots.items[0].pathHandle })) as any;
  const ws = await s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.groups[0].workspace_ref = ws.items[0].id;
  plan.roles[0].workspace_ref = ws.items[0].id;
  const v = await s.request('rolePlan.validate', { plan });
  await write(
    'rolePlan.apply',
    { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [{ role_key: plan.roles[0].role_key, permissions: plan.roles[0].requested_permissions }] },
    { project_id: project.id },
    'apply',
  );
  const snap2 = await s.request('system.snapshot', {});
  const roleId = (snap2.roles as { id: string }[])[0].id;
  const spaceId = (snap2.spaces as { id: string }[])[0].id;
  const ext = async (method: string, params: Record<string, unknown>) => {
    const key = 'c6_' + ++n;
    return s.request(method as never, params as never, {
      leaseId,
      requestKey: key,
      operationId: key,
      expectedRevision: (await s.request('system.snapshot', {})).revision,
    } as never);
  };
  return { dir, db, server, s, write, project, roleId, spaceId, leaseId, ext, plan, async close() { await transport.close(); db.close(); } };
}

it('C6 Gate: Management 派任务，Participant join/claim/artifact/result，下游看到同一 hash；Cursor 不是 Role', async () => {
  expect(() =>
    assertManagementLauncher({ data: 'E:/dut', mode: 'controller', clientId: 'mcp_management_cursor', managedRole: '1' }),
  ).toThrow('MANAGEMENT_START_DENIED');
  const f = await fixture();
  try {
    const managed = (await f.ext('participant.slot.list', { role_id: f.roleId })) as { slots: { id: string }[] };
    await f.ext('participant.leave', { role_id: f.roleId, slot_id: managed.slots[0].id });
    const slot = (await f.ext('participant.slot.create', { role_id: f.roleId, name: 'W1', participant_kind: 'CHATGPT_WEB' })) as { slot_id: string };
    const grant = (await f.ext('participant.grant.issue', { role_id: f.roleId })) as { grant_id: string; token: string };
    const task = (await f.write(
      'task.submitFromUser',
      {
        request: {
          kind: 'task.request',
          to: { type: 'role', id: f.roleId },
          summary: '写 review',
          body: '请产出 review.md',
          inputs: [],
          expected: ['review.md'],
          completion: { mode: 'result', to: { type: 'user' } },
        },
      },
      { project_id: f.project.id, space_id: f.spaceId },
      'task-review',
    )) as { id: string };

    await expect(
      f.s.request('participant.join' as never, {
        role_id: f.roleId,
        slot_id: slot.slot_id,
        participant_kind: 'CHATGPT_WEB',
        request_key: 'mgmt-must-not-join',
      } as never),
    ).rejects.toMatchObject({ message: 'PARTICIPANT_GENERATION_STALE' });

    const web = new P1MemoryTransport(f.server, 'human_web');
    const w = await web.connect({ clientId: 'client_web_c6', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    await w.request('participant.attach' as never, { role_id: f.roleId, grant_id: grant.grant_id, grant_token: grant.token } as never);
    const joined = (await w.request('participant.join' as never, {
      role_id: f.roleId,
      slot_id: slot.slot_id,
      participant_kind: 'CHATGPT_WEB',
      request_key: 'join-c6',
    } as never)) as {
      work_session_id: string;
      identity: { charter_revision: number; role_id: string };
    };
    expect(joined.identity.role_id).toBe(f.roleId);
    expect(
      f.db.prepare('select role_session_id from tasks where id=?').get(task.id),
    ).toEqual({ role_session_id: joined.work_session_id });
    const beforeRev = joined.identity.charter_revision;

    await w.request('participant.claim' as never, { role_id: f.roleId, task_id: task.id, request_key: 'claim-c6' } as never);
    const art = (await w.request('participant.artifact' as never, {
      role_id: f.roleId,
      task_id: task.id,
      name: 'review.md',
      content: '# review\nPASS\n',
      request_key: 'art-c6',
    } as never)) as { artifact_id: string; sha256: string };
    expect(art.sha256).toMatch(/^[0-9a-f]{64}$/);
    await w.request('participant.submit_result' as never, {
      role_id: f.roleId,
      task_id: task.id,
      request_key: 'result-c6',
      outcome: 'succeeded',
      summary: '已写 review',
      body: '见 review.md',
      outputs: [{ kind: 'artifact', artifact_id: art.artifact_id }],
    } as never);

    const listed = (await f.s.request('artifact.list', {})) as { items: { id: string }[] };
    const seen = listed.items.find((x) => x.id === art.artifact_id);
    expect(seen).toBeTruthy();
    const verified = (await f.s.request('artifact.verify', { id: art.artifact_id })) as { state: string };
    expect(verified.state).toBe('AVAILABLE');
    const row = f.db.prepare('select sha256 from artifacts where id=?').get(art.artifact_id) as { sha256: string };
    expect(row.sha256).toBe(art.sha256);
    const result = f.db.prepare('select id,publication_state,outputs_json from results where task_id=?').get(task.id) as {
      id: string;
      publication_state: string;
      outputs_json: string;
    };
    expect(result.publication_state).toBe('PUBLISHED');
    expect(JSON.parse(result.outputs_json)).toEqual([{ kind: 'artifact', artifact_id: art.artifact_id }]);
    const evidence = (await f.s.request('result.evidence' as never, { id: result.id } as never)) as unknown as {
      evidence_layer: string; source_revision: string | null; tests: unknown[];
      test_records_status: string; run_id: string | null;
      artifacts: { id: string; sha256: string; state: string }[];
    };
    expect(evidence).toMatchObject({
      evidence_layer: 'CORE_PERSISTED_RECORD', source_revision: null,
      test_records_status: 'NOT_RECORDED', run_id: null,
      artifacts: [{ id: art.artifact_id, sha256: art.sha256, state: 'AVAILABLE' }],
    });
    expect(evidence.tests).toEqual([]);
    const visibleResult = (await f.s.request('system.snapshot', {})).results.find((x) => x.id === result.id);
    expect(visibleResult?.artifactIds).toContain(art.artifact_id);

    const reviewOptions = {
      leaseId: f.leaseId,
      requestKey: 'review-c6',
      operationId: 'review-c6',
      expectedRevision: (await f.s.request('system.snapshot', {})).revision,
    };
    const observerTransport = new P1MemoryTransport(f.server, 'human_observer');
    const observer = await observerTransport.connect({
      clientId: 'review_observer', clientVersion: '1.0.0-dev.0', requestedMode: 'observer',
    });
    await expect(observer.request('result.requestChanges' as never, {
      id: result.id, feedback: '越权修改',
    } as never, reviewOptions as never)).rejects.toThrow('CONTROL_LEASE_REQUIRED');
    await observerTransport.close();
    f.server.defaultConnectionScope = new Set();
    const scopedTransport = new P1MemoryTransport(f.server, 'human_scoped_observer');
    const scopedObserver = await scopedTransport.connect({
      clientId: 'review_scoped_observer', clientVersion: '1.0.0-dev.0', requestedMode: 'observer',
    });
    await expect(scopedObserver.request('result.evidence' as never, { id: result.id } as never))
      .rejects.toThrow('SCOPE_DENIED');
    await scopedTransport.close();
    f.server.defaultConnectionScope = undefined;
    f.server.failNextCommit = true;
    await expect(f.s.request('result.requestChanges' as never, {
      id: result.id, feedback: '提交前回滚',
    } as never, { ...reviewOptions, operationId: 'review-rollback' } as never)).rejects.toThrow('INTERNAL_ERROR');
    expect(f.db.prepare('select acceptance from tasks where id=?').get(task.id))
      .toEqual({ acceptance: 'PENDING' });
    expect((f.db.prepare("select count(*) as n from tasks where json_extract(request_json,'$.project_data.source_result_id')=?")
      .get(result.id) as { n: number }).n).toBe(0);
    const changes = (await f.s.request('result.requestChanges' as never, {
      id: result.id, feedback: '请补充复核说明',
    } as never, reviewOptions as never)) as unknown as {
      acceptance: string; follow_up_task: { id: string; state: string };
      published_history_retained: boolean;
    };
    expect(changes).toMatchObject({ acceptance: 'REJECTED', published_history_retained: true,
      follow_up_task: { state: 'QUEUED' } });
    expect(await f.s.request('result.requestChanges' as never, {
      id: result.id, feedback: '请补充复核说明',
    } as never, reviewOptions as never)).toEqual(changes);
    await expect(f.s.request('result.requestChanges' as never, {
      id: result.id, feedback: '不同意见',
    } as never, reviewOptions as never)).rejects.toThrow('OPERATION_CONFLICT');
    const review = (await f.s.request('result.reviewStatus' as never, { id: result.id } as never)) as unknown as {
      feedback: string; follow_up_task: { id: string }; published_history_retained: boolean;
    };
    expect(review).toMatchObject({ feedback: '请补充复核说明',
      follow_up_task: { id: changes.follow_up_task.id }, published_history_retained: true });
    expect(f.db.prepare('select publication_state from results where id=?').get(result.id))
      .toEqual({ publication_state: 'PUBLISHED' });
    expect((f.db.prepare("select count(*) as n from tasks where json_extract(request_json,'$.project_data.source_result_id')=?")
      .get(result.id) as { n: number }).n).toBe(1);
    await expect(f.write('result.accept', { id: result.id },
      { project_id: f.project.id, space_id: f.spaceId }, 'accept-after-changes'))
      .rejects.toThrow('PLAN_STATE_CONFLICT');

    const charter = f.db.prepare('select spec_json,permissions_json from role_charters where role_id=? order by revision desc limit 1').get(f.roleId) as {
      spec_json: string;
      permissions_json: string;
    };
    const spec = JSON.parse(charter.spec_json);
    spec.mission = '修订后的审查职责';
    f.server.publish(f.roleId, spec, JSON.parse(charter.permissions_json));
    const ident2 = (await w.request('participant.identity' as never, { role_id: f.roleId } as never)) as {
      charter_revision: number;
      mission: string;
    };
    expect(ident2.charter_revision).toBeGreaterThan(beforeRev);
    expect(ident2.mission).toBe('修订后的审查职责');
    await web.close();
  } finally {
    await f.close();
  }
});
