# V11-L1：MCP 会话命令重试

基线：`3aed2f5984f3f127dc639e21dbf95f7bb29d744f`。
状态：L1 部分实现；尚未完成真实联调验收。

## 行为

MCP 新建/切换 WorkSession 的工具 schema 现在要求调用方提供并保存 `request_key`、`expected_revision`、`preflight_hash`。调用方先读取 snapshot 和 roleSession.preflight，然后提交命令；响应丢失时原样重试，允许重新取得控制租约。

Gateway 不再替换这些元数据。重新启动 Gateway 后，保存的同一命令仍产生相同 operation id，可命中 Core 持久命令账本。缺少元数据时拒绝写入。已有旧格式 MCP 调用需要增加这三个字段。

GUI 的 pending command 持久化仍待接线；本修复不宣称 GUI 重启重试已完成。

## 验证

- 修复前：`role-session-gateway-retry.test.ts` 2/2 失败，确认调用方元数据被替换，以及缺少元数据仍发起请求。
- 修复后：上述文件与 `role-session-command-security.test.ts` 合计 5/5 通过。
- 类型检查、生成合同、迁移 manifest/EOL、lint、diff 空白检查通过。
- 测试使用模拟 transport 与合成 SQLite，未调用真实 Harness/API；没有 LIVE_PASS 结论。

命令：

```text
node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/integration/role-session-gateway-retry.test.ts tests/integration/role-session-command-security.test.ts
node node_modules/typescript/bin/tsc --noEmit
node tools/generate-client-contract.mjs --check
node tools/check-migrations.mjs
node tools/lint.mjs
git diff --check
```

后续：GUI 稳定 pending 命令、公共跨 Harness 切换、Driver 真实 preflight、receipt 绑定、DeepSeek 压缩、ZCode 受管 Role 与手机验收。账号切换仍为 `EXCLUDED_BY_USER`。
