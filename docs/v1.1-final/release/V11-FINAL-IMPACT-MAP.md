# V1.1.0 Windows 最终 SHA 影响图

产品 SHA：`a76ca2773b55b9808a5488bd15ed61bc92f4b016`；分支 `codex/v1.1-core-ui-candidate`。最终详细状态见 [收口复核](V11-FINAL-CLOSEOUT-20260924.md)。

| 变更域 | `ea4bad0..a76ca27` 主要文件 | 影响与补测 |
|---|---|---|
| Web Participant 桥 | `apps/participant-mcp/participant-common.mjs`、`packages/core-service/participant-extension.ts` | 新增 join/identity；显式输入跨 Task Artifact 可读，未授权读取仍拒绝。HTTP/MCP/工作环集成测试和真实 ChatGPT Work Join→Result 已跑。 |
| 共享 Harness 工具说明 | `packages/core-service/harness-drivers.ts`、`packages/role-bridge/tool-definitions.mjs` | `route_finish` 必填字段说明变更，影响五家角色任务的模型行为。**不能继承 Pi/Kimi/DSH 的旧 SHA 证据**；五家均在最终 SHA 补跑真实 Bootstrap、Result、Artifact/hash。 |
| 自动测试 | Participant HTTP/MCP/工作环及 Codex/Kimi lifecycle 单元测试 | 最终完整套件 114 文件、654 PASS / 2 SKIP；C1/W11 最终产品 SHA 云端 success。 |
| 远程手机 | 远程网关/手机页面运行时代码在本段 diff 未变 | 最终包 HTTPS/WSS 与真机实测；第一次空 scope 产生空视图是最小权限行为，重签显式 Project scope 后通过。 |
| Electron UI | 本段没有 renderer 变更 | 最终 ZIP 全新解包后真实桌面打开并核对 Projects/Workbench/Results/连接；未完整操作六页黄金链。 |
| 安全、迁移、发行 | 本段无迁移 SQL 或安全规则变更 | 最终产品索引、publish refs、目录包、解包 0 findings；20 个迁移、包哈希、ZIP 哈希、fresh unpack 直接验收。 |
| 文档 | 本目录复核文档和矩阵 | docs-only 提交与产品 SHA 明确分离；不要求仅因文字更新重跑产品。 |

旧 SHA 上同 Harness 冷续核心断言可供背景参考，最终 SHA 未重跑，不能写成最终 PASS。Codex→ZCode 完整历史迁移是 V1.2 范围，不列 V1.1 发布阻断。任何后续产品代码改动均应重新定义 `FINAL_PRODUCT_SHA`、重建 ZIP、按本表影响范围重测。
