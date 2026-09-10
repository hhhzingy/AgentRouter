# CCR-J2-01：本地客户端稳定身份

范围：有限本地 Main/preload 元数据扩展，不改变 C1/C1R1/C1R1P1 冻结 Schema、方法表、生成文件或 SQL 迁移。

现有 serverInstanceId 表示启动世代，不能通过截断字符串充当稳定身份。认证的本地网关增加只读 desktop_context，Core 返回持久 app_meta.dataset_id、已初始化连接的 clientId 和本次 serverInstanceId。Main 校验发送者，仅向沙箱 Renderer 暴露当前连接上下文；Renderer 检查启动世代一致后按 mode/dataId/clientId 分区。该扩展不是通用文件访问，也不授权 SSH 或新增真实账号能力。

旧客户端继续使用原冻结合同，不调用扩展即保持原行为。新客户端缺少可信上下文时不得把 LOCAL_CORE 降级为模拟记录。原命令 operationId 和 expectedRevision 在未知重试中保持，租约重新取得。

待核对正文使用随机 recordId 存在结构化值中，不作为索引键；诊断只含元数据。相同数据实例旧格式迁移保存回滚副本再清旧条目；未知归属记录保留隔离，不自动发送。前端存储尚不等价于 OS 秘密隔离，清理不取消 Core 任务。
