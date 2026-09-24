# 受限进程启动诊断断点（2026-09-11）

本记录仅为无秘密诊断。默认 `tools/test-j3-access-environment.ps1` 仍使用 BuiltinUsers（BU）作为 restricting SID；只有显式 `-SystemObjectControl` 参数启用 BU + RestrictedCode（RC）机制对照。两者均不是生产权限方案。没有读取真实凭据，没有启动 Harness，没有修改既有 desktop/windowstation ACL，没有请求 UAC、切换可见桌面或按进程名清理。

## 已有结论与证据

每条结果位于 `evidence/J3/convergence/security/diagnosis-<run_id>.json`，含独立源码/runner/二进制 hash。不要把不同源码的通过项合成完整认证。

| run_id | 代码变化与结论 |
| --- | --- |
| 06dea3c906a74ef1a1266db6895b9330 | 补 TOKEN_ADJUST_DEFAULT 句柄访问位（0x8B）；新 token default DACL 设置成功，primary 仍 0xC0000022。之前错误5不能归因于系统不许设置该字段。 |
| 65207974263c452b94d1e59a6b1df36d | unnamed windowstation + CREATE_ONLY 返回183（已存在），未打开/修改既有对象。 |
| f2301dad9f8f46fcb2cda9fa608f84f7 | 唯一名称 + CREATE_ONLY 返回5；新命名 windowstation 未创建。 |
| 0d736abf11b94b92a954a6ddc5639beb | 显式新 child process/thread DACL 对照，仍 0xC0000022。 |
| 105d3a87c47b4025a32ad1718fa079c0 | BU模式原生 cmd `/d /c exit 0` 与 CLR probe 都 0xC0000022；不能仅归因 CLR。 |
| 6a7ea290a9af408b9720868cd2120e4f | WindowsIdentity.Groups 未提供 logon SID，实验未到启动；该查询方式不适合据此判断无 logon SID。 |
| b4d15bd3019341779456ff79873b3429 | 专用 TokenLogonSid 查询可用；logon SID 对照仍启动失败，且 broker memory 拒绝负测失败，此方案淘汰，不作默认。 |
| dd16cf1f7290433bb1c39d180a911d16 | RC单独：native cmd首次退出0；canary与broker负测通过，但probe/CLR文件读取拒绝，CLR仍0xC0000022。 |
| 83958f1c6ef14a679f52744851027913 | 显式 BU+RC：native cmd退出0；CLR变为0xFFFFFFFF，线程控制仍通过。 |
| d98f55d0a8f54a29bdc600ee38e6749a | BU+RC增加裸Node控制（无pi/Kimi配置）；Node进入代码，但完整控制退出1。 |
| 392d3bf8093c47d4a9d8ac96239d1c70 | 增加Node阶段数字：phase3失败。已执行dummy读写与canary读/写拒绝；icacls ACL负测失败，孙Node尚未运行。native cmd退出0；CLR仍0xFFFFFFFF。 |

解释边界：BU 与 RC 分别满足部分文件和系统启动对象权限，组合使 native Node / cmd 进入执行；这证明旧“所有 primary 进程均无法启动”判断过宽。尚未定位具体哪个系统对象导致 BU 单独失败，也没有证明完整生产隔离。

微软文档说明命名 windowstation 需要管理员组，CREATE_ONLY 遇已存在对象会失败。实验严格使用 CREATE_ONLY，未回退到打开既有 station。见 [CreateWindowStationW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-createwindowstationw)、[Process connection to a window station](https://learn.microsoft.com/en-us/windows/win32/winstation/process-connection-to-a-window-station)。仅引用 API 语义，不把它当本机完整根因证明。

## 当前源码与下一步

当前源码保留三种实际运行入口的区分：native cmd启动对照、Node子孙控制、CLR子孙控制。CLR失败没有被Node结果替换。默认BU保留，Logon SID方案不在当前源码。

最后运行与断点源码见 `diagnosis-392d3bf8093c47d4a9d8ac96239d1c70.json` 的 sourceHash / runnerHash。没有提交，由主执行者合并审阅。

下一独立增量应先把Node phase3拆成 `icacls spawn error布尔`、`退出码`、`随后canary重读拒绝`，只允许数字/布尔日志。当前未区分icacls执行失败和不符合预期退出码，不能声称ACL绕过或ACL保护通过。保持所有负测，确认后才进行孙Node控制。不需要用户重复执行旧脚本或UAC。

修改诊断后，再执行一次：

```powershell
& "E:\AgentRouter\.local\w11a\integration\tools\test-j3-access-environment.ps1" -SystemObjectControl
```

这个命令明确是诊断模式；不得拿它加载真实账号或作为生产 SecureProcessHost。

## 仍未测试或未通过

- Node ACL子进程负测未通过，孙Node未运行；CLR执行入口失败。
- 当前工作区BU/RC可见性只是新建dummy设置；**BU可能允许读取用户原始凭据路径中的继承权限文件**。没有读取真实凭据来测试，不能声称保护真实凭据。
- 所有出口封锁、reparse绕过、真实父句柄/监督器/Core接口、broker代码防篡改、完整子孙Job containment与native completion proof未完成。
- Node环境只是显式构造为SystemRoot，未在最新JS控制中完成逐字段断言；不能继承旧CLR尚未执行的检查。
- 默认/诊断过程均 `fullIsolationCertified=false`，SG仍阻断真凭据加载。

本次诊断到此收敛。保留必要带hash证据，停止相同失败重复；下一命令应在上述phase3具体诊断变化之后运行。

### 交付前 Reviewer 修正（仅编译验证）

将 native / Node 控制返回值纳入总退出码，避免实验失败而最终退出0。此次仅 csc 编译成功，没有新增运行；前述 runtime 证据仍对应各自旧 sourceHash，不归属到最终修正源码。watchdog 只终止手中直接自建 Process/handle，另依赖子进程自身超时；**不是 Job 整棵进程树清空证明**。未来生产必须补 Job containment 与空树证据。

## 主执行者进一步拆分（12cc236d87214600afe41b201d5c22e8）

有代码差异后实测：Node phase3，aclSpawnError=true、aclExit=-999（无退出码）、canaryStillDenied=true。确认为ACL工具未成功启动，未证明ACL绕过，孙Node仍未运行；native cmd 0、CLR FFFFFFFF。总exit1，fullIsolationCertified=false。

下一动作改为记录合成子进程spawn错误的数值errno，区分进程创建、stdio/管道、自身对象访问；不再把phase3笼统归为ACL权限修改失败。不需要用户重复脚本/UAC。生产SecureProcessHost、SG和真实Harness仍未完成。

## 完全访问权限后的对照（未加载凭据）

- de4155afdac942f1ac117505b44a885a：ignore：Node spawn errno -4048 EPERM；假秘密仍拒绝。
- 264e20c90c6f4cfa8a29eb1ee8c04959：新dummy文件fd：native、Node与孙Node通过，CLR失败。
- d6c4e3a3092841d2bbfc3847d4973f21：相对NUL测试不能代表设备（Node路径规范化）；撤回设备结论。
- 315752c6a3e14a37b946c69def8acc52：stdin文件fd，stdout/stderr pipe：spawn失败。
- c4b6c62b648a447e8294a281609adf94：真实NUL设备路径，但pipe仍失败。
- 28a56e9f0e604906bd44b1844d2d0f17：真实NUL读0、写-4048；文件fd下Node及孙Node控制通过；CLR仍失败。

文件fd正向检查保留原dummy读写、canary读写/ACL拒绝及孙Node同检查；没有把spawn失败当成ACL拒绝通过。其通过不包含CLR、Job树清空、出网隔离、真实凭据路径保护。相对NUL用例不是设备测试，后续改用显式\\.\NUL获得设备读写差异。

当前具体下一步：生产宿主显式创建/继承stdout/stdin通信句柄，分别验证服务端和受限客户端访问；调查libuv自动管道EPERM，不能关闭安全负测或开放系统对象ACL。Harness内部采用ignore/pipe的工具调用仍未兼容，不得加载真实凭据。Node24.14.0，libuv1.51.0。
