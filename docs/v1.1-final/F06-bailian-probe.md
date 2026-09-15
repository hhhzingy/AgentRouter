# F06 DUT 探测结果（真实分母，不伪造）

日期:2026-09-15 · 工具:`tools/v11-bailian-probe.mjs` · 源:`账号信息/通用API/百炼.txt`（受信加载器读取;未把任何疑似秘密打印到终端/Git/模型上下文）

## 结论:kimi_code / zcode / deepseek_harness / pi 的百炼 DUT = `BLOCKED_PROVIDER_BINDING`

指定百炼文件的实测结构指纹（脱敏,仅形态不含值）:
- 3 行文本,均含空格,非 `key=value` 结构;
- 未发现 `sk-` 前缀令牌、未发现 hex/AKID(`LTAI`)形态、未发现可机读的 OpenAI 兼容 API Key;
- 其中含一个阿里云 **MaaS 专用工作空间**端点主机 `ws-….cn-beijing.maas.aliyuncs.com`。

探测脚本按 §4/§6 规则:先尝试 `/compatible-mode/v1`、`/v1`、原 `/v1` 三种 base 的 `/models`;因**无可解析密钥**,在 chat 之前即判 `KEY_CARDINALITY=0` → `BLOCKED_PROVIDER_BINDING`。

## 为什么不继续（依据执行包）
- §4/§6 明令:"不得凭‘百炼’猜 endpoint 或模型";"某 Harness 无法用该 API 官方配置路径时,结果是 `BLOCKED_PROVIDER_BINDING`,不是切到另一账号或用自制 chat wrapper 冒充"。
- 该文件当前是散文式说明/文本,不含可直接机读的密钥令牌;把散文当 Bearer 发送既不正确也可能触发非预期外部调用,违反"不把秘密放明文参数/不擅自猜"。
- 因此**不**切回旧 DeepSeek/Kimi 凭据冒充成功(那正是被禁的静默 fallback),也不伪造 DUT PASS。

## 需要用户澄清的单一问题（不需要你把密钥贴进对话！）
为把百炼矩阵接上,请二选一(任选安全的一种即可,勿在聊天中粘贴 secret):
1. **把百炼凭据改成可机读单行格式**:在 `百炼.txt` 内用一行 `sk-<密钥>`（或工作空间 token 单独成行、无空格无解释文字),端点 URL 另起一行。我可重新探测(仍是 1 chat + 1 tool-calling 的最小用量)。
2. **告知该 MaaS 工作空间的鉴权方案**(例如:是否需 AccessKey ID+Secret 走签名,而非 Bearer;或专用 workspace 的 API-Key 头部名称),据此我调整探针的官方配置路径,再测。

在澄清前:F06/F07 的百炼 Harness DUT 与生产为 `BLOCKED_PROVIDER_BINDING`;不阻塞其它可自主完成的收敛工作(F02/F03 核心重构、F04 余下网关、F05 桌面/打包)。

## Codex 不受此影响
矩阵中 Codex 保留既有 DUT/生产方式(不涉百炼);其准入独立评估,不因百炼阻塞。
