# ChatGPT 网页操作手册 — 复核角色(Review Profile)

版本:2026-09-17(已按 Secure MCP Tunnel 实际架构修订);对应本地:组合候选 `6e95922` 的
Participant MCP + 官方 `tunnel-client v0.0.14`(windows-amd64,SHA256 已对官方 SHA256SUMS 核验,
安装于 `E:\AgentRouter\.local-protected\tunnel-client-v0.0.14\`,profile 名 `agentrouter-review`)。

## 0. 接入架构(与旧版说明的差异,以此为准)
**ChatGPT Plugin 不再需要任何 Bearer token。**正确分工:
- ChatGPT 连接器:Connection = **Tunnel**,选择本组织的 `AgentRouter Review` tunnel,Authentication = **No Auth**;
- Participant Bearer 由**本机** tunnel-client 以 `mcp.extra_headers` 从受保护文件注入
  (`E:\AgentRouter\.local-protected\web-demo\core\participant-authorization-header.txt`);
- Runtime API key 也仅存本机(`file:` 引用,非明文配置),权限只需 Tunnels Read + Use。
**任何 token/key 都不进入聊天、截图或仓库。**

前置(本机,由助手/脚本维持):受限 Core + Participant 入口(8790)+
`tunnel-client run --profile agentrouter-review` 常驻;健康面 `http://127.0.0.1:8088/healthz|/readyz|/ui`
(仅 loopback,不开 Funnel)。

## 1. 演练脚本(逐条粘贴给 ChatGPT)

**① 身份与收件箱**
> 你现在是本机 AgentRouter 的复核角色。请调用 participant_read_inbox 工具,把返回的任务列表原样转述给我,
> 不要编造任何未由工具返回的内容。

预期:看到一个任务「复核口令nonce」(QUEUED),其中含 nonce WEBDEMO-7QX4。

**② 登记复核产物**
> 请用 participant_register_artifact 登记一个产物:name 为 review-chatgpt.md,
> task_id 用收件箱里那个任务的 id,request_key 固定用 chatgpt-rk-1,
> 内容包含:本任务 nonce WEBDEMO-7QX4、你的复核意见两行、时间。登记后把工具返回的
> artifact_id、sha256、byte_size 原样报给我。

**③ 幂等验证(关键)**
> 完全重复刚才的 participant_register_artifact 调用:同样的 name、同样的内容、同样的
> request_key chatgpt-rk-1,然后再报一次返回的三个字段。

预期:artifact_id/sha256 与第②步**完全一致**(服务端按 request_key 幂等返回原回执,不落第二份文件)。

**④ 篡改防护**
> 再用同样的 request_key chatgpt-rk-1 登记,但内容改成「different content」。

预期:返回错误码 PARTICIPANT_REQUEST_CONFLICT(同键异内容必须拒绝)。

**⑤ 读回核验**
> 用 participant_read_artifact 读取第②步的 artifact(task_id+artifact_id),把返回的
> content、sha256、byte_size 报给我。

预期:content 含 WEBDEMO-7QX4;sha/size 与登记回执一致。

**⑥(可选)WAITING_INPUT 补输入语义**:若将来有任务处于 WAITING_INPUT,可让网页用
`participant_send_user_input`(带 request_key)补输入;当前演练任务不处于该态,跳过即正常。

## 2. 本机对账(你把网页报的字段发我,或自行核对)
- `E:\AgentRouter\.local-protected\web-demo\workspace\agentrouter-artifacts\` 下应只有
  `review.md`(我预登记的)与 `review-chatgpt.md`(演练新产物,**不多不少**)。
- Core 事件/artifact 状态为 AVAILABLE;sha256 由服务端计算,与网页回执一致。

## 3. 安全与边界(务必遵守)
- 不向聊天粘贴 token/grant/key;不把隧道 URL 转发他人。
- 网页角色只拿到这四个工具;管理面(Control)是另一条 stdio 通道,本手册不涉及——网页要改配置/派任务时停下告诉我。
- 同一入口进程绑定单一角色+单一活动聊天约定:多开聊天不保证相互隔离(合同已声明)。
- 演练结束撤销:管理面 revoke grant(或我执行)→ 网页工具调用应报 PARTICIPANT_GENERATION_STALE;
  之后如需再来,重新签发 grant 并重启入口。

## 4. 失败分诊
| 现象 | 处理 |
| --- | --- |
| 连接器连不上 | 本机自查三件套:8790 `/health`(带 Bearer,仅本地诊断用)、tunnel-client `/healthz|/readyz`(127.0.0.1:8088)、profile doctor 全绿;ChatGPT 侧确认 daemon 正在运行期间才做连接器扫描 |
| 工具列表为空 | ChatGPT 宿主未启用工具调用 → 记 BLOCKED_BY_HOST,不换通道硬凑 |
| 401/UNAUTHORIZED | 本机 header 文件与入口 token 不一致(入口重启过)→ 重新生成 authorization-header 并 `tunnel-client run` 重启;与 ChatGPT 无关 |
| PARTICIPANT_GENERATION_STALE | grant 已被撤销/重启再签发 → 正常拒绝,不是故障 |
