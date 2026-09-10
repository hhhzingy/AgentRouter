/** 状态合成层语义测试：SETTLING≠完成、UNKNOWN 独立可见、去重、队列位置只认 Core。 */
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_LABEL,
  formatQueuePosition,
  roleDisplayStates,
  summaryTone,
} from '../../packages/ui/index.ts';
import { D } from './helpers.tsx';

const byId = <T extends { id: string }>(arr: T[], id: string) => arr.find((x) => x.id === id)!;

function ctx(roleId: string) {
  return {
    role: byId(D.roles, roleId),
    tasks: D.tasks,
    runs: D.runs,
    approvals: D.approvals,
    issues: D.issues,
  };
}

describe('角色展示态合成', () => {
  it('SETTLING 显示"收尾中"，绝不显示"完成"', () => {
    const states = roleDisplayStates(ctx('role_zhou'));
    expect(states[0].label).toBe('收尾中');
    expect(states.map((s) => s.label)).not.toContain('完成');
  });

  it('角色 ACTIVE ≠ 执行中：无 Run 时显示空闲', () => {
    const states = roleDisplayStates(ctx('role_lin'));
    expect(states.map((s) => s.key)).toEqual(['idle']);
  });

  it('UNKNOWN 是独立一等状态且优先于需介入', () => {
    const states = roleDisplayStates(ctx('role_su'));
    expect(states[0].key).toBe('unknown');
    expect(states[0].tone).toBe('danger');
    expect(states.map((s) => s.key)).toContain('attention');
  });

  it('暂停与排队并存时并列显示（不互相掩盖）', () => {
    const states = roleDisplayStates(ctx('role_tang'));
    const keys = states.map((s) => s.key);
    expect(keys).toContain('queued');
    expect(keys).toContain('paused');
    expect(states.find((s) => s.key === 'queued')?.label).toBe('排队 2');
  });

  it('审批实体与 Run WAITING_APPROVAL 去重，只显示一次', () => {
    const states = roleDisplayStates(ctx('role_chen'));
    expect(states.filter((s) => s.label === '等待审批')).toHaveLength(1);
  });

  it('BOOTSTRAP_REQUIRED 优先于一切运行信号', () => {
    const c = ctx('role_lin');
    c.role = { ...c.role, interventionState: 'BOOTSTRAP_REQUIRED' };
    const states = roleDisplayStates(c);
    expect(states[0].key).toBe('intervention');
    expect(states[0].label).toBe('待初始化');
  });
});

describe('聚合计数状态灯', () => {
  it('UNKNOWN/介入优先于运行与排队', () => {
    expect(summaryTone({ unknown: 1, activeRuns: 2 }).key).toBe('unknown');
    expect(summaryTone({ issues: 1, activeRuns: 2 }).key).toBe('issues');
    expect(summaryTone({ approvals: 1, activeRuns: 2 }).key).toBe('approvals');
    expect(summaryTone({ activeRuns: 2, queued: 3 }).key).toBe('running');
    expect(summaryTone({}).key).toBe('idle');
  });
});

describe('队列位置', () => {
  it('只展示 Core 返回的精确位置，缺失时不展示', () => {
    expect(formatQueuePosition(1)).toBe('队列位置 1');
    expect(formatQueuePosition(undefined)).toBeNull();
    expect(formatQueuePosition(null as never)).toBeNull();
  });
});

describe('连接状态', () => {
  it('Local 断线 ≠ 协议不兼容；INCOMPATIBLE 只用于协议层', () => {
    expect(CONNECTION_LABEL.DISCONNECTED).toBe('已断开');
    expect(CONNECTION_LABEL.RECONNECTING).toBe('重连中');
    expect(CONNECTION_LABEL.INCOMPATIBLE).toBe('协议不兼容');
    expect(CONNECTION_LABEL.CONNECTED_OBSERVER).toContain('只读');
  });
});
