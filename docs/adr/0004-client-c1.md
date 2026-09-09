# ADR-0004：C1 客户端、Local/SSH 传输与单 Controller

状态：C1 提交冻结，待用户复核；2026-09-09。

背景：基线桌面固定启动本地 Core 子进程。为 Windows GUI 管理 Linux 长期 Core，需要共享合同，不能把 SSH 生命周期当作业务生命周期。

决定：管理 Client API 使用 agentrouter-client/1，与 Harness run-scoped Route 身份分离。CoreTransport 抽象 LocalStdio、SshStdio、InMemory；本轮只提供接口和 Mock，生产接线后续完成。Linux Core 由 systemd --user 常驻，SSH 只运行桥并连接 Unix Socket，不打开 SQLite、不启动第二 Core、不开放公网端口。不开启 lingering，除非用户明确选择。

SSH 使用系统 OpenSSH、Host Alias、参数数组、BatchMode、禁用 agent/X11/端口转发，主机密钥必须验证。实现留待 W12；本轮无真实 SSH 测试、不读 .ssh 或私钥。

单 controller 有短期租约，多 observer 只读。principal 来源于受信任 OS 连接，client_id 仅稳定安装标识。写操作有幂等键、全局 expected_revision 和作用域；snapshot+cursor+catchup 恢复 UI。GUI 断开不调用 shutdown、不取消业务，未知副作用进入对账。

合同来源唯一为 JSON Schema，所有 TypeScript ViewModel、方法表由自带确定性生成器产出，无新增依赖。命令失败不回显任意异常。未实现方法通过 capability 拒绝，不把类型声明当作支持。

AuthUnit V1.0 最大活跃 Run 固定为1，配置大于1明确阻断调度。基线 SQL 保持原样，不把未经迁移的约束变更伪装成兼容升级。

SQLite 安全下限3.53.4；当前只实际验证区间 [3.53.4,3.53.5)。版本比较与区间配置分离，未来实测后可扩展。低于安全线拒绝；未知安全版本进入只读诊断入口，不执行迁移/调度。不能为了“范围支持”把未测试补丁写成已验证。

通知直接从持久 messages 的明确收件人投影，不进入可唤醒 Outbox；上下文按段最小披露。原生 HELD 屏障、显式结果去向、FIFO/关联续办和 UNKNOWN 不重跑保持原语义。

取舍：C1 全局修订会造成无关写操作冲突，但边界简单、可复核；未来放宽需 CCR。Mock 账本与审计仅内存，不提供重启耐久性。旧桌面入口暂存，后续统一切换，不在合同冻结时修改 Renderer。
