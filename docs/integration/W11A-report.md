# W11A 阶段报告

## 已实现

从 S0/B0 继续实现实际持久化 Application Service、SQLite 增量迁移、独立 Windows Core、Fixture 子进程监督和桌面 LOCAL_CORE 接线。详见 `W11A-core-ready.md` 与 ADR-0006。没有修改旧 001 基线或 C1/C1R1/P1 冻结合同，没有扩展 Harness 支持等级。

## 已测试

本地 `node tools/check-w11.mjs` 退出 0：22 个测试文件、123 条通过，含原有 91 条。合同生成/冻结、类型、安全扫描通过；真实 Electron PREVIEW_MOCK 2 项、LOCAL_CORE 生命周期 4 项通过。SQL 应用层测试与真实进程测试分层列出，不将对象重建测试冒充进程重启。

| 验收项 | 已验证行为 | 实际证据层 | 结果 |
|---|---|---|---|
| C-01 | SQL 迁移/备份/校验拒绝；真实进程第二实例拒绝 | w11-store + w11-process | PASS |
| C-02 | 连接绑定路径句柄，实际目录项目创建 | w11-application + w11-process | PASS |
| C-03 | SQL 原子配置与真实 Core 故障回滚 | w11-application + w11-process | PASS |
| C-04 | 初始化失败保留 APPLIED 和 PAUSED | w11-process | PASS |
| C-05 | 独立 Bootstrap 获取资源，不依赖业务 Bootstrap 门槛 | w11-process | PASS |
| C-06 | Bootstrap 不改 PAUSED；未验证模型拒绝业务派发 | w11-process + w11-application | PASS |
| C-07 | 完整 request、sender=user 和明确结果目标 | w11-application + w11-process | PASS |
| C-08 | A→B→C→用户，无发起者抄送 | w11-process | PASS |
| C-09 | 同角色 FIFO、原任务 CONTINUATION、RESULT_HANDLING | w11-process | PASS |
| C-10 | HELD 至 terminal+子进程退出后发布；重复事件去重 | w11-process | PASS |
| C-11 | 跨组任务/结果/notice 拒绝；同组 notice 不唤醒 | w11-process + w11-application | PASS |
| C-12 | 同物理目录互斥、异目录并行、合成 AuthUnit 限流 | w11-process | PASS |
| C-13 | 丢响应→kill/restart→同操作重放只一项任务 | w11-process | PASS |
| C-14 | 半帧和 kill Core 后 UNKNOWN/资源隔离保留 | w11-process | PASS |
| C-15 | 一致 SQL 快照、订阅窗口缓冲、cursor 去重/catchup | w11-application + P1 transport | PASS |
| C-16 | 旧 epoch 审计；Observer/过期 lease/错 scope 拒绝 | w11-process + w11-application | PASS |
| C-17 | SQL 先定向再分页；真实 Fixture GAP 不补造 | w11-application + w11-process | PASS |
| C-18 | 旧角色 undefined 与跨项目活动/需介入汇总 | w11-application | PASS |
| C-19 | LOCAL_CORE 禁用生产组重构/worktree，模型未验证 | w11-application + desktop-lifecycle | PASS |
| C-20 | 冻结、安全扫描、preload 最小接口，支持数 0 | check-w11 + desktop-lifecycle | PASS |

进程证据：`tests/integration/w11-process.test.ts`，由外部父进程启动/终止 Core，并启动独立 FixtureHarness 子进程。SQL 服务证据：`w11-application.test.ts`；存储证据：`w11-store.test.ts`；客户端字节流和合同证据：`tests/contract/p1.test.ts`。聚合命令与退出码：`evidence/W11A/gates.json`。

## 被阻断

J1：尚无 UIAI B1 已提交 SHA；未运行最终新 GUI 的联合验收、四张 UI 场景截图或联合 J1 提交测试。当前测试壳不等于最终产品 Renderer。

真实账号、真实 Harness、真实 SSH/Linux：按用户约束 NOT_RUN，本轮不启用。真实 Harness 支持数 **0**。

## 已知风险与边界

- 生产重构、真实 worktree 操作、真实模型能力/账号验证未实现，不公开为可用能力。LOCAL_CORE 的 Fixture 配置只可由隔离父测试进程提供。
- UNKNOWN 资源不自动释放；缺少原生核对证据时保持阻断，不能由 GUI 文本声明解决。
- SQL 快照超过合同集合上限明确拒绝，需要后续规模化 API；当前不伪装为完整快照。对话已经服务器端定向分页。
- 默认项目目录白名单由受信任 Core 启动器配置，未提供任意磁盘浏览权限。Windows 同用户恶意进程隔离不作额外安全保证。
- 本轮门禁验证 Node 24.14.0、Electron 44.3.0 和锁定依赖；正式安装打包分发与非 Windows 环境不在通过范围。
- 调试失败已修复后重测；失败类别保存在 gates.json，不保留含敏感风险的原始进程日志。

## 各阶段

G0/S0：既有证据通过，旧 Git 异常保全，根因 UNKNOWN_CAUSE。B0：已有固定提交及远端 Windows CI 通过。W11A：上述本地门禁通过，远端和集成 SHA 由集成交接记录补充。B1/J1：等待 UIAI，不合 main，不宣称 V1.0 已完成。
