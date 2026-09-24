# V11-04 Driver Capability 阶段报告

## 结果

- Baseline SHA：`338fcffc001a5ed8e93c00051605f7c6e4eea74a`
- Parent stage：`0fe69bc`
- Stage：`V11-04`
- Branch：`feat/v1.1-context-continuity`
- Worktree：`E:\AgentRouter\.worktrees\v1.1-context-continuity`
- 结果：PASS；建立统一 Driver Context capability shape、校验、registry 查询和可选 probe 入口。

## 实现

- 新增 `driver-context-capabilities.ts`，覆盖 `native_resume`、`history_export`、capacity/usage、native compaction 和同会话 model switch 的既定枚举。
- `HarnessDriverRegistry` 现在拒绝 harness mismatch/非法 capability，并返回拷贝后的 capability/evidence，避免调用方改变 registry 状态。
- 内置 codex、kimi_code、pi、zcode、deepseek_harness 仅声明已有代码层 resume 为 `IMPLEMENTED_UNVERIFIED`；history/capacity/usage/compaction/model switch 保持 `UNKNOWN`。
- 可选 `probeContextCapabilities` 结果必须重新验证 shape 和 harness，证据与 capability 分离，不能进入模型或 Route payload。

## 验证

- `tests/unit/driver-context-capabilities.test.ts`：4/4 PASS。
- TypeScript typecheck：PASS。
- C1/C1R1/C1R1P1 冻结合同未修改。

## 安全与限制

- 没有实际运行外部 Harness 探针；因此没有把任何 native history export、capacity、compaction 或同会话 model/effort switch 标为 VERIFIED。
- 未读取或输出 Secret、凭据、hidden reasoning、KV 或 native session 内容。
- 此阶段只建立能力合同，尚未把能力用于 resume/preflight/context sync。

## 下一步

进入 V11-05：把可见对话/Route/artifact refs 写入 012 Context index，实现 `(N,M]` Delta、target-source 排除、stable marker 和 receipt-confirmed cursor。
