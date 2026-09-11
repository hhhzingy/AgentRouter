# J3 真实联调收敛进度（未完成验收）

源码 f79037ec6a554397599d15791fb602235b0905af；分支 feat/v1-finalization-j3。当前真实 Harness 支持 0，新增付费调用 0。不合 main、不发布。

已实现：生产注册配置与SQLite迁移003、三家协议生命周期组合、持久会话与epoch保护、可信工具授权、取消后停止证据/UNKNOWN清理保留；新版工作台+生产Core打包。安全代理拒绝目标覆盖、秘密反射及无效UTF8。

已测试：固定源码310项全仓、38项Electron检查；新包真实命名管道/Fixture禁用3项，真实打包Electron创建项目和重载显示2项。截图在 evidence/J3/convergence/f79037e/workbench.png。pi 0.85.1仅空HOME离线RPC两项，model catalog为空，不是DeepSeek真实任务。

修复记录：Windows探针把复用ACL对象的无操作误当成功，已更正并保留前后证据；Kimi配置回执核验currentValue；首次工具调用先accepted；停止未知保留清理对象；会话保存检查epoch；独立审查发现JSON转义秘密检测绕过，已用解析后字符串/属性名检查修复。GUI测试先误用不存在s.close，随后关闭等待未完成，修正仅终止自建GUI/Core并有界结束，最终退出0。

被阻断：受限主令牌子进程退出0xC0000022，独立终端无秘密对照待用户。SG尚未通过，真凭据未加载。

未实现/未测：SecureProcessHost实际OS启动与出口封锁、真实账号注册/切换、pi SSE代理、GUI真实Harness任务、三家工具/交接/取消/恢复、Codex独立DUT切号和重启、干净Windows部署与实际升级回退；SSH按用户暂缓。现有包不是可认证V1.0，也不是最终可用交付。

生产包：release/AgentRouter-j3-f79037ec6a55-d4cdab62-85b4-4df0-8f61-2a16d9248c2c；运行electron.exe。artifactHash 0085372c10a75d417f5af95828e04841ef9a2ff9eb7ea897eeb764b7d5d9965d，sourceDirty=false。仅用于本地工作台验证，不导入真实账号。

迁移会保存升级前备份；回退需停写、恢复对应数据库备份并使用匹配旧代码，不直接降级现库。固定证据见 evidence/J3/convergence/f79037e/index.json；当前断点见 checkpoint.md。
