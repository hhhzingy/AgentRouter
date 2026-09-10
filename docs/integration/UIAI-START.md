# UIAI B1 交接入口

S0 已验证：`441558d3e32c573e9a73f517f06c3641453311ec`。固定输入 c658c01 + 4ec4805，双方历史均保留。91/91 原有回归、C1/C1R1 生成/冻结、类型、安全扫描通过。

从私人远端 `https://github.com/hhhzingy/AgentRouter.git` 创建独立 clone 到 `E:/AgentRouter/.local/w11a/uiai-ui`（若目录已存在，先核对，不覆盖）。不要借用旧仓库对象库，不使用 linked worktree、shared/reference，不修旧 .git。

从上述 S0 SHA 创建 `feat/ui-b1-workbench`。请先读 `E:/AgentRouter/docs/执行包/AgentRouter_UIAI_B1_执行包/prompts/UIAI_START.txt` 和其中工作包，先做语义纠正、28 场景迁移和纯组件。B0 当前未产生，不提前实现第二套桥/Core。

共享文件由 Codex 管理：根 package/lock/tsconfig/CI、协议/生成类型、Main/preload。UIAI 拥有新 Renderer 视觉/组件/样式与 docs/ui；不以旧 GUI 为视觉基线。需要依赖或合同调整写交接请求。最终提供已提交 B1 SHA，Codex 合并 J1 联验。

Codex 的工作副本：`E:/AgentRouter/.local/w11a/codex-core`。B0 就绪后更新本目录 `B0-client-ready.md`，请按其中明确 SHA 更新，不复制未提交代码。所有临时文件、测试数据库、截图保存在各自 clone 内。禁止真实账号/Harness/SSH/Linux，不合 main。

## B0 已就绪

B0 源码提交：`5d6084f0d99d6de4710a81e8753b6a828a59d66a`。B0 集成提交：`d04442be1354452d3d47688441a1c244ad5d4849`。请合入此明确 B0 集成提交，再按同目录 B0-client-ready.md 接线。新 Renderer 入口约定为 apps/desktop/workbench.tsx；最终视觉由 UIAI 负责。98 个回归及真实 Electron PREVIEW_MOCK 检查已通过。LOCAL_CORE 当前尚未就绪，不能伪造连接成功。
