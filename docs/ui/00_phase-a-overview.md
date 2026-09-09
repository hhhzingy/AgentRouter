# UIAI Phase A：产品与 UX 规范总览

- 基线提交：`18c259c9c21f1750b275b27f5d1ed315c7e04f35`
- 分支：`feat/ui-ux-spec`
- 阶段：Phase A（产品信息架构、用户流程、状态系统、组件地图、低保真结构、Mock 场景）
- 明确排除：不编写 Renderer；不修改 `contracts/**`、`packages/**`、`apps/**`；不参考旧 GUI；不依赖 Client Schema 变更
- 等待：C1R1 合同冻结后进入 Phase B

## 一、设计立场

1. **旧 GUI 不是设计基线。** 本规范从零推导信息架构与交互，仅遵守 `agentrouter-client/1`（C1）与共享产品文档中的业务规则。
2. **Core 是唯一状态真相。** UI 不读 SQLite、不启动 Harness、不接触凭据、不从自然语言推断完成。
3. **项目是第一公民。** 首页是项目卡网格；角色、对话、任务都生活在项目页内，不存在全局角色管理台。
4. **组是通信边界，工作区是文件边界。** 所有组视图同时标注两者，避免"能沟通 = 能同时写文件"的误解。
5. **缺字段不发明。** 组件地图只依赖 C1 已有 ViewModel；所有缺口登记在 `contract-change-requests.md`（CCR-UI-xx），等待 C1R1 裁决。

## 二、文档索引

| 文档 | 内容 | 对应 Phase A 交付项 |
|---|---|---|
| `01_information-architecture.md` | 全局 IA、路由、11 个页面/区域、低保真结构图 | 交付 1 |
| `02_home-project-cards.md` | 首页项目卡 8 种状态、创建卡、响应式 | 交付 2 |
| `03_project-page.md` | 单项目页：概览、组卡、合并/拆分入口、活跃任务、最近交接 | 交付 3 |
| `04_role-plan-and-creation.md` | AI 生成 / 导入 / 手工三入口、Role Plan Review | 交付 4 |
| `05_role-detail.md` | 角色详情：章程系统卡、对话、Route、队列、产物、历史 | 交付 5 |
| `06_group-reconfigure-wizard.md` | 合并/拆分安全向导、Preview blockers | 交付 6 |
| `07_state-system.md` | 状态分层、图标、标签、颜色 Token、优先级、合成规则 | 交付 7 |
| `08_component-map.md` | 组件清单与 ViewModel 依赖、缺口→CCR 映射 | 交付 8 |
| `09_mock-scenarios.md` | 28 个 Mock 场景索引、断言、fixtures 位置 | 交付 9 |
| `contract-change-requests.md` | C1 合同缺口清单（CCR-UI-01 ~ CCR-UI-16） | 交付 6（合同变更请求） |

Mock 数据：`fixtures/ui-proposals/**`，28 个场景，一景一文件。

## 三、必须遵守的业务规则（设计红线）

以下规则已逐条落到界面结构，违反任一即视为设计错误：

| 规则 | 界面落点 |
|---|---|
| Task/Run/Result/Connection 状态分开 | 状态系统五条独立状态道，禁止合并成一个灯 |
| 成功发信不产生业务回执 | 对话输入发送后只显示"已送达"，不伪造"已读/已处理" |
| 结果只交显式对象 | 结果卡始终标注去向（用户/某角色），无"默认广播" |
| 普通通知不唤醒 | 通知仅入收件箱计数，不触发角色状态变化 |
| 同角色新任务排队 | 角色忙时输入区明确显示"将进入队列，位置 N" |
| 组隔离由 Core 强制 | 跨组拒绝以系统事件卡呈现，不暗示可用提示词绕过 |
| Local/SSH 共用界面 | 全部页面按连接模式无关设计；路径选择器按模式切换本地/远程 |
| 远程路径来自 Core | SSH 模式只使用 `filesystem.list*` 返回，不调本地对话框 |
| UI 不从自然语言推断完成 | 完成只认 Result/Acceptance 状态；对话文本永不驱动状态机 |
| 未验证模型不启动 | 模型目录按 source/availability 分级展示，UNVERIFIED 仅可保存草稿 |

## 四、Phase A 完成条件自检

| 条件 | 状态 |
|---|---|
| 产品流程完整 | 见 01/03/04/05/06，覆盖创建项目→编排→执行→交接→重构全链路 |
| 低保真线框/结构图完整 | 每份文档含 ASCII 结构图 |
| 状态定义明确 | 见 07 |
| 不依赖旧 UI | 全部重新推导，无旧导航/配色/组件引用 |
| 24+ Mock 场景 | 28 个，见 09 与 fixtures |
| CCR 清单 | 16 项，见 contract-change-requests.md |
| 无 Renderer 代码 | 本分支仅 `docs/ui/**` 与 `fixtures/ui-proposals/**` |
| 无敏感字段 | fixtures 全部使用假名/掩码，无凭据形态数据 |
| 等待 C1R1 冻结 | Phase A 到此停止 |

## 五、验收矩阵映射（UA-01 ~ UA-12）

| Gate | 证据 |
|---|---|
| UA-01 不参考旧 GUI | 本文 §一；各文档无旧 GUI 结构引用 |
| UA-02 首页项目卡与创建卡 | 02 §二、§三 |
| UA-03 项目卡显示组和角色 | 02 §二卡组结构 |
| UA-04 单项目页完整 | 03 全文 |
| UA-05 组与 worktree 区分 | 01 §四、03 §三、07 §八 |
| UA-06 Role Plan 三入口 | 04 §二 |
| UA-07 角色章程第一条系统卡 | 05 §三 |
| UA-08 模型/推理/权限流程 | 04 §五、§六 |
| UA-09 合并/拆分安全向导 | 06 全文 |
| UA-10 24+ Mock 场景 | 09 + fixtures（28 个） |
| UA-11 状态系统分层 | 07 全文 |
| UA-12 CCR 完整 | contract-change-requests.md |
