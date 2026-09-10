# KNOWN_LIMITATIONS

## 环境（非产品缺陷）

1. **Electron/LOCAL_CORE 未实测**。本机 better-sqlite3 原生构建被阻断，按任务约定不改根依赖；
   全部验证走 PREVIEW_MOCK + Chromium 真实渲染。真 Electron + LOCAL_CORE 联验属 Codex J1。
2. `apps/desktop/workbench.js` 是构建产物（esbuild bundle），未提交；Electron 打包时需把
   workbench bundle 步骤加入构建链（见 HANDOFF_REQUESTS）。
3. `apps/desktop/workbench.html` 由本基线新增（p1-main.ts 已引用它），属于交付的必要入口文件。

## 功能降级（按 capabilities 正确禁用，非 bug）

1. **AI 生成 Role Plan**：当前无 LIVE_TESTED/CERTIFIED 且可建会话的 Harness，入口禁用并说明。
2. **目录选择/项目创建**：`filesystem.*` 的目录选择对话框需要 Electron 壳提供原生 picker（J1 接入）；
   创建卡按钮当前 disabled 并注明。
3. **产物下载/校验**：Artifact 仅列表展示；`artifact.download/verify` 的保存对话框待 J1。
4. **远程 SSH 目录浏览**：`remote_filesystem: false` 时不展示远程目录树。
5. **Esc 关闭弹层**：Dialog/Drawer 目前点击遮罩/按钮关闭，Esc 监听未实现（小项，见 HANDOFF_REQUESTS）。
6. **时间线过滤**：`message.listTimeline` 拉取项目范围后客户端过滤；专用过滤参数（CCR-09）未实现。
7. **"最近完成"角标**：有意不做（避免被误读为主状态；见 STATUS_PRESENTATION）。
8. **账号切换进度**：`account.switch` 只发请求；切换进行中的进度轮询与重构 blocker 联动未做 UI 轮询。

## 数据语义注意

- 预览 Mock 的排队位置为演示值；真实位置只认 Core 返回（UI 逻辑已按此实现）。
- 断线横幅的"数据截至"来自最后一次成功 snapshot 的本地时刻，不是 Core 侧时刻。
