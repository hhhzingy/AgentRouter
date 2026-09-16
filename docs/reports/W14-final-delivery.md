# V1.1 W14 最终交付报告（2026-09-16）

分支：`feat/v1.1-final-windows-mobile`（不自动合 main、不 tag、不发布——按包规由你终审）。
最新验证头：见 git log 顶端；CI 双门（C1 contract+offline、W11 integration+P1 gates）对
`fix(w11)`/`docs` 各提交均 success。

## 完成度总览

| 工单 | 状态 | 关键证据 |
| --- | --- | --- |
| W00/W01 | 完成 | 基线增量延续；Shared 检查点=本分支头，Linux 缝文档 docs/v1.1/linux-port-seams.md |
| W02 Context 收敛 | 完成 | 历史复活删除+负面测试；migration 014；GUI 无切换；422 旧测试中 4 个旧语义用例以新语义替换（映射表见 W10 报告） |
| W03 一次性 Context Transfer | 完成 | context_transfer_ops journal(015)、决定表、继承拒绝路径实测 |
| W04 受控诊断 | 完成 | stderr ring（跨块密钥安全）、结构化错误、DUT 中经 stderrTail 排障实际使用 |
| W05 百炼统一绑定 | 完成 | pi/dsh/kimi/zcode 四路官方配置路径；qwen3.8-flash Chat Completions；各自 DUT PASS（含 kimi 7eb2c37、zcode 本轮） |
| W06 Remote 权限 | 完成 | K07/K08、空 scope 语义、自创建可见、撤销队列失效、资源硬上限、网关测试 7/7 |
| W07 手机共享客户端 | 完成 | /meta.js 共享元数据、真 Chromium 全链路验收（配对→cookie→controller→K04 重连，0 页面错误） |
| W08 Linux 缝 | 完成 | 共享层零平台硬编码审计 + linux-port-seams.md |
| W09 打包双模式 | 完成 | AGENTROUTER_REMOTE_* opt-in、console 资产入包、manifest backendModes+sha、remoteDevice Core 扩展+工作台远程页、候选包 dirty=false |
| W10 回归+负载 | 完成 | 430/430；fixture 三轮固定负载 3/3（幂等/取消/重连不复活/历史/队列/完整性/关停屏障）；映射报告 |
| W11 五 Harness 矩阵 | 4/5 + 1 挂人 | pi/dsh/kimi/zcode→百炼全 PASS；codex 行 BLOCKED_USER（卡4 device-auth 重登） |
| W12 双机/手机 | 卡已就绪 | docs/reports/W12-user-action-card.md（4 张卡） |
| W13 组合验证 | 完成（不合并） | 全量+live+负载+双门 CI 在本头一致绿；未 merge/tag/发布 |
| W14 清理+交付 | 本报告 | 探针/临时脚本已删；.local 工件不入库；敏感面零入 Git（扫描器 findings=0 全程） |

## 本轮新发现并修复的产品级事实（ZCode 0.16.5）

事件词汇（v4/telemetry/event）、'unknown' 投影占位、冷 resume 模型不可恢复（改新会话+章程重申、
能力诚实降级）、interaction/requestPermission 白名单审批流、mcp__ 全限定名映射。
全部有协议探针证据与更新后的单测；详见 W11-harness-dut-matrix.md。

## 等待用户动作（唯二硬缺口）

1. W12 卡1-3：真手机配对/Tailscale 私网/第二机（物理）。
2. W11 卡4：`powershell -File tools/login-j3-codex-dut.ps1` 批准 device 码后我补跑 codex 行。
3. 最终人工终审是否合 main（包规：不自动）。

## 安全边界执行记录

未打印/未提交任何 key；凭据文件只在受信宿主内读取；DUT 一律独立受管 HOME；
生产 Codex/ZCode 桌面登录未被触碰；1M 压缩实测按你指示仍挂起（脚本与口径保留）。
