# ChatGPT 网页操作手册 — 复核角色(外接角色完整工作环版)

版本:2026-09-17 第二轮(源码 v1.1-final @ 0d92196+本轮工作环提交;bundle 见 `docs/parallel/shared-mcp-checkpoint.json` 的 `workloop_bundle_hashes`)。
接入方式不变:**ChatGPT Plugin = Secure MCP Tunnel(`AgentRouter Review`)+ Authentication = No Auth**;
Participant Bearer 由本机 tunnel-client 注入,任何 token/key 不进聊天、截图或仓库。

本轮新增三个工具,共 7 个:`participant_read_inbox / claim_task / request_user_input / submit_result / read_artifact / send_user_input / register_artifact`。

## 0. 实栈预置(已由本机准备好,勿重复创建)

| 任务 id                                   | 状态                                      | 用途                                                                                                    |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| task_d6ba0023…                            | QUEUED(遗留)                              | 正文含 WEBDEMO-7QX4,仅作收件箱读取证据;其正文写「不要使用其它工具」且 review.md 名已占用,**不要**认领它 |
| task_dd5601c4…                            | DELIVERED+ACCEPTED                        | 本机全链预演已完成的结果(含 result_、产物 artifact_1698ea0b…)                                           |
| task_989880f1-8b5e-4839-a95f-f28f890d4542 | **WAITING_INPUT**(user_input_ready:false) | 本轮 send_user_input 正向测试目标                                                                       |
| task_1271f0f7-028e-4b7e-9e85-f3c11c1cbc44 | QUEUED                                    | 口令 WEBDEMO-7QX4 完整闭环(claim→产物→submit)                                                           |

角色同一时刻只有一个进行中任务:`task_989880f1` 完成前,认领其它任务会得到 `ROLE_BUSY`——这是特性,按下面顺序走即可。

## 1. 演练脚本(逐条粘贴给 ChatGPT)

**W1 结构化收件箱(缺口①证据)**

> 调用 participant_read_inbox,逐任务报告 id、state、waiting_for/user_input_ready、expected、completion,
> 并原样引用两个任务正文中出现的口令。不要采信我口头转述的口令,只认工具返回的正文。

预期:`task_989880f1` 为 WAITING_INPUT 且 `user_input_ready:false`;`task_1271f0f7` 正文含 WEBDEMO-7QX4。

**W2 等待未就绪的拦截**

> 先对 task_989880f1 调 participant_claim_task(request_key 自定)。

预期:`PLAN_STATE_CONFLICT`(用户输入未就绪不能继续)。

**W3 正向 send_user_input(缺口③核心)**

> 我现在以用户身份给你输入:口令 OPT-A-R3。用 participant_send_user_input 提交,
> task_id=task_989880f1…,body=「确认选项A,口令 OPT-A-R3」,request_key 固定 R3SI1,报告返回。

**W4 幂等与异参冲突(缺口③)**

> ① 用完全相同的参数再调一次 participant_send_user_input;② 再用同 request_key R3SI1 但 body 改成「口令改成B」。

预期:①返回与原回执一致(entityId 不变);②报 `OPERATION_CONFLICT`。

**W5 继续推进→产物→提交结果(缺口②③)**

> 1. participant_claim_task(R3 新 request_key)把 task_989880f1 恢复到 ACTIVE;
> 2. participant_register_artifact 登记 answer-r3.md(task_id=989880f1,request_key 自定),内容逐字包含我给你的口令 OPT-A-R3;
> 3. 再读一次收件箱,确认该任务仍是 ACTIVE 且没有 result(产物≠完成);
> 4. participant_submit_result:outcome=succeeded,summary/body 概述按用户选项A完成,outputs 引用该产物,报告完整回执字段。

预期:回执 `state:DELIVERED, publication_state:PUBLISHED, acceptance:PENDING, downstream:{type:user}` + result_id。
acceptance 保持 PENDING —— 你的提交不代替用户验收。

**W6 口令闭环(缺口②复用)**

> 对 task_1271f0f7…:claim → 登记 review-final.md(内容逐字包含收件箱正文里的 WEBDEMO-7QX4)→ submit_result(outputs 引用它)。报回 artifact_id、sha256、result_id。

**W7(可选)产物幂等三件套**:同键重放→同回执 `replayed:true`;同键改内容→`PARTICIPANT_REQUEST_CONFLICT`;再试认领 d6ba0023→`ROLE_BUSY` 或按其正文只做只读(随它,不算失败)。

## 2. 本机对账(你报 W4/W5/W6 字段,我核验后回执)

- DB 账目:两条 participant result 应 `run_id=NULL、publication_state=PUBLISHED`、task.result 消息 outbox=DELIVERED;
- 用户验收门:我对 W5/W6 的 result 执行管理面 `result.accept`,验收位应从 PENDING→ACCEPTED(证明人类批准独立且有效);
- 工作区只多出 `answer-r3.md`、`review-final.md`(与既有 review.md 等共存,不覆盖)。

## 3. 撤销演示(演练完成后由本机执行)

管理面 revoke grant → 网页任意 participant 工具应报 `PARTICIPANT_GENERATION_STALE`;需继续时重签发+重启入口。

## 4. 失败分诊

| 现象                         | 处理                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| ROLE_BUSY                    | 上一顺序正常:先完成 task_989880f1 再动其它任务                                |
| PLAN_STATE_CONFLICT          | 状态机拦截(如未就绪就 claim),不是故障                                         |
| OPERATION_CONFLICT           | 同 request_key 换了内容,正确防护;换新 key 重发                                |
| PARTICIPANT_REQUEST_CONFLICT | 产物幂等账本拦截篡改,正确行为                                                 |
| PARTICIPANT_GENERATION_STALE | grant 已撤销/重签发,正常拒绝                                                  |
| 连接器连不上                 | 本机查 8790 /health(带 Bearer)、tunnel `/readyz`(127.0.0.1:8088)、daemon 存活 |
