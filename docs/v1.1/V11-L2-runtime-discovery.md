# V11-L2：ZCode runtime 发现与传输故障修复

代码基线：`8771189b50f02726e7056dc9463535966e660432`。

## 安装证据

通过活动进程可执行文件路径确认桌面安装为 `E:\software\ZCode\ZCode.exe`。只读文件枚举找到随附官方 runtime：

`E:\software\ZCode\resources\glm\zcode.cjs`

- 长度：12,615,227 字节。
- SHA-256：`e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`。
- 发行物内确有 `app-server`、`session/create`、`session/resume`、`session/send`、`session/stop`、`session/event`、`session/list` 标识。

本次未运行 runtime、未读取认证材料、未改变任何活动进程或已有会话。以上只证明安装入口与方法标识存在，不证明协议版本、事件结构或真实执行成功。

## 故障修复

现有生命周期忽略 `write()` 的 Promise rejection，使调用最终错误地收到 RPC_TIMEOUT，并产生未处理 rejection。现在捕获同步或异步传输失败，统一断开并拒绝等待请求，暴露保守诊断码 `ZCODE_TRANSPORT_FAILED`，不传播传输层原始错误正文。

验证：修复前新增测试 1/1 失败且出现 1 个未处理 rejection；修复后 1/1 通过，TypeScript 和 diff 空白检查通过。

```text
node E:/AgentRouter/node_modules/vitest/vitest.mjs run tests/unit/zcode-transport-failure.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

## 后续约束

需要独立受控数据目录、禁止继承 Management MCP 的配置，再做真实 session 往返与事件规范化。当前没有 ZCode LIVE_PASS。

跨 Harness 源码复核确认：NativeSessionStore 按 WorkSession ID 读取 native ref，按 activation 校验执行 binding；旧 WS 可使用新的执行 binding，但必须保持 Harness/Driver、workspace、native ref 及正确 sessionHome，重新发布最新章程并注册可信 profile。该跨 Harness 公共路径尚未实现。
