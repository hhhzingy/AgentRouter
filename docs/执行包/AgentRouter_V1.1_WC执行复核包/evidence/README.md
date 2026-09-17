# evidence 说明

三份均为 `tools/test-j3-production-pi.mjs --live` 真实运行产出的 report.json（DUT 副本数据目录工件），
已核验不含密钥字段（sk-/api_key/Bearer 扫描为 0 命中）。

- `dut-kimi-bailian-pass-42.json`：kimi→百炼 qwen3.8-flash 主任务闭环
  （bootstrap DELIVERED → route_finish → PUBLISHED summary=42，含 MCP 同 key 幂等检查）。
- `dut-zcode-bailian-pass-42.json`：ZCode→百炼同口径闭环（WC02 修复链完成后达成）。
- `dut-kimi-flaky-fail-sample.json`：kimi 抖动失败样例——status=FAIL/run=SUCCEEDED/
  error=TASK_RESULT_NOT_VERIFIED，即"回合原生结算但模型未调用 route_finish"，
  与 known-limitations 中 K2.7 session/load 后偶发不执行任务指令一致。

复核者若需重跑（付费、使用本机凭据文件，勿在共享环境执行）：

```
node tools/test-j3-production-pi.mjs --live --kimi-bailian
node tools/test-j3-production-pi.mjs --live --zcode
node tools/wc02-zcode-warm-probe.mjs --live
```

产物落 `.local/j3-production-pi/run-*/report.json`；本包不收集 .local 工件除以上述取样。
