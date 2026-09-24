# V11-01 Inventory/ADR 阶段报告

## 结果

- Baseline SHA：`338fcffc001a5ed8e93c00051605f7c6e4eea74a`
- Previous stage commit：`688eece`（V11-00 baseline）
- Stage：`V11-01`
- Branch：`feat/v1.1-context-continuity`
- Worktree：`E:\AgentRouter\.worktrees\v1.1-context-continuity`
- 结果：PASS；完成源码/迁移/测试/Driver/UI/MCP inventory 与 ADR，未写入 migration。

## 交付物

- `docs/v1.1/inventory.md`：V1.0 当前实现、缺口、冻结边界和后续闸门。
- `docs/adr/0008-v1.1-context-continuity.md`：Role、WorkSession、activation epoch、Context sync、Driver capability、压缩安全和 handoff 拆分决策。

## 关键结论

- Role 可作为长期身份；现有 `role_sessions` 已有一个 Active 唯一索引，但 `binding_id/binding_epoch` 仍是执行授权镜像，不能当永久 WorkSession 绑定。
- 现有 WorkSession handoff package/ACK/ACK gate 是运行时产品路径，V1.1 必须移除；task `completion.mode=handoff` 是独立业务语义，必须保留。
- `conversation_items`、Artifact refs 和现有 Core state 可复用；需要追加 append-only Context index/head/state、source/hash 去重、target-source 排除和 receipt-confirmed cursor，不使用 Vector DB。
- Driver 尚未暴露统一 history/capacity/usage/compaction/model-switch 能力；下一阶段必须以证据标注 UNKNOWN/UNSUPPORTED/VERIFIED，不能从 open/resume 代码过度推断。
- V1.0 的升级夹具/回滚测试已存在并通过审计；写 011 前仍须补齐 V1.1 连续性字段、旧 handoff 只读、Active/epoch 和数据保留的升级/回滚断言。

## 门禁与兼容性

- `001—010` migration 字节、migration manifest 和冻结合同：未修改。
- 数据库 migration 写入：0。
- 活动 Codex/ZCode 会话、认证和用户凭据：未触碰。
- 本阶段未运行真实 Harness、SSH、Electron packaged 或需要用户认证的测试；这些限制不被本报告扩大解释为生产能力。
- 文档未包含 Secret、hidden reasoning、KV 或 native session 内容。

## 下一步

V11-02 先提交 V1.0→V1.1 upgrade fixture、失败回滚、幂等和数据保留测试，再追加 011 identity/continuity metadata；完成并验证后才允许写入下一条 migration。
