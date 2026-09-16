# USER_ACTION_CARD — V1.1 W12 物理/人工门禁(仅此需要你)

分支检查点:`feat/v1.1-final-windows-mobile`(合入本卡生成时最新 SHA)。
候选包:`release/AgentRouter-j3-<sha>-*`(manifest.sourceDirty=false)。
所有步骤都不需要你把任何 token/key 粘贴进聊天。

## 卡 1 — 手机网页控制(真机,约 10 分钟)
1. 主机(本机)以远程模式启动生产 core:设置环境变量 `AGENTROUTER_REMOTE_ENABLED=1`、
   `AGENTROUTER_REMOTE_PORT=3780`,并确认 Tailscale 已登录(仅私网,不 Funnel)。
2. 桌面 Workbench → 首页右上「远程设备」→「生成手机配对码」。
3. 手机浏览器打开 `http://<主机 tailscale 名>:3780/` → 输入配对码 → 应看到概览(项目/角色计数)。
4. 验收点:断网/锁屏 30 秒后解锁 → 页面应自动重连并显示"数据截至上次快照"后恢复;
   撤销(桌面「远程设备」→撤销)→ 手机页面变"已断开"且不再恢复。
5. 记录:通过/失败 + 页面截图即可;不要导出手机 token。

## 卡 2 — 第二台 Windows 机器(约 15 分钟)
1. 第二机安装候选包,启动 electron.exe。
2. 第一机「远程设备」→「生成第二台设备配对码(可控制)」;第二机工作台节点面板:
   输入第一机地址 `http://<tailscale 名>:3780` + 配对码 → 添加。
3. 验收点:第二机能看快照、获取控制器租约、派发并取消一个小任务;
   第一机此时应被降级为观察者(租约互斥)。

## 卡 3 — ZCode 桌面登录态共存(仅当你想验证生产原登录不受影响)
- DUT 已用百炼 API 独立受管 HOME 完成,不触碰你的 ZCode 桌面登录;
  如需人工确认:打开 ZCode 桌面确认仍能正常会话即可,无需任何操作。

## 卡 4 — Codex DUT 登录(约 3 分钟,仅当你要求 Codex 行进矩阵)
1. 运行 `powershell -File tools/login-j3-codex-dut.ps1`。
2. 它只为隔离 DUT(独立 CODEX_HOME,不影响桌面 Codex 登录)发起 device-auth,
   你在浏览器批准显示的设备码即可;不要向你之外任何人转发该码。
3. 完成后助手重跑 `node tools/test-j3-production-pi.mjs --live --codex` 补矩阵行。

## 明确不需要你做的
- 不切换/登出任何账号;不复制 Codex/ZCode 生产凭据;不贴 key。
- 失败时只需要:哪一步、看到什么文字/截图。
