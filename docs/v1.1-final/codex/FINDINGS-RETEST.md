# F01—F30 最新代码复核（N0）

基线：`3e4df007f6fe2b65acd74792d2eaba0e01a2ad48`。本表区分“代码/自动测试已收口”与“真实环境仍未闭环”；不得把前者替代后者。

| ID | 优先级 | N0 判定 | 复核摘要 |
|---|---:|---|---|
| F01 | P0 | FIXED_AUTOMATED | ZCode `confirmed` 仅在 session/send 被接受后成立，不代表模型 READY。 |
| F02 | P0 | FIXED_AUTOMATED | 历史 WorkSession reactivation 被移除，repair/transfer 回归已有覆盖。 |
| F03 | P1 | FIXED_AUTOMATED | Reference/Artifact 输入结构已有合同与黄金链测试。 |
| F04 | P0 | FIXED_AUTOMATED_REAL_PARTIAL | Managed Artifact 路径、hash、读取/去重已修；四家有历史真实链，非同一干净 SHA，ZCode 缺。 |
| F05 | P1 | FIXED_AUTOMATED | attribution 由 task/run/result/artifact 关系保持，不回写历史请求。 |
| F06 | P1 | FIXED_AUTOMATED_REAL_PENDING | queued/waiting 阻止新 WS，cancel/drain 后才能替换；真实五 Harness Level B 未闭环。 |
| F07 | P0 | FIXED_DUT | Management MCP scope 正负测通过；Cursor observer 已连且不是 Role。 |
| F08 | P1 | FIXED_AUTOMATED_REAL_PARTIAL | observer/controller lease 分离已有后端测试；Cursor controller 与真实 Remote 全链未跑。 |
| F09 | P0 | FIXED_AUTOMATED | Participant grant/generation fencing 与 extension principal 授权有负测。 |
| F10 | P0 | FIXED_AUTOMATED | malformed Remote input 局部失败及边界测试通过。 |
| F11 | P0 | FIXED_AUTOMATED_REAL_PENDING | revoke 后端断流/写入围栏有测试；真实 HTTPS/WSS existing stream 未跑。 |
| F12 | P1 | FIXED_AUTOMATED | ResolvedExecutionContext 精确绑定 profile/workspace，不再 first-profile。 |
| F13 | P1 | FIXED_AUTOMATED | legacy RoleContext 停止作为运行时事实源；conversation_items 仅保留人类历史。 |
| F14 | P1 | FIXED_AUTOMATED_REAL_PENDING | migration 018 建立正式 TaskInput、wait generation、hash/idempotency 与 Run/Participant 恰好一次消费；真实 Harness WAITING_INPUT 链未齐。 |
| F15 | P1 | SUPERSEDED_UNSUPPORTED | ZCode 当前声明 COLD_RUN；同 WS native warm/resume 不支持，新 WS + transfer 才是可测路径。 |
| F16 | P1 | PARTIAL | UNKNOWN 状态不自动重试已有合同；生产 reconcile/故障恢复证据仍需 N8。 |
| F17 | P1 | FIXED_AUTOMATED | P2/extension 合同与 participant principal 分离已有覆盖。 |
| F18 | P1 | PARTIAL | capability 原值/UNKNOWN 展示合同已冻结；真实五 Harness 声明仍不完整。 |
| F19 | P1 | PARTIAL | LOCAL/REMOTE Core 组合与本地包有证据；Electron 安装/升级未跑。 |
| F20 | P2 | PARTIAL | 固定 100/1k/10k、20 MiB 分块读通过；无 4h/1M 硬门，按执行包不作为门禁。 |
| F21 | P1 | FIXED_AUTOMATED | Task/Run/Result/Artifact/WS 状态与不可变性已有 contract/spec 约束。 |
| F22 | P2 | FIXED_AUTOMATED | current binding 唯一索引与 generation fencing 已覆盖。 |
| F23 | P2 | FIXED_AUTOMATED | run provenance migration/投影已存在；真实矩阵仍需记录 effective provider/model。 |
| F24 | P2 | PARTIAL | 已去除关键 first-profile/固定 identity 路径；N1—N5 继续做定向扫描。 |
| F25 | P1 | PARTIAL_HOST | credential hash/safeStorage/remote locality 已实现；HTTPS/WSS 真实部署未验证。 |
| F26 | P1 | PARTIAL_REAL_AND_APPROVAL_PENDING | Join 无/预建 WS、reconnect/replacement/generation/drain、Managed 自动绑定及 claim/artifact/result/downstream 自动 DUT PASS；真实网页 ChatGPT 未跑，Identity current_assignment 全载荷扩展待明确安全授权。 |
| F27 | P2 | FIXED_BASELINE | migrations `001`—`018` freeze + EOL guard PASS；v17 ready input backfill 已测，完整升级/回滚/备份恢复仍属 N8。 |
| F28 | P2 | PARTIAL | 自动 unit/integration/contract/chaos 历史全绿；当前功能分支需分阶段重跑并固定分母。 |
| F29 | P2 | PARTIAL | lease/scope 有正负测；controller 细粒度真实矩阵未跑。 |
| F30 | P2 | FIXED_BASELINE | 独立功能 worktree 已从最新功能 HEAD 创建，UI Base 祖先关系已验证，未复用 UI 工作树。 |

## 下一步优先级

1. N1 对 P0 修复做当前 SHA 定向回归，确认无回归后不重复改代码。
2. N2/N3 补三条黄金流程及 Participant 真实链，形成 FUNC-CHECKPOINT-A/B。
3. N4/N5 补 Context Transfer、UNKNOWN reconcile、Cursor controller 与 Remote 真实负测。
4. N6 以同一干净候选 SHA 跑五 Harness Level A/B；ZCode、Pi Level B 如仍失败须保留失败分母。
5. N8—N10 补 migration/fault、安装包、CI 与 UI 合流；在此之前不宣称 Windows RC。
