# V11-L2 真实新会话失败定位与客户端协议修复

日期：2026-09-15；修复提交：`c838001fbc499ca4a422a55758d83ff9824b5dd7`。真实探测均执行于其提交前工作树，不冒称干净 SHA 的 RC 验收。

## 两次真实创建尝试（全部失败分母）

1. 新独立 HOME、Git 边界工作目录，关闭插件/hooks、标题生成，MCP/工具列表为空，不发送 prompt。session/list 通过；session/create 返回 -32022，PID 53056，证据目录 `.local/zcode-isolated-probes/list-kkH86n`。官方日志与源码证实这是反向 session/requestRuntimePreferences 超时，并非仅凭同号 MCP 枚举推断的“不支持协议版本”。
2. 补齐反向请求响应后，session/list 与客户端请求单元测试通过，session/create 返回 -32603，PID 56736，目录 `.local/zcode-isolated-probes/list-pB3Lo0`。官方日志依次进入 create_record、app config、plugins completed 后失败；错误为 Model config is missing，要求配置显式 model provider。偏好请求超时已消除，未重试同一未改变条件。

两次均只停止并等待本测试的 app-server 退出；未发 prompt，没有读取/复制开发认证或已有对话。保留所有测试目录。空工具列表不是已验证的完整隔离，也未监测所有潜在网络访问，不将这些探测标成受管 Role PASS。

## 修复

Lifecycle 对 session/requestRuntimePreferences 返回明确策略：memoryEnabled=false、nativeSearchEnhancementsEnabled=false、askUserQuestionAutoResolutionEnabled=false。其他有 ID 的反向请求返回 -32601，不默许交互或自动审批；写失败仍断开。该修复解决先前静默忽略服务器请求导致 create/resume 超时的问题。

新增 live create 场景仍保留真实失败断言；仅显式设置 AGENTROUTER_V11_ZCODE_ISOLATED_PROBE=1 才运行，不能将默认 skip 当作通过。普通七文件 22/22、类型检查、lint、migration manifest/EOL、三套 freeze、diff 与提交敏感扫描通过。

## 下一步与全局范围

原生桌面登录不等同于独立 app-server 已获得 model provider 配置。仍需核实官方 workspace/provider runtime 接口与受管宿主的合法认证路径，不复制 refresh token，不用 pi+GLM 或 Management MCP 冒充 ZCode。该链路未完成；DeepSeek 1M-token→256K、实际 preflight/receipt、GUI/手机部署及固定候选仍在完整执行范围内，不因此取消或缩小。
