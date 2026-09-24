-- 016: 外接角色工作环(Participant claim/submit_result)。
-- results.run_id 允许 NULL:Participant 外接角色(如网页 ChatGPT)没有原生 Run 生命周期,
-- 其提交的结果直接发布给 completion 目标(publication_state='PUBLISHED')且无执行 Run 关联。
-- 用户验收(result.accept/result.reject)仍是唯一的人类批准门,不受此变更影响。
-- 按 003/006 既有先例事务外 foreign_keys=OFF 重建;子表 continuations/result_handlings 引用随名解析。
CREATE TABLE results_new (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id),
  run_id TEXT REFERENCES runs(id),
  outcome TEXT NOT NULL CHECK(outcome IN ('succeeded','partial','failed','cancelled')),
  summary TEXT NOT NULL, body TEXT NOT NULL,
  outputs_json TEXT NOT NULL CHECK(json_valid(outputs_json)),
  publication_state TEXT NOT NULL CHECK(publication_state IN ('STAGED','PUBLISHED','QUARANTINED')),
  created_at_ms INTEGER NOT NULL
);
INSERT INTO results_new SELECT * FROM results;
DROP TABLE results;
ALTER TABLE results_new RENAME TO results;
