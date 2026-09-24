# Harness Setup

AgentRouter V1.1.0 支持：

- Codex
- ZCode
- Kimi Code
- DeepSeek Harness (DSH)
- Pi

AgentRouter **不打包这些 Harness 本体，也不打包它们的账号凭据**。

## 通用原则

每个 Harness profile 至少需要：

- Harness 类型
- 可执行文件绝对路径
- 可执行文件 SHA-256
- 独立 session home
- provider/model/effort
- workspace
- 受信本地配置

真实 credential：
- 不写进 Git；
- 不放进 README；
- 不经 Role/Participant/Renderer 传入；
- 由本机受信配置或既有 Harness 登录状态提供。

## Codex

V1.1.0 的主路径使用用户已登录的 Codex 账号。

建议：
- 使用已安装、已登录 Codex；
- AgentRouter 为 Role 创建新的受管 WorkSession；
- 不用 AgentRouter 自动切账号；
- 不删除已有 Codex conversation。

## ZCode

V1.1.0 支持：
- ZCode 0.16.9 已验证路径；
- existing account Host broker；
- Bigmodel Individual Coding Plan 的受信读取路径；
- session create/resume。

不要把 ZCode production credential 复制进项目仓库。

如果官方 ZCode 登录已过期，应先在官方 ZCode 中恢复/刷新登录，再回 AgentRouter 使用。

## Kimi Code

V1.1.0 已验证 Kimi Code 受管执行。

可以使用用户自己的受支持 provider 配置；provider credential 必须留在本机受信配置。

## DeepSeek Harness

V1.1.0 已验证 DSH ACP 路径。

注意 DSH 上游仍可能迭代，升级 DSH 版本后应重新做 capability smoke。

## Pi

V1.1.0 使用 Pi RPC 进程隔离路径。

AgentRouter 会验证受管 executable 与 profile 配置，不建议手工绕过 profile 边界。

## 配置文件

本地 Core 可通过 `native-runtime.json` 启用受管 Harness runtime。

该文件属于 operator-controlled 本地配置，可能引用 Harness executable、session home、workspace root、credential source、supervisor、RoleBridge。

不要提交真实生产 `native-runtime.json`。

建议保存一个不含 secret 的 `.example` 模板用于团队内部维护。

## V1.1.0 的验证边界

五个 Harness 已做真实 Artifact → Result 基本链路。

Codex/ZCode 是最终发布主验收路径。

Kimi/DSH 曾保留瞬态失败分母，所以“支持”不表示承诺上游/模型永远无波动。
