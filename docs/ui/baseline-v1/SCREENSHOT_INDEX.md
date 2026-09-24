# SCREENSHOT_INDEX

真实渲染截图（Chromium + esbuild bundle + PreviewClient 假数据，固定时钟 2026-09-09T13:30+08:00）。
重新生成：`node tests/e2e-ui/shoot.mjs`（产物写入 `screenshots/`）。

| 文件 | 场景 | 验证点 |
|---|---|---|
| `01-home-project-cards.png` | full / `#/` | 项目卡网格、同尺寸创建卡、卡组行+头像、SSH ⌁、状态灯 |
| `01-home-project-cards-zoom125.png` / `-zoom150.png` | 同上 | 125%/150% 缩放不破版 |
| `02-project-overview-two-groups.png` | full / 项目概览 | 双组卡、wt 徽标、规则 revision、收尾中/等待审批/状态未知/排队位置、进行中任务 Task+Run 双徽标 |
| `02-...-zoom125.png` / `-zoom150.png` | 同上 | 缩放证据 |
| `03-role-detail-settling.png` | full / 周实现 | SETTLING="收尾中"+提示≠完成；Charter 卡；对话 10 种 kind（含 GAP/系统卡）；有效权限 |
| `04-role-plan-review.png` | full / Role Plan Review | 校验警告（模型未验证）、权限"请求→拟授予"对照、custom_request 逐项确认、种子模型徽标 |
| `05-unknown-approval.png` | full / 苏界面 | UNKNOWN 对账面板六动作、"不会自动重跑"、需要介入 |
| `06-reconfigure-blockers.png` | full / 组重构 Preview | blockers 列表、Commit 禁用、无"忽略继续"、不可撤销文案 |
| `07-models-accounts.png` | full / 模型与账号 | 脱敏账号、额度、SEED/需登录/未验证徽标、无 Secret 输入 |
| `08-ssh-disconnected.png` | ssh-disconnected | 断线横幅"最后已知状态 + 数据截至"、不承诺远端继续、写禁用原因"连接已断开" |
| `09-observer-readonly.png` | observer | 只读横幅、写按钮禁用原因"观察者只读"、申请控制入口 |
| `10-home-empty-create-card.png` | empty | 空首页 + 创建卡 |
| `11-capability-gated.png` | production-caps | Role Plan/组重构入口禁用+"当前 Core 不支持"原因 |

截图不含任何真实凭据；所有人名/路径/账号为虚构。
