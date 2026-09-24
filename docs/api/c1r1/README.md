# C1R1 合同修订：待复核

基线 `18c259c9c21f1750b275b27f5d1ed315c7e04f35`，分支 `feat/contract-c1r1`。本轮止于合同（Contract）、生成类型、内存 Mock、夹具（Fixture）与离线验证，不进入 W11。真实 Harness 支持数为 **0**。

入口：`UIAI-只读指南.md`、`compatibility.md`、`CCR决策.md`、`report.md`、`test-evidence.json`；方法全集见 `methods.md`。上级 `freeze.c1.json` 原样保留，新增 `freeze.c1r1.json` 独立锁定。

Space 的产品名称为“协作组”，决定角色通信和未来规则边界；Workspace 是工作区/工作树，两者不能互相替代。一个角色只有一个活跃组；用户不是角色，可查看本项目各组。跨组任务、结果、通知均拒绝。Mock 的 route 测试端口只验证通信边界并记录消息，不模拟关联结果续办或真实工具调用。

执行包已存在条目与清单校验一致；Codex 分包缺少的 UIAI 专用条目逐项记录于 `input-integrity.json`，未伪造整包完整通过。
