# USER_ACTION_CARD — 网页 MCP 接入(WN05 演练;无需手机/第二机)

你已确认可人工配合;本卡只做网页 ChatGPT↔本机 MCP,手机跨设备项本轮不涉及。
全程不要向聊天/我粘贴任何 token/key/设备码。

## 准备(约 10 分钟,一次性)
1. 打开 `docs/cloud-kit/README.md`,按 Profile A 起一个**专用受限 core**(建议新建独立数据根,
   项目先建好再带 `AGENTROUTER_MCP_PROJECT_SCOPE` 重启),记录 project id。
2. 用管理面给一个测试角色签发 participant grant(工作台/管理 MCP 均可),确认
   `participant-grant-<role>.json` 落在数据根(0600)。
3. 起 Profile B 的 HTTP 入口(`--port 8790`),`curl http://127.0.0.1:8790/health` 应回 OK。
4. tunnel-client 按 README 核验来源/版本/help 后,把 **Profile B 指向 ChatGPT**(官方 Secure
   MCP Tunnel;运行 Key 只入受保护文件)。
5. 把 `docs/cloud-kit/web-ready.template.json` 复制为 web-ready.json 抄写填写(无秘密值)发回或直接留在仓库。

## 演练 A:Control(只读起步)
- 新网页聊天连接入口 → 让它 `router_status`,把你看到的 `root_alias`/项目别名截图或转述给我核对。
- 通过后再开 controller 模式小动作:查角色→派发一个 fixture 小任务→查结果→`router_control_release`
  (要求:它复述同一 request_key,不自动挤占本机控制器;网页停聊后 5 分钟内租约自然过期)。

## 演练 B:Review(参与角色)
- 先在本机给该角色派一个 WAITING_INPUT 任务或让角色读一个它被引用的产物;
- 网页端要求它:`participant_read_inbox` → `participant_read_artifact`(任务内产物) →
  `participant_register_artifact`(几 KB 复核意见,自拟 request_key 并可重发一次验证幂等);
- 本机核对:产物落盘、sha/回执一致、重发不产生第二份、旧 grant 撤销后网页读也失效(管理面点撤销再试)。

## 我会做的
收到你的 web-ready.json/截图口径后:核对哈希链与回执、跑撤销/迟到写负测、把结果计入
`WN05` 证据;网页拿不到工具/宿主不支持时如实记 BLOCKED_BY_HOST,不伪造动作。

## 失败时只需告诉我
哪一步、界面原话(可截图涂掉敏感列)、大致时间。不需要任何日志导出或凭据。
