# AgentRouter V1.1 非 UI 收尾 — ZCode 检查点

日期：2026-09-21

基线：`4163fca5ed4c2f0eeaa9b381be20b5d66a5a4fc5`

状态：`PROTOCOL_ALIGNMENT_PARTIAL / REAL_DUT_PENDING`

结论：不是 Windows RC，也不是 `V1.1_NON_UI_FUNCTIONAL_RC_READY`。

## 本检查点已完成

- 以本机 ZCode `0.16.9` 官方发行物复核 `session/resume`、`session/subscribe`、Provider Config v2 与 Host interaction 方法面。
- 同一 WorkSession 已保存原生引用时，Driver 改为调用 `session/resume`，不再无条件创建新 session。
- resume 重新传入真实 workspace 与 Role MCP；能力状态仅为 `IMPLEMENTED_UNVERIFIED`。
- `session/subscribe` 发送 `afterSeq`，接受官方 replay 缺口，并在新 Run admission 前只提升事件水位，避免旧事件污染新 Run。
- Context Transfer 创建目标时使用真实 Role workspace；`sessionHome` 仅作为 HOME / data root，不再冒充 workspace。
- Provider/Session 拒绝仅保留经过字符集和长度约束的安全 reason code；错误正文、Header、凭据不进入诊断码。

## 验证结果

- 定向 ZCode 单测：`15/15 PASS`。
- 全量 unit：`220/220 PASS`。
- integration：首次 `226/227`，唯一失败为旧 0.16.5 状态断言；更新断言后定向 `3/3 PASS`，因此功能测试总集合对应项均已通过。
- contract + chaos：`71/71 PASS`。
- typecheck、仓库 lint、`git diff --check`：PASS。
- staged sensitive scan：PASS（2158 files，0 findings）。

## 仍未闭环

1. Provider Config v2 的 Personal Provider 文件写入尚未落地；旧 storage config 仍需保留。
2. Bigmodel Existing Account 仍缺 `provider/updateAccountConfig` overlay 与 `interaction/requestProviderRuntimeHeaders` 受信 broker。
3. `interaction/requestUserInput`、Official MCP auth headers、permission request 幂等与 generation fencing 尚未完成。
4. 尚未以已登录 Bigmodel / `GLM-5.3-Flash` 做真实 Level A、同 session cold resume、Core cold restart、TaskInput 与权限/MCP 连续性测试。
5. 百炼 `qwen3.8-flash` 仅作为用户指定备选，尚未触发真实请求。

在上述真实 DUT 与剩余 Host 合同完成前，ZCode Level A/B 不得记为 PASS，整体不得宣称 RC。

## Existing Account 上游合同复核

固定上游：`zai-org/ZCode@872ad960de7ec172591f7e1952f7849229f94521`。

- `runZCodeProtocolAgent()` 启动 `startProcessProviderRegistryRuntime(runtimeEnv)` 时不传 `standalone`；`app-server` 因而固定为 hosted account 模式。
- Standalone credential store 只由 prompt/TUI 路径显式传入；公开 `app-server` 命令没有 standalone account 开关。
- hosted 模式要求外部 Host 产生完整 Account Overlay，通过 `provider/updateAccountConfig` 交付，并在每次模型请求响应 `interaction/requestProviderRuntimeHeaders`。
- Account Overlay 不是从客户端登录目录复制出的静态配置；请求期凭据也不得进入 Provider Config、模型、Route、日志或测试证据。

因此，用户已登录 ZCode 桌面客户端这一事实不能通过公开 `app-server` 合同直接复用。AgentRouter 没有 ZCode 官方外部 Host broker，也未获授权读取/复制私有 credential store；按执行包要求，此项准确标记为：

`BLOCKED_BY_UPSTREAM_ACCOUNT_HOST_CONTRACT`

不能用 Managed Provider 或读取私有认证文件把 Existing Account 伪装成 PASS。该阻塞只针对 ZCode G2；其他 F3—F6 工作继续执行。
