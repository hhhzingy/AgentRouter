# V11-L2 官方配置发现边界调查

日期：2026-09-15。调查时仓库源码 SHA：`6c170e7`。官方安装文件：`E:/software/ZCode/resources/glm/zcode.cjs`，SHA256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`。

## 实际发现

从上述官方发行物只读提取并审阅 L_r/B_r/j_r/n5o/o5o 函数，在独立 Node vm 中执行这些路径发现函数；上下文只提供 path、fs.existsSync、fs.statSync。没有执行发行物入口、没有启动 app-server、没有读取配置内容或认证。

一次执行的两个结果：

| 工作目录 | 官方算法发现的项目配置 |
| --- | --- |
| E:/AgentRouter | E:/AgentRouter/.zcode/config.json |
| E:/AgentRouter/.worktrees/v1.1-context-continuity | 空 |

算法从工作目录向上遍历，到最近的 `.git` 文件或目录为止；在该范围内逐级发现 `zcode.json` 与 `.zcode/config.json`。若一直没有 Git 边界，则返回工作目录本身，并非始终扫描到磁盘根。显式 projectConfigPath 是追加，不替换自动发现路径。

## MCP 来源语义

静态审阅发现：

- ns 默认加载用户配置；内部支持 skipUserConfig，但尚未证实 app-server 向外暴露对应开关，不发明 CLI 参数。
- m5o 普通配置合并依次覆盖 system/project/user/env/cli 的同名 MCP。
- 会话运行时的 MCP 合成使用插件 MCP、显式 runtimeConfig.mcp.servers（缺省才用普通配置 MCP）、内置 MCP。因而上轮传入 agentrouter-role 具有替换普通配置 MCP 的意义，但不移除插件与内置来源。
- 不应再把“显式 Role MCP 仍必然合并所有项目 MCP”当作结论；剩余风险需按真实来源分别验证。

## 后续执行依据

独立 Git 测试工作区能提供可验证的祖先项目配置边界；当前 worktree 的发现为空，不代表其未来子目录或用户/plugin 配置也为空。真实新会话前仍须核实用户 home、插件存储/内置 MCP 来源，并确认官方进程的实际加载与子进程记录。不得改写原仓库 `.zcode/config.json`，不得复制现有会话或认证来绕过隔离。

本轮一次配置算法检查成功，无重试、无真实模型调用。静态证据不足以认证执行闭环，ZCode 实际受管 Role 与全局目标仍未完成。
