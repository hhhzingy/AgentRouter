# V11-06b 原生压缩优先补充报告

## 结论

在跨 WorkSession 上下文迁移的预算不足分支，ContextMigrationService 现在按以下顺序处理：

1. 调用显式注入、由 Driver/宿主拥有的 NativeCompactionBackend；
2. 用 Driver 返回的目标窗口/使用量重新评估完整 Portable Context；
3. 仍然超预算时，才调用已授权的 ContextCompressionBackend；
4. 没有可用后端或仍不能安全 fit 时阻止迁移。

原生压缩接口只接收 Role、目标 WorkSession、操作标识、迁移模式和预算数字，不接收 Portable Context、Core authoritative state、凭据、hidden reasoning 或 KV。上下文同步游标仍必须等待单独的 native receipt confirmed 才推进。

## 变更

- 新增 NativeCompactionBackend 与 NativeCompactionResult；
- 原生压缩成功后重新计算 FIT/COMPRESS/BLOCK；
- 原生压缩失败可审计并回退到授权的 Portable Context 压缩；无安全回退则阻止；
- 计划内部记录 backend/provider/model 和预算前后数字，Envelope 不暴露这些诊断细节；
- built-in Driver 的 native_compaction 在没有真实探测证据时继续保持 UNKNOWN，不会虚报支持。

## 验证

- tsc --noEmit -p tsconfig.json：通过；
- tests/integration/context-migration.test.ts：2/2 通过；
- tests/integration/context-native-compaction.test.ts：1/1 通过；
- 游标在确认前保持不推进，确认后才推进。


