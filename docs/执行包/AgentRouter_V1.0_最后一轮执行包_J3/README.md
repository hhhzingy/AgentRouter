# AgentRouter V1.0 最后一轮执行包（J3）

日期：2026-09-10。包版本：J3 / 1.0。对象：私人仓库 `hhhzingy/AgentRouter`，不是 Trassi 硬件固件。

**目标：在本轮持续完成实现、真实账号与双平台联调、现场修复、正式打包和用户验收，使 AgentRouter 成为实际可用的 V1.0。不是再做一个 Mock 演示，也不是做完代码后返回网页等待下一轮计划。**

本包是执行安排，不是测试通过证明。本次网页端只读检查了指定分支、关键源码、产品/验收文档及 CI 状态；没有在用户 Windows、Ubuntu 或真实账号上执行测试，也没有修改仓库、提交、合并或发布。

## 直接开始

把本目录交给在 AgentRouter 仓库中工作的 Codex，使用 `09_CODEX_START.md` 作为入口。无需再次返回网页端复核。Codex 先按 J3-00 固定基线并登记任务；需要登录、预算、系统操作、现场观察和最终发布时，直接找用户。

建议将本包原样纳入 `docs/执行包/AgentRouter_V1.0_最后一轮执行包_J3/`。保留旧执行包和历史失败记录；用本包的权威覆盖说明更新当前入口，不能删除历史以制造“全部完成”。

## 基线

| 项目 | 固定值 |
|---|---|
| J2 分支 | `feat/j2-usable-workbench` |
| J2 受测源码 | `1ee22dadc9fb890c44f7e95ff015288306d7a913` |
| J2 证据提交 / 本轮起点 | `62b2e187285aeb0fd73926cdc47c8d830502fb97` |
| 已查到的 main | `16370d3971740c80ca9ccec7a6d9b3553e896545` |
| 已查到的 integration/v1.0-next | `bbdea2ab86243260c520f5eed791bab90a2b851c` |
| 建议本轮分支 | `feat/v1-finalization-j3`（新建议，并非当前已有） |

开始时重新 fetch 和核对；发生新提交，不得 hard reset 覆盖，先保存并核对来源，再由用户指定整合对象。

## 文件导航

| 文件 | 用途 |
|---|---|
| `01_REPOSITORY_REVIEW.md` | 核实到的事实、缺口和不可由旧证据推出的结论 |
| `02_SCOPE_AUTHORITY.md` | 完整 V1.0 范围、旧限制覆盖、用户授权与责任移交 |
| `03_WORK_PACKAGES.md` | J3-00—J3-12 工作包、依赖、写入边界、完成与回退 |
| `04_ACCOUNT_JOINT_DEBUG.md` | 用户账号联调、安全隔离、双账号切换和费用限制 |
| `05_HARNESS_REAL_EXECUTION.md` | 三家真实 Adapter、六工具、原生完成屏障与认证矩阵 |
| `06_SSH_LINUX_DEBUG.md` | Windows GUI → SSH → Ubuntu 常驻 Core 的实施和故障验证 |
| `07_ACCEPTANCE_AND_ACTUAL_DEBUG.md` | 原始验收覆盖、真实操作剧本、故障/压力/试用门槛 |
| `08_RELEASE_AND_HANDOFF.md` | 打包、备份迁移、最终候选复测、合并发布和日常接管 |
| `09_CODEX_START.md` | 可直接给 Codex 的总任务指令 |
| `10_SOURCES.md` | 固定提交的来源链接及当前官方文档核查 |
| `acceptance/original-T001-T081.json` | 原测试逐 ID 的执行映射，初始均 NOT_RUN |
| `acceptance/J3-additional.json` | 本轮新增现场/安全/SSH/交接测试 |
| `templates/` | 用户配合、现场证据、合同变更、发布清单模板 |

验收 JSON 是计划与记录模板，不是测试实现，不得因文件齐全而计 PASS。

## 完成的唯一解释

三家 Harness 的实际会话、工具、任务交接、取消、账号管理和相应平台能力已按受测组合验证；本地与 SSH 两种工作方式可操作；原始 F01—F25 的适用验收及本轮增加项通过，F26 不开放外部编排；正式候选包可安装/启动/恢复；用户完成现场验收并明确接受。

关键项缺账号、缺 Linux 或缺人工观察时，只能记 `BLOCKED_ENV` / `NOT_RUN`，Codex 直接组织用户补齐。即使代码完成，也不能宣布 V1.0 已完成。用户主动缩减范围时必须形成明确变更，并改称限制版/RC，不得暗中把完整 V1.0 改成单 Harness 演示。

## 包完整性

`MANIFEST.sha256` 记录包内文件摘要。可运行 `python VERIFY_PACKAGE.py` 检查计划文件完整性、81 个原始测试 ID 和 52 个新增计划条目。这个检查不连接仓库、账号或目标主机，**不运行产品测试、不认证 V1.0**。`templates/checkpoint.md` 用于多会话断点续做；`acceptance/TRACEABILITY_INDEX.md` 提供可直接阅读的原测试到工作包索引。
