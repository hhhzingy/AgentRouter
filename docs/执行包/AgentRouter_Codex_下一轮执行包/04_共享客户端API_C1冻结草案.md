# AgentRouter Client API C1 冻结草案

## 一、目的

建立 UI、Local Core、Remote Core、未来插件共享的单一协议。UI 不再绑定 Electron 本地子进程，Core 也不依赖某一种客户端。

C1 是 Codex 与 UIAI 并行开发前必须冻结的契约。

## 二、固定边界

### UI/客户端可以做

- 连接 Core；
- 读取投影；
- 订阅事件；
- 发送有 `operation_id` 的管理命令；
- 请求停止、审批、账号切换；
- 读取对话和产物的可展示内容。

### UI/客户端不可以做

- 直接打开 SQLite；
- 直接启动 Harness；
- 直接读写认证文件；
- 自行推断任务完成；
- 伪造角色 run-scoped identity；
- 修改 binding epoch；
- 直接释放资源租约；
- 绕过 UNKNOWN 对账。

### Harness 内部 Route Tool

继续使用独立的 run-scoped 协议，不与 GUI 管理权限混用。

## 三、传输无关接口

```ts
interface CoreTransport {
  connect(options: ConnectOptions): Promise<CoreSession>;
  close(): Promise<void>;
}

interface CoreSession {
  request<T>(method: string, params: unknown, options?: {
    operationId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<T>;

  subscribe(handler: (event: CoreEvent) => void): () => void;
  connectionState(): ConnectionState;
}
```

实现：

- `LocalStdioTransport`
- `SshStdioTransport`
- 测试用 `InMemoryTransport`

未来可增加经认证的 WSS，但不属于 V1.0。

## 四、帧格式

### 请求

```json
{
  "v": 1,
  "id": "req_01",
  "method": "role.create",
  "operation_id": "op_installation_uuid_0001",
  "params": {}
}
```

### 成功响应

```json
{
  "v": 1,
  "id": "req_01",
  "result": {}
}
```

### 错误响应

```json
{
  "v": 1,
  "id": "req_01",
  "error": {
    "code": "CONTROL_LEASE_REQUIRED",
    "category": "AUTHORIZATION",
    "message_key": "errors.control_lease_required",
    "retryable": false,
    "trace_id": "trace_xxx",
    "details": {}
  }
}
```

### 事件

```json
{
  "v": 1,
  "event": "run.state.changed",
  "cursor": 1902,
  "occurred_at_ms": 1788940000000,
  "payload": {}
}
```

## 五、连接方法

### `system.initialize`

返回：

- 协议版本；
- Core 版本；
- 数据库 Schema；
- server instance；
- OS；
- 功能 capability；
- 当前 event cursor；
- controller/observer 状态；
- 服务健康；
- 是否需要客户端升级。

### `system.ping`

只检查连接，不改变业务。

### `system.snapshot`

返回面向 UI 的 compact projection，不返回 Secret。

### `events.catchup`

输入 `after_cursor` 和上限。事件必须按 cursor 单调递增。

### `control.acquire / renew / release`

V1.0 单 controller。获取失败时 UI 进入只读模式。

## 六、V1.0 方法清单

### 项目和空间

- `project.list`
- `project.get`
- `project.create`
- `project.archive`
- `project.relocate`
- `space.list`
- `space.create`
- `space.updateStatus`

### 远程文件系统

- `filesystem.listRoots`
- `filesystem.listDirectory`
- `filesystem.validateProjectRoot`

返回的是 Core 主机路径，不是客户端路径。

### 角色与绑定

- `role.list`
- `role.get`
- `role.create`
- `role.rename`
- `role.updateStatus`
- `binding.getCurrent`
- `binding.listHistory`
- `binding.prepareReplacement`
- `binding.commitReplacement`
- `binding.abortReplacement`

### 任务、Run 和消息

- `task.list`
- `task.get`
- `task.createFromUser`
- `task.cancel`
- `task.suspend`
- `task.resume`
- `run.list`
- `run.get`
- `run.cancel`
- `run.reconcile`
- `message.listTimeline`
- `conversation.read`
- `conversation.sendUserInput`

### 产物

- `artifact.list`
- `artifact.get`
- `artifact.readChunk`
- `artifact.download`
- `artifact.verify`

### 审批、问题和用户收件箱

- `approval.list`
- `approval.decide`
- `issue.list`
- `issue.acknowledge`
- `issue.resolve`
- `inbox.list`
- `inbox.markRead`
- `result.accept`
- `result.reject`

### 账号与兼容性

- `harness.list`
- `harness.probe`
- `account.listProfiles`
- `account.getStatus`
- `account.switch`
- `quota.listSnapshots`

任何 API 都不得返回密钥、Refresh Token、完整 `auth.json` 或 SSH 私钥。

### 生命周期

- `runtime.getActiveWork`
- `runtime.drain`
- `runtime.pauseDispatch`
- `runtime.resumeDispatch`
- `runtime.shutdownCore`

远程 GUI 退出不调用 `runtime.shutdownCore`。

## 七、能力协商

示例：

```json
{
  "remote_filesystem": true,
  "event_stream": true,
  "controller_lease": true,
  "artifact_types": ["artifact", "external"],
  "reference_types": {
    "git": false,
    "live": false
  },
  "harnesses": {
    "codex": {
      "status": "PROBED",
      "create_session": false,
      "cancel": false
    }
  }
}
```

UI 必须按 capability 隐藏或禁用功能。不能因为 Schema 支持就假设运行时已实现。

## 八、状态投影原则

UI 至少分开：

- `RoleStatus`
- `TaskState`
- `RunState`
- `DeliveryState`
- `AcceptanceState`
- `ConnectionState`

UI 不解析自然语言来改变状态。

示例：

```text
角色运行：WAITING_APPROVAL
任务：ACTIVE
结果：NOT_SUBMITTED
连接：REMOTE_CONNECTED
```

## 九、通知语义

普通通知：

- 持久化；
- 有明确收件人；
- 不自动启动模型；
- 在收件角色页面可见；
- 下一次正常 Run 可由 `route_context(notices)` 按项目规则加载；
- 不产生“收到”业务回执。

## 十、UNKNOWN 对账

`run.reconcile` 只接受明确动作：

- `confirm_native_completed`
- `confirm_no_side_effect_and_retry`
- `mark_failed`
- `reattach_native_session`
- `quarantine_workspace`
- `release_after_manual_verification`

每次必须记录操作者、证据、时间和资源处理结果。

## 十一、版本规则

- 协议名：`agentrouter-client/1`
- 增加可选字段：向后兼容；
- 删除/改义字段：新主版本；
- UIAI 不得自行修改 Schema；
- 需要变更时提交 `Contract Change Request`；
- 生成 TypeScript 类型和 Mock fixtures；
- CI 比较生成文件，防止手工漂移。
