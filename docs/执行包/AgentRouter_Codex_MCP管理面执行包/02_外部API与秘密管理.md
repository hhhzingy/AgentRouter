# External API Registry

禁止暴露 `http(url, headers, body)` 之类任意代理。

数据模型：
- ApiProfile: id/displayName/adapter/allowedHosts/secret_ref/enabled
- ApiAction: id/inputSchema/method+path模板/outputRedaction/timeout/sideEffect/idempotency

MCP：
- router_api_list
- router_api_describe
- router_api_call(profile_id, action_id, args, request_key, confirm?)

规则：
- Secret由Core/broker插入；
- MCP永不返回API Key、Cookie、Authorization；
- 模型不能自定义Host或认证头；
- READ_ONLY可按策略直接执行；
- WRITE/DESTRUCTIVE采用preview/confirm；
- 原始HTTP正文不自动进入Git/evidence。

用户的“通用API”以后可导入为Profile，但只由受信任本地Importer/Broker读取；MCP只看到Profile别名。
