# AgentRouter 公开仓库全历史安全复核（2026-09-22）

仓库：`hhhzingy/AgentRouter`（GitHub `public`，默认分支 `main`）

复核工作树：`E:\AgentRouter\.worktrees\v1.1-functional-codex`

结论口径：区分“公开远端历史”“普通本地分支/标签”“仅本机 Codex checkpoint refs”，不把原始扫描候选数写成零。

## 结论

1. GitHub 公开远端历史及普通分支/标签中，未发现凭据、账号信息目录、`.local-protected` 内容、`.env`、私钥文件或以 credential/secret/token 命名的敏感文件进入 Git；当前这些路径也没有 tracked 文件。
2. 仓库内置历史扫描覆盖 3301 个历史 blob，结果为 `0 findings`。GitHub Secret Scanning 与 Push Protection 已启用，公开仓库当前 open secret alerts 为 0。
3. 独立 Gitleaks v8.30.1 对 `--all` 的原始结果不是零，而是 25 个 `generic-api-key` 候选；逐项按只读元数据和所在语义复核后，20 个是固定 SHA-256/冻结哈希、4 个是协议枚举字符串、1 个是集成测试固定 request key，未解决真实泄漏为 0。禁止把本项表述成“Gitleaks 原始零告警”。
4. `docs/执行包` 确实进入了公开 Git 历史，因此不能宣称“执行包从未进入 Git”。对 635 个唯一执行包 blob 扫描后，没有发现“不得公开/禁止公开/仅限内部/私有执行包/confidential/do not publish/not for public”等私有标记，也没有发现凭据内容；其中对 credential/key/token 和 `.local-protected` 的命中均是安全规则、操作说明或受保护路径名。若所有执行包本应一律私有，需要另行授权历史重写并重新评估公开链接、fork 与 clone，当前没有擅自执行。
5. 严格例外：仅本机 11 个 `refs/codex/turn-diffs/*` checkpoint refs 中存在 67 个 `.local-protected` 路径对象。这些对象不在 GitHub remote refs、普通本地分支或标签中，但从“曾进入本地 Git object/ref”这一绝对口径看不能写成从未进入 Git。永久删除这些 checkpoint 并执行不可达对象回收属于不可恢复操作，尚未获得用户明确的“删除这些 Codex 检查点并回收不可达对象”授权，因此本轮未删除。

## 扫描范围与结果

| 检查 | 范围 | 结果 |
|---|---|---|
| `tools/check-sensitive.mjs --history` | 3301 个历史 blob | PASS，0 findings |
| `tools/check-sensitive.mjs --staged` | 本轮拟提交内容 | PASS，0 findings（提交前再次执行） |
| Gitleaks v8.30.1 `git --log-opts=--all --redact` | 326 commits，约 10.62 MB | 25 原始候选；25 个均已解释，0 unresolved |
| 公开 remote refs + tags 路径审计 | `git rev-list --objects --remotes=origin --tags` | `.local-protected` 0；`账号信息` 0；`.env` 0；私钥扩展名 0；敏感命名文件 0 |
| 普通本地 branches + tags | 非 `refs/codex/*` | 同上均为 0 |
| 所有 refs | 含 `refs/codex/turn-diffs/*` | 11 个本机 checkpoint refs，67 个 `.local-protected` 路径对象 |
| GitHub 安全设置 | `hhhzingy/AgentRouter` | Secret Scanning enabled；Push Protection enabled；open alerts 0 |

Gitleaks 25 个候选的分类只记录类型与长度，不记录候选值或凭据散列：

- 20 个长度 64：冻结清单、checkpoint、path exception 中的 SHA-256 字面量；
- 4 个长度 21：ZCode/DeepSeek 上下文压缩协议枚举及其单测副本；
- 1 个长度 17：集成测试固定 `request_key` fixture；
- 未出现已知 live token 前缀、JWT 形状或 credential URL 形状。

## 执行包公开性复核

- 可达对象清单中存在 31 个 `docs/执行包` 目录，执行包不是“从未进入 Git”。
- 扫描 635 个唯一 blob，显式私有/机密标记为 0。
- 249 个路径/文本命中 credential/key/token 术语，均为流程安全要求、字段名或禁止事项，不是凭据值。
- 3 份文档提及 `.local-protected` 作为必须保护的路径；未包含该目录内容。

## 尚需用户明确授权的不可恢复动作

若用户希望满足“本机任意 Git ref/object 也完全不存在 `.local-protected`”的最严格口径，需要明确授权：

> 删除这些 Codex 检查点并回收不可达对象。

获得授权后才可精确删除命中的 11 个 `refs/codex/turn-diffs/*`，再次验证目标 ref 列表，再运行 Git object cleanup。该动作会永久失去对应 Codex turn-diff checkpoint 的恢复能力；未授权前保持现状最安全。

## 发布边界

- 本复核支持“公开 GitHub 历史未发现敏感泄漏”的结论。
- 本复核不支持“任何执行包都从未进入 Git”或“任何本机 Git object 都从未包含 `.local-protected`”这两种绝对表述。
- 没有 merge、tag 或 release；没有使用 Codex reset credit。
