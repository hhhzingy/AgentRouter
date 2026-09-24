# Cloud-ready 工具包(两个本地受限 profile;网页 ChatGPT 接入)

三条连接不同协议,互不混用:**网页 ChatGPT 走 MCP(官方 Secure MCP Tunnel 指向本地 stdio/HTTP 入口)**;
手机/远程 Electron 走 HTTPS/WSS RemoteGateway(本轮按用户指示不执行);Provider API Key 与
Tunnel 运行 Key、device credential 与 participant grant 永远分离。

## Profile A:Control(受限管理,只+写租约)

专用 core 进程 + 管理 MCP。**项目范围由进程环境固定,客户端不可自行声明**(WN04a 语义):

```bat
:: 1) 专用受限 core(新数据根;首次需先建项目则临时不设 scope 建好后重启)
set AGENTROUTER_DATA=D:\ar-tunnel-core
set AGENTROUTER_PROJECT_ROOTS=["D:\ar-workspace"]
set AGENTROUTER_MCP_PROJECT_SCOPE=project_xxxx   :: 逗号分隔的已批准项目 id;未知 id 拒绝启动
node resources\w11-core\core.mjs

:: 2) 管理 MCP(stdio,供 tunnel-client 拉起;同一数据根)
set AGENTROUTER_MCP_PROJECT_SCOPE=project_xxxx   :: 仅作操作员核对标签(服务端范围在 core 上)
node resources\app\management-mcp.mjs %AGENTROUTER_DATA% controller mcp_management_web
```

只读演练:mode 用 `observer`(能协商/读,不增写权)。

## Profile B:Review(参与角色,网页复核)

```bat
:: grant 由管理面签发后放入受控文件(入口不再自签):
::   %AGENTROUTER_DATA%\participant-grant-<role>.json  ({grant_id, token},0600)
set AGENTROUTER_MANAGED_ROLE=1
node resources\app\participant-mcp\http.mjs %AGENTROUTER_DATA% <role_id> --port 8790
:: 首启生成 participant-token-<role>.txt(0600);GET /health 与 POST MCP 分离
```

## tunnel-client 引入顺序(核验→回退目录→最小权限)

1. 只用官方来源;安装前核对来源域、版本、`--help` 输出与发布 hash(操作员在浏览器核对,不落聊天)。
2. 安装到本包可回退目录(如 `D:\ar-tunnel\`),不改系统 PATH 之外的任何服务。
3. 运行 Key 仅存受保护文件(本进程可读),**不出现在命令行参数、日志、截图或聊天**。
4. 先暴露 stdio(默认)或 127.0.0.1:8790;不做 Funnel;撤销=tunnel 停+撤销 grant/重启受限 core。

## 已完成的本地验证(无需用户)

scope 快照/跨项目写拒绝/同 scope 可达、grant 撤销后读失效、request_key 幂等回放与冲突、
坏 token 401、>1MB 413、UTF-8 边界与 body 上限、断线重连不重复创建(测试名见
`tests/integration/mcp-scope.test.ts`、`participant-mcp.test.ts`、`participant-http.test.ts`、
`role-session-gateway-retry.test.ts`)。

## tunnel-client 实测记录(2026-09-17)

- 官方发布物:openai/tunnel-client v0.0.14 windows-amd64;下载包 SHA256 与 release SHA256SUMS.txt 一致(784ab8da…67430f…尾段见本地核验输出)。
- 安装位(可回退):E:AgentRouter.local-protected	unnel-client-v0.0.14;profile 名 agentrouter-review,secrets 全部 file: 引用,Authorization 头由 daemon 注入(ChatGPT 插件 No Auth)。
- doctor:结构项 PASS,唯 tunnel_id 待操作员提供真实值(格式 tunnel_<32hex>)后重跑。

## web-ready

按 `web-ready.template.json` 抄写填写(不含任何秘密值),交回后进入 WN05 演练。
