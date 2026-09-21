import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../../packages/storage/application-store.ts';
import { ApplicationService } from '../../packages/core-service/application.ts';
import { NativeExecutionRegistry } from '../../packages/core-service/native-registry.ts';
import { installLocalNativeRuntime } from '../../packages/platform/local-native-runtime.ts';
import { builtInDrivers, harnessLifecycleDeclaration } from '../../packages/core-service/harness-drivers.ts';
import { ParticipantExtension } from '../../packages/core-service/participant-extension.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import seed from '../../fixtures/client-c1r1/two-groups.plan.json' with { type: 'json' };
import type { RolePlanInput, Method, Scope } from '../../packages/client-contract/c1r1p1/index.ts';

const CRED = 'E:/AgentRouter/账号信息/通用API/百炼.txt';
const PROD_HOMES = [
  'C:/Users/hap_p/.kimi-code',
  'C:/Users/hap_p/.dsh',
  'C:/Users/hap_p/.codex',
  'C:/Users/hap_p/.zcode',
];

it('C7:五 Harness 声明矩阵均为 COLD_RUN；ZCode 0.16.9 resume 接线仍待 DUT 验证', () => {
  const registry = builtInDrivers();
  expect(registry.list().sort()).toEqual(['codex', 'deepseek_harness', 'kimi_code', 'pi', 'zcode']);
  for (const harness of registry.list()) {
    const d = harnessLifecycleDeclaration(harness);
    expect(d.lifecycle).toBe('COLD_RUN');
  }
  const zcode = harnessLifecycleDeclaration('zcode');
  expect(zcode.level_b).toBe('DECLARED_UNVERIFIED');
  expect(zcode.native_resume).toBe('IMPLEMENTED_UNVERIFIED');
  expect(harnessLifecycleDeclaration('pi').level_b).toBe('DECLARED_UNVERIFIED');
  expect(harnessLifecycleDeclaration('codex').level_b).toBe('DECLARED_UNVERIFIED');
});

it(
  'C7:隔离 native-runtime 可安装；百炼只引用路径；不占用生产 HOME',
  { timeout: 180000 },
  async () => {
    execFileSync(process.execPath, [resolve('tools/v11-c7-dut-setup.mjs')], {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: 120000,
    });
    const cfgPath = resolve('.local/v11-c7-dut/native-runtime.json');
    const inventory = JSON.parse(readFileSync(resolve('.local/v11-c7-dut/inventory.json'), 'utf8'));
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    expect(inventory.credential_copied).toBe(false);
    expect(inventory.production_homes_used).toBe(false);
    expect(cfg.credentialFile.replaceAll('\\', '/')).toBe(CRED);
    expect(cfg.kimiBailianCredentialFile.replaceAll('\\', '/')).toBe(CRED);
    expect(cfg.profiles.map((p: { harness: string }) => p.harness).sort()).toEqual([
      'deepseek_harness',
      'kimi_code',
      'pi',
      'zcode',
    ]);
    for (const p of cfg.profiles) {
      expect(p.sessionHome.replaceAll('\\', '/')).toMatch(/\/managed\/(pi|dsh|kimi|zcode)$/);
      for (const home of PROD_HOMES) expect(p.sessionHome.replaceAll('\\', '/')).not.toBe(home);
    }
    expect(existsSync(resolve(cfg.managedRoot, '百炼.txt'))).toBe(false);
    const dumped = readdirSync(cfg.managedRoot, { recursive: true }).map(String);
    expect(dumped.some((n) => /百炼|bailian\.txt|sk-/i.test(n))).toBe(false);

    mkdirSync('.local/w11-tests', { recursive: true });
    const dir = mkdtempSync(resolve('.local/w11-tests/c7-native-'));
    const db = openApplicationStore(dir);
    const app = new ApplicationService(db, [dir], false);
    try {
      const runtime = await installLocalNativeRuntime(app, new NativeExecutionRegistry(db), cfgPath);
      expect(app.registeredHarnesses?.().sort()).toEqual([
        'codex',
        'deepseek_harness',
        'kimi_code',
        'pi',
        'zcode',
      ]);
      await runtime.close();
    } finally {
      db.close();
    }
  },
);

async function dutFixture() {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests/c7-dut-'));
  const db = openApplicationStore(dir);
  const server = new ApplicationService(db, [dir], false);
  const transport = new P1MemoryTransport(server, 'human_test');
  const s = await transport.connect({
    clientId: 'client_c7',
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
  const project = (await write('project.create', {
    name: 'V11-DUT-SMOKE',
    path_handle: roots.items[0].pathHandle,
  })) as { id: string };
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
    {
      plan,
      plan_hash: v.planHash,
      confirmed: true,
      permission_grants: [{ role_key: plan.roles[0].role_key, permissions: plan.roles[0].requested_permissions }],
    },
    { project_id: project.id },
    'apply',
  );
  const snap = await s.request('system.snapshot', {});
  const roleId = (snap.roles as { id: string }[])[0].id;
  const spaceId = (snap.spaces as { id: string }[])[0].id;
  const ext = async (method: string, params: Record<string, unknown>) => {
    const key = 'c7_' + ++n;
    return s.request(method as never, params as never, {
      leaseId,
      requestKey: key,
      operationId: key,
      expectedRevision: (await s.request('system.snapshot', {})).revision,
    } as never);
  };
  return {
    dir,
    db,
    server,
    s,
    write,
    project,
    roleId,
    spaceId,
    ext,
    async close() {
      await transport.close();
      db.close();
    },
  };
}

it('C7 DUT: Level A 产物链、取消排队任务、新建 WS（Level B 控制面）', async () => {
  const f = await dutFixture();
  try {
    const managed = (await f.ext('participant.slot.list', { role_id: f.roleId })) as { slots: { id: string }[] };
    await f.ext('participant.leave', { role_id: f.roleId, slot_id: managed.slots[0].id });
    const slot = (await f.ext('participant.slot.create', {
      role_id: f.roleId,
      name: 'W1',
      participant_kind: 'CHATGPT_WEB',
    })) as { slot_id: string };
    const grant = (await f.ext('participant.grant.issue', { role_id: f.roleId })) as { grant_id: string; token: string };
    const task = (await f.write(
      'task.submitFromUser',
      {
        request: {
          kind: 'task.request',
          to: { type: 'role', id: f.roleId },
          summary: '写 note',
          body: '产出 note.md',
          inputs: [],
          expected: ['note.md'],
          completion: { mode: 'result', to: { type: 'user' } },
        },
      },
      { project_id: f.project.id, space_id: f.spaceId },
      'task-note',
    )) as { id: string };

    const web = new P1MemoryTransport(f.server, 'human_web');
    const w = await web.connect({
      clientId: 'client_web_c7',
      clientVersion: '1.0.0-dev.0',
      requestedMode: 'controller',
    });
    await w.request('participant.attach' as never, {
      role_id: f.roleId,
      grant_id: grant.grant_id,
      grant_token: grant.token,
    } as never);
    await w.request('participant.join' as never, {
      role_id: f.roleId,
      slot_id: slot.slot_id,
      participant_kind: 'CHATGPT_WEB',
      request_key: 'join-c7',
    } as never);
    await w.request('participant.claim' as never, {
      role_id: f.roleId,
      task_id: task.id,
      request_key: 'claim-c7',
    } as never);
    const art = (await w.request('participant.artifact' as never, {
      role_id: f.roleId,
      task_id: task.id,
      name: 'note.md',
      content: '# note\nPASS\n',
      request_key: 'art-c7',
    } as never)) as { artifact_id: string; sha256: string };
    await w.request('participant.submit_result' as never, {
      role_id: f.roleId,
      task_id: task.id,
      request_key: 'result-c7',
      outcome: 'succeeded',
      summary: '已写 note',
      body: '见 note.md',
      outputs: [{ kind: 'artifact', artifact_id: art.artifact_id }],
    } as never);
    const listed = (await f.s.request('artifact.list', {})) as { items: { id: string }[] };
    expect(listed.items.some((x) => x.id === art.artifact_id)).toBe(true);

    const queued = (await f.write(
      'task.submitFromUser',
      {
        request: {
          kind: 'task.request',
          to: { type: 'role', id: f.roleId },
          summary: '待取消',
          body: '取消验证',
          inputs: [],
          expected: ['cancel'],
          completion: { mode: 'result', to: { type: 'user' } },
        },
      },
      { project_id: f.project.id, space_id: f.spaceId },
      'task-cancel',
    )) as { id: string };
    const queuedRow = f.db.prepare('select state from tasks where id=?').get(queued.id) as { state: string };
    if (queuedRow.state === 'QUEUED') {
      await f.write('task.cancel', { id: queued.id }, { project_id: f.project.id, space_id: f.spaceId }, 'cancel');
      const cancelled = f.db.prepare('select state from tasks where id=?').get(queued.id) as { state: string };
      expect(cancelled.state).toBe('CANCELLED');
    } else {
      expect(['QUEUED', 'ACTIVE', 'WAITING_INPUT']).toContain(queuedRow.state);
    }
    const sessions = f.db.prepare('select id,state from role_sessions where role_id=?').all(f.roleId) as {
      id: string;
      state: string;
    }[];
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.filter((x) => x.state === 'ACTIVE').length).toBe(1);
    await web.close();
  } finally {
    await f.close();
  }
});
