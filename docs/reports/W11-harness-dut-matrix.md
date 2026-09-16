# W11 五 Harness DUT 矩阵(2026-09-16,分支 feat/v1.1-final-windows-mobile)

统一验收口径(PRODUCTION_CORE_*):真实打包芯 + 受管独立 HOME + Windows Job 监督器;
握手+bootstrap→小任务→route_finish/PUBLISHED→MCP 同 key 幂等派发→原生终态与全树收尾。
百炼绑定一律 qwen3.8-flash via Chat Completions(用户澄清);ZCode/Codex 不复制生产登录。

| Harness | 绑定 | 结果 | 证据 |
| --- | --- | --- | --- |
| pi | 百炼 MaaS | PASS | 前批 --bailian(参数化 broker 后);报告 run 记录 PASS_TASK_AND_BOOTSTRAP |
| dsh | 百炼(官方 balian provider + BALIAN_API_KEY) | PASS | cd8d4d4 批次 --dsh --bailian 全绿 |
| kimi_code | 百炼(openai-wire provider 形状,catalog add alibaba-cn 官方路径) | PASS | 7eb2c37 批次 --kimi-bailian:bootstrap DELIVERED、42/PUBLISHED、MCP 幂等 |
| zcode | 百炼(官方 openai-compatible provider + ZCODE_API_KEY) | PASS | 本轮:run SUCCEEDED、result PUBLISHED summary=42 |
| codex | 原登录(0.154.0-alpha.6.2) | BLOCKED_USER | DUT 独立凭据在 .local 清理中丢失;需重跑 tools/login-j3-codex-dut.ps1(用户浏览器批准 device 码,见 W12 卡4);桌面 Codex 生产登录未受影响 |

## ZCode 行揭示并修复的产品缺陷(全部有测试/探针证据)

1. **事件词汇错配**:0.16.5 官方 app-server 用 `v4/telemetry/event`(turnId/sourceCommandId/eventSeq/kind)
   与 `session/event`(仅 payload.kind 增量),不存在旧合成词汇的顶层 `type`。lifecycle 重写映射;
   `turn.terminal` 仅 success/cancelled/failed 显式结算,未知终态不报成功。
2. **projection.sessionId='unknown' 占位**与真实 session id 冲突 → snapshotSessionId 只对非 'unknown' 校验一致性。
3. **冷进程 resume 后模型客户端不可恢复**(resume OK → send `ZCODE_RUNTIME_MODEL_UNAVAILABLE`,setModel 无效):
   驱动改为始终新会话 + runPrompt 重申章程并作废 bootstrap ACK;能力诚实声明 native_resume=UNSUPPORTED、
   supportsFreshSession=true;路由测试同步新契约。
4. **工具权限流缺失**:MCP/写工具有副作用时服务器发 `interaction/requestPermission`(options 自带 response)。
   lifecycle 新增 onApproval:白名单 route_* allow_once,其余选 deny option;托管会话不再回 -32601。
5. **提示词工具名映射**:zcode MCP 工具为 mcp__ 全限定名,runPrompt 明确映射 route_context/route_finish 指称。

环境门观测:`AR_ZCODE_DEBUG=1` 时 lifecycle 输出协议诊断(通知/服务器请求摘要,含权限工具名),
默认关闭;该诊断用于 DUT 副本排障,不进生产路径日志策略。
