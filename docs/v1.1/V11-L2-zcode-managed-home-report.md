# V11-L2 受管 HOME 配置对齐

日期：2026-09-15；固定源码 SHA：`359bd7bdb6fa17f0debba8a62c6f7db9f5d7db6b`。

## 原因与修改

WindowsNativeProcessHost 会强制 HOME/USERPROFILE 为绑定 sessionHome，原 ZCode prepare 却准备其下 zcode-home。官方 runtime 的 ws/tI/Nee 使用 os.homedir 展开 `~/.zcode/cli/config.json`，默认 storage.dir 为 `~/.zcode`，插件存储为其 cli/plugins 子目录。故原先准备目录不等于进程实际读取目录。

现在在 owner 已验证的 sessionHome 下准备 `.zcode/cli/config.json`：storage/db 固定在此 HOME 内，plugins.enabled=false，hooks.enabled=false，普通 MCP 配置为空；Role MCP 仍由受信宿主通过协议传入。现有不同配置一律抛错，不覆盖、不复制桌面认证；相同配置幂等保留。已存在路径解析检查限制在 HOME 内。这不是针对同用户恶意并发修改的完整文件系统沙箱。

官方发行物仍是 SHA256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`。静态分析发现官方插件默认启用，包括提供 node_repl 的 Browser Use；仅隔离 HOME 不足以推断插件关闭。本次配置增加明确的 plugins.enabled=false，但仍须用官方真实进程验证实际禁用效果及内置 MCP 来源，未宣称完成。

## 尝试分母

- 首次 profile/路由两文件 7/7 通过，类型检查通过。
- 固定 SHA 六文件 21/21 通过，无失败测试尝试。
- lint、migration manifest/EOL、三套 freeze、diff、提交敏感扫描通过。
- profile 测试只创建独立临时目录，验证路径、重复准备、已有配置保留、相对路径拒绝；保留测试文件，不清理删除。

没有运行官方 app-server、没有修改用户现有 HOME/认证/会话。本阶段下一步是独立 Git 工作区与上述受管 HOME 下的实际加载检查，再推进原生会话与 Role 工具；完整验收目标仍未完成。
