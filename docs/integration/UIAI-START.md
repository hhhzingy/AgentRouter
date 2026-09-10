# UIAI B1 交接入口

请先读 `E:/AgentRouter/docs/执行包/AgentRouter_UIAI_B1_执行包/prompts/UIAI_START.txt` 和该执行包。UIAI 负责新 Renderer 全部视觉、布局、页面和交互，不继续设计旧 GUI。

## 固定基线

- S0：`441558d3e32c573e9a73f517f06c3641453311ec`，包含 c658c01 与 4ec4805。
- B0 Core：`5d6084f0d99d6de4710a81e8753b6a828a59d66a`；B0 集成：`d04442be1354452d3d47688441a1c244ad5d4849`。
- W11A Core：`59942b21654997540da0ea04f2cda4d9611cb39d`。
- W11A 集成：`51e4c7a9dda935192387e0528a11665161425c88`。

如未开始，请从私人远端 `https://github.com/hhhzingy/AgentRouter.git` 独立 clone 到 `E:/AgentRouter/.local/w11a/uiai-ui`，在 W11A 集成 SHA 建立 `feat/ui-b1-workbench`。若已从 S0/B0 开始，保留修改并按提交合并 W11A 集成 SHA，不重建覆盖。先核对已有目录与 Git 状态；不要使用 shared/reference、linked worktree 或旧仓库对象库，不修旧 `.git`。

## 接线

读取同目录 `B0-client-ready.md`、`W11A-core-ready.md`、`W11A-report.md`。PREVIEW_MOCK 和 LOCAL_CORE 均已有实际桥；模式必须明确。LOCAL_CORE 不是 MockProduct，生产模型仍未验证，不能据此宣称真实 Harness 支持。

Renderer 入口 `apps/desktop/workbench.tsx` 挂载 `#root`，构建器加载 JS/CSS。共享根依赖/lock/tsconfig/CI、协议/生成类型、Main/preload 由 Codex 管理，新增依赖或合同问题写交接请求。不要实现第二套桥或 Core。

本地 W11A 门禁 123 条测试通过，保留原有 91 条；Electron PREVIEW_MOCK 与 LOCAL_CORE 生命周期均通过。精确远端 CI 状态见本目录 W11A-integration.json，不能把这些测试壳结果当作最终 UI/J1 通过。

## 返回交付

提供已推送的 B1 SHA、场景 Schema/语义检查、实际 Renderer 截图与交互证据、失败/阻断/风险。Codex 收到 SHA 后在 integration/v1.0-next 按提交合并并负责 J1 联验。J1 当前等待 B1，尚未执行。

所有开发、依赖、截图、临时数据库留在各自 AgentRouter 内 clone。禁止真实账号、真实 Harness、真实 SSH/Linux；真实支持数为 0；不合并 main。Codex 工作副本：`E:/AgentRouter/.local/w11a/codex-core`。
