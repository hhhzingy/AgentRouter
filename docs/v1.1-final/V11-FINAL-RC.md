# V1.1 Windows 最终验收状态

- 规范源：`16598f621d7160627ce769ecafb8d14ab55399f4`
- 当前行为候选：`0050c1b1f595ee4eb3bdc216334af4c04df06fd2`
- 工作树：`E:\AgentRouter\.worktrees\v1.1-final-cursor-win` · `feat/v1.1-final-cursor-win`
- 完整复核：`docs/v1.1-final/V11-WRAP-REVIEW-20260920.md`
- 状态：**`AUTO_SCOPE_DONE_WITH_BLOCKERS`**
- 未发出：`V1.1_WINDOWS_RC_READY_FOR_USER_ACCEPTANCE`
- 未执行：merge main / tag / release / GitHub 完成态推送

## 已证实

- `0050c1b`：type/lint/spec、unit 213、integration 212、contract 67、chaos 3、secret scan 全 PASS。
- `0050c1b`：packaged Core、Electron 工程包冒烟、手机浏览器、双移动视口、fixed-load 3/3 PASS。
- Pi 与 Kimi 在干净 `9fb6a95`、DSH→百炼在干净 `0050c1b` 完成真实 Level A Artifact 链，含 PUBLISHED、下载 hash、marker 和 Core stop。
- Cursor observer 已连接且不是 Role；手机历史现场 HTTP+WS 配对成功。

## 未关闭

1. Codex DUT 被账号 usage limit 阻断；未获明确授权，不消耗 reset credit。
2. ZCode DUT 被账号余额/资源包 1113（HTTP 429）阻断；不切账号。
3. Pi 新 WorkSession Level B 暴露 native open `ENOENT`，Run UNKNOWN；五 Harness marker/WAITING_INPUT/cancel/restart-resume 未闭环。
4. 当前固定 SHA 的 Web ChatGPT Participant 与 Cursor controller 联跑未完成。
5. Remote HTTPS+WSS、签名安装器安装/升级、GitHub CI 未完成。
6. 三家 Level A PASS 不是同一个干净候选 SHA 的完整矩阵。

因此不能宣称 Windows RC，也不满足“完成后提交 GitHub”的条件。
