# V11-L1：启动前预算失败

基线：`a33d654`。本阶段修改协调器 context plan 构建异常路径。

在 backend.launch 之前失败时，记录 run `FAILED`、exit reason `PRECHECK_BLOCKED`，任务进入 NEEDS_ATTENTION，释放该 run 的资源租约，清除活动 run 槽位并记录保守原因码。不会生成 EXECUTION_UNKNOWN 或伪造 native receipt。已接受或已有 native run ref 的 run 拒绝使用此结算路径。

没有改变冻结 run 状态枚举；PRECHECK_BLOCKED 是明确的 exit reason 与 issue code。

验证：首次两个 SQLite 状态测试 2/2 通过；随后增加协调器拒绝测试，并运行原 RC 连续性回归，合计 4/4 通过。协调器测试注入 context plan 拒绝，断言 backend.launch 调用次数为零。TypeScript、迁移字节门禁、diff 空白检查通过。本轮没有修复前红测运行，不能宣称完成了先红后绿过程。

```text
node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/integration/precheck-blocked.test.ts tests/integration/v11-context-continuity-rc.test.ts
node node_modules/typescript/bin/tsc --noEmit
node tools/check-migrations.mjs
git diff --check
```

范围限制：真实 Driver 预算探测、预算阻止后的产品恢复操作、持久启动前所有权证明仍需继续验证。当前没有 LIVE_PASS；DeepSeek/ZCode、手机与最终候选尚未完成。
