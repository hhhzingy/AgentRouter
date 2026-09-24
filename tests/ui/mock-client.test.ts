/** 预览 Mock Client 行为测试：回执红线、排队位置、能力门控、断线语义、Apply/Bootstrap 分离。 */
import { describe, expect, it } from 'vitest';
import { connectPreview } from '../../packages/ui-mocks/client.ts';
import { samplePlan } from '../../packages/ui-mocks/data.ts';

describe('发信与派发红线', () => {
  it('成功发信只回"已提交"级结果，不含"已读/已接收/已处理"字段', async () => {
    const c = await connectPreview('full');
    const r = (await c.request('conversation.sendUserInput', {
      role_id: 'role_zhou',
      task_id: 'task_refund',
      body: '补充输入',
    } as never)) as Record<string, unknown>;
    expect(r.entityId).toBe('role_zhou');
    const keys = Object.keys(r).join(',');
    expect(keys).not.toMatch(/read|received|processed|delivered/i);
  });

  it('角色忙时新任务入队，位置由 Core 返回（不估算）', async () => {
    const c = await connectPreview('full');
    const task = (await c.request('task.createFromUser', {
      role_id: 'role_zhou', // 有 ACTIVE 任务
      summary: '追加任务',
      body: '追加任务',
      completion: { to: { type: 'user' } },
    } as never)) as { state: string; queuePosition?: number };
    expect(task.state).toBe('QUEUED');
    expect(task.queuePosition).toBe(1);
  });

  it('暂停角色的新任务也入队', async () => {
    const c = await connectPreview('full');
    const task = (await c.request('task.createFromUser', {
      role_id: 'role_tang', // PAUSED + 已有 2 个排队
      summary: '追加回归',
      body: '追加回归',
      completion: { to: { type: 'user' } },
    } as never)) as { state: string; queuePosition?: number };
    expect(task.state).toBe('QUEUED');
    expect(task.queuePosition).toBe(3);
  });
});

describe('Role Plan：Validate → Apply，Apply ≠ Bootstrap', () => {
  it('validate 标出未验证模型与需逐项确认项', async () => {
    const c = await connectPreview('full');
    const v = (await c.request('rolePlan.validate', { plan: samplePlan } as never)) as {
      valid: boolean;
      warnings: Array<{ code: string }>;
      requiredConfirmations: string[];
    };
    expect(v.valid).toBe(true);
    expect(v.warnings.some((w) => w.code === 'MODEL_UNVERIFIED')).toBe(true);
    expect(v.requiredConfirmations.some((x) => x.includes('自定义网络'))).toBe(true);
  });

  it('apply 返回 APPLIED，不含 bootstrap 完成含义', async () => {
    const c = await connectPreview('full');
    const vm = (await c.request('rolePlan.apply', {
      plan: samplePlan,
      plan_hash: 'h',
      confirmed: ['郑结算 请求自定义网络权限'],
      permission_grants: [],
    } as never)) as { state: string; roleIds: string[] };
    expect(vm.state).toBe('APPLIED');
    expect(JSON.stringify(vm)).not.toMatch(/BOOTSTRAP_DONE|bootstrap.*DELIVERED/i);
  });
});

describe('能力门控与权限', () => {
  it('Observer 写操作被拒（CONTROL_LEASE_REQUIRED）', async () => {
    const c = await connectPreview('observer');
    await expect(
      c.request('task.createFromUser', {
        role_id: 'role_lin',
        summary: 'x',
        body: 'x',
        completion: { to: { type: 'user' } },
      } as never),
    ).rejects.toMatchObject({ code: 'CONTROL_LEASE_REQUIRED' });
  });

  it('断线时请求报 CONNECTION_LOST', async () => {
    const c = await connectPreview('ssh-disconnected');
    await expect(c.request('system.ping', {} as never)).rejects.toMatchObject({
      code: 'CONNECTION_LOST',
    });
  });

  it('生产能力下 rolePlan/组重构报 CAPABILITY_UNAVAILABLE', async () => {
    const c = await connectPreview('production-caps');
    await expect(
      c.request('rolePlan.validate', { plan: samplePlan } as never),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
    await expect(
      c.request('space.reconfigure.preview', { plan: {} } as never),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
    expect(c.hello.capabilities.space_reconfiguration).toBe(false);
  });

  it('组重构存在 blockers 时 Commit 被拒（RECONFIGURATION_BLOCKED）', async () => {
    const c = await connectPreview('full');
    await expect(
      c.request('space.reconfigure.commit', { plan_id: 'rcfg_01', plan_hash: 'h', confirmed: [] } as never),
    ).rejects.toMatchObject({ code: 'RECONFIGURATION_BLOCKED' });
  });

  it('UNKNOWN Run 的对账动作留审计记录，不自动重跑', async () => {
    const c = await connectPreview('full');
    const rec = (await c.request('run.reconcile', {
      run_id: 'run_390',
      action: 'mark_failed',
      evidence_ids: [],
    } as never)) as { auditId: string; retryScheduled: boolean };
    expect(rec.auditId).toBeTruthy();
    expect(rec.retryScheduled).toBe(false);
  });
});
