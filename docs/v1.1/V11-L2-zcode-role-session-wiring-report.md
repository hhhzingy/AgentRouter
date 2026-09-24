# V11-L2 ZCode Role MCP 与会话保存接线

日期：2026-09-15；固定源码 SHA：`cc30a2312b155c2b01472f8dc1c4d058c916c720`。

## 修复

ZCode owner 运行时配置现在校验 Role bridge 绝对路径及 hash，再签发本次桥令牌；将唯一显式 agentrouter-role MCP 配置传给宿主进程结构。Driver 把该配置传给 session/create 与 session/resume。会话引用由既有 NativeSessionStore 加载、保存，保存沿用 binding/activation/key/isCurrent 防护，替换固定 ZCODE_SESSION_SAVE_UNSUPPORTED 抛错。

本机官方发行物 `E:/software/ZCode/resources/glm/zcode.cjs` 的只读静态提取显示 create/resume schema 均支持 mcpServers 数组，i3e 转换器接受 name/command/args/env 结构。本轮未启动该发行物，没有读写用户认证或现有会话。

## 测试分母与边界

第一次运行五个 ZCode/dsh 生命周期测试文件，18/18 通过；类型检查通过。提交后在上述固定 SHA 再次 18/18 通过，无失败测试尝试。新增两项分别检查 create/resume 的 Role MCP 参数传递；既有错配拒绝、事件规范化、传输失败及原生 snapshot 解析测试继续通过。

lint、migration manifest/EOL、C1/C1R1/C1R1P1 freeze、diff 检查及提交敏感内容扫描通过。没有运行会自动删除目录的旧 native-session-store 测试。

这些测试使用模拟协议响应，并不证明官方进程实际保存/恢复、Role 工具执行、fresh 任务、取消停止证据或认证成功；宿主保存接线仍需要后续真实端到端证据。

## 未解除的安全前提

显式传入 Role MCP 不等于禁用 runtime 的用户/祖先目录/插件 MCP。静态发行物仍包含 project config 加载逻辑，历史记录已发现祖先 Management MCP 继承风险；本轮不因此启动真实 ZCode。需要先验证不继承 Management MCP 的隔离配置，再在独立新会话做真实角色测试。supportsFreshSession 尚未启用，不能宣称 fresh 任务闭环完成。

本报告不改变全局验收状态。账号切换 EXCLUDED_BY_USER；不合 main、不 tag/release。
