# WC00 保护账本与安全停止规则（2026-09-17）

## 1. 事件记录：Codex DUT 凭据为何丢失（X-04/W-04 根因）

- 位置：`.local/j3-codex/dut-fj/home/.codex/`（auth.json 等登录态）。
- 原因：DUT 登录态被放在 `.local` 临时区，而 `.local` 被历史清理批次与探针清理
  （`rm -rf .local/...` 模式）当作可任意删除的 scratch；成功 DUT 登录因此被当成一次性产物清除。
- 规则（即日生效）：**受保护认证目录不得位于任何清理计划覆盖路径**。DUT 登录态迁往
  `.local-protected/`（同级、同样不入 Git），清理白名单仅允许 `.local/`。
- 恢复动作：需用户执行卡 4（device-login，脚本自动定位最新 codex.exe）；此后登录态写入受保护目录，
  `tools/login-j3-codex-dut.ps1` 的 CODEX_HOME 将改指向 `.local-protected/codex-dut/home/.codex`。

## 2. 保护账本（清理/停进程操作不得触碰）

| 资产 | 路径 | 说明 |
| --- | --- | --- |
| 生产 ZCode 桌面（正在运行，PID 随时变化） | `E:\software\ZCode`，进程 ZCode.exe | 原登录；本轮观测到 2 个进程存活 |
| 生产 Codex 桌面登录 | `C:\Users\hap_p\.codex`（桌面默认 CODEX_HOME） | 不复制、不注销 |
| Kimi 原始凭据 | `C:\Users\hap_p\.kimi-code\credentials\kimi-code.json` | DUT 只读拷贝为独立 HOME，不反向写 |
| dsh 用户设置 | `C:\Users\hap_p\.dsh`（含官方 balian provider） | 只读参考 |
| 百炼标签凭据 | `E:\AgentRouter\账号信息\通用API\百炼.txt` 等 | 只在受信宿主进程内读取 |
| 开发者主数据根 | 打包桌面 `%APPDATA%\agentrouter\core`；dev 会话为各自 AGENTROUTER_DATA | 不注入破坏性 DB 故障、不删 |
| 本会话与历史开发会话 | ZCode/ZCode 会话库 | 不接管、不结束 |

## 3. 安全停止规则（取代旧卡通杀命令）

仅允许：先枚举 `tasklist /V`（或 PowerShell `Get-CimInstance Win32_Process`）核对
**PID + 可执行路径 + 启动时间 + 命令行里的数据根**，确认属于本批测试启动的实例后，
按 PID `taskkill /PID <pid> /T /F`。**禁止**按映像名批量 `taskkill /IM electron.exe|core-node.exe`。
宿主上长期运行的原应用（生产 ZCode/Codex/浏览器）一律不碰。

## 4. 旧 W12 卡撤回项（对应复核 W-01/W-02）

- `taskkill /F /IM core-node.exe & taskkill /F /IM electron.exe`：**作废**，按 §3 替代。
- 裸 HTTP `http://100.74.12.59:3780` 手机配对步骤：**作废**。Cookie 为 Secure，真实手机不把
  VPN 内 HTTP 当安全上下文；替换方案在 WC03（loopback 网关 + Serve HTTPS/WSS + 真实 Origin）。
- 手机"仅观察者"演示：**作废**。MOBILE 可按 owner 授权申请 controller（资格≠已持租约）；
  新卡等 WC03 修复后基于真实 HTTPS 自测重新生成。
- 卡 3（ZCode 共存确认）与卡 4 思路保留，但卡 4 的脚本将改为受保护目录（§1）。
