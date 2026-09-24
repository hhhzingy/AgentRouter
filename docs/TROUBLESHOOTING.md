# Troubleshooting

## 双击后没有窗口

1. 确认完整解压 ZIP；
2. 从解压目录运行 `electron.exe`；
3. 不要只复制一个 exe；
4. 查看 Windows 是否阻止 unsigned portable app；
5. 确认包文件未被杀毒软件隔离。

## 找不到原来的 Project

确认是否改变了数据目录。

如果曾设置 `AGENTROUTER_DATA`，不同路径代表不同本地数据集。

## Harness 不可用

检查：Harness 是否已安装、executable 路径、executable SHA-256、session home、provider/model、登录/provider credential 是否有效、profile 是否属于受支持版本。

不要为了通过检查随意复制别的账号配置。

## WorkSession 不能继续

确认是否当前 ACTIVE。历史 WorkSession 是只读，这是设计要求；如果需要新上下文，创建新的 WorkSession。

## Result 已 PUBLISHED 但没有 Accepted

这是不同状态。

`PUBLISHED` 表示 Result 已发布；`Accepted/Rejected` 是后续 review 结论。

## Remote 打不开

检查 Remote Gateway 是否启用、Tailscale 是否在线、Serve 配置、手机是否在同 tailnet、URL 是否为正确 Core、device 是否被 revoke。

## 操作超时后不知道是否成功

不要立刻重复点击。

正确处理：查询 operation/status → 根据已有 operation id reconcile → 确认没有提交后再决定下一步。

## Kimi/DSH 偶发失败

模型/Harness 本身可能有瞬态行为。

先保存当前 Run/错误证据，再用同一受控配置做有界重试；不要自动切账号或 provider。
