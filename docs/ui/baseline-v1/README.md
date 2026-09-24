# UI Baseline V1

AgentRouter V1.0 的界面基线，由 UIAI 一次性交付，此后由 Codex 单一维护。

## 这份基线包含什么

| 层 | 位置 | 说明 |
|---|---|---|
| 设计 Token 与样式 | `apps/desktop/workbench.css` | 色板/字阶/间距/状态色，纯 CSS 变量，无外部资源 |
| 基础组件 | `packages/ui/` | Badge/Card/Button/Dialog/Drawer/Tabs/EmptyState/CapabilityGate + 状态合成层 `status.ts` + 格式化 `format.ts` |
| 预览数据 | `packages/ui-mocks/` | 实现 ClientSession 接口的 PreviewClient + 全套假数据（脱敏、固定时钟） |
| 页面 | `apps/desktop/workbench/**`、`apps/desktop/workbench.tsx` | 壳/首页/项目页/角色详情/Role Plan/组重构 |
| 测试 | `tests/ui/` | 83 个 vitest 断言（状态语义/页面红线/Mock 行为/28 场景/无 Secret） |
| 截图 | `docs/ui/baseline-v1/screenshots/` | 15 张真实渲染截图（含 125%/150% 缩放证据） |

## 快速开始

```bash
# 静态预览（纯浏览器，Mock 数据）
node tests/e2e-ui/shoot.mjs        # 打包 + 起服务 + 截图到 screenshots/
# 然后浏览器打开 http://127.0.0.1:<port>/workbench.html?scenario=full

# 场景：full / observer / ssh-disconnected / production-caps / empty

# 测试
node_modules/.bin/vitest run tests/ui
```

## Electron 内运行（J1 联验）

`p1-main.ts` 加载 `workbench.html` 并注入 `window.agentrouterClient`；
workbench 检测到该桥后走真实 Core，否则回退预览 Mock。
Electron/LOCAL_CORE 联合验证属于 Codex J1（见 KNOWN_LIMITATIONS）。

## 阅读顺序

1. PRODUCT_RULES — 20 条不可改的产品规则
2. STATUS_PRESENTATION — 状态如何显示（最重要）
3. ROUTES_AND_IA / COMPONENT_SYSTEM / DESIGN_TOKENS
4. INTERACTION_RULES / RESPONSIVE_AND_A11Y
5. SCREENSHOT_INDEX / KNOWN_LIMITATIONS
6. HANDOFF_TO_CODEX / HANDOFF_REQUESTS
