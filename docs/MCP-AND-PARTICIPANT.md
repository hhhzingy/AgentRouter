# MCP & Participant

AgentRouter 有两个不同用途的 MCP 面。

## Management MCP

用途：
- 管理 Project / Role / Task / Result
- 读取 Router 状态
- Controller/Observer 管理

Management client 不是 Role。

例如 Cursor 可以作为 Management MCP client，但不应该因为连接 MCP 就自动成为 AgentRouter Role/WorkSession。

## Participant MCP

用途：
- 外部参与者认领 Role/Slot
- 获取 Core 派生 Role Identity
- 读取批准的 Task/Artifact
- 提交 Result

Web ChatGPT 应走 Participant 语义，而不是 Management MCP 冒充 Role。

## Join

典型流程：

```text
Role
→ Slot OPEN
→ participant.join
→ Binding
→ WorkSession
→ participant_identity
→ Task / Artifact
→ Result
```

### 重要状态

`BOUND` 只表示 Core 中存在有效 Binding。

它不表示网页 GPT 当前在线、正在思考或后台持续运行。

## 安全

- caller 不能自己声明管理员；
- caller 不能自己指定 workspace root；
- 权限来自 Core；
- generation stale write 会被拒绝；
- 同一个 request key 重试必须幂等；
- 历史 WorkSession 不可重新激活。

## 网页 ChatGPT

V1.1.0 已真实验证 ChatGPT Web Participant 的 Join/Task/Artifact/Result happy path。

实际 MCP 暴露方式取决于你的本地网络/受信 tunnel 设置。
