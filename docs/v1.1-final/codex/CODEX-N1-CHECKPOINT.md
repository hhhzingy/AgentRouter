# AgentRouter V1.1 Windows 功能收口 N1 Checkpoint

日期：2026-09-21

## 结论

N1 的 P0 定向回归在功能基线 `3ab6628da81956712b9b0aca52782bc61bcb033d` 全部通过。本阶段未发现需要再次修改实现的 F01/F02/F07/F09/F10/F11 回归；既有修复在当前独立功能工作树仍成立。

该结论只证明 N1 自动回归，不等于完整真实环境闭环，也不构成 Windows RC。

## 源与所有权

- source SHA：`3ab6628da81956712b9b0aca52782bc61bcb033d`
- parent：`3e4df007f6fe2b65acd74792d2eaba0e01a2ad48`
- branch：`feat/v1.1-functional-closeout-codex`
- worktree：`E:/AgentRouter/.worktrees/v1.1-functional-codex`
- 测试前工作树：clean
- UI 文件改动：无
- migration 改动：无
- protected assets：未触碰生产 HOME、旧会话、账号文件、UI 工作树

## 定向回归

命令：

```text
vitest run \
  tests/unit/v11-c2-p0.test.ts \
  tests/integration/context-transfer-engine.test.ts \
  tests/integration/mcp-scope.test.ts \
  tests/integration/participant-grants.test.ts \
  tests/integration/v11-remote-gateway.test.ts \
  tests/integration/role-session.test.ts \
  tests/integration/role-session-gateway-retry.test.ts
```

结果：`7 files passed / 46 tests passed / 0 failed`。

| Finding / gate | 当前证据 | 判定 |
|---|---|---|
| F01 Context 不假 confirmed | `v11-c2-p0.test.ts` | PASS_AUTOMATED |
| F02 repair 不复活历史 WS | `context-transfer-engine.test.ts`、`role-session.test.ts` | PASS_AUTOMATED |
| F07 Management MCP 真实 scope | `mcp-scope.test.ts` | PASS_DUT |
| F09 participant/extension 授权与 generation fencing | `participant-grants.test.ts` | PASS_AUTOMATED |
| F10 malformed Remote 输入局部失败 | `v11-remote-gateway.test.ts` | PASS_AUTOMATED |
| F11 revoke 立即关闭 live WSS | `v11-remote-gateway.test.ts` | PASS_AUTOMATED |
| Context transfer retry/receipt/历史边界 | `context-transfer-engine.test.ts`、`role-session-gateway-retry.test.ts` | PASS_AUTOMATED |

## 失败分母与环境记录

- 首轮：6 files / 35 tests PASS；Remote suite 在 collection 阶段因独立工作树缺少 `ws` package link 失败，未执行产品断言。
- 依赖处理：`pnpm install --frozen-lockfile` 按 lockfile 下载完成 159 packages，但 `better-sqlite3` postinstall 尝试本机重编译时因缺少 Visual Studio C++ workload 返回非零。已有 Node 24.14 兼容二进制仍可加载，随后 Remote 11/11 及整组 46/46 实际通过。
- Node engine 提示：package 声明 `24.14.0`；pnpm wrapper 报告 `24.19.0`，native install 子进程使用 `D:/Software/nodejs/node.exe` 的 `24.14.0`。这属于依赖安装环境差异，不计为产品测试通过或失败；N10 打包环境必须固定并复核。
- 未使用 Codex reset credit。

## 未被 N1 证明的范围

- 真实公网 HTTPS/WSS 与已连接手机的 revoke/reconnect/idempotency。
- Web ChatGPT Participant 真实链。
- 五 Harness 同一干净 SHA 的 Level A/B。
- Electron 安装/升级、CI、merge/tag/release。

下一阶段进入 N2：在当前代码上复核 Artifact / Reference / TaskInput / Queue 三条黄金流程，只对真实失败实施修复，并形成 `FUNC-CHECKPOINT-A`。
