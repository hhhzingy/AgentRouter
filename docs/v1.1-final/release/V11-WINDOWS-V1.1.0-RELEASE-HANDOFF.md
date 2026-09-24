# AgentRouter V1.1.0 Windows 发布前收口复核与交接

**裁决：`V1.1_WINDOWS_RELEASE_BLOCKED`。** 截至 2026-09-24，自动门、候选 portable ZIP、Codex/ZCode 分段原生任务已有可复核证据；执行包指定的同一真实 Golden Flow、Web Join 和实体手机尚未闭环。不得宣称 Windows RC；本轮未 merge、tag 或发布 GitHub Release。

## 1. 身份与边界

| 字段 | 值 |
|---|---|
| 测试产品 SHA | `ea4bad0a74277883c40087920383c76527d56ca8` |
| 分支 | `codex/v1.1-core-ui-candidate`，已推至 `origin`；C1/W11 在此 SHA 绿灯 |
| 工作树 | `E:\AgentRouter\.worktrees\v1.1-core-ui-candidate`；产品构建/实测时 `git status --porcelain` 为空 |
| 非本轮源码根 | `E:\AgentRouter` 是 `feat/contract-c1`，仅从中读取 2026-09-24 执行包 |
| 基线 | `84b1ef2b0021bd48c5ac7d0e3f5a42dad7f595be` |
| 发行文档 SHA | 本文件所在 docs-only 提交；与测试产品 SHA 分开，运行时代码差异为 0。以 `git log -1 --format=%H -- docs/v1.1-final/release/V11-WINDOWS-V1.1.0-RELEASE-HANDOFF.md` 读取。 |
| 版本 | 根 `package.json`、Core/桌面握手、包内 app 与 manifest 均投影 `1.1.0`；合同 revision 未改 |

文件级影响与 Pi/Kimi/DSH 证据继承依据见 [V11-FINAL-IMPACT-MAP.md](V11-FINAL-IMPACT-MAP.md)。`84b1..ea4bad0` 未改 Harness adapter、shared RPC/lifecycle/native backend、role bridge/profile/runtime 或迁移 SQL；只改发行版本投影和打包核对。故 Pi、Kimi、DSH 复用 `84b1ef2` 同包真实 Level A 证据为 `PASS_BY_UNAFFECTED_PRIOR_EVIDENCE`，而非本 SHA 重新 live 深测；Kimi 首次 UNKNOWN、隔离重试 PASS 的分母保留。

## 2. 完成项与证据

| 门禁 | 结果 |
|---|---|
| typecheck、lint | PASS |
| unit/integration/contract/chaos/UI 自动套件 | 114 个文件，654 PASS / 2 SKIP；迁移备份/FK、冻结合同、安全负面路径在套件内。 |
| C1 云端 | [同 SHA completed/success](https://github.com/hhhzingy/AgentRouter/actions/runs/35944527756)。 |
| W11 云端 | [同 SHA completed/success](https://github.com/hhhzingy/AgentRouter/actions/runs/35944527662)，含自动 Electron/流程门。 |
| 合同冻结 | C1、C1R1 生成核对与 frozen source PASS；C1R1P1/W11 云端 PASS。 |
| Codex 真实最终包 | `.local/j3-production-pi/run-LxxCLh/report.json`：Bootstrap、`42/PUBLISHED`、输入→输出 Artifact、下载 SHA-256/随机 marker PASS；`.local/j3-production-pi/run-wmA2Hz/report.json`：同 native ref 与 Core 冷重启续轮的断言 PASS；组合脚本之后在已关闭客户端上继续 Artifact 而总状态 FAIL。 |
| ZCode 真实最终包 | `.local/j3-production-pi/run-2bH3zd/report.json`：安装客户端 Existing Account Broker（Bigmodel / `GLM-5.3-Flash`）、Bootstrap、`42/PUBLISHED`、Artifact 哈希链 PASS；`.local/j3-production-pi/run-xdPqzV/report.json`：同 native ref 与 Core 冷重启续轮断言 PASS，末尾清理租约过期，总状态 FAIL。因此综合仅 `PARTIAL`。 |
| SQLite/打包烟测 | 目录包和全新解包各执行 `tools/packaged-test.mjs` PASS：生产 Core/pipe/SQLite、Project 持久化与重启；manifest 20 个 migrations。未冒称干净机或真实 Electron 黄金链。 |
| 敏感扫描 | 本 SHA 暂存索引 2235 个文件、publish refs 历史 3645 个 blob、包/解包目录各 139 个文件；`findings=0`。只对被扫描范围作结论，不声称所有本机私有 checkpoint refs 或过去所有不可达 Git 对象永无秘密。 |

真实分段与缺口细节见 [V11-FINAL-GOLDEN-FLOW.md](V11-FINAL-GOLDEN-FLOW.md)；机器门禁状态见 [V11-FINAL-GATE-MATRIX.json](V11-FINAL-GATE-MATRIX.json)。本机受限会话跑 W11 时自动 114 文件通过，但 Playwright Electron 在启动处被环境拒绝；同 SHA GitHub Windows Runner 的 W11 成功，二者不混写。

## 3. 候选 portable ZIP（不是发布批准）

```text
目录包=E:\AgentRouter\.worktrees\v1.1-core-ui-candidate\release\AgentRouter-j3-ea4bad0a7427-6c1a6e46-4f29-4e4c-bbdb-39d975058ee0
ZIP=E:\AgentRouter\.worktrees\v1.1-core-ui-candidate\release\AgentRouter-v1.1.0-windows-x64.zip
ZIP_SHA256=7a5e0927d1836da2704f02d7fd39011295926a2e7005471307c25f115cd74366
ZIP_BYTES=200126709
MANIFEST_VERSION=1.1.0
SOURCE_SHA=ea4bad0a74277883c40087920383c76527d56ca8
SOURCE_DIRTY=false
ARTIFACT_HASH=362f91b111d2e3acf48cbe41989ede497ee1c84fdfeebc1e5527d82da8a2a526
MIGRATIONS=20
FRESH_UNPACK=E:\AgentRouter\.worktrees\v1.1-core-ui-candidate\.local\final-unpacked-ea4bad0
FRESH_UNPACK_PACKAGED_SMOKE=PASS
PACKAGE_SENSITIVE_FINDINGS=0
```

ZIP 名称满足执行包约定，但仅是待验收候选物；不可因构建成功就上传为正式 Release。没有签名安装器；V1.1.0 发行形式按执行包允许 portable ZIP。若修复 P1 而产生新产品 SHA，必须重建 ZIP、重算哈希并重跑受影响门禁，本 ZIP 作废。

## 4. 未完成的发布硬门

1. **P1：Codex→ZCode 跨 WorkSession 完整可见历史迁移不支持。** Codex 原生端口 `exportContext()` 明确拒绝跨端导出；驱动 `history_export=UNKNOWN`，门控会 fail closed。真实 Codex 会话含结构化 MCP 工具条目，不得把文本拼接/未知容量当作无损迁移。于是旧 Codex WS → HISTORY/read-only、迁移随机 marker、目标 receipt、迁移后 cold resume 的整链均未验收。
2. **同一真实 Golden Flow 未完成。** 现有 Codex/ZCode 是不同隔离 Core 数据集的分段测试，且脚本对象名不符合 `AR_V11_FINAL_*`；真实 REAL_CORE+Electron 六页面、Result Evidence 的 Controller attestation/幂等、Electron Request Changes/follow-up 唯一性未在同链实测。
3. **ChatGPT Web `participant.join` 未做。** 本轮未创建最终测试 Slot/Binding，未给用户发送 Join Instruction；旧网页 Participant Task→Artifact→Result 证据不是 Join。
4. **实体手机和最终桌面用户 smoke 未做。** 旧 Tailnet HTTPS/WSS 后端与模拟 390px 浏览器证据不能替代实体手机；全新 ZIP 的脚本烟测不能替代用户打开桌面应用复核。

因此 `no_open_p0_p1=BLOCKED`，不是“已完成、只待发布”。下一轮优先解决第 1 项并从新 clean 产品 SHA 重建；再创建统一 `AR_V11_FINAL_*` 测试对象，跑同链 Evidence/Request Changes/Join/手机。机器准备好之后才按执行包 `06_USER_ACTION_CARDS.md` 向用户发 Web Join、实体手机和桌面 smoke 卡；用户不需要自行猜测 Slot、URL 或 Core 身份。

## 5. 明确延后/排除与发布控制

按本次执行包，签名安装器、完整 Windows Narrator、11 个 P0 页面逐页人工截图、全 DPI/主题、干净卸载矩阵与未受影响 Harness Level B 全量重跑归 V1.1.1；账号切换是 `EXCLUDED_BY_USER`，Linux 在 Windows V1.1 正式发布后另行收口。不能把延后项写为 PASS，也不能把 Kimi 的一次 UNKNOWN 抹去。

本轮未使用 Codex reset credit；测试走隔离 DUT / ZCode Existing Account Broker，未主动复制或编辑生产 HOME/账号文件，也未触碰用户既有 Project/Role/WS。未对所有生产凭据文件做前后全量字节比对，因此不作“绝对未变化”声明。未授权 merge、tag、release；**当前不建议发布**。只有所有硬门和用户手机/桌面 smoke 均通过、用户再明确批准时，才可提出 `V1.1.0_READY_FOR_MERGE_TAG_RELEASE`。
