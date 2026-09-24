# J3-00 独立只读评审

Reviewer：j3_readonly_review。只读，无写入、凭据读取或服务启动。基线 62b2e187285aeb0fd73926cdc47c8d830502fb97。

- P0：WindowsSupervisor 的 Job Object 只管理生命周期；当前用户和继承环境不构成秘密隔离。需要独立 OS 身份及 shell/plugin/子进程 canary 实测。
- P0：FixtureDriver 直接 spawn，父进程 close 不能证明孙进程停止；生产路径必须由 supervisor 提供整棵进程树停止证明，否则 UNKNOWN/QUARANTINED。
- P1：w11-main 无条件 FixtureDriver；调度、Bootstrap、收尾、关联结果续办逻辑应提取为单一协调层，实际 Adapter 不可旁路。
- P1：账户只有注入式 SwitchPort；需持久化切换阶段、auth_unit 锁、最新凭据快照、身份核验、epoch 和崩溃恢复。
- P1：Windows endpoint 的 mode 0600 不证明 ACL 隔离；agent 子进程不能取得人类控制凭据。
- P1：build-win 仍指向旧入口与单迁移；正式包需新工作台、生产 Core、完整迁移及 runtime/helper hash。
- P1：三家现有 Adapter 仅事件归一化；原生 session/turn/epoch、逆向请求、取消与收尾均须真实驱动。
- P2：已知 token 前缀扫描不能替代秘密隔离；需无前缀 canary 和假 Provider 覆盖全部输出通道。

集成负责人确认以上均为未关闭缺口，不更改能力徽标冒充支持。保留现有 Fixture 双门禁、Route principal、UNKNOWN 隔离、HELD 和诊断白名单。
