# C1 冻结合同：UIAI 只读接入指南

本目录及 `contracts/**`、`packages/client-contract/**`、`apps/desktop/preload.*` 由 Core 负责人维护。C1 是协议合同和离线 Mock 基线，不是 W11 服务完成。修改字段或含义须提交执行包中的 Contract Change Request。复核前不创建 UIAI worktree，不开始真实账号联调。

## 唯一来源与生成

- `contracts/client-api.c1.schema.json`：正式 JSON Schema 2020-12，包含严格帧、66 个方法的参数/返回、ViewModel、错误、能力和写权限字段。
- `packages/client-contract/generated.ts`：完全由 Schema 生成；不得手工修改，也不再维护执行包中的类型副本。
- `pnpm contract:generate` 生成；`pnpm contract:check` 比较精确字节。CI 和提交钩子均阻断漂移。
- [方法表](methods.c1.md) 与生成类型来自同一 Schema。`x-methods` 只说明合同及 Mock 状态；以连接返回的 `capabilities.methods` 为运行时事实。

## 帧与身份

协议名 `agentrouter-client/1`，UTF-8 JSON，每帧仅用 LF 分隔，上限 262144 字节（不含 LF）。可接受 CRLF；JSON 内的转义换行、U+2028 不分帧。流尾残帧、无效 UTF-8、超长、额外字段、未知方法失败关闭。stdout 仅协议帧，stderr 仅固定诊断码，不转发原始异常。

请求/响应以 `id` 关联，成功和错误互斥。心跳为 `{v:1, heartbeat_at_ms:number}`，不推进业务游标，不取消任务。事件游标为安全整数、严格递增，但可有间隔；UI 不以自然语言猜测完成。

连接先 `system.initialize`；`client_id` 是稳定安装 ID，**不是认证凭据**。真实身份必须由 Local 父进程或未来 SSH/Unix Socket 的受信任 OS 边界提供，不能相信 Renderer 的 principal。Mock 注入身份仅用于测试。

## 写操作、租约与重试

所有写操作（包括 control）必填：`operation_id`、`client_id`、`expected_revision`、`scope`。普通业务写操作还必填 `lease_id`。作用域 global 使用 `{}`；project 使用 `project_id`；space 同时使用 `project_id/space_id`。scope 不授予权限，服务端必须核对实体归属。

C1 的 `expected_revision` 是 `system.snapshot.revision` 全局业务修订号；VM.revision 是实体最后修改时的全局修订号。客户端在冲突后重新读 snapshot，不以本机状态推算。创建操作也使用全局修订。control 操作不改业务修订。

`system.initialize` 返回 observer；请求 controller 的授权连接再显式 `control.acquire`。一次只有一个 controller，租约绑定连接及受信任 principal；Mock TTL 为 30 秒。`renew` 延长 TTL，`release` 放弃。observer 无法通过提交 client_id 或 lease_id 越权。断开连接保留业务与租约至 TTL，不取消 Run；重连获得新租约后再重放业务操作。

幂等键为受信任 principal + client_id + operation_id；规范化摘要含 method/params/scope/expected_revision，不含传输请求 ID 或新 lease_id。同键同载荷返回已提交结果，不检查旧业务修订；不同载荷报 OPERATION_CONFLICT。未提交的失败不进成功账本。已成功 release 可以精确重放；过期 acquire 不得通过旧响应恢复控制权，必须用新 operation_id 申请。

不要自动给断线请求生成新 operation_id。timeout/AbortSignal 只取消客户端等待，**不等于业务取消**；结果可能未知，应重连查询或用同一操作重试。C1 InMemory 只模拟立即执行与调用前取消，真实传输中途取消/持久账本由 W11/W12 实现。

## 快照、事件与重连

先 snapshot，保存 cursor，再 catchup/subscribe。同一 UI 对重复事件按 cursor 去重；收到事件后按实体 ID 读取权威 VM。`events.catchup` 使用 `after_cursor` 和 `server_instance_id`，每页最多 100。next_cursor 是本页最后一项，空页保持输入，has_more 指示补页。

游标早于保留边界或 server instance 改变，报 CURSOR_EXPIRED、`details.snapshot_required=true`；游标超前报 CURSOR_INVALID。重拉 snapshot 后重新补偿，不拼接两个 Core 实例的事件。生产保留周期与持久化由 W11/W13 实现，C1 Mock 用 trimEvents 显式测试。

## Mock 与 UI 入口

```ts
import { MockCoreServer } from '../../packages/core-api/mock-server.ts';
import { InMemoryTransport } from '../../packages/client-transport/in-memory.ts';
const transport = new InMemoryTransport(new MockCoreServer());
const session = await transport.connect({
  clientId: 'client_ui',
  clientVersion: '1.0.0-dev.0',
  requestedMode: 'controller',
});
const snapshot = await session.request('system.snapshot', {});
const lease = await session.request(
  'control.acquire',
  {},
  {
    operationId: 'op_acquire',
    expectedRevision: snapshot.revision,
    scope: {},
  },
);
```

上述 Node Mock 供测试/Main 使用，Renderer 不直接引入 Node。独立 stdio Mock：`pnpm mock:c1`（临时构建在 `.local/client-c1`）。该进程退出即丢失内存状态，不冒充长期 Core。

桌面先 `pnpm build:win`，再设置 `AGENTROUTER_C1_MOCK=1` 启动预览。Renderer 通过 `window.agentrouterClient` 使用 CoreTransport 的 connect/close，返回 CoreSession 的 request/subscribe/connectionState。preload 不暴露原始 IPC 或数据库；Mock 开关未开时 C1 connect 明确失败。旧 window.router 为旧页面保留，不是新 UI 的合同。真实 LocalStdioTransport/SshStdioTransport 在 W11/W12 接线。

`fixtures/client-c1/` 提供等待审批、UNKNOWN、FIFO 排队和 HELD 结果等结构化场景。Role/Task/Run/Delivery/Acceptance/Connection 状态分别展示，HELD 不显示已投递。Mock 的 Linux 标签只是夹具，不是 SSH 已连接证据。

## 能力及路径

git/live=false，output_types 只有 artifact；external 只作为输入引用，不代表可冻结的输出。三家均 PROBED，create_session/cancel=false；真实支持计数 0。不在 `capabilities.methods` 中的方法必须禁用，不得因 Schema 包含方法就显示为可用。

路径 API 使用 Core 颁发的 opaque path_handle；RemoteDirectoryEntryVM.displayPath 仅展示。project.create 的 path_handle 同时覆盖本地授权选择和远程选择，不新增 createFromRemotePath 别名。artifact.download 采用分块结果，客户端保存位置由其主进程显式授权，不把 Windows 路径发送给 Linux；它不隐式写文件。这些方法在 C1 Mock 均未宣称可用。

## UNKNOWN 对账

run.reconcile 必须 controller、scope、revision、operation_id、run_id、明确 action 和至少一个 evidence_id；reattach 额外要求 native_session_handle。证据由受信任端登记并绑定 Run/epoch，客户端不能用字符串断言“资源已停止”。审计返回 actor/time/evidence/resourceDisposition/revision；不返回凭据，也不公开任意释放资源的方法。

C1 Mock 支持证据注册和审核语义：缺证据、错 Run/epoch 或释放时没有 nativeCompleted+resourcesStopped 证明均拒绝；重复请求只产生一条审计。释放只作用于 Mock disposition，不操作 OS 资源，Run 仍 UNKNOWN，不能把资源释放等同于任务成功。confirm_no_side_effect_and_retry 记录核对意图，retryScheduled 固定 false，不自动重跑；未来显式 task.resume 必须再次校验。真实持久审计、原生核验和解除流程属于 W11/W13，不由 Mock 测试替代。

## 原 Route 工具修正

route_context 默认 identity，支持 identity/roles/task/child_results/policy/notices；显式 all/results 作为旧别名保留。指定段只返回该段，不附带其他内容。policy 使用任务锁定的策略或绑定同步策略；notices 按目标角色与空间过滤，支持 after_cursor/limit（默认50，最大100），读取不确认、不唤醒、不产生回执。

## 安全与变更

ViewModel 无认证原文，错误只有固定 code/message_key/trace 和受限 details。禁止将真实凭据或未脱敏捕获塞进 Mock fixture。凭据、SSH、网络隔离与真实 Provider Gate 仍未测试，不开始真实账号。

合同新增可选字段走 CCR 和兼容性复核；改义/删字段升主版本。C1 冻结源的哈希见 freeze.c1.json；未来变更不得悄悄重算哈希替代复核。
