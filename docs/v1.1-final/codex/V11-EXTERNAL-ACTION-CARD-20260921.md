# AgentRouter V1.1 外部阻塞最小操作卡（2026-09-21）

状态：`BLOCKED_USER_ACTION`

需要用户操作的产品：Tailscale、GitHub Actions。Codex 当前由用户明确跳过，不在本卡要求内。

## 当前权威状态

### Tailscale

- 客户端：`1.102.2`
- Backend：`Running`
- MagicDNS：已启用
- 本机 DNS：`young-lab.tail7dc63e.ts.net`
- `CertDomains=null`
- `tailscale serve status --json`：`{}`
- TLS certificate probe：`500 Internal Server Error: your Tailscale account does not support getting TLS certs`

因此尚不能执行真实 Tailscale Serve HTTPS/WSS 验收；HTTP loopback、手机 HTTP/WS 和 OpenAI Secure MCP Tunnel 都不能替代本 Gate。

### GitHub Actions

运行时候选 `823d8d23d321e32cbb44aeb1ce4dd4360ef4bfae`：

- W11 run `35619982778`：`steps=[]`
- C1 run `35619982745`：`steps=[]`

docs/evidence-only 后继 `c857590a58869b78c9f03c7b5dcfd90ba51a436c`：

- W11 run `35621701614`，job `106406074777`：`runner_id=0`、`steps=[]`
- C1 run `35621701588`，job `106406074995`：`runner_id=0`、`steps=[]`

两条最新 annotation 均为：

> The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings

## 用户只做

1. 在 Tailscale 管理面为当前 tailnet 启用 HTTPS certificates / Serve 所需能力；如果当前账户方案不支持，请升级或调整账户能力。
2. 不要 reset 已有 Serve。当前 Serve 本来就是空配置。
3. 在 GitHub 的 Billing & plans 修复付款失败或提高 Actions spending limit。
4. 完成后告知“已启用 Tailscale HTTPS，并已修复 GitHub Actions 账单限制”，同时明确是否授权为 AgentRouter 配置最小 `tailscale serve`。

## 不要做

- 不粘贴 token、API key、credential 或账单资料；
- 不删除旧项目、对话、ZCode/Codex 会话；
- 不修改生产 profile 或 `.local-protected`；
- 不把 Secure MCP Tunnel 当作 Tailscale HTTPS/WSS；
- 不手工把失败 CI 标成 green。

## 执行者随后自动核对

1. 只读确认 `CertDomains`、证书能力与当前 Serve 状态；
2. 获得明确授权后配置最小 Serve，并验证 HTTPS、WSS hello/snapshot、observer/controller、revoke、Core restart reconnect/catchup；
3. 在运行时候选 `823d8d2` 上重跑 C1/W11，确认真实产生 steps 且 success；
4. 更新 Gate Matrix；在 Codex 仍跳过的情况下不会输出 `V1.1_NON_UI_FUNCTIONAL_RC_READY`，也不会宣称 Windows RC。
