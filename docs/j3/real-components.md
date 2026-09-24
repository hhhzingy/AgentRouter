# 三家原生 Harness 部件实测记录

本记录属于 LIMITED_ISOLATION 实际账号调试，不是 Fixture，也不是 Core/Route 全链路认证。SSH 暂缓；开发 hzxpro 未读取认证、未登出、未关闭。

| 组合 | 实测结果 | 尚未通过的范围 |
| --- | --- | --- |
| pi 0.85.1 + DeepSeek deepseek-v4-flash / thinking disabled | 实际算术返回42、独立进程恢复会话返回42、运行中取消后原生 agent_settled/cancelled；固定源码a785254 | Core派发、Route工具与交接、GUI、全树停止、真实费用显示 |
| Kimi 0.42.0 + K2.7 Coding | 实际算术42与ACP取消终态；固定源码b0613f1；恢复上下文42在8e30635通过 | Core/Route、GUI、真实Harness全树停止 |
| Codex 0.153.4 + GPT-5.6 Luna / low | 用户确认的新独立DUT身份校验、MCP空列表、真实任务42、原生取消终态均通过；固定源码36a9228 | Core/Route、GUI、真实Harness全树停止；重启恢复与切号仍最后执行 |

证据及哈希见 evidence/J3/real-components/index.json。Codex认证失败发生在探针未提交版本，明确记录该限制，不将后来提交SHA冒充该次运行源码。原失败不自动重放。

## 发现与修复

- pi取消后上游仍可能完成并计费：等待上游结束再写报告，单独记录upstreamCancellationCertified=false。原生返回cost=0源于未设置可信模型价格，actualBilledCost=null，不能宣称免费。
- pi真实Key只在父进程ApprovedProvider内存中，从授权文件解析；子进程只接收短期loopback capability。上游固定api.deepseek.com，单次探针最多一次请求，无任意HTTP代理。
- Kimi实际版本已从历史0.41.0漂移到0.42.0；探针明确禁自动更新/遥测/cron。当前EXE哈希015e9ecfea02a491d47f5d3fb4db47b070c163d25a88ee54fcb6489328117d5d。
- Kimi ACP未转交顶层agent-file/skills-dir，不能依赖它们禁工具；独立默认agent覆盖tools=[]，再通过ACP显式切Plan模式。工具权限仍不能从角色名推导。
- Kimi原生配置仅提供Thinking On，已记录为最低实际可用，未伪造关闭。
- Kimi只复制必要OAuth凭据到独立目录，最小化重建provider/model配置，不复制日常services；运行后删除本次凭据副本，不改日常账号。
- Codex带账号会自动发现codex_apps；在任何模型任务前拦截，独立配置关闭apps/plugins/remote_plugin后原生MCP列表为空。未修改开发配置或hzxpro。
- Codex旧fj种子刷新失败，后续改用持久独立DUT的最新认证，不再每次复制失效种子。工具tools/login-j3-codex-dut.ps1仅设置独立终端环境，退出时恢复，不注销桌面。
- Windows Node可能补入父PATH；有限环境组件使用明确独立PATH，stdin错误受控处理。当前stop仍unknown，不冒充Native Completion Barrier。

## 后续执行

用户已完成独立登录，并明确确认刚登录的独立账号为本次测试账号；其身份与旧fj种子不同是已获授权的选择。授权身份摘要仅存本地，仓库不记录邮箱或账号ID。新任务与取消已实测通过；旧401失败记录保留。Codex切号与重启恢复仍最后，不得拿hzxpro当A账号读取。

继续补Windows Job宿主与真实生产注册、六个RoleBridge工具、MCP管理派发、GUI取消恢复和多Harness交接。现有Core仍缺实际宿主接线，不能把本记录当V1.0完成。External API管理注册面尚未完成。无main合并或发布。

Kimi恢复补充：原生load显示default，但重复设plan报Already in plan mode。保留恢复的原会话配置，不重复配置、不退出/重入plan；tools=[]仍保留。恢复上下文实测通过，mode呈现不一致列为兼容风险。

Windows Job新宿主四项实际测试通过：EOF后子/孙停止、幂等、超时UNKNOWN、非零UNKNOWN、哈希拒绝。尚未接真实Harness，不能冒称其停止屏障已过。原C1 CI文件冻结改动被门禁拦截后已恢复，冻结hash未修改。

登录脚本Windows PowerShell5.1编码问题已修复为ASCII并解析0错误；用户无需调整终端编码。

依赖修复记录：安装包装器重链接导致better-sqlite3 13.0.3元数据缺失；仅从本机相同版本复制43个缺失文件，不覆盖已加载二进制。ESM导入及内存数据库SELECT 1通过。后续直接使用Node执行工具，避免pnpm exec触发重链接。

本次宿主增量验证：3文件7项定向检查通过；全并发首次在编译并启动进程的测试触发默认5秒超时（244通过、1失败）。为该含C#编译的集成测试设置30秒上限，4 worker复测38文件245项全部通过，类型检查通过；该计数不包含UI测试。WindowsNativeProcessHost与NativeRoleBridge仍未接入真实生产派发。pi的Node CLI入口新增独立文件哈希校验和正确参数前缀，尚未用该宿主运行真实pi。
