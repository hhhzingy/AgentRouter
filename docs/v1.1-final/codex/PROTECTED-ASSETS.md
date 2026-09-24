# N0 保护资产清单

以下资产不因本轮测试而覆盖、迁移、删除或写入：

- `E:/AgentRouter` 主工作树及其 `feat/contract-c1` 未提交内容。
- `E:/AgentRouter/.worktrees/v1.1-final-cursor-win` 与 UI Base/Kimi UI 分支。
- 用户生产 `HOME`、Codex/ZCode/Kimi/DSH/Pi 既有登录、配置、会话与历史项目。
- `.local-protected/codex-dut`、`.local-protected/zcode-dut` 中的隔离身份；只按测试合同使用，不提交。
- `E:/AgentRouter/账号信息/通用API/百炼.txt` 及其中凭据；只允许受信 loader 路径引用。
- 用户手机 Tailscale、Remote 配对状态与既有设备记录；真实测试使用新配对/新对象并可撤销。
- `packages/storage/migrations/001`—`017` 当前冻结字节。
- `docs/v1.1-final/ui-base/**` 的 UI 合同与所有权边界；后端变化用 delta，不直接重做 UI。

允许清理的仅限本轮可再生成且确认无后续价值的 cache、tmp、历史 build/evidence；清理前必须解析并核对绝对路径位于本功能工作树或明确 DUT 根内。
