# 开发与复现

## 1. 固定环境

在 E:\AgentRouter 中开发。系统 Node 为 24.14.0；pnpm 11.19.0 的现有 Codex 包装器使用 Node 24.19.0，二者在证据中分开记录。运行时始终显式使用 `.local/runtime/node.exe`。

```powershell
$env:TEMP = 'E:\AgentRouter\.local\tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'E:\AgentRouter\.local\npm-cache'
$env:electron_config_cache = 'E:\AgentRouter\.local\electron-cache'
pnpm install --frozen-lockfile
node node_modules/electron/install.js
node tools/private-node.mjs
& tools/build-supervisor.ps1
```

系统已有 Codex/Kimi 保持原版本，不自动升级、不覆盖默认配置。不要再次运行 bootstrap-records 脚本覆盖现有记录。

## 2. pi

pi 已按用户要求改为 Windows 用户级安装，版本 0.85.1，目录为 `%APPDATA%/npm`。重新安装时：

```powershell
npm install --global --prefix "$env:APPDATA/npm" --ignore-scripts @earendil-works/pi-coding-agent@0.85.1
& tools/pi.ps1 --version
```

`pi` 命令来自 Windows 用户 PATH 中已有的 `%APPDATA%/npm`；`tools/pi.ps1` 只转发到该用户级安装。没有修改系统 PATH。交互登录需用户在受控配置目录明确完成，不从默认账号复制刷新凭据。无账号探针：`node tools/probe-harnesses.mjs`。

## 3. 验证命令

```powershell
pnpm spec:check
pnpm doctor
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:chaos
pnpm db:verify
node tools/test-supervisor.mjs
pnpm build:win
pnpm test:packaged
node tools/desktop-smoke.mjs
pnpm test:desktop
```

`test:desktop` 使用 Playwright；最新软件渲染测试通过，证据见 evidence/latest-run.json 和 evidence/M00/desktop.json。测试替身代替目录及关闭对话框。完整批次可运行 `node tools/checkpoint.mjs`。真实账号、干净 Windows、卸载、断电、长期压力等用例不得根据离线命令通过推断为 PASS。

## 4. 核心故障复现

`tests/chaos/recovery.test.ts` 将 finish 结果保存在 HELD 后重新打开数据库，再执行 recover；预期保留结果与资源隔离，不自动再次执行。`tests/integration/core.test.ts` 验证结果先到/后 wait、A→B→C→用户与不抄送。

测试临时目录位于 `.local/tests`，均为无真实账号 fixture；默认保留，用户可自行检查。生产控制数据应保存在用户数据目录，不能放用户源项目或同步盘。

## 5. GitHub

远程为 https://github.com/hhhzingy/AgentRouter，私人仓库。若受限执行账户触发 dubious ownership，仅使用 `git -c safe.directory=E:/AgentRouter ...`，不修改全局安全目录列表。网络推送失败需分辨网络隔离与真实认证失效，不输出或索取 token。
