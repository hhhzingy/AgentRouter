# V11-L1：GUI 会话命令持久化

基线：`5883bcd7629496c43d63b7279bffd6a31c6be6b0`。
状态：L1 部分实现，真实 GUI/Harness 联调仍待完成。

## 修改

- 新建/切换 WorkSession 在发送前保存原请求键、operation id、revision、preflight 和载荷，复用现有按 Core dataset/client/mode 隔离的 PendingStore。
- 重载后“按原操作重试”进入会话扩展入口，复用原命令且不重新取 preflight。
- 本机存储失败时不发送命令；不确定结果保留记录。已有待核对命令重试失败时继续保留，租约错误不能证明首次请求未提交。
- pending 列表和身份纳入 Workbench memo 依赖，使面板能在记录变化后刷新。

## 全部测试结果

- 新增存储回归：修复前 2/2 失败，分别缺少持久化元数据和未拒绝缺失 preflight。
- 修复后新增与 J2 pending 回归共 7/7 通过。
- 增补重试记录保留与 memo 更新后，完整 `tests/ui` 共 10 文件、94/94 通过。
- TypeScript、生成合同、迁移 manifest/EOL、lint 与 diff 空白检查通过。

命令：

```text
node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/ui/v11-session-pending.test.ts tests/ui/j2-pending.test.ts
node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/ui
node node_modules/typescript/bin/tsc --noEmit
node tools/generate-client-contract.mjs --check
node tools/check-migrations.mjs
node tools/lint.mjs
git diff --check
```

以上为存储和 UI 单元回归，未执行真实 Electron 断线/重载端到端验收，不能标为 LIVE_PASS。公共跨 Harness、实际 Driver preflight、receipt、DeepSeek、ZCode、手机及固定候选仍未完成。账号切换为 `EXCLUDED_BY_USER`。
