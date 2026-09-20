# V11 Final Windows RC — 固定源验收

- 规范源 SHA（canonical Windows）：`16598f621d7160627ce769ecafb8d14ab55399f4`
- 本工作树证据提交：C7 `7e268ea` · C8 `0641ff3` · C9 `556a121` · C10 `9c9272a`
- 工作分支：`feat/v1.1-final-cursor-win`
- 状态：**`AUTO_SCOPE_DONE_WITH_BLOCKERS`**
- 未发出：`V1.1_WINDOWS_RC_READY_FOR_USER_ACCEPTANCE`
- 未授权：merge `main` / tag / release

## 已完成（本执行器范围）

- C0–C6：既有提交覆盖 Management MCP、P0 正确性、Join/Slot、联合结果链。
- C7：五 Harness 声明矩阵均为 `COLD_RUN`；隔离 `native-runtime.json`（pi / dsh / kimi / zcode，百炼路径引用）；supervisor STDIO Job 收尾通过；**真实 pi→百炼 Level A** `PASS_TASK_AND_BOOTSTRAP`（bootstrap `DELIVERED`，run `SUCCEEDED`，结果 `42`/`PUBLISHED`，Management MCP 同 key 幂等）。
- C8：隔离数据根创建 `V11-REAL-SMOKE-*`；未改写生产 Codex/ZCode/Kimi/DSH HOME；未复制 `百炼.txt`。
- C9：Desktop 静态 UX（Host/Core 身份、需要关注、受阻原因、工作会话、槽位绑定、远程配对页）。
- C10：100 / 1k / 10k conversation fixture、20 MiB 分块读取、二次连接 snapshot、migration freeze（含 017）。

## 精确阻断

1. Codex 真实 DUT 身份缺失，禁止复制生产登录。
2. dsh / kimi / zcode 本轮未重放真实 Level A（W11 历史矩阵曾 PASS）。
3. ChatGPT Web Participant 真机 Join/结果环未跑。
4. Mobile sheet / Remote HTTPS+WSS 真机需要用户手机或二机。
5. Electron 打包安装包未构建、未做打包后持久化。
6. GitHub CI 仍为基础设施阻断，不是本仓测试失败。

## 保护约束

- Cursor 只作为 Management MCP 客户端 `mcp_management_cursor`，不是 Role。
- 百炼密钥未写入仓库、日志或对话。
- 未 merge / tag / release。
