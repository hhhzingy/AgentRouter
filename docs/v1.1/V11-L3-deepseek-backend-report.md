# V11-L3 DeepSeek 生产压缩后端接线

开发父提交：ffbd775。此报告记录第一阶段接线，不是 D2/D3 或最终 RC 验收。

## 实现

- 新增 DeepSeekContextCompressionBackend，复用 ApprovedProvider 的 HTTPS 白名单、TLS、限额、秘密过滤和超时，无自动重试。
- owner 配置 contextCompression，经 installLocalNativeRuntime 和 Core daemon 传入 ExecutionCoordinator，再进入 ContextMigrationService；不接受 Renderer/MCP 指定后端。
- 仅发送 Portable transfer entries；引用化大条目不重新塞全量原文。Core authoritative state 不外发、不交模型改写。
- 输出必须完整 stop、单 JSON，含叙述和决策/约束/失败/待办/冲突；来源 seq/hash 必须与输入集合一致。此校验证明来源集合，不证明全语义无损。
- Core 另校验覆盖首尾和最终 envelope 估算预算；失败不准备 receipt、不推进 cursor。
- 请求重新测 wire 字节，后端按 UTF8 字节保守上界限 token 预算；记录 Provider usage、requested/resolved model、输入 hash/字节、输出字节，不记录秘密和正文。

## 离线分母

Backend 八项新测试首次 8/8 通过，未宣称这些测试有修复前失败。
协调器集成首次因 fixture 缺 context state 失败；补齐后复现未传后端造成 CONTEXT_MIGRATION_TOO_LARGE；接线后通过。
边界两项验证最终 metadata 开销和引用化/覆盖错误。最终本组 3 文件、11/11 通过，TypeScript 通过。
测试 DB 保留，不自动清理。

## 真实模型发现

2026-09-15T03:25:51Z，用已有授权文件只读 GET https://api.deepseek.com/models：PASS，返回 deepseek-flash、deepseek-v4-pro。未打印认证头/正文。接口不返回容量，未把模型列表当窗口实测。

[官方模型页](https://api-docs.deepseek.com/quick_start/pricing/) 当前列 deepseek-flash（V4.1 Flash）、1M context、384K max output，旧 deepseek-v4-flash 为转向新版的兼容名；[thinking 文档](https://api-docs.deepseek.com/guides/thinking_mode/) 支持 disabled；[模型列表协议](https://api-docs.deepseek.com/api/list-models/) 为 GET /models。

已加入显式启用的小型真实 Core smoke：tests/live/v11-deepseek-core-smoke.test.ts。通过固定提交后单次执行并追加结果，不以模拟 transport 充当 live。

## 尚未完成

真实 smoke 结果另记；完整语义质量、引用读取工具、大窗口分段、1M token 量级、目标 256K 实际执行和 native receipt 尚未验收。ContextMigration 的通用 token 估计仍为 bytes/4，需替换/校准；原生 wire 限额仍需贯通。连接/响应分别超时、取消/长作业、模型实际窗口边界与 endpoint body 限制仍待补齐。
