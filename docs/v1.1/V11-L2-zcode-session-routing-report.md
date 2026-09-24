# ZCode 原生会话路由与发送字段修复

基于 `3cd9108659a085de85563a0c816357e254652da0` 开发；基线 `1349652a7b92c19776651d9a5725bc13ab20af97` 已通过祖先检查。

## 官方发行物证据

只读检查已安装的 `E:/software/ZCode/resources/glm/zcode.cjs`，未运行或修改桌面会话、认证、配置。
发行物身份见 V11-L2-runtime-discovery.md。

- `kEt` schema：session/resume 接收 sessionId，返回 session snapshot。
- `$pn` 实现：通过 Owt 加载指定会话，再返回 E2 snapshot；不应以 create 替代 resume。
- `OEt` strict schema：session/send 必须使用 content，可带 inputId；message 不在协议字段内。
- `Kpn` 实现读取 content，并向后台 prompt 传入 inputId。

## 修复范围

Driver 对已绑定原生 session 调用 resume，并校验返回 sessionId；不允许错配后 fallback create。
发送使用 content/inputId，绑定本次 run 身份；不据发送响应推断持久上下文确认。

## 测试分母

- 新增 session-routing 两项：修复前 2/2 失败（错误 create、错配未拒绝）。
- 首次相关回归：22 项中 21 通过、1 失败；旧 lifecycle 测试将错误 message 字段固化为断言。依据上述官方 strict schema 改为 content/inputId，不删测试。
- 修正断言后复跑：4 文件、22/22 通过；TypeScript、规范副本/领域依赖检查、migration manifest/EOL 与 diff 检查通过。

## 未完成

本阶段仅是 OFFLINE 协议接线验证，不是 LIVE_PASS。事件规范化、Role MCP 隔离、新受控进程 fresh 保存、真实恢复/取消与原生 history 对账仍需完成；未启用未经验证的 fresh 能力声明。
