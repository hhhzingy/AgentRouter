# F01 — Context 收敛决策映射(DECISION_DELTA)

依据:`sources/AgentRouter_V1.1_Context架构收敛_交接文档_2026-09-15.md` §14 + 执行包 §2。
新目标语义:一次性的跨 WS Context Transfer + 当前 ACTIVE WS 原生连续 + 永久只读历史;不再维护长期 Context 镜像/Delta 对账/旧 WS 复活/Router 同 WS 压缩。

## ADR 摘要
- 决策:V1.1 产品路径**删除**WorkSession 重新激活、Delta/Cursor/Sync-Receipt 持续对账、Role Context 长期运行时镜像、Router 同 WS 上下文/窗口/原生压缩管理、强制 1M 分段压缩基准与 4h soak。
- 保留:执行代际(binding/run/lease generation)防过期写入、Task completion.mode=handoff(业务接力)、当前 ACTIVE WS 的 session/load|resume|thread/resume 原生连续、审批/权限/Controller Lease/命令幂等、Remote Gateway/WSS/Pairing、可读历史(conversation_items)。
- 边界:兼容所需的 legacy 表(001—013)停止 runtime 读写与 GUI/MCP 暴露,不物理 DROP;014+ 新增。

## 旧要求 → 处置(每条替代测试,不删一般安全/幂等/恢复/取消测试)
| 旧要求(本轮前) | 处置 | 替代/理由 |
| --- | --- | --- |
| 历史 WS ARCHIVED→ACTIVE 重新激活 | **SUPERSEDED(删除)** | 旧 WS 永久只读;继续旧内容只能新建 WS + 一次性 export/import(V11F-W01—W18) |
| Resume old WorkSession / Continue Existing WS | **SUPERSEDED** | 移除 GUI/MCP 入口;当前 ACTIVE WS 原生 resume 保留(V11F-C/W) |
| 同 WS activation epoch 流程(为复活旧 WS) | **SUPERSEDED** | 保留 generation 防过期进程,删复活轮次 |
| Delta Context Sync / cursor 持续对账 / sync receipt 推进 | **SUPERSEDED** | 一次性 transfer 用 export→initialize 完成证据,不再长跑 Delta;事件 catchup(状态同步)保留,勿与 AI Context Delta 混淆(V11F-C01—C18) |
| Role Context Head/Sequence 长期镜像、Context Checkpoint、Memory/Vector/RAG/KG | **DEFERRED(停止扩展;runtime 停用,表兼容保留)** | 本轮不实现;legacy 停止产品读写 |
| Router 同 WS model/window/native compaction 管理 | **SUPERSEDED** | 同 WS 变化交 Harness 自管,Router 不据此迁移 |
| 强制 DeepSeek bounded 1M→256K 分段基准 | **不再阻塞** | 本轮不以其为强制前置;外部压缩降级为一次性 source→单次外部→空白,不递归/不分片 |
| Core+Gateway 连续 4h soak | **不再阻塞** | 改固定三轮短负载 + 资源回收观察(V11F-S) |
| WorkSession Handoff package + ACK(我上轮 R4 引入) | **SUPERSEDED** | 见 §15:不创建/不 ACK/不门控/不暴露;Task handoff 不同,保留;role_session_handoffs 表停止产品读写(不 DROP,013 字节不动) |
| 五 Harness 基本任务执行 | **KEEP(不可虚报)** | 可选 Driver 能力才允许 UNSUPPORTED;基本执行失败须 BLOCKED 或用户限缩 |

## 一次性 Context Transfer 容量规则(新语义)
```
T>=S → 直接 export/initialize,不查 A
T<S 且 A 已知且 A<=T → 直接迁移
T<S 且 A 已知且 A> T → 压缩
目标返回 CONTEXT_TOO_LARGE → 有界压缩,绝不静默裁剪
S/T/A 未知或单位不可比 → UI 报"容量无法确认",用户选 压缩/取消/一次显式尝试;不把未知当 0,不 bytes/4 冒充实测
```
压缩顺序:source WS 生成一次迁移摘要 → source 无额度但 export 可用时用户授权外部 API 一次 → 明确失败。不递归/不换 provider/不分片重试。Context Seed 不建 Task/Run/Result。
