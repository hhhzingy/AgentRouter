import { mkdirSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { openApplicationStore } from '../packages/storage/application-store.ts';
import { Core } from '../packages/runtime/core.ts';
export const request = (
  role: string,
  completion: Record<string, unknown> = { mode: 'result', to: { type: 'user' } },
) => ({
  kind: 'task.request',
  to: { type: 'role', id: role },
  summary: '执行测试工作',
  body: '实际工作说明',
  inputs: [],
  expected: ['结论'],
  completion,
});
export const finish = () => ({
  outcome: 'succeeded',
  summary: '测试交付',
  body: '模拟结果；非真实 Harness',
  outputs: [],
});
export function createFixture(clock?: () => number) {
  mkdirSync('.local/tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/tests/case-'));
  const path = resolve(dir, 'router.db');
  let db = openApplicationStore(dir);
  db.exec(
    "insert into projects values('project_test','测试','test','test','ACTIVE',1);insert into spaces values('space_test','project_test','测试','ACTIVE',1);insert into policies values('policy_test','project_test',1,'agentrouter/1.0','{}','test',1);",
  );
  for (const letter of ['a', 'b', 'c']) {
    db.prepare('insert into workspaces values(?,?,?,?,?,?,?,?,?)').run(
      `workspace_${letter}`,
      'project_test',
      null,
      dir,
      `${dir}/${letter}`,
      'DIRECTORY',
      null,
      null,
      'READY',
    );
    db.prepare('insert into roles values(?,?,?,?,?,?)').run(
      `role_${letter}`,
      'space_test',
      letter,
      '',
      'ACTIVE',
      1,
    );
    db.prepare('insert into bindings values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      `binding_${letter}`,
      `role_${letter}`,
      'pi',
      `workspace_${letter}`,
      null,
      null,
      '{}',
      JSON.stringify({ fixture: 'mock', liveSupported: false }),
      null,
      1,
      1,
      'policy_test',
      'NEW',
      1,
    );
    db.prepare('insert into role_slots(role_id) values(?)').run(`role_${letter}`);
    db.prepare("insert into role_sessions(id,role_id,seq,name,state,generation,created_at_ms,activated_at_ms) values('rsess_' || ?, ?, 1, '初始会话', 'ACTIVE', 1, 1, 1)").run(
      `role_${letter}`,
      `role_${letter}`,
    );
  }
  let core = new Core(db, clock, { allowMock: true });
  return {
    get core() {
      return core;
    },
    get db() {
      return db;
    },
    dir,
    dispatch(role: string) {
      const run = core.dispatch(role);
      if (run) core.accepted(run.id);
      return run;
    },
    reopen() {
      db.close();
      db = openApplicationStore(dir);
      core = new Core(db, clock, { allowMock: true });
    },
    close() {
      db.close();
    },
  };
}
