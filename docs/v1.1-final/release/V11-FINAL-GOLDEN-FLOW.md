# V1.1.0 Windows 真实黄金链复核（最终产品 SHA：a76ca27）

结论：`PARTIAL`。本文件依据 [完整收口复核](V11-FINAL-CLOSEOUT-20260924.md)；不把多个隔离 Core 数据集拼接为一条已通过的链。Codex→ZCode 完整历史迁移已明确移至 V1.2，不作为 V1.1 阻断。

| 黄金步骤 | 实测事实 | 裁决 |
|---|---|---|
| 最终干净包、全新 ZIP 解包 | manifest `1.1.0/a76ca27/sourceDirty=false`；Core/SQLite/pipe、重启后 Project 持久化；解包 Electron 成功连接隔离 Core | PASS |
| 同项目原生 Artifact→Result | `AR_V11_FINAL_20260924_102508` 的原生 Run `SUCCEEDED`、Artifact bytes/hash 可读，但当时 `route_finish` 参数错误，原 Task 没有 Result，保留 `NEEDS_ATTENTION` | PARTIAL |
| 同项目重试 | 新建隔离原生 Role 的 Bootstrap 为 `FAILED/BOOTSTRAP_ACK_MISSING`，新 Task 仍 `QUEUED`；未删除原失败对象 | FAIL；不得冒称补齐 |
| Codex、ZCode 完整链 | 修正提示后，在各自隔离新 Core 上 Bootstrap、`42/PUBLISHED`、输入→输出 Artifact、下载哈希 PASS；不是上一行同一 Task | PASS（分段） |
| Evidence 和 Request Changes | ZCode 真实 Result 上 Controller-attested Evidence、同 operation id 幂等、原件保留与唯一 follow-up PASS | PASS（独立数据集） |
| ChatGPT Work Web Participant | 同一 `AR_V11_FINAL_*` 项目，`W2` BOUND；join/identity/claim/read Artifact/submit Result 完成，`WEB_VERIFIED:FINAL_NATIVE_2edafa43` 已发布 | PASS |
| 实体手机 HTTPS/WSS | 首次空 scope 返回空视图为正确权限行为；撤销后显式限定测试 Project 重配，iPhone 显示 1 Project/3 Role/目标 Result；手机 Request Changes 后 Core 确认 `REJECTED`、原件仍 `PUBLISHED`、唯一后续 Task | PASS；操作期间曾有冲突/断连提示，必须保留 |
| 后续 Result 来源 | follow-up 已交付，**由原生 Codex Run 执行**，不是网页 Participant 再次处理；测试 Role 同时具有 Native 绑定与 Web Slot | 不计网页二次 PASS |
| Electron 六页人工链 | 最终解包已核对 Projects、Workbench、Results/Detail、Core/Host/Controller 显示；没有在同链通过桌面 Request Changes、New WorkSession 等全部动作 | PARTIAL |

因此 Golden Flow 不能签为 PASS，发布裁决仍 BLOCKED；若接受缩减范围，应由发布负责人明确签收风险。
