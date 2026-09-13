import { it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';

const MIGRATIONS_DIR = 'packages/storage/migrations';
const FULL = pathToFileURL(resolve(MIGRATIONS_DIR) + sep);

/** 构造指定版本的库(逐迁移执行+注册校验和;001 不自我注册,由脚本统一注册)。 */
function buildUpTo(dir: string, through: number) {
  const names = [
    '001-baseline.sql',
    '002-w11-application.sql',
    '003-native-execution.sql',
    '004-external-api-journal.sql',
    '005-role-sessions.sql',
    '006-role-harness-dynamic.sql',
    '007-restore-current-binding-index.sql',
    '008-participant-grants.sql',
  ];
  const db = new Database(resolve(dir, 'router.db'));
  for (let v = 1; v <= through; v++) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, names[v - 1]), 'utf8');
    db.exec(sql);
    db.prepare('insert into schema_migrations values(?,?,?)').run(
      v,
      Date.now(),
      createHash('sha256').update(sql).digest('hex'),
    );
  }
  return db;
}

function seedRealData(db: Database.Database) {
  const now = Date.now();
  db.prepare("insert into projects values('p1','项目','desc','root','ACTIVE',?)").run(now);
  db.prepare("insert into spaces values('s1','p1','组','ACTIVE',?)").run(now);
  db.prepare(
    "insert into policies values('pol1','p1',1,'agentrouter/1.0','{}','x',?)",
  ).run(now);
  db.prepare(
    "insert into workspaces values('w1','p1',null,'E:/x','e:/x','DIRECTORY',null,null,'READY')",
  ).run();
  db.prepare("insert into roles values('r1','s1','角色','','ACTIVE',?)").run(now);
  db.prepare(
    "insert into bindings(id,role_id,harness,workspace_id,model_json,capability_json,epoch,is_current,continuity_mode,created_at_ms) values('b1','r1','pi','w1','{}','{}',1,1,'NEW',?)",
  ).run(now);
  db.prepare("insert into role_slots(role_id) values('r1')").run();
  db.prepare("insert into chains values('c1','s1','op1',?,100,28800000,'ACTIVE')").run(now);
  db.prepare(
    "insert into role_sessions(id,role_id,seq,name,state,generation,created_at_ms,activated_at_ms) values('rs1','r1',1,'初始会话','ACTIVE',1,?,?)",
  ).run(now, now);
  db.prepare(
    "insert into tasks(id,space_id,assignee_role_id,chain_id,policy_id,summary,body,request_json,completion_json,problem_target_json,state,acceptance,role_session_id,created_at_ms,updated_at_ms) values('t1','s1','r1','c1','pol1','任务','x','{}','{}','{}','QUEUED','PENDING','rs1',?,?)",
  ).run(now, now);
}

it('DB-01:v5→v6→v7 升级恢复 one_current_binding_per_role 且拒绝双当前绑定', async () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests', 'db01-'));
  const db = buildUpTo(dir, 5);
  seedRealData(db);
  // v5 层:索引存在且拒绝第二条 current(对照组)
  expect(
    db.prepare("select name from sqlite_master where name='one_current_binding_per_role'").get(),
  ).toBeTruthy();
  expect(() =>
    db.prepare(
      "insert into bindings(id,role_id,harness,workspace_id,model_json,capability_json,epoch,is_current,continuity_mode,created_at_ms) values('b2','r1','pi','w1','{}','{}',2,1,'NEW',1)",
    ).run(),
  ).toThrow(/UNIQUE/);
  db.close();
  const { openApplicationStore } = await import(
    pathToFileURL(resolve('packages/storage/application-store.ts')).href
  );
  const up = openApplicationStore(dir, FULL);
  expect(
    up.prepare('select max(version) v from schema_migrations').get(),
  ).toEqual({ v: 8 });
  // 006 重建 bindings 后 007 恢复了索引
  expect(
    up.prepare("select name from sqlite_master where name='one_current_binding_per_role'").get(),
  ).toBeTruthy();
  // v6+v7 后同角色第二条 current 仍被拒绝(任务/会话/绑定数据完整)
  expect(up.prepare('select count(*) c from tasks').get()).toEqual({ c: 1 });
  expect(() =>
    up.prepare(
      "insert into bindings(id,role_id,harness,workspace_id,model_json,capability_json,epoch,is_current,continuity_mode,created_at_ms) values('b3','r1','codex','w1','{}','{}',3,1,'NEW',1)",
    ).run(),
  ).toThrow(/UNIQUE/);
  up.close();
  rmSync(dir, { recursive: true, force: true });
});

it('DB-02:006 缺陷窗口存量(双当前绑定)时 007 显式失败并回滚版本记录,数据保留', async () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests', 'db02-'));
  const db = buildUpTo(dir, 6); // 模拟 006 缺陷窗口:无唯一索引
  seedRealData(db);
  // 缺陷窗口内可插入第二条 current(证实索引确实缺失)
  db.prepare(
    "insert into bindings(id,role_id,harness,workspace_id,model_json,capability_json,epoch,is_current,continuity_mode,created_at_ms) values('b2','r1','codex','w1','{}','{}',2,1,'NEW',1)",
  ).run();
  db.close();
  const { openApplicationStore } = await import(
    pathToFileURL(resolve('packages/storage/application-store.ts')).href
  );
  expect(() => openApplicationStore(dir, FULL)).toThrow(/UNIQUE|constraint/);
  // 失败后 v6 库仍在(未记录 7),冲突数据原样保留,不自动挑选或删除
  const check = new Database(resolve(dir, 'router.db'));
  expect(check.prepare('select max(version) v from schema_migrations').get()).toEqual({ v: 6 });
  expect(check.prepare("select count(*) c from bindings where role_id='r1' and is_current=1").get())
    .toEqual({ c: 2 });
  check.close();
  rmSync(dir, { recursive: true, force: true });
});

it('DB-03:006 升级失败回滚不记录版本(模拟 FK 违规场景),v5 数据保留', async () => {
  // 006 只删改 4 表结构;构造带 role_sessions FK 引用的 v5 库,替换 006 迁移注入 FK 破坏验证事务回滚。
  mkdirSync('.local/w11-tests', { recursive: true });
  const caseDir = mkdtempSync(resolve('.local/w11-tests', 'db03-'));
  const db = buildUpTo(caseDir, 5);
  seedRealData(db);
  db.close();
  // 用受污染的迁移目录:把 006 换成注入 FK 违规的版本
  const badDir = resolve(caseDir, 'mig-bad');
  mkdirSync(badDir, { recursive: true });
  const { copyFileSync, writeFileSync } = await import('node:fs');
  for (const n of ['001-baseline.sql', '002-w11-application.sql', '003-native-execution.sql', '004-external-api-journal.sql', '005-role-sessions.sql', '006-role-harness-dynamic.sql', '007-restore-current-binding-index.sql', '008-participant-grants.sql'])
    copyFileSync(resolve(MIGRATIONS_DIR, n), resolve(badDir, n));
  writeFileSync(
    resolve(badDir, '006-role-harness-dynamic.sql'),
    readFileSync(resolve(MIGRATIONS_DIR, '006-role-harness-dynamic.sql'), 'utf8') +
      "\nINSERT INTO native_binding_configs VALUES('ghost',1,'pi','{}','h',1);\n",
  );
  const { openApplicationStore } = await import(
    pathToFileURL(resolve('packages/storage/application-store.ts')).href
  );
  // ghost 绑定不存在 → 提交前 FK 检查必须使升级失败且版本保持 5
  expect(() => openApplicationStore(caseDir, pathToFileURL(badDir + sep))).toThrow(
    /MIGRATION_FOREIGN_KEY_FAILURE/,
  );
  const check = new Database(resolve(caseDir, 'router.db'));
  expect(check.prepare('select max(version) v from schema_migrations').get()).toEqual({ v: 5 });
  expect(check.prepare('select count(*) c from tasks').get()).toEqual({ c: 1 });
  check.close();
  rmSync(caseDir, { recursive: true, force: true });
});

it('DB-04:升级幂等——v7 库重复打开不再迁移且索引持续生效', async () => {
  mkdirSync('.local/w11-tests', { recursive: true });
  const dir = mkdtempSync(resolve('.local/w11-tests', 'db04-'));
  const db = buildUpTo(dir, 7);
  seedRealData(db);
  db.close();
  const { openApplicationStore } = await import(
    pathToFileURL(resolve('packages/storage/application-store.ts')).href
  );
  const first = openApplicationStore(dir, FULL);
  first.close();
  const second = openApplicationStore(dir, FULL);
  expect(second.prepare('select max(version) v from schema_migrations').get()).toEqual({ v: 8 });
  expect(
    second
      .prepare("select name from sqlite_master where name='one_current_binding_per_role'")
      .get(),
  ).toBeTruthy();
  second.close();
  rmSync(dir, { recursive: true, force: true });
});
