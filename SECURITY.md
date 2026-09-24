# Security

## Credential policy

不要把以下内容提交到 Git 或粘贴到公开 Issue/日志：

- API keys
- OAuth tokens
- `auth.json`
- Harness account files
- Remote device tokens
- Participant grants
- `.local-protected` 内容
- 真实用户数据库/项目数据

AgentRouter 发行 ZIP 不携带用户凭据。

## Local trust boundary

Harness 的账号与 provider credential 只应由本地受信配置/loader 使用。

Role、Participant、Renderer 和模型 prompt 不应成为 credential source of truth。

## Remote

Remote Gateway 与本地 Core credential 是不同安全边界。

推荐：loopback Core/Gateway、Tailscale Serve HTTPS/WSS、不使用公网 Funnel 作为默认部署、Controller lease 与 Observer 分离。

## Reporting a vulnerability

请通过仓库所有者提供的私下渠道报告可能包含 secret、认证绕过、任意项目越权、任意文件访问或远程控制问题。

不要在公开 Issue 中发布可用凭据或真实用户数据。

## Repository scans

项目使用仓库敏感信息扫描工具检查 tracked / publication history 范围。

“0 findings”只代表被扫描范围内未发现规则命中，不表示任何未扫描的本机私有 Git ref/object database 都被证明为空。
