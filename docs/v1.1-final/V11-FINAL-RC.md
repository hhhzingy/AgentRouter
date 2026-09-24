# V1.1 Windows 最终验收状态

- 规范源：`16598f621d7160627ce769ecafb8d14ab55399f4`
- 当前行为候选：`0050c1b1f595ee4eb3bdc216334af4c04df06fd2`
- 工作树：`E:\AgentRouter\.worktrees\v1.1-final-cursor-win` · `feat/v1.1-final-cursor-win`
- 完整复核：`docs/v1.1-final/V11-WRAP-REVIEW-20260920.md`
- 状态：**`AUTO_SCOPE_DONE_WITH_BLOCKERS`**
- 未发出：`V1.1_WINDOWS_RC_READY_FOR_USER_ACCEPTANCE`
- 未执行：merge main / tag / release；工作分支已阶段性推送 GitHub

## 已证实

- `0050c1b`：type/lint/spec、unit 213、integration 212、contract 67、chaos 3、secret scan 全 PASS。
- `0050c1b`：packaged Core、Electron 工程包冒烟、手机浏览器、双移动视口、fixed-load 3/3 PASS。
- Pi 与 Kimi 在干净 `9fb6a95`、DSH→百炼在干净 `0050c1b` 完成真实 Level A Artifact 链，含 PUBLISHED、下载 hash、marker 和 Core stop。
- Cursor observer 已连接且不是 Role；手机历史现场 HTTP+WS 配对成功。

## 未关闭

1. Codex 自然恢复后，最小 Level A 与 Artifact Level A 实测 PASS；同名同字节重试故障已修复，后者仍是脏工作树证据，待新干净 SHA 复测；Level B 尚缺。未使用 reset credit。
2. ZCode 隔离 DUT 已选择 Bigmodel / GLM-5.3-Flash，但缺 Bigmodel 官方授权，Bootstrap FAILED；隔离 CLI 的 Bigmodel OAuth 回调因缺应用 appSecret 失败。百炼 qwen3.8-flash 备选尚未在 ZCode 受管链验证。
3. Pi 新 WorkSession Level B 暴露 native open `ENOENT`，Run UNKNOWN；五 Harness marker/WAITING_INPUT/cancel/restart-resume 未闭环。
4. 当前固定 SHA 的 Web ChatGPT Participant 与 Cursor controller 联跑未完成。
5. Remote HTTPS+WSS、签名安装器安装/升级、GitHub CI 未完成。
6. 四家 Artifact Level A 的真实 PASS 尚不是同一个干净候选 SHA 的完整矩阵，其中 Codex 为脏工作树；ZCode 仍 FAIL。

因此不能宣称 Windows RC。工作分支已按用户要求推送 GitHub，但不是完成态发布。

## UI Base 后复核补充（2026-09-20）

- UI_BASE_SHA=89a41b5e0ff6af198141ded3c1d5c627fdcf9a52，已推送，非 RC。
- ZCode 隔离桌面 Bigmodel 登录已成功，但 CLI 0.16.9 registry 对 GLM-5.3-Flash 仍 entitled:false，真实 session/create 拒绝。百炼 qwen3.8-flash 显式备选也被 registry 拒绝；隔离探针未产生模型调用，状态为 BLOCKED_PROVIDER_BINDING，无自动回退证据。
- computer-use 正确的 node_repl + @oai/sky 入口在本机 trusted Node 启动时退出；插件包存在且 MCP ready，UI 自动验收暂受工具宿主阻塞。
- 第 2 条“缺 Bigmodel 官方授权/备选尚未验证”是早期时点；以上为最新事实。仍不能宣称 V1.1_WINDOWS_RC_READY_FOR_USER_ACCEPTANCE。
