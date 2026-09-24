# 来源、审阅边界与固定版本

仓库静态审阅基线：`62b2e187285aeb0fd73926cdc47c8d830502fb97`。受测源码由 J2 报告登记为 `1ee22dadc9fb890c44f7e95ff015288306d7a913`。以下仓库来源均固定提交，避免把后续 main 变化当作本包已审阅事实。

本包有针对性读取了关键源码、阶段报告、功能/协议/验收文档、兼容性锁和构建脚本，并查询分支及 CI 状态。没有运行用户机器测试、取得账号权限、逐行覆盖全仓或重新目视全部截图。

| ID | 来源 | 固定链接 |
|---|---|---|
| S01 | J2 复核报告 | [docs/integration/J2-review.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/integration/J2-review.md) |
| S02 | J2 未实测和限制 | [docs/integration/J2-known-limitations.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/integration/J2-known-limitations.md) |
| S03 | 当前兼容性锁 | [compatibility-lock.json](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/compatibility-lock.json) |
| S04 | W11 Core 入口源码 | [apps/core-daemon/w11-main.ts](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/apps/core-daemon/w11-main.ts) |
| S05 | 当前 ApplicationService 与能力声明 | [packages/core-service/application.ts](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/packages/core-service/application.ts) |
| S06 | 账号切换抽象源码 | [packages/accounts/index.ts](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/packages/accounts/index.ts) |
| S07 | 当前 Windows 预览打包脚本 | [tools/build-win.mjs](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/tools/build-win.mjs) |
| S08 | 当前离线联合门禁脚本 | [tools/check-w11.mjs](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/tools/check-w11.mjs) |
| S09 | 原始 V1.0 功能手册 | [docs/执行包/AgentRouter_V1.0功能与开发手册包/01_功能手册.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/%E6%89%A7%E8%A1%8C%E5%8C%85/AgentRouter_V1.0%E5%8A%9F%E8%83%BD%E4%B8%8E%E5%BC%80%E5%8F%91%E6%89%8B%E5%86%8C%E5%8C%85/01_%E5%8A%9F%E8%83%BD%E6%89%8B%E5%86%8C.md) |
| S10 | 原始 T001—T081 验收矩阵 | [docs/执行包/AgentRouter_V1.0功能与开发手册包/04_验收与追踪矩阵.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/%E6%89%A7%E8%A1%8C%E5%8C%85/AgentRouter_V1.0%E5%8A%9F%E8%83%BD%E4%B8%8E%E5%BC%80%E5%8F%91%E6%89%8B%E5%86%8C%E5%8C%85/04_%E9%AA%8C%E6%94%B6%E4%B8%8E%E8%BF%BD%E8%B8%AA%E7%9F%A9%E9%98%B5.md) |
| S11 | 已入库的远程 Core/SSH 方案 | [docs/执行包/AgentRouter_Codex_下一轮执行包/02_远程内核与SSH方案.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/%E6%89%A7%E8%A1%8C%E5%8C%85/AgentRouter_Codex_%E4%B8%8B%E4%B8%80%E8%BD%AE%E6%89%A7%E8%A1%8C%E5%8C%85/02_%E8%BF%9C%E7%A8%8B%E5%86%85%E6%A0%B8%E4%B8%8ESSH%E6%96%B9%E6%A1%88.md) |
| S12 | 已入库的真实账号安全基线 | [docs/执行包/AgentRouter_Codex_下一轮执行包/03_真实账号联调安全基线.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/%E6%89%A7%E8%A1%8C%E5%8C%85/AgentRouter_Codex_%E4%B8%8B%E4%B8%80%E8%BD%AE%E6%89%A7%E8%A1%8C%E5%8C%85/03_%E7%9C%9F%E5%AE%9E%E8%B4%A6%E5%8F%B7%E8%81%94%E8%B0%83%E5%AE%89%E5%85%A8%E5%9F%BA%E7%BA%BF.md) |
| S13 | C1 合同及兼容性说明 | [docs/api/README.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/api/README.md) |
| S14 | W11A 交付与接线 | [docs/integration/W11A-core-ready.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/integration/W11A-core-ready.md) |
| S15 | J2 原有逐项验收 | [docs/integration/J2-acceptance.json](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/integration/J2-acceptance.json) |
| S16 | 组重构页面源码 | [apps/desktop/workbench/pages-reconfigure.tsx](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/apps/desktop/workbench/pages-reconfigure.tsx) |
| S17 | pi 收尾事件归一化源码 | [packages/adapters/pi/events.ts](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/packages/adapters/pi/events.ts) |
| S18 | 根脚本和运行时依赖 | [package.json](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/package.json) |
| S19 | 阶段进展（含历史状态） | [docs/progress.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/progress.md) |
| S20 | 当前产品说明 | [README.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/README.md) |
| S21 | 六工具与 Route 总协议 | [docs/执行包/AgentRouter_V1.0功能与开发手册包/03_总协议与工具契约.md](https://github.com/hhhzingy/AgentRouter/blob/62b2e187285aeb0fd73926cdc47c8d830502fb97/docs/%E6%89%A7%E8%A1%8C%E5%8C%85/AgentRouter_V1.0%E5%8A%9F%E8%83%BD%E4%B8%8E%E5%BC%80%E5%8F%91%E6%89%8B%E5%86%8C%E5%8C%85/03_%E6%80%BB%E5%8D%8F%E8%AE%AE%E4%B8%8E%E5%B7%A5%E5%85%B7%E5%A5%91%E7%BA%A6.md) |

## 远端状态核查

- 分支集合：`https://api.github.com/repos/hhhzingy/AgentRouter/branches?per_page=100`。查到 J2 分支指向 62b2e18、main 指向 16370d3、integration 指向 bbdea2a。此为查询时事实，执行前必须重新核对。
- Windows run：`https://github.com/hhhzingy/AgentRouter/actions/runs/34447454261`。已查询到 success，head SHA 为 1ee22da。
- C1 run：`https://github.com/hhhzingy/AgentRouter/actions/runs/34447454249`。已查询到 c1 job success，步骤明确 no account / no SSH。
- 未通过公开网站访问私人仓库；以上仓库审阅使用已连接的 GitHub 只读工具。本包不携带访问 token。

## 外部官方资料（2026-09-10 核查，不能替代本机实测）

| ID | 官方来源 | 本包仅采用的要点 |
|---|---|---|
| S22 | [Codex App Server](https://learn.chatgpt.com/docs/app-server)（原 developers.openai.com/codex/app-server 重定向） | 从实际 CLI 导出匹配版本 schema；使用正式会话、轮次、中断与事件接口，仍须用安装版本核验 |
| S23 | [Codex Authentication](https://learn.chatgpt.com/docs/auth)（原 developers.openai.com/codex/auth 重定向） | 认证可能存文件或 OS credential store；凭据按密码处理，不提交聊天/仓库；实际账号隔离不能仅假设不同目录有效 |

Kimi/pi 的安装版本与行为依据当前仓库锁和协议要求；本包没有独立完成其全部最新官方接口验证。J3 Adapter 实施须核对对应安装版本的一手文档/源码和实际协议，记录来源。不能把网上最新说明直接用于不同旧版本。

## 范围与新增安排的来源区分

原始 F/T 定义和可靠性不变量来自仓库；J3 工作包顺序、六个平台组合的明确认证要求、额外重复次数/压力时长/响应门槛、直接用户接管是本包的新执行安排。它们不是从 J2 成功证据推导出的既成能力。原 Windows-only 范围与后来的 SSH 提案之间的范围变化已在 02_SCOPE_AUTHORITY 明确。
