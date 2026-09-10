# ROUTES_AND_IA

## 路由（hash）

| 路由 | 页面 | 说明 |
|---|---|---|
| `#/` | 首页 | 项目卡网格 + 创建卡 |
| `#/project/:id` | 项目页（默认"概览"页签） | 八页签见下 |
| `#/project/:id/:tab` | 项目页指定页签 | overview/spaces/timeline/inbox/issues/artifacts/models/settings |
| `#/role/:id` | 角色详情 | Charter/当前工作/对话/权限 |
| `#/roleplan/:projectId` | Role Plan | 三入口 → Validate → Review → Apply |
| `#/reconfigure/:projectId` | 组重构 | 方式选择 → Preview → Commit |

## 信息架构要点

- **项目是根上下文**：角色/组/对话/收件箱都挂在项目内（规则 2）。
- **壳**（shell.tsx）常驻：Core 健康、活跃 Run/介入/审批计数、连接态（Controller/Observer/断线）、生命周期声明（页脚）。
- **项目页八页签**：
  1. 概览：聚合计数条 + 组卡 + 进行中任务
  2. 协作组：组卡全集 + "组=通信边界 / 工作区=文件边界"说明
  3. 时间线：项目范围 ConversationItem 流
  4. 收件箱：显式 Result（验收操作）
  5. 审批与问题：Approval（批准/拒绝）+ Issue（知悉）；空态不宣称健康
  6. 产物：Artifact 列表（类型/大小/状态）
  7. 模型与账号：目录徽标 + 脱敏账号 + 额度
  8. 设置：项目事实（ID/Core/路径/revision）；项目级暂停不伪装全局 pause
- **角色详情三段**：左主列（当前工作 + 完整对话 + Composer）、右侧列（Charter/运行配置/有效权限）、顶部 UNKNOWN 时插入 ReconcilePanel。
- **Role Plan 与组重构是项目级动作**，入口在项目头部，能力缺失时禁用并说明。

## 空状态文案原则

- 说"这里会有什么"+"如何开始"，不宣称系统级结论（如"系统健康"）。
- 全部空状态经 `EmptyState` 组件，文案集中在页面内可检索。
