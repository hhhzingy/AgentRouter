# V1.1.0 Windows 最终影响图（进行中）

基线：`84b1ef2b0021bd48c5ac7d0e3f5a42dad7f595be`。起始审计 HEAD：`10513b4f84f9f362ee4b1e94ceedb6d4674981e7`，`git diff --name-only 84b1ef2..10513b4` 只有两份 `docs/v1.1-final/codex/` 复核文档。本图按 **最终产品 diff** 更新；`FINAL_PRODUCT_SHA` 尚未冻结。任何新改动必须更新 touched_files 与重测决策，不能从 SHA 不同机械推出五家完整 live 重跑。

| 域 | touched_files（当前/计划） | affected_capabilities | required_reruns | historical_evidence_reusable 与理由 |
|---|---|---|---|---|
| UI_ONLY | `apps/desktop/workbench.tsx`（仅 clientVersion 读取根版本） | 握手展示产品版本，不改页面布局/行为；黄金链若发现主路径 blocker 才补 | UI 自动测试、真实 Electron 连接 | 现有真实 Electron 与 UI 自动测试可作为历史依据；不能覆盖最终新交互。 |
| REMOTE_UI | 当前无 | 无 | 若改远程页面，Remote/390px 定向 smoke | 旧 Tailscale backend 和 Chrome 手机尺寸证据仅证明各自 SHA。 |
| CORE_DOMAIN | `packages/core-service/application.ts`（仅 serverVersion 读取根版本） | 握手显示的产品版本，不改合同 revision/状态语义 | typecheck、合同/集成、黄金链 Core/Electron | 旧业务流程支持证据可复用；版本文案本身须最终包核对。 |
| WORKSESSION_CONTEXT | 当前无 | 无 | 黄金链真实 Codex→ZCode 迁移和 cold restart 必跑 | 旧 Codex/ZCode marker/continuity 作为支持证据，不能替代本轮黄金链。 |
| PARTICIPANT | 当前无 | 无 | 网页 ChatGPT `participant.join` 新路径必跑一次 | 旧网页 Task→Artifact→Result 真实证据可支持未改业务环，不能证明 Join。 |
| RESULT_ARTIFACT | 当前无 | 无 | 黄金链真实 Artifact、Result Evidence、Request Changes 必跑 | 旧真实 Artifact 哈希与 Fixture UI 证据支持已实现语义；不能替代同一黄金链。 |
| HARNESS_SHARED | 当前无 | 无 | 若 shared RPC/native backend/role bridge/tool lifecycle 变化，则受影响 Harness 短 live；否则 Codex/ZCode 黄金链即可 | `84b1ef2` 五家同包 Level A 与旧深度 DUT 可继承为支持证据，须继续核对文件级 diff。 |
| HARNESS_CODEX | 当前无 | 无 | 最终包 Codex bootstrap、Artifact/output、native ref、continuation 必跑 | 旧 `6e75e93` 深度证据支持，但不冒称最终 SHA PASS。 |
| HARNESS_ZCODE | 当前无 | 无 | 最终包 ZCode 新 WS、continuation、transfer、old WS read-only、Result 必跑 | 旧 `6e75e93` 深度证据支持，但不冒称最终 SHA PASS。 |
| HARNESS_KIMI | 当前无 | 无 | 若其 adapter/shared lifecycle 未动且自动门无相关失败，可不新增 live；否则短 smoke | `84b1ef2` 首次 UNKNOWN、隔离复测 PASS，失败分母永久保留；不能写长期稳定。 |
| HARNESS_DSH | 当前无 | 无 | 同上 | `84b1ef2` 同包最小任务首跑 PASS。 |
| HARNESS_PI | 当前无 | 无 | 同上 | `84b1ef2` 同包最小任务首跑 PASS。 |
| STORAGE_MIGRATION | 当前无；001–020 不改 | 无 | 迁移/freeze/backup、包内 SQLite 检查 | 旧迁移测试可支持；最终自动门仍直接运行。 |
| PACKAGING | `package.json`、`tools/build-win.mjs`、`tools/packaged-test.mjs`；后续 ZIP 脚本仅在实际需要时增加 | 根版本 1.1.0 作为唯一发行权威，manifest/Electron app 与之核对；私有 workspace 包版本和历史 fixture 不批量替换 | 最终 clean package、fresh unpack、packaged smoke、ZIP/hash/安全扫描 | `84b1ef2` 旧目录包仅支持构建链存在，不能用作 1.1.0 发布包。 |
| SECURITY | 当前无 | 无 | final SHA 暂存/历史/包目录敏感扫描 | 可发布 refs 旧扫描为 0 findings；最终 SHA 必须重扫。 |
| DOCS_ONLY | `docs/v1.1-final/codex/V11-CORE-UI-COMBINED-REVIEW-20260923.md`、`docs/v1.1-final/codex/V11-WINDOWS-REMAINING-CLOSEOUT-AUDIT-20260924.md`；本图及后续交接 | 无运行时影响 | 文档链接/事实复核 | 不因 docs-only 提交机械重跑 live；区分 `tested_product_sha` 与 `release_document_sha`。 |

风险规则：若黄金链暴露 P0/P1 而修改上述运行时代码，只对受影响 live 项补测，并重跑全自动门；不得因本图的“当前无”提前宣告最终代码无影响。用户资产、登录态、旧 WorkSession 与历史迁移均不删除或改写。
