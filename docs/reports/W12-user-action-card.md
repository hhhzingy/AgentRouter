# USER_ACTION_CARD — V1.1 W12 物理/人工门禁（2026-09-16，逐步可复制执行）

> **⚠️ 复核撤回（2026-09-17，WC00）**：本卡以下内容已作废，不要执行——
> ① 所有 `taskkill /IM electron.exe|core-node.exe` 通杀命令（会误伤原应用；替代见
> `docs/parallel/wc00-protection-ledger.md` §3，只允许按 PID/路径/数据根核验后停止）；
> ② 裸 HTTP `http://100.74.12.59:3780` 手机配对步骤（Cookie 为 Secure，真实手机不认 HTTP 安全上下文；
> 替代方案 WC03：loopback 网关 + Serve HTTPS/WSS）；③ 手机"仅观察者"演示（MOBILE 可被授权申请控制器）。
> 新操作卡将在 WC03 完成并经真实 HTTPS 自测后重新发布。卡 4（Codex DUT 登录）思路保留，
> 但登录目录将迁往受保护的 `.local-protected/`（原因与规则见保护账本 §1）。

（以下为已撤回的原始卡内容，仅存档）

主机 = 本机 young-lab，Tailscale IP `100.74.12.59`（已确认在线，账号 hap_py_@）。
候选包（含全部 W12 接线修复，manifest sourceSHA=c36b9cc）：
`E:\AgentRouter\.worktrees\v1.1-final-zcode\release\AgentRouter-j3-c36b9cc43a30-85510cfc-29fc-402c-967e-f34695a410e8`
包内 `electron.exe` 就在该目录根部。所有凭据/配对码都不需要发给我；失败时只描述现象。

主机侧我已完成无手机自证：以包内 core 绑定 `100.74.12.59:3790` → `/health 200`、`/meta.js`、
控制台页 200、`remote-gateway.json` 正确生成。以下为需要你动手的部分。

---

## 卡 1 — 手机网页控制（约 10 分钟）

### 1a. 主机以远程模式启动（一次性，测试完可关）
1. 先确保没有旧 core 残留：`cmd` 里执行
   `taskkill /F /IM core-node.exe 2>nul & taskkill /F /IM electron.exe 2>nul`
2. 打开 **新的 cmd 窗口**（保持不关直到测试结束），逐行执行：
   ```bat
   cd /d "E:\AgentRouter\.worktrees\v1.1-final-zcode\release\AgentRouter-j3-c36b9cc43a30-85510cfc-29fc-402c-967e-f34695a410e8"
   set AGENTROUTER_REMOTE_ENABLED=1
   set AGENTROUTER_REMOTE_HOST=100.74.12.59
   set AGENTROUTER_REMOTE_PORT=3780
   start electron.exe
   ```
   （只绑 Tailscale 网卡，不开放 Wi-Fi/LAN；不做 Funnel/公网。）
3. 桌面工作台打开后：首页右上角点 **远程设备** → 应显示
   “本机远程控制台已启用:手机浏览器访问 http://100.74.12.59:3780/”。
   没显示则看排障段。
4. 点 **生成手机配对码** → 屏幕出现一次性配对码（5 分钟有效，只显示一次，别截图外发）。

### 1b. 手机操作
1. 手机安装 **Tailscale** App，登录与本机相同的 tailnet 账号，确保已连接。
2. 手机浏览器访问 `http://100.74.12.59:3780/` → 出现“配对”卡片。
3. 输入主机上的配对码 → 应进入概览页（项目/角色/运行计数、底部导航五个标签）。

### 1c. 验收点（逐项记 通过/失败+现象）
- [ ] 配对码输错/过期：提示“配对失败”，不崩页面。
- [ ] 手机切后台/锁屏 30 秒再回：页面顶部出现红点+“已断开”，随后自动重连恢复（横幅“正在自动重连”短暂出现）。
- [ ] 主机端：远程设备页“已登记设备”出现手机（MOBILE·ACTIVE·不可控制）。
- [ ] 手机是观察者：任务页“派发”按钮禁用，提示需租约（不应看到控制器按钮可用）。
- [ ] 主机点“撤销”：手机变“已断开”且**不再恢复**。
- 做完关掉第 2 步的 cmd 启动的 electron 即可（`taskkill /F /IM electron.exe`，core 会随管道收尾；或直接注销）。

### 排障
- 手机打不开：电脑 cmd 自查 `curl http://100.74.12.59:3780/health` 应回 `{"status":"ok"...}`；
  通了而手机不通 = 手机 Tailscale 未连接。
- curl 也不通：防火墙放行一次即可
  `netsh advfirewall firewall add rule name=agentrouter-remote dir=in action=allow program="E:\AgentRouter\.worktrees\v1.1-final-zcode\release\AgentRouter-j3-c36b9cc43a30-85510cfc-29fc-402c-967e-f34695a410e8\resources\app\core-node.exe" enable=yes`
- 远程设备页显示“未启用”：说明 electron 不是上面那个带 env 的 cmd 启动的，或旧 core 先起了——按 1a 第 1 步清干净再来。

---

## 卡 2 — 第二台 Windows 机（约 15 分钟）

前置：主机按卡 1 的 1a 启动（保持运行）。
1. 把候选包整个文件夹拷到第二机（U 盘/共享均可），第二机安装并登录同一 Tailscale。
2. 第二机开 cmd（保持不关）：
   ```bat
   cd /d "<第二机上包所在目录>"
   set AGENTROUTER_MODE=REMOTE_CORE
   start electron.exe
   ```
3. 桌面弹出 **“连接远程主机”** 面板：
   - 主机工作台 → 远程设备 → 点 **生成第二台设备配对码(可控制)**；
   - 面板填：名称=家里主机、地址=`http://100.74.12.59:3780`、配对码=刚生成的码 → **配对并保存节点**；
   - 选中该节点 → **连接所选节点**。
4. 验收点：
   - [ ] 第二机看到主机项目/角色快照（token 只存第二机本地 safeStorage，界面不显示）。
   - [ ] 第二机“控制”获取控制器成功，能派发一个小任务并被原生执行。
   - [ ] 租约互斥：第二机拿租约期间，主机界面应显示失去控制（观察者）。
   - [ ] 第二机运行中任务可取消；主机“远程设备”页可撤销第二机 → 第二机断开不再恢复。

---

## 卡 3 — ZCode 桌面共存（1 分钟）
DUT 全程使用独立受管 HOME + 百炼 API，未触碰你的 ZCode 桌面登录。
人工确认方式：照常用 ZCode 桌面开一个会话能正常对话即可；不需要任何导出。

---

## 卡 4 — Codex DUT 重登录（约 3 分钟，补五格矩阵最后一行）
1. 在 PowerShell 里运行：
   `powershell -File "E:\AgentRouter\.worktrees\v1.1-final-zcode\tools\login-j3-codex-dut.ps1"`
2. 它会为**隔离 DUT**（不是你的桌面 Codex）发起 device-auth 并打印一个设备码/URL，
   你在浏览器里批准即可。**不要把码发给我或任何人**。
3. 看到 `DUT_LOGIN_COMPLETED` 后告诉我一声，我重跑
   `node tools/test-j3-production-pi.mjs --live --codex` 补上矩阵行。

---

## 最后：终审合入（你决定）
- 分支 `feat/v1.1-final-windows-mobile`，头 `c36b9cc`（我这边所有 CI 双门绿）。
- 审阅材料：`docs/reports/W14-final-delivery.md`（总览）、`W11-harness-dut-matrix.md`、
  `W10-regression-and-load.md`、本卡。
- 你说“可合”我再执行合并（不自动 merge/tag/发布）。

## 明确不需要你做的
- 不切换/登出任何账号；不复制 Codex/ZCode 生产凭据；不把 key/token 贴进聊天。
- 真实无线切换/锁屏行为之外的深度手机取证不做（未做会如实 BLOCKED_HUMAN_DEVICE）。
