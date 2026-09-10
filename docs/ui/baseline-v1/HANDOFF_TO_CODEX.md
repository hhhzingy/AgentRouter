# HANDOFF_TO_CODEX

## 交付事实

- **UI Baseline 分支**：`feat/ui-b1-final`
- **基线提交**：基于 W11A `59942b21654997540da0ea04f2cda4d9611cb39d`（`feat/core-w11a`）
- **UI Baseline SHA**：见本文件提交后的分支头（提交哈希即 UI 固定 SHA）
- **工作树**：干净；未触碰 Core/SQLite/Adapter/账号/Client Schema/Main/preload/根依赖/锁文件

## 已实现页面

1. 全局壳：Local/SSH 标识、Controller/Observer、Core 健康、运行/介入/审批计数、断线/重连/只读横幅、生命周期页脚
2. 首页：项目卡网格 + 同尺寸创建卡（空/多项目/SSH）
3. 单项目页：概览/协作组/时间线/收件箱/审批与问题/产物/模型与账号/设置（八页签）
4. 角色详情：Charter（Bootstrap 状态）、当前任务与 Run（SETTLING）、完整对话（10 种 kind + Composer）、有效权限、UNKNOWN 对账面板
5. Role Plan：AI 生成（能力不足禁用）/导入/手工 → Validate → Review（权限对照+模型徽标）→ 确认 → Apply（与 Bootstrap 分离）
6. 组重构：Merge/Split → Preview blockers → 逐项确认 → Commit；能力缺失整页禁用
7. 模型与账号：脱敏 Profile、Seed/Runtime/Verified Cache 徽标、额度、无 Secret 输入
8. 生命周期：Observer 只读、SSH 断线"最后已知状态"、关闭窗口仅退出界面

## 测试

| 套件 | 命令 | 结果 |
|---|---|---|
| UI 测试（83） | `node_modules/.bin/vitest run tests/ui` | 83/83 通过 |
| 全仓回归 | `node_modules/.bin/vitest run tests/unit tests/contract` | 73/73 通过 |
| 类型检查 | `node_modules/.bin/tsc --noEmit` | 0 错误 |
| 构建 | esbuild bundle `workbench.tsx` | 通过（1.2MB） |
| 截图 | `node tests/e2e-ui/shoot.mjs` | 15 张 |

## Electron 实测状态

**未实测**（better-sqlite3 原生构建阻断，按约定不通过改根依赖解决）。
J1 需要验证：preload 注入 `window.agentrouterClient` 后 workbench 走真实 Core 的全部页面、
`AGENTROUTER_MODE=LOCAL_CORE` 启动、目录选择 picker 接入创建卡。

## 截图位置

`docs/ui/baseline-v1/screenshots/`（索引：SCREENSHOT_INDEX.md）

## 已知阻断

- better-sqlite3 原生构建（Core 侧，Codex 已有方案）
- Electron 原生目录 picker 未接（创建卡/产物下载按钮 disabled 并注明）

## 接管规则

1. 20 条 PRODUCT_RULES 不可单方面修改；视觉/布局/实现可自由重构。
2. 状态解释集中在 `packages/ui/status.ts`；改文案先改那里。
3. 此后所有 UI 修改由 Codex 负责；UIAI 分支保留为历史，不 force 改写。
