# V1.1.0 发布后仓库清理复核

## 冻结的发布对象

| 项目 | 值 |
| --- | --- |
| Release / tag | [`v1.1.0`](https://github.com/hhhzingy/AgentRouter/releases/tag/v1.1.0) |
| 受测产品 SHA（Tested product SHA） | `268fc71e81c2956ed1eeabf75df6389934836c09` |
| 发布文档 SHA（Release docs commit） | `eec00d9e2bcdce2bdb6c27629ed874778c9f6f30` |
| Portable ZIP | `AgentRouter-v1.1.0-windows-x64-268fc71.zip` |
| ZIP SHA-256 | `6cd14621d24348c00d46c5995444e07ff7264e9591b8214ad8c9bdc0ac603604` |
| 发布前 `main` | `3df4dd3135c27af53be0d64d920920e3ab55346e` |

本轮仅维护发布后公开文档及仓库树；没有修改 runtime、UI、contracts、migration、测试代码或既有 ZIP，没有改动 `v1.1.0` tag。发布产品仍以受测 SHA 为准，清理提交不是新的产品候选。

## 公开使用文档

- 重写根目录 `README.md`，明确下载、SHA-256、ZIP 解压和 `electron.exe` 入口；注明包内 `候选包说明.txt` 是构建期遗留文字。
- 新增 `CHANGELOG.md`、`SECURITY.md`、Windows Quick Start、Harness Setup、MCP & Participant、Remote & Mobile、Troubleshooting，以及 `docs/releases/v1.1.0/` 的 Release Notes、Validation、SHA256SUMS。
- 修复 `docs/api/J3-current.md` 对已移除 J3 目录的失效链接。
- 清楚标注 Codex→ZCode 完整历史迁移属于 V1.2；V1.1 可使用安全的 `Start blank` 路径。不把 portable ZIP 描述为 signed installer。

## 仓库树清理

从当前 Git 树移除 704 个过时、可由历史提交追溯的已跟踪文件：旧执行包 77、J3 阶段文档 34、V1.1 中间文档 150、历史 `evidence/` 输出 367、其他旧阶段文档/`REPRODUCTION.md` 76。`main` 历史和发布 tag 均未重写；删除只影响当前树。

保留 `docs/执行包/AgentRouter_V1.0功能与开发手册包/` 的 33 个规范输入文件：`tools/lint.mjs`、`tools/spec-check.mjs`、`tools/bootstrap-records.mjs` 与 `tests/contract/protocol.test.ts` 直接依赖它们。保留 `evidence/M00/README.md`，因为数据库验证工具仍向该目录写入探针结果。Tests、fixtures、contracts、migrations、CI、build/security 工具均保留。

## 验证

| 检查 | 结果 |
| --- | --- |
| Typecheck / Lint | PASS / PASS |
| Unit | 43 文件、238 tests PASS |
| Contract | 8 文件、68 tests PASS |
| Chaos | 1 文件、3 tests PASS |
| Integration | 单工作线程完整重跑 49 文件、238 PASS、2 skipped |
| `db:verify` | SQLite `integrity_check=ok`、`foreign_key_check=[]` |
| 暂存区敏感扫描 | PASS，0 findings（1548 files） |
| 仓库历史敏感扫描 | PASS，0 findings（3680 files） |
| `git diff --check` | PASS |

首次与其他套件并行运行 Integration 时，两个 Participant 子进程测试未产生临时 `endpoint.json`；这两例隔离重跑 PASS，随后完整 Integration 以单工作线程 PASS。上述历史扫描结论只覆盖工具实际检查的范围，不声称本机所有私有 refs/不可达对象绝对无敏感内容。

## 分支与本机状态

- 清理分支：`chore/v1.1-post-release-cleanup`；公开文档和旧证据清理通过快进（fast-forward）合入 `main`。本报告所在的最终 `main` 提交即发布后清理提交。
- 执行包列出的 16 条旧 V1/V1.1 远端分支已逐条删除，包括明确授权放弃的 4 条 diverged 分支；未创建 V1.2 分支、Git bundle 或新 tag。最终远端只保留 `main`。
- 已安全移除干净且无忽略数据的 `ui-ux-spec` 本地 worktree 及对应本地分支。
- 根工作树 `E:\AgentRouter` 有用户未提交变更；`contract-c1r1` 有大量 staged 文件；`v1.1-integration` 有未提交修改。其他旧 worktree 虽 tracked clean，但含 `.local`、`.local-protected`、`release` 或依赖缓存，其中可能有用户 Project/Role/WorkSession、登录状态或唯一测试资产。本轮不以 `--force` 删除这些目录，也不清理根工作树。旧本地分支因相应 worktree 仍在而保留；这不影响 GitHub 只保留 `main`。
- 没有触碰账号文件、`.local-protected`、用户会话数据或 Codex `refs/codex/turn-diffs/*`。本轮校验工作树里的依赖、缓存和测试输出仅是可再生临时产物，工作树退出时清理。

## 发布对象复核

GitHub Release 中现有 ZIP 的 asset digest 与上述 SHA-256 一致，大小 200110621 字节。清理后再次核对 tag、资产和 `main`；不重建、不替换 ZIP，不重跑 Harness live / Golden Flow。

`V1.1_POST_RELEASE_CLEANUP_COMPLETE`
