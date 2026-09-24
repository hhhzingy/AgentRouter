# V11-L1：WorkSession 命令持久幂等与鉴权

基线：`1349652a7b92c19776651d9a5725bc13ab20af97`。
状态：L1 部分完成；本报告不是真实 Harness 验收或 RC 发布证明。

## 本次修复

- RoleSession 读写入口先验证连接初始化、授权和角色所属项目范围。
- 写操作在读取重放记录前检查当前控制租约和 client 身份；缺少请求元数据的写入被拒绝。
- 复用 migration 002 的 `command_ledger`，以 principal/client/project/role/request key 隔离重放记录。请求摘要覆盖 method、params、operation id、expected revision、preflight hash。
- WorkSession、activation、revision、审计与命令结果处于同一 SQLite 事务。扩展重建后可以重放原请求；提交故障整体回滚。
- 未新增 migration，已有 migration 字节保持原样。

## 验证与全部失败记录

1. 首次 pnpm 测试调用在依赖准备阶段失败：better-sqlite3 编译未发现 Visual Studio C++ 工具链，测试未执行。
2. 复用现有 Vitest 运行时，首次执行 3 项测试全部失败。其中持久重放测试因错误 preflight 夹具提前失败，不能作为持久幂等缺口证据。
3. 修正为真实 preflight 且重试保持原命令后，3 项全部失败：缺元数据仍写入、扩展重建后重放触发 REVISION_MISMATCH、未初始化连接可读取。该轮是修复前有效证据。
4. 修复后生产接线、原会话、历史/激活三文件合计 9 项通过。
5. 新增事务回滚与安全边界测试，加生产接线和原 RC 连续性回归三文件合计 7 项通过。两轮有重复用例，不能相加作为独立用例数。
6. TypeScript、生成合同检查、迁移 manifest/EOL、lint、git diff --check 通过。

测试命令：

```text
node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/integration/role-session-production-wiring.test.ts tests/integration/role-session.test.ts tests/integration/role-session-handoff.test.ts
node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/integration/role-session-command-security.test.ts tests/integration/role-session-production-wiring.test.ts tests/integration/v11-context-continuity-rc.test.ts
node node_modules/typescript/bin/tsc --noEmit
node tools/generate-client-contract.mjs --check
node tools/check-migrations.mjs
node tools/lint.mjs
git diff --check
```

本次测试使用隔离目录下的合成数据库，没有运行真实 Codex/ZCode session。

## 仍需完成

Gateway 调用方稳定重试键；跨 Harness 公共切换；实际 Driver 恢复与预算预检；启动前预算失败状态；关联 native session/turn/activation/载荷的 receipt；DeepSeek 真实压缩与 1M token 验收；ZCode 受管 Role；其余 Harness 故障回归；Web/手机与固定候选包。

账号切换：`EXCLUDED_BY_USER`。当前未合 main、未 tag、未 release。
