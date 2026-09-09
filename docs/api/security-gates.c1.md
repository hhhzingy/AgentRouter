# W10 安全边界与 Gate 记录

本轮无真实账号、无真实 Harness、无真实 SSH，不读取 auth.json、SSH 私钥或日常账号配置。

## 日志策略

禁止提交原始日志、auth.json、.env、名称含 token/secret 的秘密副本。结构化诊断采用字段白名单：测试名、固定诊断码、时间、版本、退出码、计数和 REDACTED；不保留原始请求、Prompt、stdout/stderr、异常正文。未知字段直接丢弃。

13 个历史离线 `.log` 取消当前分支的 Git 跟踪但仍留在本地；旧握手/完整测试报告的原件备存在忽略目录 `.local/w10-original-evidence`，当前分支替换为摘要与原件哈希。未删除文件，未改写 Git 历史。旧提交内仍有历史离线原始日志，这不等于已清洗所有历史元数据。

本轮没有启用 live raw 日志出口。未来如需 raw，必须放仓库外、OS ACL 限权、配置保留期并验证过期处理；在实现之前保持禁用。`.local/verification` 只用于无账号测试框架结果，不能用来保存真实 Harness 原始输出。

## 扫描边界

`tools/check-sensitive.mjs --staged` 检查完整暂存区内容和路径，非零阻断提交。`--history` 检查所有可达历史 blob 的内容；历史路径保留，不因已存在的离线 log 文件名阻断。`--tree <目录>` 扫描显式目录，不擅自读取用户凭据目录。

检测 Provider Key、Bearer、JWT、认证字段、Cookie、PEM、canary；只报告规则编号及文件，不输出命中值。16 个基线生成类型/Schema 文件名包含 Token，使用精确文件路径+内容哈希例外，仅豁免路径名，仍扫描内容。没有对整个 fixtures 或二进制目录放行。

构建初次扫描误匹配 Chromium/SQLite 标识符内部的 sk-/Cookie 子串。经不输出命中值的结构检查，确认匹配前为字母；加入完整标识符边界后重新通过扫描，并保持 canary/Provider 等负面用例通过。扫描不是穷尽性泄漏证明。

提交钩子 `.githooks/pre-commit` 与 CI 执行生成一致性、冻结哈希及秘密扫描。新 clone 需 `git config --local core.hooksPath .githooks`；CI 不依赖本地钩子配置。

## Gate 状态

| Gate      | 本轮状态     | 范围与限制                                                                   |
| --------- | ------------ | ---------------------------------------------------------------------------- |
| G10-05    | PASS（离线） | raw 未进入新提交；白名单摘要验证                                             |
| G10-06    | PASS（离线） | 合成 canary 触发非零；独立测试仓库真实 git commit 被阻断                     |
| SG-1      | SCOPED_PASS  | 当前暂存区、可达历史、便携构建扫描；未宣称扫描所有 OS 凭据/崩溃转储/安装目录 |
| SG-2      | NOT_RUN      | 未连接 Mock Provider 捕获真实 Harness 请求                                   |
| SG-3      | NOT_RUN      | 扫描 canary 不等于 OS 沙箱拒读 canary；未测试网络/凭据目录隔离               |
| SG-4—SG-6 | NOT_RUN      | 专用账号、真实最小调用、撤销审计延期                                         |

真实账号安全门仍未通过，不开始 W15；C1 合同完成不替代 G11—G14。
