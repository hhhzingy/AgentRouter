# J3 真实联调收敛：Windows 隔离诊断

## 当前结论

仅在本次新建假数据目录验证，无真实凭据读取、无开发 Codex 认证/进程改动、无全局 ACL 放宽。

**线程访问控制已通过；受限 primary token 进程尚未通过启动后的控制测试，因此安全 Gate 未通过，不加载真凭据。**

旧探针同时写 owner 与 DACL，造成错误的环境归因。DACL-only 实际可以设置；单独重设相同 owner 被拒绝，HRESULT -2147024891 / Win32 5。

另发现并修复探针自身错误：同一个 `DirectorySecurity` 对象经持久化后会清除修改标记，再次传入可能不执行真正 ACL 系统调用。首轮把这种无操作当成可修改 ACL，结论不成立，已撤回。修复后每次创建并标记新的 DACL；真正增加 BuiltinUsers 读取 ACE 的操作被拒绝，之后读取仍被拒绝。没有成功复现 ACL 绕过。

## 实测记录（不把不同源码结果混用）

每份 `evidence/J3/convergence/security/diagnosis-<run_id>.json` 固定源码、runner、二进制 SHA256；它们是未提交源码实测，不继承 HEAD 的认证。

| run_id | 变化与实测 | 结果 |
| --- | --- | --- |
| 562b42780b204552a587c7a59c9a4172 | 分离 DACL / owner；普通和 restricted dummy 正向、broker 内存拒绝 | DACL PASS；owner DENIED；合并 ACL 负测 FAIL，后查明探针无操作 |
| 247a6ff37a1544c59400d6d0a8a9f849 | 拆分读/写/ACL 负测 | 读写拒绝；复用对象 ACL 负测误报，不能证明漏洞 |
| c50629e72416486298f96c71b1142e4e | 真正增加 Users ACE；新增 OWNER RIGHTS 对照 | 新授权尝试被拒绝；旧负测仍受复用错误影响 |
| 19459b5784864b17ae7309c2c7c1a58e | 每次 fresh DACL；授权攻击与重读分开 | 所有线程正负控制 PASS，退出 0 |
| 59e515a775a74260bc50f8544e81f0ef | 增加 restricted primary token 子孙进程控制 | 所有线程控制 PASS；CreateProcessAsUser API 成功，但子进程退出 3221225506（0xC0000022，STATUS_ACCESS_DENIED），子孙控制 NOT_RUN |

最新运行 712 ms，无 watchdog 超时，无 stderr，源码 SHA256 `a6945bfa77a21cdf10bf1125f5b77988803b0849e731730252acd33ea6508d2a`。环境为 NTFS 固定卷、medium 完整性 RID 8192、管理员组未启用；共享证据仅记录 ownerMatchesPrincipal、组数、ACE 数，不记录真实账号或 SID。

## OWNER RIGHTS 与进程方案

微软说明：对象 ACE 使用 Owner Rights SID `S-1-3-4` 后，不再隐式授予 owner READ_CONTROL / WRITE_DAC。本探针只对新假 canary 目录加此 SID 的 ReadPermissions ACE，保留当前可信 principal 显式 FullControl。见 [Microsoft Security identifiers](https://learn.microsoft.com/en-nz/windows-server/identity/ad-ds/manage/understand-security-identifiers)、[Standard access rights](https://learn.microsoft.com/en-us/windows/win32/secauthz/standard-access-rights)。

实测原 DACL 和 OWNER RIGHTS DACL 对本次 restricted token 均拒绝真正的 ACL 修改。不能据此声称 OWNER RIGHTS 是当前环境唯一必要修复，也不能将未复现的攻击写成已发现漏洞。

进程方案使用 `CreateRestrictedToken` + `CreateProcessAsUser`，不继承句柄，环境块只允许 SystemRoot，工作目录是新 dummy 区。子进程计划执行 dummy 读写、canary 读/写/ACL 拒绝、环境字段检查，再启动继承同 token 的孙进程重复控制。每个自建子孙进程有 10 秒退出上限；父方等待 primary 15 秒，超时仅终止手中自建 process handle；runner 另有 30 秒 watchdog。当前启动后 0xC0000022，控制入口未确认到达，不能计为子孙隔离通过。

当前证据不足以区分原受控 Shell 的附加 token 限制、加载器/系统对象/桌面访问等因素。没有错误地把它归因于缺少管理员权限。需要普通独立终端对同一无秘密程序做一次对照。

## 最小用户行动单

在普通独立 PowerShell（无需管理员）运行一次：

```powershell
& "E:\AgentRouter\.local\w11a\integration\tools\test-j3-access-environment.ps1"
```

动作仅编译已审查探针，在新的 `.local/j3-access-check/<run_id>` 下创建假文件与局部 ACL，启动有限时的自建测试进程；不登录、不读取凭据、不操作已有账号、不关闭任何用户进程。完成后只回报脚本打印的 `Result:` 路径和 `Status:`，不要发送任何秘密。

预期：比较 primary 进程是否仍返回 0xC0000022。若普通终端通过，下一步固定该运行入口并实现生产监督器边界；若仍失败，依据新的结果定位加载/系统对象权限，不重复相同失败、不默认请求 UAC。

## 仍未认证的完整安全 Gate

SEC-01 的 DACL / owner 诊断已具备。SG1—SG3 尚未通过：实际子孙进程正负控制、父句柄/环境/内存/重解析点绕过、broker 程序配置防篡改、Core 管理与监督器接口拒绝、假 Provider 消息体秘密扫描、非允许目的地出网限制均需各自证据。线程模拟通过不是完整进程沙箱，任何时候 `fullIsolationCertified=false`。

## 用户普通终端对照及启动细分

用户结果 ed6b39e26cc2460bb953c3641f5e3a06，相同sourceHash，460ms、exit1、primary 0xC0000022。排除“仅Codex受控Shell导致”的归因；不要求用户重复或UAC。

4d940f 探针在impersonation内取MainModule失败，属于对象查询失败，不能断言exe文件不可读。d5dea2把路径预解析，exe/ntdll/clr读取全部PASS，primary仍失败。e49d1a设置默认对象DACL本身被拒绝（句柄缺TOKEN_ADJUST_DEFAULT），未形成有效对照；后续由诊断支线修正句柄权限后重新验证，不作为生产权限方案。继续调查新进程/私有桌面对象，未修改现有桌面或系统ACL。

本地真实HTTPS socket四项（timeout/overflow/redirect/success）全部PASS，每项1次请求、剩余socket0；证据https-socket-controls.json。只用合成凭据与一次性自签证书，由测试子进程单独信任；不是实际Provider/出网封锁认证。

增补TLS负向控制PASS：不信任新自签证书时TRANSPORT_FAILED、HTTP请求0、剩余socket0。Reviewer只读确认测试使用生产directHttpsTransport，socket断言在测试强制清理前，信任环境只对子进程生效。
