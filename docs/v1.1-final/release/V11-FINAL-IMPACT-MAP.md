# V1.1.0 Windows 发布前影响图（2026-09-24）

已测试产品 SHA：`ea4bad0a74277883c40087920383c76527d56ca8`，分支 `codex/v1.1-core-ui-candidate`，工作树 `E:\AgentRouter\.worktrees\v1.1-core-ui-candidate`。基线：`84b1ef2b0021bd48c5ac7d0e3f5a42dad7f595be`。`84b1..ea4bad0` 的运行时代码仅改握手版本投影；构建/校验脚本改版本一致性；另外两份旧复核文档和本图是文档差异。下表按实际 diff 收口，不能从 SHA 不同机械推出五家完整 live 重跑。

| 域 | touched_files（当前/计划） | affected_capabilities | required_reruns | historical_evidence_reusable 与理由 |
|---|---|---|---|---|
| UI_ONLY | `apps/desktop/workbench.tsx`（仅 clientVersion 读取根版本） | 握手版本，不改页面布局/行为 | UI 自动套件、W11 云端 Electron；真实黄金链仍单列阻塞 | 旧证据只支持未改交互，不能覆盖本轮真实黄金链。 |
| REMOTE_UI | 当前无 | 无 | 若改远程页面，Remote/390px 定向 smoke | 旧 Tailscale backend 和 Chrome 手机尺寸证据仅证明各自 SHA。 |
| CORE_DOMAIN | `packages/core-service/application.ts`（仅 serverVersion 读取根版本） | 握手产品版本，不改合同 revision/状态语义 | typecheck、合同/集成、打包 Core | 旧业务流程证据可支持；新版本已在打包校验核对。 |
| WORKSESSION_CONTEXT | 无 | 原有 Codex 跨端导出端口明确不支持，`history_export=UNKNOWN` | 真实 Codex→ZCode 继承迁移必须单列阻塞；Codex/ZCode 各自冷续已核对 | 同 Harness marker/冷续不是跨 Harness 完整历史迁移。 |
| PARTICIPANT | 当前无 | 无 | 网页 ChatGPT `participant.join` 新路径必跑一次 | 旧网页 Task→Artifact→Result 真实证据可支持未改业务环，不能证明 Join。 |
| RESULT_ARTIFACT | 当前无 | 无 | 黄金链真实 Artifact、Result Evidence、Request Changes 必跑 | 旧真实 Artifact 哈希与 Fixture UI 证据支持已实现语义；不能替代同一黄金链。 |
| HARNESS_SHARED | 无 | shared RPC、native backend、role bridge、profile/runtime 未改 | Codex/ZCode final live；Pi/Kimi/DSH 允许按旧证据继承 | `84b1ef2` 同包五家 Level A，文件级 diff 未触及后三家或共享执行链；保留 Kimi 首次 UNKNOWN 分母。 |
| HARNESS_CODEX | 无 | 原适配器未变 | 已测最终包 bootstrap、Artifact/output、native ref、cold continuation；跨端迁移仍阻塞 | `run-LxxCLh` Artifact PASS、`run-wmA2Hz` 冷续核心断言 PASS（后续 Artifact 因旧测试脚本已关闭客户端而失败）。 |
| HARNESS_ZCODE | 无 | 原适配器未变 | 已测最终包 bootstrap、Artifact/output、native ref、cold continuation；跨端迁移仍阻塞 | `run-2bH3zd` Artifact PASS；`run-xdPqzV` 冷续断言 PASS，但最终清理步骤租约过期使报告总状态 FAIL，不把总状态冒写 PASS。 |
| HARNESS_KIMI | 当前无 | 无 | 若其 adapter/shared lifecycle 未动且自动门无相关失败，可不新增 live；否则短 smoke | `84b1ef2` 首次 UNKNOWN、隔离复测 PASS，失败分母永久保留；不能写长期稳定。 |
| HARNESS_DSH | 当前无 | 无 | 同上 | `84b1ef2` 同包最小任务首跑 PASS。 |
| HARNESS_PI | 当前无 | 无 | 同上 | `84b1ef2` 同包最小任务首跑 PASS。 |
| STORAGE_MIGRATION | 当前无；001–020 不改 | 无 | 迁移/freeze/backup、包内 SQLite 检查 | 旧迁移测试可支持；最终自动门仍直接运行。 |
| PACKAGING | `package.json`、`tools/build-win.mjs`、`tools/packaged-test.mjs` | 根版本 1.1.0 为发行元数据权威，manifest/Electron app 与之核对；私有 workspace 包版本和历史 fixture 未批量替换 | 干净源码构建、ZIP、全新解包、packaged smoke 与包扫描已执行 | 旧目录包不被用作 1.1.0 发布包；当前 ZIP 仅为阻塞状态下的候选物。 |
| SECURITY | 无 | 无 | 本 SHA 暂存索引、publish refs 历史、构建目录与解包目录扫描均已执行且 0 findings | 只报告扫描范围与结果，不声称所有本机 Git 对象从未含秘密。 |
| DOCS_ONLY | 两份 `docs/v1.1-final/codex/` 旧复核文档；本图及同目录门禁/黄金链/交接文档 | 无运行时影响 | 文档事实与链接复核 | 文档提交与 `tested_product_sha` 分开报告，运行时 diff 为 0。 |

风险规则：若后续修复跨端历史迁移而修改运行时代码，本 SHA 的门禁和包必须按影响范围重跑并产生新产品 SHA；不能沿用本 ZIP 宣称修复通过。用户资产、登录态、旧 WorkSession 与历史迁移均未删除或改写。
