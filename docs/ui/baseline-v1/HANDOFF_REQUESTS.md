# HANDOFF_REQUESTS — 请 Codex 在 J1/后续完成的事项

## J1 必须

1. **构建链接入 workbench bundle**：在打包流程中加入
   `esbuild apps/desktop/workbench.tsx --bundle --platform=browser --format=iife --jsx=automatic --outfile=<app>/workbench.js`
   并拷贝 `workbench.html` / `workbench.css` 到应用资源目录（`p1-main.ts` 已按 `workbench.html` 加载）。
   注意：本机 esbuild 的 JS wrapper spawn 失败，需直接调用平台二进制或修复 spawn 环境。
2. **真 Electron + LOCAL_CORE 联验**：preload 注入 `window.agentrouterClient`（C1R1P1）后逐页验证；
   workbench 检测到桥即走真实 Core，无桥时回退预览 Mock（`?scenario=` 仅预览用途，生产可移除）。
3. **目录选择 picker**：创建卡按钮需要原生目录对话框（建议 preload 增加 `chooseDirectory` 桥，
   返回后经 `filesystem.validateProjectRoot` + `project.create`）。
4. **产物下载/校验**：`artifact.download/verify` 接保存对话框。

## 合同层建议（不阻塞 J1）

5. `account.switch` 进行中状态查询（重构 blocker 联动的 UI 轮询需要）。
6. 时间线过滤参数（CCR-09 的正式化）。
7. 项目卡摘要 VM（组行/头像目前是客户端聚合，大项目需要服务端摘要）。

## 小改进（可由 Codex 随手完成）

8. Dialog/Drawer 增加 Esc 关闭与焦点圈定（focus trap）。
9. `rolePlan` 手工创建的组/角色编辑表单（当前为空白方案 + 导入为主）。
10. `conversation.read` 的增量游标拉取（当前全量刷新，200 条上限）。
11. 顶栏"申请控制"后的租约续期提示（`control.renew` UI 化）。

## 不要做的事

- 不要在 UI 内实现 SQLite 直读、Harness 直启、Secret 输入。
- 不要恢复旧 GUI（`renderer.tsx`/`index.html`）为默认入口；它仅是历史。
- 不要删除 PreviewClient 的场景门控测试（它们是 capability gate 的回归网）。
