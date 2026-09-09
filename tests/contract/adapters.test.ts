import { it, expect } from 'vitest';
import { PiRunEvents } from '../../packages/adapters/pi/events.ts';
import { codexSettled } from '../../packages/adapters/codex/events.ts';
import { kimiSettled } from '../../packages/adapters/kimi/events.ts';
it('T076 pi agent_end/重试不释放，只有 agent_settled', () => {
  const p = new PiRunEvents();
  p.start();
  expect(p.accept({ type: 'agent_end', willRetry: true })).toBeNull();
  expect(
    p.accept({ type: 'message_end', message: { role: 'assistant', stopReason: 'error' } }),
  ).toBeNull();
  expect(p.accept({ type: 'agent_end', willRetry: true })).toBeNull();
  p.accept({ type: 'message_end', message: { role: 'assistant', stopReason: 'stop' } });
  expect(p.accept({ type: 'agent_settled' })?.outcome).toBe('succeeded');
  expect(p.accept({ type: 'agent_settled' })).toBeNull();
});
it('M03 Codex 会话归属和未知结束默认拒绝', () => {
  const e = {
    method: 'turn/completed',
    params: { threadId: 'thread_a', turn: { id: 'turn_a', status: 'completed' } },
  };
  expect(codexSettled(e, 'thread_a', 'turn_a')?.outcome).toBe('succeeded');
  expect(() => codexSettled(e, 'thread_b', 'turn_a')).toThrow();
  expect(codexSettled(e, 'thread_a', 'turn_a', true)).toBeNull();
});
it('T077 Kimi 按 ACP v1 解释 prompt 响应，未知版本不启用', () => {
  expect(kimiSettled({ result: { stopReason: 'end_turn' } }, 1)?.outcome).toBe('succeeded');
  expect(() => kimiSettled({ result: { stopReason: 'end_turn' } }, 2)).toThrow();
  expect(() => kimiSettled({ result: {} }, 1)).toThrow();
});
