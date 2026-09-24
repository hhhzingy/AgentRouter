# C1R1 阶段报告

基线：18c259c9c21f1750b275b27f5d1ed315c7e04f35。合同实现提交：211cc1e1c095aa09c2a703247b368c4a88873124。分支：feat/contract-c1r1。阶段：C1R1 合同修订，待复核；未进入 W11。

已实现：新增 21 方法、要求的 ViewModel 和原 VM 可选扩展；Role Plan 输入校验/原子 Apply/幂等、章程版本及 Bootstrap、六个未验证模型 seed、统一组重构、工作区元数据、项目摘要、C1 协商投影。具体方法和边界见 methods.md、compatibility.md、UIAI-只读指南.md。

已测试：Windows Node 24.14.0 离线合同/单元/集成/故障回归共 91 个通过，其中新增 C1R1 31 个。包含 Apply/重构事务故障回滚、跨组拒绝、默认结果目标显式处置、旧 InMemoryTransport 读取新服务。类型检查、规范和精确依赖检查、旧/新生成一致性、C1 历史冻结检查通过。准确结构化记录见 test-evidence.json，依赖实测见 dependency-evidence.json。

| Gate | 证据与范围 |
|---|---|
| CR1-01 | 原 freeze.c1.json 全部文件哈希不变 |
| CR1-02 | C1R1 生成检查，同时校验产品 Plan Schema 嵌入无漂移 |
| CR1-03/04 | 协作组定义与 Mock 三类跨组消息拒绝；不代表生产 Core 已接入 |
| CR1-05/06 | 输入 key/权限/范围检查、原子创建、幂等与失败重试 |
| CR1-07 | Bootstrap 四态、章程历史/hash、首任务屏障、Binding epoch |
| CR1-08/09 | 六 seed 均 UNVERIFIED，原生档位与目录优先级测试 |
| CR1-10/11 | Merge/Split、重预检、revision/hash、活跃/UNKNOWN/账号/租约阻断 |
| CR1-12 | 显式队列和会话选择；旧任务保留并关联后继；无自动唤醒 |
| CR1-13 | Workspace VM/API 及 Mock 元数据；无真实 Git 操作 |
| CR1-14 | 原 C1 transport 的真实离线连接与闭合旧 Schema 校验 |
| CR1-15 | 本地冻结/敏感扫描 PASS；Windows CI 34361224896 全部门禁 PASS，证据见 test-evidence.json |

真实测试：仅 Windows 本机离线软件测试，SQLite 预编译模块内存查询成功。真实 Harness 支持仍为 0；未读取日常凭据、未使用真实账号。账号联调按用户指示留待后续。

阻断/未测试：真实账号、生产 DB 原子性/持久化、SSH/Linux、真实目录探测、Bootstrap/native 收尾与 Renderer 均未在本轮验收。Codex 分包缺少 UIAI 专属文件不阻断本轮，已逐项记录。Windows 源码编译 SQLite 未测；本轮实际使用安装包 prebuild。

已知风险：内存状态/幂等账本/事件不跨进程持久化；Mock 路由只检查通信边界，不替代关联结果续办；权限交集不等于 OS 授权；worktree API 不创建真实目录；模型 seed 不证明线上存在或可用。合组 role_key 冲突会阻断，需后续明确用户修订方案。没有提高任何真实 Harness 能力等级。

工作区完整性：本轮 Git 管理目录在提交前缺失，仅恢复 contract-c1r1 的 admin、branch 和基线 index；没有改动主仓库工作文件/index 或 UI 工作树。主仓库原 feat/contract-c1 引用无法解析的现状不属于本轮修复范围。

UIAI 所需文件：见 UIAI-只读指南.md。下一步：提交冻结候选后停止，等待用户复核；不自行推进 W11。

远端证据：[Windows CI 34361224896](https://github.com/hhhzingy/AgentRouter/actions/runs/34361224896)，对应合同实现提交 211cc1e；后续证据提交仅更新本报告和测试记录。
