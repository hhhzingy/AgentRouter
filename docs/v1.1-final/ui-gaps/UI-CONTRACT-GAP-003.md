# UI-CONTRACT-GAP-003 — New WorkSession 上下文容量与迁移决策

## User scenario

Role Detail → New WorkSession → Context。用户需要在提交前知道 Start blank / Direct transfer / Compression required / Unavailable 的真实依据，并在提交后看到 Core 报告的处理阶段。

## Current observed contract

`roleSession.preflight` 提供 `target_harness`、`recommended_action`、`reason_code`、`migration_fidelity`、`preflight_hash`；当前 Core 实现把 `migration_fidelity` 固定为 `UNKNOWN`，没有源上下文大小、目标容量、压缩要求或可选策略的 display-safe 投影。`roleSession.create` 的 inherit 路径返回 transfer operation，`roleSession.transferStatus` 只提供 `PREPARING / EXPORTED / SEEDED / COMMITTED / FAILED` 和 `error_code`。

## Required field/action

- Core 提供每个目标 Harness 的 display-safe 容量判断：`UNKNOWN / FITS / COMPRESSION_REQUIRED / UNAVAILABLE`，并明确数据来源和有效期。
- 若允许用户选择压缩策略，提供可提交的受控枚举及 preflight hash 约束；若 Core 自行决定，只返回决定和说明，不让 UI 伪造选项。
- 对 operation 提供安全的用户级阶段、是否可取消/核对、源 WorkSession 是否仍 ACTIVE 的权威摘要。

## Why UI cannot infer safely

模型上下文窗口、实际可导出 token 数量和迁移保真度不能从 Harness 名称或本地估算推出。把 `UNKNOWN` 画成 Fits/Compression 会误导用户；`PREPARING` 等 Core 阶段也不能拆成 UI 自创的六个阶段。

## Blocking level

P0 New WorkSession 完整 Context 决策和 Processing 页面；当前安全降级可支持 blank/inherit 并显示 `UNKNOWN`。

## Safe temporary UI

展示 Core 原始 preflight 可确认的结论。提交 inherit 后保存 operation ID，按 Core 实际状态查询；结果不确定时禁止再次创建并引导核对。容量与压缩显示“Core 未提供评估”，不显示数值。

## Mock prohibited

禁止写入假容量、假 token 数、假压缩进度或在 `PREPARING` 时宣称旧 WorkSession 已归档。

## Owner

V1.1 Core / Context Transfer 负责人；UIAI 只消费合同并渲染。

## Expected compatibility

优先加法字段，不改变现有 `roleSession.preflight/create/transferStatus` 状态语义。

## Codex response

- status: PARTIAL_CORE_IMPLEMENTED_UI_CONSUMED
- commit: `eccf799`
- UI-CONTRACT-CHANGE: `UI-CONTRACT-CHANGE-20260923`

Core preflight 已提供 `capacity_assessment=UNKNOWN`、`compression_policy=CORE_DECIDES`；transferStatus 提供实测容量决策与 `operation_summary`，UI 按字段展示。创建前真实容量预测仍缺失；最终 Core+UI 真实链路尚未合流验证。

2026-09-23 后继：`5298638` 使 New WorkSession 向导随目标 Harness 重新读取 Core preflight，未就绪时不前进，提交前 hash 变化要求重新审阅；`28f19f4` 的 W11 真实 Electron Fixture Core 页面证明无 Native 创建能力时安全禁用，不伪造可用 Harness 或容量。`ccf6099`/`8cd4972` 让受信本机宿主仅对已注册驱动、已配置 profile 且支持 fresh session 的 Harness 报告可新建，并通过 `roleSession.harnesses` 只读扩展列出 ZCode/DSH，不修改冻结 C1/C1R1 Schema。真实 Codex 与 ZCode 同源包分别核验“只有当前已配置 profile 可创建”，Level A `42/PUBLISHED`；`8cd4972` 的 C1/W11 双绿。`5298638` 的 W11 先因 J1 Core 重连 5 秒等待窗口过短红灯；`2b52c4c` 修正等待后 J2 又因 Fixture 中不存在可用的第二 Harness 选项红灯；`28f19f4` 改按 Fixture 真实能力验安全门控后独立跑绿，失败分母均保留。创建前容量仍 `UNKNOWN`，具备真实 profile 的 Electron New WorkSession 创建/迁移页面尚未实测，GAP-003 保持 PARTIAL，不宣称完整 Context 决策闭环。
