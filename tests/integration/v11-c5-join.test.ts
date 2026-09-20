import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { ParticipantExtension } from '../../packages/core-service/participant-extension.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

async function fixture() {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/c5-join-'));
  const db = openApplicationStore(dir);
  const server = new ApplicationService(db, [dir], false);
  const transport = new P1MemoryTransport(server, 'human_test');
  const s = await transport.connect({
    clientId: 'client_c5_setup',
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
  const project = (await write('project.create', { name: 'Join项目', path_handle: roots.items[0].pathHandle })) as any;
  const ws = await s.request('workspace.list', { project_id: project.id });
  const plan = structuredClone(seed) as RolePlanInput;
  plan.project_id = project.id;
  plan.groups = plan.groups.slice(0, 1);
  plan.roles = plan.roles.slice(0, 1);
  plan.groups[0].workspace_ref = ws.items[0].id;
  plan.roles[0].workspace_ref = ws.items[0].id;
  const v = await s.request('rolePlan.validate', { plan });
  await write('rolePlan.apply', { plan, plan_hash: v.planHash, confirmed: true, permission_grants: [] }, { project_id: project.id }, 'apply');
  const snap2 = await s.request('system.snapshot', {});
  const roleId = (snap2.roles as { id: string }[])[0].id;
  const ext = async (method: string, params: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    s.request(method as never, params as never, {
      leaseId,
      operationId: 'c5_' + ++n,
      expectedRevision: (await s.request('system.snapshot', {})).revision,
      ...extra,
    } as never);
  return { dir, db, server, s, write, project, roleId, leaseId, ext, async close() { await transport.close(); db.close(); } };
}

it('C5-A: Slot 无 WS 时 join 绑定现有未占用 WS，同 request_key 不建第二份', async () => {
  const f = await fixture();
  try {
    const managed = (await f.ext('participant.slot.list', { role_id: f.roleId })) as { slots: { id: string; participant_kind: string }[] };
    expect(managed.slots.some((x) => x.participant_kind === 'MANAGED_HARNESS')).toBe(true);
    await f.ext('participant.leave', { role_id: f.roleId, slot_id: managed.slots.find((x) => x.participant_kind === 'MANAGED_HARNESS')!.id });
    const slot = (await f.ext('participant.slot.create', {
      role_id: f.roleId,
      name: 'W1',
      participant_kind: 'CHATGPT_WEB',
    })) as { slot_id: string };
    const grant = (await f.ext('participant.grant.issue', { role_id: f.roleId })) as { grant_id: string; token: string };
    const web = new P1MemoryTransport(f.server, 'human_web');
    const w = await web.connect({ clientId: 'client_web_a', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    await w.request('participant.attach' as never, { role_id: f.roleId, grant_id: grant.grant_id, grant_token: grant.token } as never);
    const joined = (await w.request('participant.join' as never, {
      role_id: f.roleId,
      slot_id: slot.slot_id,
      participant_kind: 'CHATGPT_WEB',
      request_key: 'join-a-1',
    } as never)) as { binding_id: string; work_session_id: string; identity: { short_ref: string; role_id: string } };
    expect(joined.identity.role_id).toBe(f.roleId);
    expect(joined.identity.short_ref).toContain('W');
    const replay = (await w.request('participant.join' as never, {
      role_id: f.roleId,
      slot_id: slot.slot_id,
      participant_kind: 'CHATGPT_WEB',
      request_key: 'join-a-1',
    } as never)) as { binding_id: string };
    expect(replay.binding_id).toBe(joined.binding_id);
    const sessions = f.db.prepare('select count(*) c from role_sessions where role_id=?').get(f.roleId) as { c: number };
    expect(sessions.c).toBe(1);
    await web.close();
  } finally {
    await f.close();
  }
});

it('C5-B: 预创建未绑定 WS 的 Slot join 使用该 WS 不新建', async () => {
  const f = await fixture();
  try {
    const managed = (await f.ext('participant.slot.list', { role_id: f.roleId })) as { slots: { id: string }[] };
    await f.ext('participant.leave', { role_id: f.roleId, slot_id: managed.slots[0].id });
    const wsId = (f.db.prepare("select id from role_sessions where role_id=? and state='ACTIVE'").get(f.roleId) as { id: string }).id;
    const slot = (await f.ext('participant.slot.create', {
      role_id: f.roleId,
      name: 'W1',
      participant_kind: 'CHATGPT_WEB',
      work_session_id: wsId,
    })) as { slot_id: string };
    const grant = (await f.ext('participant.grant.issue', { role_id: f.roleId })) as { grant_id: string; token: string };
    const web = new P1MemoryTransport(f.server, 'human_web');
    const w = await web.connect({ clientId: 'client_web_b', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    await w.request('participant.attach' as never, { role_id: f.roleId, grant_id: grant.grant_id, grant_token: grant.token } as never);
    const joined = (await w.request('participant.join' as never, {
      role_id: f.roleId,
      slot_id: slot.slot_id,
      participant_kind: 'CHATGPT_WEB',
      request_key: 'join-b-1',
    } as never)) as { work_session_id: string };
    expect(joined.work_session_id).toBe(wsId);
    expect((f.db.prepare('select count(*) c from role_sessions where role_id=?').get(f.roleId) as { c: number }).c).toBe(1);
    await web.close();
  } finally {
    await f.close();
  }
});

it('C5-D: 同 grant 重挂接后 join 同一 request_key 恢复原 Binding', async () => {
  const f = await fixture();
  try {
    const managed = (await f.ext('participant.slot.list', { role_id: f.roleId })) as { slots: { id: string }[] };
    await f.ext('participant.leave', { role_id: f.roleId, slot_id: managed.slots[0].id });
    const slot = (await f.ext('participant.slot.create', { role_id: f.roleId, name: 'W1', participant_kind: 'CHATGPT_WEB' })) as { slot_id: string };
    const grant = (await f.ext('participant.grant.issue', { role_id: f.roleId })) as { grant_id: string; token: string };
    const web = new P1MemoryTransport(f.server, 'human_web');
    const w = await web.connect({ clientId: 'client_web_d', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    await w.request('participant.attach' as never, { role_id: f.roleId, grant_id: grant.grant_id, grant_token: grant.token } as never);
    const first = (await w.request('participant.join' as never, {
      role_id: f.roleId,
      slot_id: slot.slot_id,
      participant_kind: 'CHATGPT_WEB',
      request_key: 'join-d-1',
    } as never)) as { binding_id: string; work_session_id: string };
    await web.close();
    const web2 = new P1MemoryTransport(f.server, 'human_web');
    const w2 = await web2.connect({ clientId: 'client_web_d2', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    await w2.request('participant.attach' as never, { role_id: f.roleId, grant_id: grant.grant_id, grant_token: grant.token } as never);
    const again = (await w2.request('participant.join' as never, {
      role_id: f.roleId,
      slot_id: slot.slot_id,
      participant_kind: 'CHATGPT_WEB',
      request_key: 'join-d-1',
    } as never)) as { binding_id: string; work_session_id: string };
    expect(again.binding_id).toBe(first.binding_id);
    expect(again.work_session_id).toBe(first.work_session_id);
    await web2.close();
  } finally {
    await f.close();
  }
});

it('C5-C/I: 第二聊天占用冲突；kind 不匹配；跨角色 Slot 不存在', async () => {
  const f = await fixture();
  try {
    const managed = (await f.ext('participant.slot.list', { role_id: f.roleId })) as { slots: { id: string }[] };
    await f.ext('participant.leave', { role_id: f.roleId, slot_id: managed.slots[0].id });
    const slot = (await f.ext('participant.slot.create', { role_id: f.roleId, name: 'W1', participant_kind: 'CHATGPT_WEB' })) as { slot_id: string };
    const grant = (await f.ext('participant.grant.issue', { role_id: f.roleId })) as { grant_id: string; token: string };
    const web1 = new P1MemoryTransport(f.server, 'human_web1');
    const w1 = await web1.connect({ clientId: 'client_web_c1', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    await w1.request('participant.attach' as never, { role_id: f.roleId, grant_id: grant.grant_id, grant_token: grant.token } as never);
    await w1.request('participant.join' as never, {
      role_id: f.roleId,
      slot_id: slot.slot_id,
      participant_kind: 'CHATGPT_WEB',
      request_key: 'join-c-1',
    } as never);
    const web2 = new P1MemoryTransport(f.server, 'human_web2');
    const w2 = await web2.connect({ clientId: 'client_web_c2', clientVersion: '1.0.0-dev.0', requestedMode: 'controller' });
    const grant2 = (await f.ext('participant.grant.issue', { role_id: f.roleId })) as { grant_id: string; token: string };
    await w2.request('participant.attach' as never, { role_id: f.roleId, grant_id: grant2.grant_id, grant_token: grant2.token } as never);
    await expect(
      w2.request('participant.join' as never, {
        role_id: f.roleId,
        slot_id: slot.slot_id,
        participant_kind: 'CHATGPT_WEB',
        request_key: 'join-c-2',
      } as never),
    ).rejects.toMatchObject({ message: 'ROLE_WORKSESSION_ALREADY_BOUND' });
    await expect(
      w2.request('participant.join' as never, {
        role_id: f.roleId,
        slot_id: slot.slot_id,
        participant_kind: 'PAIR_CODE',
        request_key: 'join-c-3',
      } as never),
    ).rejects.toMatchObject({ message: 'PARTICIPANT_KIND_MISMATCH' });
    await expect(
      f.ext('participant.join', { role_id: f.roleId, slot_id: 'wslot_missing', participant_kind: 'CHATGPT_WEB', request_key: 'x' }),
    ).rejects.toBeTruthy();
    expect((f.db.prepare('select count(*) c from role_sessions where role_id=?').get(f.roleId) as { c: number }).c).toBe(1);
    await web1.close();
    await web2.close();
  } finally {
    await f.close();
  }
});

it('C5-E/F/G: leave 后历史只读；identity pack 随 charter revision；managed Harness 自动 Binding', async () => {
  const f = await fixture();
  try {
    const slots = (await f.ext('participant.slot.list', { role_id: f.roleId })) as { slots: { id: string; participant_kind: string; state: string }[] };
    const managed = slots.slots.find((x) => x.participant_kind === 'MANAGED_HARNESS')!;
    expect(managed.state).toBe('BOUND');
    const ident = f.server.participantJoin!.identity(f.roleId, 'managed_harness');
    expect(ident.slot_id).toBe(managed.id);
    expect(ident.history_only).toBe(false);
    expect(ident.effective_permissions).toBeTruthy();
    await f.ext('participant.leave', { role_id: f.roleId, slot_id: managed.id });
    const after = (await f.ext('participant.slot.list', { role_id: f.roleId })) as { slots: { id: string; state: string; binding_generation: number }[] };
    expect(after.slots.find((x) => x.id === managed.id)?.state).toBe('CLOSED');
    expect(after.slots.find((x) => x.id === managed.id)?.binding_generation).toBeGreaterThan(1);
  } finally {
    await f.close();
  }
});
