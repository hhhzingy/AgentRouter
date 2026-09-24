# DeepSeek Core 真实压缩 smoke

## 首次尝试

- tested_source_sha：66fec77956c0da3559d9021422036fabc185af8e，执行前工作树干净。
- 模式：REAL_CORE_FIXTURE_LIVE_PROVIDER；真实 HTTPS，Core 迁移协调链；没有启动目标 Harness。
- 显式启用 AGENTROUTER_V11_DEEPSEEK_LIVE=1，运行 tests/live/v11-deepseek-core-smoke.test.ts。
- 2026-09-15 11:27（Asia/Shanghai），1/1 通过，无重试。
- 请求模型 deepseek-flash，thinking disabled；授权 Key 仅受信加载，无回显。
- 4 个合成 canary 标识保留，权威状态对象一致，cursor 保持 0。此断言不等于全部语义事实验证。
- Core 审计 input_bytes=29656、output_bytes=1650；input_tokens=7414、output_tokens=413 均是旧 bytes/4 估计，不是 Provider usage。
- input_hash=44953bc3be026892be5ef5f3d69f172ef41cf3336b3f73cc39b574513337bc48；output_hash=96b49e078fc7ca98ae0fadb548fd4e38eadeb5eb4fc2eb0a210ffa90e78c1bb9。
- 本地 DB：E:/AgentRouter/.worktrees/v1.1-context-continuity/.local/tests/case-5xdVtt/router.db（保留，未删除）。

## 计量证据缺口与修正

成功测试的 console 指标未由当前运行器输出；Provider usage 原先仅在内存 attempts 中，未持久化。不能宣称其已完成持久计量验收。
本次补充把白名单 attempt 元数据写入测试 DB 的 application_audit；随后固定新提交再执行一次，分别记录，不覆盖第一次分母。

## 范围

## 第二次：持久计量验证

- tested_source_sha：40c592977da7faba2b429bde0477091b2d914fba；工作树干净，11:29（Asia/Shanghai）。
- 1/1 通过，无重试。累计两次真实压缩调用均通过；第二次是修复计量持久性后的验证，不覆盖第一次证据。
- 本地 DB：E:/AgentRouter/.worktrees/v1.1-context-continuity/.local/tests/case-My8nwu/router.db。
- ContextCompressionProviderAttempt：requestedModel=resolvedModel=deepseek-flash；inputBytes=32594（真正完整请求）；outputBytes=1600；providerInputTokens=8344；providerOutputTokens=514。
- 本地输入上界=32594，方法 UTF8_BYTE_UPPER_BOUND，与 Provider 实际 usage 分开记录。
- wire inputHash=dbc06115540f29dca3d8c508e059a224de83770459629bfcf8a67662bf2e72e7。
- Core 原始 Portable 输入=29656 字节；摘要 hash=68ec6dedf3d876d80c8090590c2a37afe0419a35d33b17941a8d67e2035fde95。
- 包含 Provider 安全边界的相关离线回归：4 文件、24/24 通过。未跑全仓/打包验收。

## 当前范围

仅小规模压缩 smoke。窗口容量仍依赖官方文档，未做边界探测；1M token 来源、分段、语义覆盖、引用读取、最终 256K 原生目标与 receipt 均未验收。不是整体验收或发布许可。
