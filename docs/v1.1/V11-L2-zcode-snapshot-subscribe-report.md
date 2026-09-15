# ZCode 官方快照与事件订阅修复

开发父提交：a0c7a5d。证据来自只读检查本机官方 zcode.cjs（发行物身份见 runtime-discovery 报告），未启动或修改任何真实会话。

## 新发现

- Wbt 返回完整 snapshot，fse 的身份在 session.sessionId，projection 也包含 sessionId。之前的简化顶层 sessionId 测试不足以覆盖当前发行物。
- Zpn/session.subscribe 设置 legacyStreamSubscribed；参数 xEt 要求 deliveryKind，枚举允许 desktop-continuous 与 web-remote-replayable。
- 不传 afterSeq 时订阅返回空 events 和当前 eventSeq；不能把历史通知当本次输入输出。
- 宿主仍有 ZCODE_SESSION_SAVE_UNSUPPORTED；历史 managed-zcode-inheritance 证据显示会继承工作区 Management MCP。尚未验证无继承边界，因此本次不启动真实会话，也不宣布 fresh 可用。

## 修复

create/resume 统一解析官方快照身份；保留既有实验响应兼容，但多个身份字段冲突时拒绝。Driver 打开会话后先订阅再发送；核验订阅身份、事件序号及空历史响应，以 eventSeq 作为当前事件处理下界。

## 测试分母

官方快照三项修复前 3/3 失败；修复后相关 14/14 通过。
订阅路由用例修复前 1/2 失败；修复后相关 30/30 通过。
随后补意外订阅历史与序号边界两项；最终 6 文件、32/32 通过，TypeScript、规范副本及 migration/EOL、diff 检查通过。

## 验收边界

仅 OFFLINE_PASS，不是 LIVE_PASS。真实宿主保存、Role MCP 隔离/注入、认证可用性、工具产物与取消停止证明仍未完成。未改变旧迁移、冻结合同或用户工作区；未删除文件。
