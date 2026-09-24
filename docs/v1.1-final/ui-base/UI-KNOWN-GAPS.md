# UI Known Gaps

这些缺口由 Codex/Core 路线负责。Kimi 可以设计 UNKNOWN/NOT_RUN/BLOCKED 状态，但不得在 renderer 中补造后端事实。

| 编号 | UI 需要 | 当前状态 | 临时 UI 处理 | Owner |
|---|---|---|---|---|
| UI-GAP-001 | WorkSession 冻结 ViewModel 与 capability 方法声明 | `roleSession.*` 是扩展接口，字段与 detailed stages 仍 PROVISIONAL | 使用通用详情与原始状态；历史只读 | Codex |
| UI-GAP-002 | Slot/Participant Binding 的统一只读投影 | Core 有表和 Join API，主 `SnapshotVM` 尚未包含 | 无数据时显示“尚未连接/不可用”，不推断 | Codex |
| UI-GAP-003 | 独立 `TaskInputVM`、输入请求时间/提示/解决状态 | 当前由 Task、wait record、conversation input 组合 | 仅在明确 `WAITING_INPUT` 和 task scope 下显示输入框 | Codex |
| UI-GAP-004 | Artifact 在主 snapshot 中的完整列表 | 冻结类型有 `ArtifactVM` 与分页 API，主 `SnapshotVM` 只由 Result 引用 artifactIds | 按 capability 懒加载；失败显示 unavailable | Codex |
| UI-GAP-005 | effective model provenance | binding/model selection 可见，但最终 provider/model/credential route 证据未统一 | 标注“配置值”或“未验证”，不写“实际运行模型” | Codex |
| UI-GAP-006 | Context Transfer 稳定进度模型 | 仅 op state/error 与可选 session；阶段细节 PROVISIONAL | 低粒度状态，不估算百分比 | Codex |
| UI-GAP-007 | Harness Level B/warm/resume 真实 capability | 多项 UNKNOWN/NOT_RUN；Pi 有 ENOENT，ZCode 未闭环 | 原值展示，不提供暗示性 Resume | Codex |
| UI-GAP-008 | Participant session correlation 与网页全链结果 | 当前固定 SHA 未做 Web ChatGPT Participant 联跑 | 标记未验证，不以 integration mock 代替 | Codex |
| UI-GAP-009 | Remote HTTPS/WSS 与证书身份投影 | HTTP+WS/Tailscale observer 有历史证据，TLS 门禁未跑 | 明确 transport 未验证；不显示安全锁标志 | Codex |
| UI-GAP-010 | 安装器/升级/CI 状态来源 | 尚无 release gate 投影 | 不在产品 UI 宣称可发布 | Codex |

新增缺口使用 `UI-CONTRACT-GAP-<N>.md`，至少包含用户场景、所需字段、是否阻塞、期望兼容方式与 mock 禁止说明。
