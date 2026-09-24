# W11A Core 交付与 UIAI 接线

Core 提交：`59942b21654997540da0ea04f2cda4d9611cb39d`；集成提交：`51e4c7a9dda935192387e0528a11665161425c88`。请按固定提交合并，不复制工作区文件。

## 已实现

独立 Windows Core + 真实 SQLite 迁移/备份/独占；项目和路径句柄；两组 RolePlan 原子配置与版本化章程；独立 Bootstrap；用户任务、流水线、RESULT_HANDLING、关联续办；队列、用户结果箱、对话分页/GAP；租约、持久幂等、snapshot/catchup；UNKNOWN 与资源隔离；pause/drain、有证据的取消；桌面 Main/preload LOCAL_CORE 启动和重新附着。

## 使用

在独立 clone 安装已锁定依赖后：

```powershell
node tools/build-w11.mjs
$env:AGENTROUTER_MODE='LOCAL_CORE'
$env:AGENTROUTER_DATA='<本 clone 内的独立桌面数据目录>'
node_modules/electron/dist/electron.exe .local/desktop-w11/p1-main.mjs
```

Main 的实际 Core 数据目录是 `AGENTROUTER_DATA/core`。不设置 GUI 数据路径时使用 Electron 当前用户数据目录。默认可选项目根为这个独立 Core 数据目录；外部独立启动器可通过受信任环境 `AGENTROUTER_PROJECT_ROOTS` 提供目录白名单。Renderer 只能使用 Core 发出的 path_handle。

独立 Core：`node .local/w11-core/core.mjs`，设置 `AGENTROUTER_DATA` 指向同一个 Core 数据目录即可被 GUI 附着。不要在普通产品数据目录启用 Fixture。CI 和进程测试自行创建隔离数据、标记和父 IPC，不读取日常账号。

运行门禁：`node tools/check-w11.mjs`。桌面专项：`node tools/test-w11-desktop.mjs`。原始数据库/进程日志/凭据均留在被忽略的 `.local`，仓库只保留脱敏检查摘要。

## UIAI 约定

继续按集成目录 `UIAI-START.md` 和 `B0-client-ready.md` 实现新 Renderer；入口 `apps/desktop/workbench.tsx` 挂载 `#root`，构建器会加载生成 CSS。Main/preload/协议/根依赖由 Codex 管理。

LOCAL_CORE `capabilities.mock=false` 不代表三家 Harness 可运行；工作区创建、组重构、未经实现的方法须按 capabilities 禁用。Fixture 的 run.cancel 仅在隔离模式公开。UNKNOWN 使用既有 RunState/问题记录表达，不扩展冻结的 interventionState 枚举。

用户结果箱中没有未发布/角色间结果；这些过程状态通过任务、运行和对话显示。Apply=APPLIED 与 Bootstrap=PENDING/FAILED/DELIVERED 分开，PAUSED 仍是用户意图。技术 ChangeVM/空响应不是业务完成。

## 已测试、阻断和风险

测试结果见 `evidence/W11A/gates.json`、`desktop-lifecycle.json` 和 `W11A-report.md`。本轮未开启任何真实账号/真实 Harness/SSH/Linux；这些验证 NOT_RUN。真实支持数 0。

J1 阻断项：UIAI 尚未提供 B1 已提交 SHA。当前 Electron 是实际 Main/preload 测试壳，不是最终 GUI 验收。收到 B1 提交后，Codex 在 integration/v1.0-next 合并固定提交并运行 J1，禁止合并 main。
