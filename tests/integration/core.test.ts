import { it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { createFixture, request, finish } from '../support.ts';
const active: ReturnType<typeof createFixture>[] = [];
function fixture() {
  const f = createFixture();
  active.push(f);
  return f;
}
afterEach(() => active.splice(0).forEach((f) => f.close()));
it('T019/T021/T022 静默成功、持久幂等、结果只到用户', () => {
  const f = fixture();
  const p = f.core.management('role_a');
  expect(f.core.send(p, 'op_1', request('role_b'))).toEqual({});
  expect(f.core.send(p, 'op_1', request('role_b'))).toEqual({});
  expect(() => f.core.send(p, 'op_1', { ...request('role_b'), summary: 'changed' })).toThrow(
    'OPERATION_CONFLICT',
  );
  expect(f.core.tasks()).toHaveLength(1);
  const run = f.dispatch('role_b')!;
  f.core.finish(run.principal, 'fin_1', finish());
  expect(f.core.inbox()).toHaveLength(0);
  f.core.settle(run.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  expect(f.core.inbox()).toHaveLength(1);
  expect(f.dispatch('role_a')).toBeNull();
});
it('T023/T024 显式交接必须经过收尾屏障', () => {
  const f = fixture();
  f.core.send(
    f.core.management('role_a'),
    'op',
    request('role_b', { mode: 'handoff', to: { type: 'role', id: 'role_c' }, instruction: '复核' }),
  );
  const b = f.dispatch('role_b')!;
  f.core.finish(b.principal, 'finish', { ...finish(), next_request: request('role_c') });
  expect(f.dispatch('role_c')).toBeNull();
  f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  const c = f.dispatch('role_c')!;
  expect(c).not.toBeNull();
  f.core.finish(c.principal, 'done', finish());
  f.core.settle(c.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  expect(f.core.inbox()).toHaveLength(1);
});
it('T030/T031/T032 关联结果先到后 wait 仍可续办，独立工作 FIFO', () => {
  const f = fixture();
  f.core.send(f.core.management('role_c'), 'root', request('role_a'));
  const a = f.dispatch('role_a')!;
  f.core.send(
    a.principal,
    'child',
    request('role_b', { mode: 'result', to: { type: 'role', id: 'role_a' } }),
  );
  f.core.send(f.core.management('role_c'), 'unrelated', request('role_a'));
  const b = f.dispatch('role_b')!;
  f.core.finish(b.principal, 'done', finish());
  f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  f.core.wait(a.principal, 'wait', { waiting_for: 'child_results', reason: '汇总' });
  expect(f.dispatch('role_a')).toBeNull();
  f.core.settle(a.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  const continuation = f.dispatch('role_a')!;
  expect(continuation.kind).toBe('CONTINUATION');
  expect(continuation.taskId).toBe(a.taskId);
});
it('F14: WAITING_INPUT 的用户输入进入下一轮 CONTINUATION 快照，不改写历史 request_json', () => {
  const f = fixture();
  f.core.send(f.core.management('role_a'), 'root', request('role_b'));
  const b = f.dispatch('role_b')!;
  f.core.wait(b.principal, 'wait', { waiting_for: 'user_input', reason: '需要随机值' });
  f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  const token = 'user-secret-' + Math.random().toString(36).slice(2);
  const sessionId = f.db.prepare("select id from role_sessions where role_id='role_b' and state='ACTIVE'").get() as { id: string };
  const wait = f.db.prepare('select generation,updated_at_ms from wait_records where task_id=?').get(b.taskId) as { generation: number; updated_at_ms: number };
  const inputId = 'task_input_f14';
  f.db
    .prepare(
      "insert into conversation_items(id,project_id,space_id,role_id,task_id,kind,title,body,at_ms,source_key,role_session_id) values('conversation_in','project_test','space_test','role_b',?,'USER_MESSAGE','用户续办输入',?,1,'conversation-input:f14',?)",
    )
    .run(b.taskId, token, sessionId.id);
  f.db
    .prepare(
      'insert into task_inputs(id,task_id,role_id,role_session_id,wait_key,requested_by_run_id,actor,payload,payload_sha256,operation_id,created_at_ms) values(?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      inputId,
      b.taskId,
      'role_b',
      sessionId.id,
      `${b.taskId}:${wait.generation}`,
      b.id,
      'human_test:client_test',
      token,
      createHash('sha256').update(Buffer.from(token, 'utf8')).digest('hex'),
      'f14-input',
      wait.updated_at_ms + 1,
    );
  f.db.prepare('update wait_records set ready=1 where task_id=?').run(b.taskId);
  const cont = f.dispatch('role_b')!;
  expect(cont.kind).toBe('CONTINUATION');
  expect((cont.request as { task_input?: { body?: string } }).task_input?.body).toBe(token);
  expect((cont.request as { task_input?: { input_id?: string } }).task_input?.input_id).toBe(inputId);
  expect(String((cont.request as { body?: string }).body)).toContain(token);
  const stored = f.db.prepare('select request_json from tasks where id=?').get(b.taskId) as { request_json: string };
  expect(stored.request_json).not.toContain(token);
  const snap = f.db.prepare('select request_snapshot_json from runs where id=?').get(cont.id) as { request_snapshot_json: string };
  expect(snap.request_snapshot_json).toContain(token);
  expect(
    f.db.prepare('select consumed_by_run_id from task_inputs where id=?').get(inputId),
  ).toEqual({ consumed_by_run_id: cont.id });

  // 同一 Task 再次等待输入时使用单调 wait generation，不依赖毫秒时钟且不冲突旧输入。
  f.core.wait(cont.principal, 'wait-again', { waiting_for: 'user_input', reason: '需要第二个随机值' });
  f.core.settle(cont.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  const wait2 = f.db.prepare('select generation,updated_at_ms from wait_records where task_id=?').get(b.taskId) as { generation: number; updated_at_ms: number };
  expect(wait2.generation).toBe(wait.generation + 1);
  const token2 = token + '-second';
  f.db
    .prepare(
      "insert into conversation_items(id,project_id,space_id,role_id,task_id,kind,title,body,at_ms,source_key,role_session_id) values('conversation_in_2','project_test','space_test','role_b',?,'USER_MESSAGE','用户续办输入',?,2,'conversation-input:f14-2',?)",
    )
    .run(b.taskId, token2, sessionId.id);
  f.db
    .prepare(
      'insert into task_inputs(id,task_id,role_id,role_session_id,wait_key,requested_by_run_id,actor,payload,payload_sha256,operation_id,created_at_ms) values(?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      'task_input_f14_2',
      b.taskId,
      'role_b',
      sessionId.id,
      `${b.taskId}:${wait2.generation}`,
      cont.id,
      'human_test:client_test',
      token2,
      createHash('sha256').update(Buffer.from(token2, 'utf8')).digest('hex'),
      'f14-input-2',
      wait2.updated_at_ms + 1,
    );
  f.db.prepare('update wait_records set ready=1 where task_id=?').run(b.taskId);
  const cont2 = f.dispatch('role_b')!;
  expect((cont2.request as { task_input?: { body?: string } }).task_input?.body).toBe(token2);
  expect(
    f.db.prepare('select consumed_by_run_id from task_inputs where id=?').get('task_input_f14_2'),
  ).toEqual({ consumed_by_run_id: cont2.id });
});
it('T029/T027 通知不唤醒，原生结束不能代替 finish', () => {
  const f = fixture();
  f.core.send(f.core.management('role_a'), 'notice', {
    kind: 'notice',
    to: { type: 'role', id: 'role_b' },
    summary: '知悉',
    body: '无需行动',
    inputs: [],
  });
  expect(f.dispatch('role_b')).toBeNull();
  f.core.send(f.core.management('role_a'), 'task', request('role_b'));
  const b = f.dispatch('role_b')!;
  f.core.settle(b.id, 1, 'succeeded', { native: true, resourcesStopped: true });
  expect(f.core.tasks()[0].state).toBe('NEEDS_ATTENTION');
  expect(f.dispatch('role_b')).toBeNull();
});
it('T071 错误空间、过期绑定和伪造身份拒绝', () => {
  const f = fixture();
  const p = f.core.management('role_a');
  expect(() => f.core.send({ ...p, epoch: 99 }, 'stale', request('role_b'))).toThrow(
    'STALE_IDENTITY',
  );
  expect(() => f.core.send(p, 'missing', request('role_missing'))).toThrow('INVALID_TARGET');
  expect(() => f.core.send(p, 'spoof', { ...request('role_b'), from: 'role_c' })).toThrow();
});
