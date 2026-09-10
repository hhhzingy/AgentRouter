# J2 可用性收敛复核

最终源码 SHA：`1ee22dadc9fb890c44f7e95ff015288306d7a913`。分支 `feat/j2-usable-workbench`，私人仓库 `hhhzingy/AgentRouter`。基线 `bbdea2ab86243260c520f5eed791bab90a2b851c`；没有合并 main 或更新 integration/v1.0-next、ui-baseline-v1。

本报告的最终门禁状态以 evidence/J2/final-gates.txt、ci.json 和 desktop.json 为准。代码与测试停止变更；此文档提交用于附加证据，不替换受测源码 SHA。最终本地门禁退出码0，217项测试通过，38项真实Electron检查通过（B0 2项、W11A 4项、J1 12项、J2 20项）。46项验收中44项PASS、1项PARTIAL（角色布局自动验证通过，人工试用未观察）、1项原生对话框人工未测。

## 各阶段交付

| 阶段 / 提交 | 已实现 | 已测试 | 被阻断 / 已知风险 |
|---|---|---|---|
| J2-0 / 4d4b6b9 | 固定基线、隔离目录、计划和失败复现 | J1原门禁199项、12项J1+6项Electron；4项已知缺陷 expected-fail | expected-fail仅证明缺陷存在，不是修复通过 |
| J2-1 / 5e19a9a | ActionState、准确身份、作用域历史、事件合并、待核对迁移 | 身份/迁移/分页，J1真实Electron | 当时统一输入仍待J2-3；真实环境不启用 |
| J2-2 / 7571ead | 手工角色与组编辑、严格JSON、显式映射、服务端校验和事务保存 | 两组三角色、现有组增员、回滚、权限上限、重载不启动 | 内部AI设置会话未实现；Seed模型只保存待验证配置 |
| J2-3 / b8fb2f5 | 显式新任务/补充、独立草稿、交接指令、IME、防重复、安全历史 | 99项阶段回归；11项真实Electron，含FIFO/HELD/150条历史 | 无尾页合同则按最早记录开始并提示范围 |
| J2-4 / 876becf | 四入口/旧路由、角色主对话与配置抽屉、本机清理、渐进展示 | 87项UI；15项Electron，含焦点/回退/未知操作恢复/缩放 | 阶段缩放截图曾裁切，最终已改原生捕获；人工未测 |
| J2-5 / 44dc228 后续修正至 1ee22da | 最终门禁、混合危险状态、失败/断线/对比度、逐项证据 | 最终完整门禁及CI记录见下方证据 | 未测项和有限范围见 J2-known-limitations.md |

后续修正：3a2ad84 保留 UNKNOWN 旁的待介入/审批；8121917 增加重叠工作区名测试，1ee22da 修正新增测试对缺省返回值的预期。中间失败的44dc228、8121917不计最终通过，CI历史可追溯。

## 保留的可靠性语义

静默成功（Silent Success）、显式结果去向（Explicit Destination）、关联结果续办（Linked Continuation）、FIFO、资源互斥、UNKNOWN不自动重跑、原生收尾屏障（Native Completion Barrier）均复用原Core。HELD下游在原生收尾前不启动。角色保存、Bootstrap和用户暂停独立；权限只取Core上限交集。UI选择不会扩大真实权限。

有限扩展仅为受限Main/preload稳定数据身份与既有TaskVM.blockedReason的含义；冻结合同和数据库迁移未改，未建新Core或全量合同。role.createFromSpec复用现有合同及原事务。

## 证据入口

- `J2-acceptance.json`：46项逐条映射；人工未观察项独立保留。
- `../../evidence/J2/final-gates.txt`：最终精确源码完整门禁。
- `../../evidence/J2/desktop.json`：真实 Electron + LOCAL_CORE + SIMULATED_PROCESS 的检查、截图元数据。
- `../../evidence/J2/ci.json`：每次 CI 的精确 headSha/URL/结论；只以最终SHA为准。
- `../../evidence/J2/git-state.json`：基线/main/标签/冻结文件核验。
- `../ui/ui-usability-j2/FEATURE_MAP.md`、`SCREENSHOTS.md`、`MANUAL_CHECKLIST.md`。
- `J2-known-limitations.md`：未测与风险完整清单。

没有真实账号/Harness/SSH/Linux或生产组重构支持宣称。原生OS对话框人工操作与五分钟试用未观察。完成证据提交后停止，等待用户复核；不推进W11B或合并main。

## 最终 CI 与截图

- [W11/P1/J2 Windows CI](https://github.com/hhhzingy/AgentRouter/actions/runs/34447454261)：success，源码 `1ee22dadc9fb890c44f7e95ff015288306d7a913`。
- [C1 离线合同 CI](https://github.com/hhhzingy/AgentRouter/actions/runs/34447454249)：success，同一源码 SHA。
- 最终原生截图 17 张，逐张像素尺寸/模式/缩放/SHA256 见 screenshots-manifest.json；已目视核验150%、200%及角色对话样本。
- 状态：STOP_FOR_REVIEW。
