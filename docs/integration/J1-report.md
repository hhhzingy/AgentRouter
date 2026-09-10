# J1：UI Baseline V1 接管与联合验收

本轮范围已完成本地实现与验收；提交后远端 CI 与精确 J1 SHA 见 [J1-integration.json](J1-integration.json)。J1 后停止等待复核，不执行 W11B，不合并 main。UIAI 已停止，后续代码由 Codex 负责。此结果不是 V1.0 完整产品发布。

## 基线与 Git 保护

- 执行包：`E:/AgentRouter/docs/执行包/AgentRouter_UIAI终版_Codex接管_联合包`；MANIFEST 7/7 文件的 SHA-256 与字节数一致，见 [校验记录](../../evidence/J1/package-verification.json)。
- Core：`59942b21654997540da0ea04f2cda4d9611cb39d`；UI：`6ef799f837df279ebc848a5665af31fc9ee0b68c`（feat/ui-b1-final）。
- 合并提交：`13240b0`，独立 clone `E:/AgentRouter/.local/w11a/integration`，分支 `integration/v1.0-next`。未覆盖原仓库工作，未使用原仓库对象库、linked worktree 或 force push。
- UI 分支原样保留；`ui-baseline-v1` 标记原始 UI 提交，不能把该 UI 单独基线称为 J1 集成通过。
- GitHub 已确认 PRIVATE：hhhzingy/AgentRouter。main 保持 `16370d3971740c80ca9ccec7a6d9b3553e896545`；根依赖与锁文件未改。

## 已实现

新 workbench 接入实际 Main/preload、独立本地 Core 和 SQLite。修正写操作缺少 operationId / expectedRevision / scope / lease、控制权申请与续期、非法读取方法及分页大小、hash 导航错误关闭连接等问题。LOCAL_CORE 缺桥会失败，不回退模拟数据。

原生目录选择接 Core 目录授权、校验与项目创建；Role Plan Validate → Review → Apply 使用真实合同和原子事务，Apply 后 Bootstrap 独立 PENDING。权限审阅显示 AI 请求 → Core 拟授予；未验证模型保持不可真实运行。

任务派发使用完整 task.request 与显式结果去向，同组筛选及交接选项；不伪造排队序号。角色对话按游标增量读取，保留原始 kind。收尾中不显示完成，UNKNOWN 对账按实际能力禁用。Observer 禁止写入与原生保存；弹层支持 Escape、焦点圈定和返回焦点。

产物页面按项目显示，接 Core 校验/分块下载及 Main 保存。缺失、损坏、非法存储键或越权不能下载；Main 校验长度和 SHA-256 后落盘。关闭 GUI/重载不会自动重放任务；提交回包丢失后明确重提复用原操作 ID。

## 已测试与需求追踪

本机 Windows 11 家庭版 10.0.26200 x64；Node 24.14.0、Electron 44.3.0、现有 SQLite 原生预构建 13.0.3。UIAI 报告的原生构建阻断在本 clone 中未复现，未改根依赖/锁文件。

命令 `node tools/check-w11.mjs`，退出码 0。26 个测试文件、**199/199** 测试通过（既有 123 + UI 实际 74 + 新增边界 2）。另有 **12/12 J1 实际 Electron 联验**、既有 **2/2 B0 + 4/4 W11 Electron** 检查通过。C1/C1R1/P1 生成及冻结、类型检查、构建均通过。敏感内容门禁在提交暂存后另行复核。

UIAI 自报 83 项 UI 测试；本轮实际运行 tests/ui 为 **74 项**，没有将差额算作通过。原 15 张 Preview 截图和所有场景测试保留。

| 联合验收项 | 实际证据与结论 |
|---|---|
| 首页、目录选择、项目持久化 | J1_HOME_OBSERVER、J1_NATIVE_PICKER_CORE_GRANT_PROJECT；真实 Electron + LOCAL_CORE |
| Role Plan / 两组 / Bootstrap 分离 | J1_ROLEPLAN_ATOMIC_PENDING_TWO_GROUPS；2 组 6 角色，Apply 后全部 PENDING，再由隔离 Fixture 完成初始化 |
| 跨组拒绝 | J1 UI 结果目标无外组角色；W11 实际 Fixture task.request / notice 越组拒绝且无副作用 |
| A→B→C→用户 | J1_PIPELINE_HELD_NATIVE_BARRIER；仅一条显式用户结果，不抄送发起者 |
| FIFO、关联续办、原生屏障 | J1_UI_FIFO；W11 子结果续办原任务且不受独立队列阻断；J1 观察 HELD/SETTLING 时下游未启动 |
| 收件箱 / UNKNOWN / Observer | J1 查询真实发布结果，UNKNOWN 页面可见且无能力时六动作禁用，Observer 创建/保存禁用 |
| 产物下载与授权 | J1_ARTIFACT_VERIFIED_SAVE 校验真实保存字节；SQLite 测试覆盖分块、越权、损坏、缺失、非法存储键 |
| 目录授权 | 新增 SQLite 测试覆盖连接句柄、Observer、UNC 与非目录拒绝 |
| 回包丢失、重载与重提 | J1_TIMEOUT_RELOAD_EXPLICIT_RETRY；保留待核对命令，重载后人工同内容重提，只产生一次任务 |
| Core 重启 / Renderer 生命周期 | J1 重启保持 6 角色及 6 次 Run（含 UNKNOWN），重载不重放；原有 W11 覆盖隐藏、崩溃、关闭再开 |
| 能力 / 无 Secret | UI 静态语义、无 Secret DOM、能力门禁测试；Renderer 无 Node require 且无页面异常；暂存及历史扫描 |
| 键盘与布局 | J1_CROSS_GROUP_TARGETS_AND_MODAL_KEYBOARD；1280×720 首页无横向溢出；本轮截图复核，原 UIAI 缩放证据保留 |

[完整本地门禁输出](../../evidence/J1/local-gates.txt)、[实际桌面检查](../../evidence/J1/desktop.json)、[架构决策](../adr/0007-j1-ui-native-boundary.md)。

## HANDOFF_REQUESTS 逐项处理

1. 构建链：完成 JSX bundle 和 HTML/CSS 复制。
2. 真 Electron + LOCAL_CORE：完成上述页面、生命周期和语义联合验证。
3. 目录 picker：完成 Main/preload 到真实 Core 授权及项目创建；OS 对话框交互由测试控制返回值，人工点击未实测。
4. 产物：完成真实文件校验、分块下载与保存；保存对话框同样使用受控返回值。
5. account.switch 进行中状态：后续账号阶段；本轮不开真实账号。
6. 时间线合同过滤扩展：未改冻结合同；使用现有 conversation.read，角色详情支持增量分页。
7. 项目摘要：沿用既有 Core 摘要，未新增 Schema 字段。
8. 弹层键盘：完成 Escape/焦点圈定并实际 UI 测试。
9. Role Plan 手工组/角色编辑器：未完成；目前导入为可用路径，不能声称完整手工编排已交付。
10. 对话游标：角色详情增量读取；全局时间线仍首批 100 条，尚无完整全局历史翻页 UI。
11. 租约：申请/释放及后台续期已接线；独立续期倒计时提示未新增。

## 被阻断 / 未实测

真实账号、真实 Harness、真实 SSH/Linux 按用户要求未开启，**真实 Harness 支持数 0**。SIMULATED_PROCESS 为真实子进程承载确定性模拟输出，UI 明确标识，不能计为真实模型执行或真实原生 Harness 收尾验收。

未实测 Windows 原生对话框人工点击、干净用户安装/卸载、系统退出/断电、长期压力、真实远程运行和同一用户恶意进程隔离。本轮 J1 自动化条件无剩余本地阻断；这些未实测项不伪造通过。

## 已知风险与停止点

生产组重构/worktree、受控 UNKNOWN 人工对账、真实模型和账号接入仍未开放，相应 UI 必须保持能力禁用。产物下载限制 20 MiB；生产产物导入尚未完成。待核对命令在本地浏览器存储保留用户正文，尚无清理管理界面；不自动重放。全局时间线首批限制与手工 Role Plan 编辑器是已知 UI 缺口。

截图 `failure.png` 是早期失败定位留档，不作为通过证据；正式证据为编号截图。所有测试数据、原生依赖和构建位于 AgentRouter 内，未创建 E 盘根目录临时区。

本轮不改变 PRODUCT_RULES 的 20 条规则；保持静默技术成功、显式结果去向、关联结果续办和原生收尾屏障。J1 记录与 CI 完成后停止，等待用户复核；不推进 W11B。
