继续 feat/v1-finalization-j3 当前分支。新增工作项 J3-MCP-01。

先实现 AgentRouter Management MCP，适配当前开发 Codex，让你可以通过 MCP 直接查看、编排和调试真实 LOCAL_CORE。不要等待完整 Windows ACL/Job/出网认证全部完成；这些继续优化，但用户已接受 LIMITED_ISOLATION 下的小任务实际环境调试。

硬要求：
1. Management MCP 与现有 RoleBridge 分离。RoleBridge=run-scoped角色工具；MCP=management controller/observer。
2. MCP只走现有 AgentRouter Client API；不直连SQLite、不import ApplicationService绕合同。
3. 第一版使用STDIO。
4. 当前开发Codex hzxpro认证/进程不动；切号最后独立DUT。
5. AgentRouter管理的Codex Role必须使用独立CODEX_HOME，绝不能继承Management MCP。
6. 不把API Key/auth.json/Cookie/Core credential放入Codex MCP env、Prompt、输出、Git或evidence。
7. 写工具需要稳定request_key并映射operation_id。
8. 首轮用真实LOCAL_CORE+SQLite+专用smoke project，不用Fixture Core；先不要求真实Harness。
9. MCP smoke成功后，把当前开发Codex实际配置连接到MCP，用router_status/role/task/result自行调试Route。
10. 加External API Registry，只允许调用已登记profile/action，禁止任意URL/Authorization代理。
11. 完成后继续J3真实Harness：pi+DeepSeek -> Kimi -> Codex，并用Management MCP创建/派发/观察真实任务。
12. 角色间消息仍必须由真实Role-scoped tools完成，不能用Management MCP伪造。
13. SSH继续暂缓；真实账号切换最后。
14. 能安全自动完成的步骤连续推进；只有真实Secret泄漏、授权外破坏、未登记出网、未知副作用重复风险或将触碰hzxpro时硬停止。

每批汇报：源码SHA、MCP SDK/transport、实际Core/Mock、实际Codex MCP调用证据、request_key幂等、风险和真实Harness认证状态。不要把MCP成功冒充Harness认证。
