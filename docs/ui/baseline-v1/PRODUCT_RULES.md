# PRODUCT_RULES — 20 条不可改的产品规则

Codex 可以修改视觉、布局和组件实现；**若要改变以下规则，先向用户说明并获得批准。**

1. 首页为项目卡网格，并有同尺寸"创建新项目"卡。
2. 角色、对话、协作组主要存在于单项目上下文，不恢复成全局角色管理台。
3. 协作组（Space）是通信/规则边界；Workspace/Worktree 是文件边界。
4. 跨组角色不能直接 Route 通信。
5. Task / Run / Result / Acceptance / Connection 分开显示。
6. SETTLING 不显示完成；UNKNOWN 始终可见且不自动重跑。
7. 成功发信不生成"对方已接收/已处理"的业务回执。
8. 结果只去显式对象，不默认抄送发起者。
9. Notice 不自动唤醒角色。
10. 同角色新任务排队；关联结果可续办当前任务。
11. Role Charter 在角色首次运行前完成 Bootstrap，并可查看历史。
12. AI 只能请求权限，实际权限由 Core 和用户确定。
13. Seed/未验证模型不能显示为真实可运行。
14. Local/SSH 使用同一产品结构；远程路径来自 Core。
15. Observer 明确只读。
16. UI 不读 SQLite、不直接启动 Harness、不接触 Secret。
17. UI 不从自然语言推断完成。
18. 组重构必须 Preview → blockers → 显式处置 → Commit。
19. 拆组不宣称模型已遗忘旧上下文。
20. 真实功能只按 capabilities 启用。

## 每条规则在代码中的落点

| 规则 | 落点 |
|---|---|
| 1 | `pages-home.tsx`（`project-card-create` 与 `project-card` 同 min-height/grid） |
| 2 | 路由只暴露 `#/project/:id`、`#/role/:id`，无全局角色页 |
| 3 | `SpaceCard` 的 `ws-badge`（⧉ worktree 徽标 + title 说明"文件边界 ≠ 协作组"） |
| 4 | `charterFor().directory` 只含同组角色；`sc-07` 测试 |
| 5 | `TaskRow`：Task 徽标与 Run 徽标并列两行 |
| 6 | `status.ts` roleDisplayStates：`settling`="收尾中"；`unknown` 独立 danger 态；`ReconcilePanel` |
| 7 | `Composer` 发送后只显示"已提交"；`mock-client.test.ts` 断言返回无 read/received/processed 字段 |
| 8/9 | 收件箱只渲染 `results`（显式 Result）；无 notice 唤醒 UI |
| 10 | `DispatchDrawer`：忙/暂停时提示入队，位置只显示 Core `queuePosition` |
| 11 | 角色详情 Charter 卡（Bootstrap 状态徽标；未完成提示不能派首任务） |
| 12 | Role Plan Review"请求 → 拟授予"对照表；角色详情"有效权限"卡 |
| 13 | 模型目录 source/availability 徽标；`sc-21/22` 测试 |
| 14 | `ProjectCard`/项目头部统一 `hostLabel` 渲染，SSH 加 ⌁ |
| 15 | 壳横幅"观察者模式：全部内容只读"；写按钮 `CapabilityGate` |
| 16 | 全仓无 SQLite/Harness 依赖；`no-secrets.test.tsx` |
| 17 | 完成只认 Run SUCCEEDED + 显式 Result（status.ts 无"自然语言完成"路径） |
| 18 | `pages-reconfigure.tsx` 四段流程；blockers 非空禁 Commit |
| 19 | 组重构页头与 Committed 页文案 |
| 20 | `CapabilityGate` + `capabilities.* === false` 的页面级降级 |
