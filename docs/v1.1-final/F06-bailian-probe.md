# F06 DUT 探测结果（真实分母，不伪造）

日期:2026-09-15 · 工具:`tools/v11-bailian-probe.mjs` · 源:`账号信息/通用API/百炼.txt`（受信加载器读取;未把任何疑似秘密打印到终端/Git/模型上下文）

## 更新(用户澄清格式后):Provider 绑定门禁 **PASS**

用户说明文件为标签格式:`base_url (OpenAI)` / URL / `api_key` / 值 / `model` / 值。探针按此解析后实测:
- 端点:`https://ws-55o4wbmp37sbapc0.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`(openai-compatible)
- `/models` → 200,**251 个模型**(含 glm-5.3、deepseek-v4.1-flash、qwen3.8-max-0902、stepfun/step-3.7-flash、vanchin/deepseek-v4-pro 等)
- 标注模型 `qwen3.8-flash`:**chat PASS**;**受控 tool-calling PASS**(探测脚本两处笔误已修:toolCalled 引用、无 key 时的旧 sk- 解析)
- 结论:百炼 provider 绑定门禁通过 → 可进入各 Harness 的 DUT 绑定与短 DUT 流程(§4:再做流式与 Harness 调用)
- 用量纪律:本轮共 2 次 chat + 2 次 tool-calling 探测(修笔误前后各一轮),无批量/循环调用

## 原始结论(格式澄清前,保留作分母史)

指定百炼文件的实测结构指纹（脱敏,仅形态不含值）:
- 3 行文本,均含空格,非 `key=value` 结构;
- 未发现 `sk-` 前缀令牌、未发现 hex/AKID(`LTAI`)形态、未发现可机读的 OpenAI 兼容 API Key;
- 其中含一个阿里云 **MaaS 专用工作空间**端点主机 `ws-….cn-beijing.maas.aliyuncs.com`。

探测脚本按 §4/§6 规则:先尝试 `/compatible-mode/v1`、`/v1`、原 `/v1` 三种 base 的 `/models`;因**无可解析密钥**,在 chat 之前即判 `KEY_CARDINALITY=0` → `BLOCKED_PROVIDER_BINDING`。

## 为什么不继续（依据执行包,历史段）
- §4/§6 明令:"不得凭‘百炼’猜 endpoint 或模型";"某 Harness 无法用该 API 官方配置路径时,结果是 `BLOCKED_PROVIDER_BINDING`,不是切到另一账号或用自制 chat wrapper 冒充"。
- 该文件当前是散文式说明/文本,不含可直接机读的密钥令牌;把散文当 Bearer 发送既不正确也可能触发非预期外部调用,违反"不把秘密放明文参数/不擅自猜"。
- 因此**不**切回旧 DeepSeek/Kimi 凭据冒充成功(那正是被禁的静默 fallback),也不伪造 DUT PASS。

## Harness 绑定注意（进入 F06 各项）
- pi 的模型目录本就含 `model_dashscope_qwen3_8_flash`(harness pi)——qwen3.8-flash 走 pi 是目录内组合;
- 但仓库的 profile 准入门禁(NATIVE_PROFILE_NOT_SUPPORTED)目前把 pi 锁在 agentrouter-deepseek/deepseek-v4-flash;
  绑定百炼/qwen3.8-flash 需按正式路径扩展该门禁与 pi provider 配置(受信 loader 注入),不是改死代码绕过;
- kimi_code/zcode/dsh 的百炼绑定须各自核实官方 provider 配置路径;失败记 BLOCKED_PROVIDER_BINDING,不冒充。
- Codex 不受此影响(既有方式)。
