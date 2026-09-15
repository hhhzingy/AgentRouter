# ZCode 事件规范化：离线阶段

开发父提交：403ed27482c863a4ce744d227f46ae352e41a654。

## 来源与实现

只读检查已安装官方 zcode.cjs 的 qMe/C6i/FDi、qLi/xG：

- session/event 的 params 为事件本体，含 sessionId、turnId、seq、payload。
- turn.started payload.inputId 关联 session/send 的 inputId；只据此绑定当前 run 的 turn。
- model.streaming 的 text_delta 映射 TextDelta；reasoning_delta 不转发。
- turn.completed/resultType=success、cancelled 分别映射成功、取消；turn.failed 映射失败。
- 同 session、同 turn 且递增 seq 才允许转发，错误 inputId、历史与重复事件过滤。
- 工具与权限事件仅透传观察元数据，不执行历史工具、不自动批准权限、不转发 input 或错误堆栈。
- 断连传递至 NativeProcessBackend，取消请求响应本身不伪造停止证明。
- RunAccepted 不附 acceptedPromptHash，不作为 durable context receipt。

## 测试记录

新增事件测试修复前 4/4 失败，修复后与既有相关测试合计 26/26 通过。再补工具/权限、未知终态与并发保护用例后，最终 5 文件、27/27 通过；TypeScript、规范副本与 migration/EOL、diff 检查通过。
命令：node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/unit/zcode-event-normalization.test.ts tests/unit/zcode-session-routing.test.ts tests/unit/zcode-transport-failure.test.ts tests/unit/j3-zcode-dsh-lifecycle.test.ts tests/unit/j3-native-process.test.ts。

## 限制

状态为 OFFLINE_PASS，未启动真实原生会话。本次不证明 Role MCP 实际注入、权限应答、工具产物、进程保存/fresh、history reconcile 或真实取消闭环已完成。未知终态保持未结算，交由现有超时与不确定状态处理。事件顺序及 seq 假设仍须当前 runtime 实测；缺少当前 turn.started 时不把无来源事件当本次输出。

未修改冻结合同、migration、用户原工作区、旧会话或认证；未进行文件删除。
