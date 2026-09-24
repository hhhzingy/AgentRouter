# C1R1 合同变更决定（CCR）

来源：用户批准的 Codex C1R1 执行包；以下为本轮实现决定，状态均为“实现完成，等待用户复核”。没有收到独立 UIAI CCR，不声称 UIAI 已审查或批准。

| 决定 | 取舍与落实 |
|---|---|
| CCR-C1R1-01 | 保留 C1 哈希；通过可选版本协商增加 21 方法和 VM，旧客户端获得闭合投影 |
| CCR-C1R1-02 | Space 是通信边界；Workspace 独立；跨组角色三类消息全部拒绝 |
| CCR-C1R1-03 | 产品 Plan Schema 保留，AI key 经 Core Mock 转真实形状 ID；Apply 在副本验证后原子换入 |
| CCR-C1R1-04 | 章程 hash/revision 与 Bootstrap 交付记录分开；章程变更新增 Binding epoch，首任务双检 Bootstrap 和模型能力 |
| CCR-C1R1-05 | Preview / Commit 绑定 hash、revision、controller；Drain 后重预览；目标工作区不确定租约也阻断 |
| CCR-C1R1-06 | MOVE 创建关联后继任务，旧任务保留组/规则；所有队列动作显式，不静默迁移等待下属结果的任务 |
| CCR-C1R1-07 | 会话默认新会话交接；原生恢复无认证即拒绝；归档会话不启动，不自动合并 worktree |
| CCR-C1R1-08 | 六模型只是未验证 seed；Runtime 覆盖缓存，消失模型不可自动启动；原生推理枚举由目录提供 |
| CCR-C1R1-09 | 拆组默认结果目标需用户明确处置；completion_to/problem_to 是显式增补字段；合组角色 key 冲突阻断 |
| CCR-C1R1-10 | Workspace API 仅内存元数据；组、权限、Bootstrap、目录均非真实运行支持；W11 后另验 DB/资源锁/Adapter |
