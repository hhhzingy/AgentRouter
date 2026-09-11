# J3 完整调试执行记录（进行中）

本记录不代表完整 V1.0 验收。用户已扩大为完整调试、记录后优化，本轮排除 Codex 账号切换。保持 hzxpro 开发会话，不读取开发凭据，不合 main。

## 已实现和修复

源码提交：211abf361c5fb93722a20c41bd98b4bd21592d49。

最小复现发现 NativeRpcPeer 的 onDisconnect 抛错会逃逸异步 writer，造成未处理 Promise 拒绝。复现进程退出 1（尽管测试断言显示通过，Vitest 报 unhandled error，因此记录为失败）。修复保持关闭、拒绝全部 pending、清除待写队列，不重试；记录无秘密布尔诊断标记。新增两项测试覆盖观察者异常、多 pending、迟到 writer 成功不发旧队列。独立只读评审无阻断意见，建议覆盖已落实。

Windows 进程树测试支持项目内独立证据目录，避免覆盖历史证据。

## 已测试

固定源码全仓门禁退出 0：252 项测试通过；冻结合同生成/hash、类型检查、索引/历史秘密扫描通过。实际 Electron 38 项检查通过（B0 2、W11 4、J1 12、J2 20），业务执行为 Fixture Core，真实 Harness 支持数仍为 0。Windows 自建父子孙进程树 20 项通过，未操作用户进程。J2 和进程树报告均 sourceDirty=false；执行期间新增的独立环境检查脚本未参与受测应用构建。

证据：evidence/J3/full-debug-20260911/result.json，包括文件 hash。截图有内容；已人工查看角色对话截图，明确显示模拟执行器、真实 Harness 支持 0。原生目录对话框返回值为受控测试，不能算人工原生对话框验收。

前基线 ac74c7ee229bd19c251d6727ea2eb9f5c9c66d21 的 CI：34547563081、34547563154 success。修复提交的 CI 单独查询记录，不继承前基线结果。

## 被阻断、未实现与风险

- SG-1 静态扫描通过不等于 SG-2 假 Provider、SG-3 完整 canary 通过。Windows 访问检查在新目录设置 ACL 处被拒绝，尚未认证认证进程与工具进程的权限隔离。
- 当前生产入口仍 FixtureDriver，非 fixture 无真实执行器，Linux 入口仍拒绝；Kimi/pi 生命周期、生产账号存储/工具连接及 SSH 等核心工程缺口未关闭。不能只改能力标记。
- build:win 仍指向旧桌面/旧 Core，未生成正式候选包；备份升级回退、干净安装、长期 soak 和全部六组合尚未实测。
- 完整付费测试费用上限、SSH alias/核对指纹/授权目录、独立 Windows 和人工时间已合并请求；Kimi 第二账号未提供。Codex 切换为用户明确排除。
- 本批没有新增真实付费调用。之前 DeepSeek 单次 9 token 仅直接 API 联通，未冒充 pi 通过。

## 用户环境配合与恢复入口

先在普通独立 PowerShell（无需改开发账号）执行 tools/test-j3-access-environment.ps1。脚本只编译已有无秘密 canary，在项目 .local/j3-access-check 下新建目录，检查假文件 ACL 和自建假 broker；不读取账号、不联网、不更改已有目录 ACL、不全局杀进程。只回报 result.json 路径及状态。该脚本仅通过语法检查，未在独立用户终端实测；即使结果 PASS，也仍需实现并验证完整进程隔离。

后续继续生产后端/迁移/六工具及 Kimi/pi 生命周期、秘密隔离实现；环境齐备后执行真实组合、取消/恢复、SSH、正式包和现场验收。未实测项保持未通过，不进入 main/tag/release。

## 用户后续授权更新

费用无上限；目录全范围授权，但开发产物仍限 AgentRouter 内，保留已有资产和开发身份保护。SSH 联调暂不进行，状态改为 DEFERRED_BY_USER，不再索取 SSH 条件。本地真实测试预算已解除阻断，仍需先通过秘密隔离；Codex 切换继续 EXCLUDED_BY_USER。修复源码 211abf361c5fb93722a20c41bd98b4bd21592d49 的 CI 34550830283、34550830431 均 success。
