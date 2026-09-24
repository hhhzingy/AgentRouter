# RESPONSIVE_AND_A11Y

## 缩放与断点

桌面工具，优先信息密度。以等效 CSS 宽度三档验证（截图证据见 SCREENSHOT_INDEX）：

| 缩放 | 等效宽度 | 行为 |
|---|---|---|
| 100% | 1440×900 | 基准：角色详情双栏、Role Plan 三入口并列 |
| 125% | 1152×720 | 布局不变，密度可接受 |
| 150% | 960×600 | 触发 ≤1000px 断点：详情变单栏、入口纵向、计数条换行 |

断点（workbench.css 末尾）：
- ≤1000px：`.role-grid` 单栏、`.roleplan-entries` 单栏、`.overview-strip` 换行
- ≤720px：顶栏计数隐藏（壳保留连接态）、角色行描述隐藏、主区内边距收窄

网格自适应：首页项目卡 `repeat(auto-fill, minmax(320px, 1fr))`，创建卡同轨。

## 可访问性

- **语言**：`lang="zh-CN"`。
- **焦点**：`:focus-visible` 统一 2px 主色描边；所有按钮/链接/输入可 Tab 到达。
- **语义**：页签 `role="tablist/tab" + aria-selected`；弹层 `role="dialog" aria-modal`；抽屉 `role="complementary"`；状态点 `role="img" aria-label`。
- **不只靠颜色**：每个状态有文字标签；徽标含文字；阻断原因以文字显示。
- **表单**：textarea/input 有 `aria-label` 或可见 label；确认项用原生 checkbox + label。
- **动效**：`prefers-reduced-motion: reduce` 时禁用过渡。
- **对比度**：状态文字色对其 -soft 底均 ≥ 4.5:1（13px 粗体徽标）。

## 键盘

- 全部操作可键盘完成（按钮均为原生 `<button>`，复选/单选为原生 input）。
- 弹层 Esc 关闭：Dialog/Drawer 由 onClose 覆盖（Codex 可补 Esc 键监听，见 HANDOFF_REQUESTS）。

## 测试证据

- `tests/ui/pages.test.tsx` 可访问性分组（tablist/aria-selected/状态点 label）。
- 缩放截图：`01-home-project-cards-zoom125/150.png`、`02-project-overview-two-groups-zoom125/150.png`。
