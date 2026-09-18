# Web Participant 演练证据链(脱敏)— CHATGPT_PARTICIPANT_VERIFIED = PASS

日期:2026-09-17 → 2026-09-18。全部数值为非秘密 ID/哈希/状态;token/key/header 不在此文件。
证据实物保留位置(不删):`E:\AgentRouter\.local-protected\web-demo\`(core/router.db、workspace/agentrouter-artifacts/_、_.out.log、pointers*.json)。

## 1. 接入链(Tunnel)

- 官方 tunnel-client v0.0.14+0f870e5(profile `agentrouter-review`,SHA 对官方 SHA256SUMS 核验),tunnel `AgentRouter Review`(tunnel_6aaba2b3…),仅 loopback 健康面 127.0.0.1:8088。
- ChatGPT Plugin = Connection: Tunnel + Authentication: No Auth;Participant Bearer 由 daemon `mcp.extra_headers` 注入(file: 引用)。
- daemon 日志:`mcp session initialized`(protocol 2025-11-25,serverInfo agentrouter-participant 1.1.0)、`tunnel metadata fetched`、`readyz=ready`。
- 工具目录传播诊断(2026-09-17):本地入口 PID 48380 / 21:58:11,bundle sha256 b97928b5…5902 @ 提交 5594553,运行目录 hash 1f66380d64ddf9e69c679bfce1b1b217a06788b12c9b0b61233d4cf355f1e424;ChatGPT Refresh 后仍显旧 4 工具 ⇒ OpenAI 连接器侧 schema 快照,重建连接器条目后 7 工具可见(v2 生效)。

## 2. 工具与目录

7 工具:read_inbox / claim_task / request_user_input / submit_result / read_artifact / send_user_input / register_artifact。
catalog hash(规范 JSON):`1f66380d…f1e424`(本地实测=台账记录)。

## 3. 结构化收件箱与任务正文(缺口①)

- inbox 逐任务返回 id/state/summary/body/inputs(name+sha+bytes)/expected/completion/problem_target/acceptance/waiting_for/user_input_ready/result。
- 口令不从聊天提供:round4 任务正文内嵌 `WEBDEMO-7QX4`,经 inbox body 读出并落入 review-final.md(sha c8fcded9…14d1,407B)。

## 4. WAITING_INPUT 往返(缺口③)

- task_989880f1… 经用户路由创建 → claim → request_user_input → WAITING_INPUT(user_input_ready:false)。
- 网页 send_user_input(口令 AR-WEB-R3-9K7M)→ ready:true → claim 恢复 ACTIVE(wait ready 清零)→ 产物逐字承载口令 → submit_result。
- 幂等/冲突(本机预演+网页路径):同键同意图=原回执;同键异参=OPERATION_CONFLICT;未就绪 claim/submit=PLAN_STATE_CONFLICT。

## 5. 产物/结果账目(缺口②;全部 DELIVERED/PUBLISHED,acceptance=PENDING)

| 轮         | task                       | artifact                             | sha256 前 16     | bytes | result                                                   |
| ---------- | -------------------------- | ------------------------------------ | ---------------- | ----- | -------------------------------------------------------- |
| R1(旧目录) | task_d6ba0023(遗留,未认领) | artifact_17c091f9(review-chatgpt.md) | dc16c810056572bf | 508   | —(register/replay/conflict/read-back 6/6)                |
| 本机预演   | task_dd5601c4              | artifact_1698ea0b(rh-answer.md)      | 1b03fb24a6d100f7 | 61    | result_dde8db57(后经管理面人类 result.accept → ACCEPTED) |
| R3 网页    | task_989880f1              | artifact_d8e8e639(answer-r3.md)      | 55e1d84dc10fedf7 | 260   | result_21e2c9ec                                          |
| R4 网页    | task_1271f0f7              | artifact_7f1d2677(review-final.md)   | c8fcded9b32e71a8 | 407   | result_2b1aaa14                                          |

对账(2026-09-18,只读):恰 5 artifacts(每名一份)、3 results(每任务一条,run_id=NULL,task.result outbox 全 DELIVERED),无重复;两轮网页结果 acceptance 保持 PENDING——AI 提交≠用户验收。

## 6. revoke 收尾(2026-09-18)

- 管理面撤销唯一 grant pgrant_cf8fd821…(generation 1)→ REVOKED。
- 本地预演:原 header 调 inbox → PARTICIPANT_GENERATION_STALE。
- 网页最终验收:participant_read_inbox(读)与 participant_claim_task(task_1271f0f7,request_key `chatgpt-revoke-claim-1`,写)均 → PARTICIPANT_GENERATION_STALE,无副作用。
- 备注:participant_register_artifact 额外负测被 OpenAI 平台安全检查在到达 Router 前拦截,按事实记为非 Router 证据;claim 为实际到达 Router 的写路径证据。
- 未动:Tunnel、runtime key、token 文件、演练数据(DB/产物/日志);未执行任何新的 result.accept。

## 7. 裁决

**CHATGPT_PARTICIPANT_VERIFIED = PASS**(v1 旧目录 6/6 + v2 全链 + revoke 双路径)。Participant 演练完结,不再重复;后续缺口转入 SC2 remaining_code(zcode transfer live run / warm session 驻留 / cross-harness inherit)。
