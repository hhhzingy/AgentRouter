# V11-L1：公共跨 Harness 执行绑定

基线：`25da3f48bf74feed959139f0f316a0024608f353`。
状态：公共 Core 写路径已接线；完整预检与真实执行尚未验收。

## 实现

`roleSession.create/switch` 经 ApplicationService 调用宿主注入的可信 transition。宿主仅从启动配置中的 profile 选择执行配置；Client 不能传 executable、认证或 sessionHome。

跨 Harness 时在原命令事务内创建新执行 binding，发布当前角色章程、注册 native 配置，再激活目标 WS。恢复旧 WS 保持 WS id、历史 binding 快照、Harness/Driver、workspace、native ref；短期执行身份通过 fresh activation 指向新 binding。

恢复已有 native ref 要求找到该 WS 的历史注册配置，并匹配原 profile/home。没有证据或 profile 歧义时拒绝。该检查尚未替代 Driver 实际恢复性与预算探测。

## 验证及失败分母

- 新公共 A→B→A 测试首次 1/1 失败：原接口返回 ROLE_SESSION_TARGET_HARNESS_REQUIRES_BINDING。
- 接线后 1/1 失败：新 SQL 使用错误列名 policy_id。修正为 last_synced_policy_id，并让新 binding 的该字段为空，等待实际同步。
- 修正后与会话/安全回归合计 7/7 通过。
- 增补模型字段与 native ref 检查时 1/1 失败：测试使用不存在的 ModelSelection 定义名，修正为 PlanModelSelection；同时源码 selection_source 使用合同允许的 runtime。
- 最终四文件共 10/10 通过；通过生产 NativeSessionStore 读取恢复后的合成 native ref。没有启动真实 Harness。
- TypeScript、合同生成检查、迁移 manifest/EOL、lint、diff 空白检查通过。

```text
node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/integration/work-session-cross-harness.test.ts tests/integration/role-session.test.ts tests/integration/role-session-command-security.test.ts tests/integration/role-session-handoff.test.ts
node node_modules/typescript/bin/tsc --noEmit
node tools/generate-client-contract.mjs --check
node tools/check-migrations.mjs
node tools/lint.mjs
git diff --check
```

## 未完成项

preflight 仍需调用实际 Driver；GUI 目标 Harness 选择/恢复推荐仍需联调；profile 在同 Harness 内变更的恢复边界仍需补测；启动前预算失败、receipt 关联、真实 DeepSeek/ZCode、手机与固定候选均未完成。本提交不构成 LIVE_PASS。账号切换保持 EXCLUDED_BY_USER。
