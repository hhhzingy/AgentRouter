# V11-L1 原生上下文 receipt 防误确认

## 本次变更

- 普通文本、工具调用与终态事件不再触发上下文确认。
- Codex 的 turn/start 响应绑定 run、原生 session/turn 和实际发送文本的 SHA-256。
- NativeProcessBackend 仅在响应匹配时生成结构化 receipt；Core 校验 WorkSession、activation epoch、原生 session、marker 和 envelope hash 后才进入确认路径。
- 未修改 migration 或冻结合同；未操作现有原生会话与认证。

## 验证

- 修复前，普通文本误确认回归用例失败；修复后通过。
- 本次提交前复跑 native-context-receipt、j3-codex-lifecycle、j3-native-process 和 v11-context-continuity-rc：4 个文件，38 项通过。
- TypeScript 类型检查通过。

## 尚未完成

- 本次是防误确认加固，不是完整真实联调验收。
- 尚无真实 Driver 到 Core cursor 推进的正向端到端证据，未完成持久化 history reconcile。
- 其他 Driver 尚未提供相应结构化响应证据，因此不能据普通事件推进 context cursor。
- Core 当前仅检查 promptHash 格式，实际发送文本匹配由后端校验；nativeTurnId 尚无持久化 turn ledger 对账。
- 不据此宣称 V1.1 RC 或整体目标完成。
