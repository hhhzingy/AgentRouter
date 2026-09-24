# 三家 Harness 的真实执行与认证

## 1. 要实现的公共能力

每个 Adapter 至少支持：精确安装/协议识别；Profile/模型可用性；会话创建与可得恢复；运行启动；有能力的人工补充；流式事件；六个原 Route 工具；审批/输入反向请求；取消；最终收尾及资源释放证明；历史回放隔离；重启/断线核对；错误和用量脱敏。

正式业务调度只在一个 Core 中发生。不得让 Harness 内部队列、pi subagent 插件或另一层多 Agent 编排私自启动平行任务绕过 FIFO、auth_unit、工作区和资源锁。不得抓屏、读私人会话数据库或解析自然语言“完成”代替协议。

当前 Adapter 目录只有各自 events.ts 的事件归一化实现；新增真正生命周期 Adapter 属于本轮任务，不是单纯补集成测试（来源 S03/S04/S19）。

## 2. 六工具与不变量

接入仓库总协议规定的六个内部工具：`route_context`、`route_send`、`route_finish`、`route_wait`、`route_artifact_register`、`route_artifact_read`。`notice` 是消息类型，不新增同名工具；产物登记与读取分开。J3-00 用现行冻结 schema 校对参数和返回，发现差异登记 SPEC-CONFLICT，不另创同义工具。[S21]

工具 sender、project/space/role、binding epoch、native session、run/task 等身份由受信任连接映射，不能接受模型自行声明 from/principal。run-scoped tool capability 不能调用 GUI controller 管理接口。

必须逐项验证：

1. Silent Success：成功业务消息持久化后，原生工具正常返回；不向发送者补业务回执、不多启动模型。
2. Explicit Destination：结果只去指定用户或角色，不默认抄送委托者；普通 notice 不独立唤醒。
3. Linked Continuation：可信子结果只续办对应 parent；其他独立任务继续 FIFO，不挤入活跃上下文。
4. Native Completion Barrier：route_finish 入库先为 STAGED、outbox 为 HELD；原生终态与写资源收尾证据满足后才发布和派下游。
5. UNKNOWN：发送后失联不能证明无副作用时，不生成新 operation_id 重试、不重新跑模型；先对账并明确用户决策。
6. 版本/幂等：相同 operation_id+规范内容至多一次；相同 ID 内容不同拒绝；旧 epoch、历史 replay 和重复终态不得产生第二次副作用。

原生任务被取消与业务结果 failed/cancelled/partial 分开；任何非成功结果不得走只适用于成功的下一阶段。

## 3. 平台和版本认证矩阵

`compatibility-lock.json` 扩充为可表达平台、架构、二进制路径模式/hash/version、协议/扩展版本、Profile/模型能力、权限配置 digest、证据、认证时间和限制的结构；旧消费者需兼容。不要用单个 global certified=true 掩盖 Linux 缺测。

| 组合 ID | 实际组合 | 必须具备 |
|---|---|---|
| H-WIN-CODEX | Windows Core / Codex | 公共矩阵、T007/T010/T078、真实工具与停止 |
| H-WIN-KIMI | Windows Core / Kimi | 公共矩阵、T008/T011/T077、反向 RPC/恢复 |
| H-WIN-PI | Windows Core / pi | 公共矩阵、T009/T012/T072/T075/T076、扩展来源 |
| H-LNX-CODEX | Ubuntu Core / Codex | 同类公共矩阵 + SSH 断线/恢复 |
| H-LNX-KIMI | Ubuntu Core / Kimi | 同类公共矩阵 + Linux 执行/权限 |
| H-LNX-PI | Ubuntu Core / pi | 同类公共矩阵 + Linux 扩展/停止 |

每格锁定一个可用模型为最低覆盖；Codex/Kimi 两账号切换在对应被支持的平台验证。额外 Provider 或模型按需增加，而非泛化为“所有模型可用”。功能未认证保守禁用，不能无标签自动降级或偷换模型。

## 4. 平台特定收尾

Codex 使用所安装版本的 app-server schema，核对 turn/completed、interrupt、审批和身份接口。官方支持从本机 CLI 导出匹配版本的 TypeScript/JSON schema，不能只按在线最新文档编码后运行旧二进制（来源 S22）。

Kimi 使用锁定版本 ACP 的返回/停止语义和实际反向请求；历史回放须只读归档，不重新驱动 route_send/finish。不能把其他 Harness 的模型等级硬映射为 Kimi 选项。

pi 当前源码依赖 agent_settled，且明确排除 agent_end（来源 S17）。本轮须证明该事件在实际受测组合中的来源、重试/压缩后的语义与资源停止关系；若实机协议不同，走最小适配/合同记录，不由 UI 伪造完成。

## 5. 真执行证据最小集合

环境和 source/build SHA；Harness/扩展/hash；匿名 Profile 与模型标识；一次真实 session/run/task ID 映射；六工具调用计数和脱敏事件序列；测试文件前后内容/hash；原生完成/停止证据；下游实际启动顺序；异常/恢复结果；明确费用范围。

模型回答中的“已执行”“已保存”不能替代文件/数据库/原生事件证据。普通退出码 0 不足以证明业务结果交付。保留失败尝试和修复提交，重新跑受到影响的全部组合。
