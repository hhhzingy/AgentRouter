import { expect, it } from 'vitest';
import { assessContextBudget } from '../../packages/core-service/context-migration.ts';
import { ExecutionCoordinator } from '../../packages/core-service/execution-coordinator.ts';

it('FULL 同步但未观察到原生占用时不能默认零占用', () => {
  expect(assessContextBudget('FULL', {}, [], { maxContextTokens: 100000, currentUsageTokens: null })).toMatchObject({
    status: 'BLOCKED', currentUsageTokens: null, reasonCodes: ['TARGET_CONTEXT_BUDGET_UNKNOWN'],
  });
});
it('显式已知零占用可以预算，DELTA 也不应丢掉合法的零', () => {
  for (const mode of ['FULL', 'DELTA'] as const)
    expect(assessContextBudget(mode, {}, [], { maxContextTokens: 100000, currentUsageTokens: 0 }).status).toBe('FIT');
});
it('生产协调器仅新原生会话可计划零占用，旧 ref 不因 FULL 重置使用量', () => {
  const app = { db: {}, contextStore: {}, fixtureMode: false, clock: () => 1 } as any;
  const coordinator = new ExecutionCoordinator(app, {} as any) as any;
  const binding = { model_json: JSON.stringify({ max_context_tokens: 256000, current_context_tokens: 7 }) };
  expect(coordinator.contextBudget(binding, 'FULL', false).currentUsageTokens).toBeNull();
  expect(coordinator.contextBudget(binding, 'FULL', true).currentUsageTokens).toBe(0);
});
