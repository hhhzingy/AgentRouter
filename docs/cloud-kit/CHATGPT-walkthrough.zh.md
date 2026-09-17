# ChatGPT 网页操作手册 — 复核角色(Review Profile)

版本:2026-09-17;对应本地服务:组合候选 `6e95922` 的 Participant HTTP 入口。
本手册假设你已跑 `start-web-demo.ps1`(本地 Core + 参与者入口已在 `http://127.0.0.1:8790/mcp`)。

## 0. 一次性接入(操作员在 ChatGPT 里做,约 3 分钟)
1. 用官方 Secure MCP Tunnel 把 ChatGPT 连接器指向本机 `http://127.0.0.1:8790/mcp`
   (tunnel 客户端核验来源/版本/help 后安装;不做 Funnel)。
2. 连接器鉴权里填 Bearer token:值从受保护文件读取
   `E:\AgentRouter\.local-protected\web-demo\core\participant-token-role_027d5887-7355-4c0f-b923-8bd9aec7eda3.txt`
   ——**只填进连接器配置界面,绝不粘贴到聊天里**。
3. 连接成功后,聊天里应能看到四个工具:`participant_read_inbox`、`participant_read_artifact`、
   `participant_send_user_input`、`participant_register_artifact`。看不到工具=宿主未启用 MCP,停下记录现象即可。

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
| 连接器连不上 | 检查本地两窗口是否存活;`curl http://127.0.0.1:8790/health -H "Authorization: Bearer <文件里的token>"` 应回 PARTICIPANT_HTTP_OK |
| 工具列表为空 | ChatGPT 宿主未启用工具调用 → 记 BLOCKED_BY_HOST,不换通道硬凑 |
| 401/UNAUTHORIZED | token 填错或入口重启后重新生成了文件 → 从上面路径重读 |
| PARTICIPANT_GENERATION_STALE | grant 已被撤销/重启再签发 → 正常拒绝,不是故障 |
