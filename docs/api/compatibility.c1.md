# C1 兼容性表

| 项目              | 冻结值/状态                                   | 验证范围                              |
| ----------------- | --------------------------------------------- | ------------------------------------- |
| 客户端协议        | agentrouter-client/1，C1                      | Schema、生成、Mock、合同测试          |
| 业务 Route 协议   | agentrouter/1.0                               | 原核心回归；未改变收尾语义            |
| CoreTransport     | 接口及 InMemory                               | Local/SSH 生产实现留待 W11/W12        |
| 控制租约          | 1 controller，多 observer，Mock TTL 30秒      | 内存合同；非真实跨主机认证            |
| 管理幂等          | principal/client/operation；业务全局 revision | 断线重连 Mock；未证明 Core 崩溃持久性 |
| AuthUnit          | max_active_runs = 1                           | 大于1明确阻断测试                     |
| SQLite            | 安全下限3.53.4；实测 [3.53.4,3.53.5)          | 真实驱动3.53.4，其他安全版本只读诊断  |
| Node / Electron   | 24.14.0 / 44.3.0                              | 当前 Windows 开发机                   |
| Codex / Kimi / pi | 0.153.4 / 0.41.0 / 0.85.1                     | 沿用无账号探测，不是完整 Adapter      |
| git/live 引用     | false                                         | capability 明确不可用                 |
| artifact 输出     | artifact                                      | 已有冻结文件回归；客户端下载未实现    |
| 远程目录          | opaque path_handle 合同                       | 暂不可用，不调用本地目录代替          |
| UNKNOWN           | action/证据/审计合同；Mock 审核               | 真实核验与解除在 W11/W13              |
| 真实 Harness 支持 | 0                                             | 无真实账号、无真实 SSH                |
