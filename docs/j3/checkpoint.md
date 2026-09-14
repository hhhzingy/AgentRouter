# 当前执行（2026-09-12 续2）：P0 完成

- **P0 全部完成**（HEAD c32bef0 起，未动开发配置/认证/进程）：
  - 经管理MCP验证真实Core（instance dataset_7a83c1c7…，mock=false，C1R1P1）；发现会话内网关在Core重启后报 CONNECTION_LOST(AMBIGUOUS) 无自动重连，新stdio客户端正常——记为改进项。
  - baseline.json（.local/nextround-p0/）：git/HEAD/实例/工具数(observer16+controller24)/运行时版本/数据目录清单(仅文件名与大小)/迁移EOL状态。
  - **受管ZCode配置继承负测 PASS（决定性）**：沙箱HOME+AGENTROUTER_MANAGED_ROLE=1+cwd=E:/AgentRouter 下，官方 zcode 0.16.5 确实从 E:/AgentRouter/.zcode/config.json 发现并拉起 agentrouter-management；守卫生效（MANAGEMENT_START_DENIED，0工具注册）。**新敞口**：插件层 node_repl 不受workspace配置管控，连上并注册3工具——P2驱动须用 --disallowed-tools/插件禁用收紧；受管实例暂不加载真实凭据直至收紧完成。证据 evidence/J3/nextround-p0/managed-zcode-inheritance.json。
  - 构建EOL guard+迁移manifest：docs/api/freeze.migrations.json（001–004 LF字节sha256）+ tools/check-migrations.mjs（--staged 支持）+ 单测 migration-manifest.test.ts；防CRLF回退制度化。
  - 能力探测（evidence/J3/nextround-p0/capability-probes.json）：**DeepSeek官方Harness= @deepseek-ai/dsh 0.1.5-rc.1**（profile插件栈；含 dsh-acp 0.1.5-rc.2 "Automation-only ACP server over JSON-RPC stdio" + dsh-session/session-persistence-jsonl）→ P2 以 dsh ACP 为接线目标，session/resume 待真实DUT验证；ZCode CLI 0.16.5 具备 app-server/--prompt/--resume/--settings/--disallowed-tools，均为P2驱动候选杠杆（未实测协议细节，不猜）。
  - checkpoint 口径已按包01纠正：覆盖率/单轮成功率/尝试分母分开记录。
- 下一动作：P1 RoleSession 最小切换闭环。

# 当前执行（2026-09-14）：Closeout R1 提交——DeepSeek bootstrap 诊断排队

- **提交历史**(本批 R0—R1):e6b2d8e F-01 → 18e92af F-02/F-03 → 0c2ad50 C1R1P2 → 39db583 plans fix → 320999b/39db583 CI 全绿 → dfe0aed/a68bd0b CCR批准+实施 → 39db583/a68bd0b CI → 96a8ac8 checkpoint → d59081b/39db583 checkpoint。
- **DeepSeek 生产 E2E 剩余唯一阻塞**:bootstrap FAILED——dsh 进程在 supervisor 内启动/握手失败。诊断状态:core stderr 为空(dsh stderr 未透传到 core);需要 supervisor 或 host 增加 stderr 转发;ACP 层直探三项已验证可用(task end_turn/resume 47/cancel cancelled)。下一轮从 supervisor stderr 透传开始。
- **SSH**:用户确认 OpenSSH.Server 仍 NotPresent——需管理员 PowerShell `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0.0` 后 `Start-Service sshd`;或从 GitHub 下载 OpenSSH 独立包。
- **dsh key**:用户确认使用 Deepseek.txt 的 API key(DEEPSEEK_API_KEY 注入已实现)。

# 当前执行（2026-09-14）：Closeout R2 完成 + R3 排队——全部 410 项 PASS

- **R2 C1R1P2 收口确认**:兼容测试 4 项全过(P1 拒绝动态计划/P2 validate+apply/未注册拒绝/旧连接投影裁剪)。旧协议连接快照裁剪先于冻结投影。
- **R3 DeepSeek**:P2 升级+Plan 应用+Native 注册(006 无 CHECK 阻碍)全通过;bootstrap FAILED——全量 env 诊断排除 env 差异;根因在 supervisor 内 dsh 子进程 stderr 未透传到 core(需修改 Supervisor.cs 或 host 增加 stderr 管道)。ACP 层直探三项(task/resume/cancel)已验证可用。
- **全仓 66 文件 410 项 PASS**;三套冻结+迁移守卫 PASS。

## 排队(R2→R6)

- **R3**: Supervisor.cs 增加 stderr 透传管道(或 host 层 NativeProcessBackend 读 supervisor stderr 尾部写入 FAILED attempt)→ 修复后跑 DeepSeek 生产 task/resume/cancel/handoff
- **R4**: NativeSessionStore 接入 RoleSession(NativeSessionRef 按 session 而非 binding);A/B 会话隔离/切回/A→B→A→C;交接包+ACK;GUI RolePage 会话切换工作流
- **R5**: Kimi→DeepSeek 显式 fallback(provenance 入 Run);ZCODE_DUT 独立登录;SSH 安装(NotPresent,见下);真机
- **R6**: 单一干净 SHA 全量验收 + RC 报告

## 用户动作

1. SSH:OpenSSH Server NotPresent(Add-WindowsCapability 静默失败)。尝试 GitHub 独立包:
   ```powershell
   # 管理员 PowerShell
   curl -L -o C:/temp/OpenSSH-Win64.zip https://github.com/PowerShell/Win32-OpenSSH/releases/download/v9.5.0.0p1-Beta/OpenSSH-Win64.zip
   Expand-Archive C:/temp/OpenSSH-Win64.zip C:/temp/OpenSSH
   C:/temp/OpenSSH/OpenSSH-Win64/install-sshd.ps1
   Start-Service sshd
   ```
2. 真机手机:装 Tailscale → 访问控制台

# 当前执行（2026-09-13）：Closeout R0—R1 完成——F-01 修复 + Participant grant 生命周期

- **R0 基线**: HEAD=320999b 与包基线一致,树干净。工单 F-01—F-12 已映射到待办。执行包路径 E:/AgentRouter/docs/执行包/AgentRouter_V1_Closeout_20260913_320999b。
- **F-01 修复(e6b2d8e)**: 迁移007恢复 one_current_binding_per_role 唯一索引;006 执行器补提交前 foreign_key_check;存量冲突显式失败不自动修复。测试 DB-01—04(v5→v6→v7升级/冲突安全失败/FK违规回滚/幂等)。
- **F-02/F-03 修复(18e92af)**: Participant 聊天级 grant 生命周期(participant_grants 表迁移008)。grant_issue/revoke/list 管理面工具(全局租约);participant.attach 需 grant 凭据;同角色新签发撤销旧 grant(PARTICIPANT_GRANT_REVOKED);断连/撤销后写被拒。HTTP入口 body>1MB 413、token 按角色隔离。受控单会话模式:新接管=管理面签发新 grant,旧聊天不能自动重挂或自签发。stdio/http 双入口测试通过。
- **F-04 C1R1P2 收口**: P2 响应跳过已改为完整 wire 帧;动态能力经 contract.upgrade 返回;旧协议快照裁剪动态角色(裁剪先于冻结投影);兼容测试4项全过。
- **全仓 66 文件 410 项 PASS**;三套冻结+迁移守卫 PASS。CI 全绿(18e92af)。

## 排队(下一批)

- R3: DeepSeek supervisor bootstrap 诊断(supervisor spawn 链 vs 直探环境差异)
- R4: 同角色原生 A/B 会话隔离/切回/A→B→A→C/交接包/ACK/GUI(F-05/F-06)
- R5: Kimi→DeepSeek 显式 fallback(provenance 入 Run);ZCODE_DUT;SSH(待提权重装 sshd);真机
- R6: 单一干净 SHA 全量验收 + RC 报告(合 main/tag/发布继续冻结)

# 当前执行（2026-09-12 续11）：39db583 CI 全绿——P3 attachment 与 C1R1P2 均已落地

- 分支头 39db583(plan.ts shapeOk 漏提交已由 39db583 修复提交补齐):两条 CI SUCCESS。树干净。
- 修复了续10遗留:rolePlan.apply 在 P2 连接上的两个问题——①createRole 的 harness 白名单走 setAllowedHarnesses 视图(management.ts,宿主注入 drivers.list());②mutate 内 validateResponse 对 P2 跳过(动态 harness 响应不走冻结 schema)。
- 迁移 006 已实测:deepseek_harness 写入 bindings/native_binding_configs 无 CHECK 阻碍。
- DeepSeek 生产 E2E 剩余唯一阻塞:bootstrap FAILED——dsh 进程在 supervisor spawn 链内启动/握手失败(ACP 层同环境直探三项已验证)。已具备 core stderr 捕获,下一轮专项:对比 supervisor 环境与直探环境差异(PATH/DSH_HOME/TTY/stdio 句柄),修复后即跑完整生产闭环。
- 排队不变:Kimi fallback(provenance 入 Run)、ZCODE_DUT、真实 SSH(待提权重装)、真机、最终 RC(单一干净 SHA 全量验收后才合 main/tag/发布)。

# 当前执行（2026-09-12 续10）：CCR-J3-DRIVER-01 批准实施——C1R1P2 动态 HarnessId 落地(0c2ad50)

- **C1R1P2 已实施**(用户批准 CCR 后):contract.upgrade 扩展协商(C1R1P1 连接初始化后升级,observer 拒绝);c1r1p2.ts 内存派生放宽校验器(C1R1P1 schema + role-plan v1 schema 的 harness 枚举 → HarnessId 模式,冻结文件字节不变);rolePlan.validate/apply 接受注册表内 harness(deepseek_harness/zcode),未注册 → UNSUPPORTED_HARNESS/CAPABILITY_UNAVAILABLE;旧协议连接快照投影裁剪动态角色(裁剪先于冻结投影)。
- **迁移 006**:account_profiles/auth_units/bindings/native_binding_configs 移除 harness CHECK(表重建,FK OFF+检查,before-v6 备份);binding/native_binding_configs 已实测插入 deepseek_harness。
- **管理面 createRole** 走 setAllowedHarnesses 视图(宿主注入 drivers.list())。
- 兼容测试 4 项全过(P1 拒绝动态计划/P2 validate+apply/未注册拒绝/旧连接投影);全仓 64 文件 403 项 PASS。
- **DeepSeek 生产 E2E 进行中**:Plan 应用+Native 配置注册 ✓(006 生效),bootstrap FAILED——dsh 进程在 supervisor 环境内启动/握手失败,原因待查(ACP 层同环境直探已验证可用,差异在 supervisor spawn 链)。已具备 core stderr 捕获,下一轮专项定位。
- 其余排队:DeepSeek bootstrap 诊断→生产 task/resume/cancel/handoff;Kimi→DeepSeek 显式 fallback(profile+provenance);ZCODE_DUT;SSH/真机;最终 RC。

# 当前执行（2026-09-12 续9）：下一轮主线第一批——P3 attachment 修复 + 手册/CCR 修订

- **P3 架构修复(fb1b39c)**:ParticipantClient 不再申请全局 Controller lease。新增 participant.attach(Role-scoped,generation 单调,同连接幂等,断连清理);conversation.sendUserInput 与 participant.artifact 走 attachment 旁路(本连接持当前 generation 即免 lease,其余 mutation 仍需全局租约);旧 generation 写入返回 PARTICIPANT_GENERATION_STALE。修复了参与者与 Management/GUI 的 30s 租约争用、网页会话 >30s 写入失败。
- **测试**:tests/integration/participant-attachment.test.ts(>120s 时钟前进写入、管理面并发 acquire、旧 generation 拒绝、断连重挂 gen3)+ participant-http.test.ts(错 token 401、>1MB 413、token 按角色隔离文件)。全仓 63 文件 399 项 PASS。
- **HTTP 入口**:请求体 >1MB 拒绝 413;token 按角色隔离文件 participant-token-<roleId>.txt;去 lease 改 attach。
- **ChatGPT 手册修订**(交接包 01):通道划分——Tailscale Serve 仅手机/tailnet Web 只读;网页 ChatGPT 走官方 Secure MCP Tunnel(桌面端隧道),宿主无 write MCP 权限则 BLOCKED_BY_HOST。
- **CCR-J3-DRIVER-01 重写(dfe0aed)**:C1R1P1 永久冻结;C1R1P2 = contract.upgrade 扩展协商 + 动态 HarnessId(注册表运行时判定)+ capabilities map + 兼容性测试定义。**待用户批准后实施**;实施完成即跑 DeepSeek 生产 task/resume/cancel/handoff(--dsh 已备)。
- 其余排队:C1R1P2 实施→DeepSeek 生产闭环;ZCODE_DUT 独立登录流程;Kimi→DeepSeek 显式 fallback profile+provenance;真实 SSH/真机/最终 RC。

# 当前执行（2026-09-12 续8）：执行包P0—P5全部推进完毕,最终候选 5ee6c39

- **最终候选**: release/AgentRouter-j3-5ee6c39f9b06-*(artifact 63804aac…),打包Electron验收 PASS(真实项目创建/重载持久化/截图)。含本会话全部增量:RoleSession、驱动注册制、两新驱动、Participant MCP(stdio+HTTP)、SSH桥、Web控制台。
- **联合抽查(最终bundle)**: kimi→pi、kimi→codex 通过;pi→kimi 遇已知K2.7波动后按规则停止重试(方向级累计6/6覆盖不变)。证据 evidence/J3/production-pair/7228939-finalbundle。
- **Kimi 5h限额备选(已查明,未启用)**: kimi-code 0.42.0 内置 deepseek vendor 注册(DEEPSEEK_API_KEY 环境变量,api.deepseek.com,含 deepseek-v4-flash 系模型);限额阻塞时在受管 prepare 注入该环境变量并选用 deepseek 模型即可,无需改配置文件。触发时再实现注入。
- **执行包完成度**: P0✓ P1✓ P2✓(dsh生产E2E BLOCKED_BY_CONTRACT待CCR) P3✓(网页闭环待ChatGPT连接器权限) P4✓(真机/真实sshd待用户) P5✓(候选PASS,正式发布仍冻结)。
- **剩余用户动作(不变)**: ①提权重装 OpenSSH Server(sshd.exe 仍缺)后跑真实SSH E2E;②按交接包跑 ChatGPT 网页闭环(需连接器权限);③真机手机验收;④批准 CCR-J3-DRIVER-01 解锁 dsh/zcode 生产E2E;⑤实际验收后合 main/发布(仍冻结)。

# 当前执行（2026-09-12 续7）：用户动作后增量——DeepSeek真实三项/SSH桥/手机仿真/ChatGPT交接包

- **DeepSeek Harness 真实三项(ACP层,授权API key经DEEPSEEK_API_KEY环境变量)**:任务 end_turn;跨进程 session/resume 后上下文延续(轮2回复47);取消 cancelled。协议要点:JSON-RPC 2.0 信封必须显式。证据 evidence/J3/nextround-p0/dsh-acp-real-probes.json。
- **生产E2E BLOCKED_BY_CONTRACT**:冻结 schema rolePlan.runtime.harness/capabilities.harnesses 枚举仅三家,客户端传输即拒;CCR-J3-DRIVER-01 记录提案(枚举扩 zcode/deepseek_harness,需合同修订),不偷改冻结、不用pi+DeepSeek冒充;test-j3-production-pi --dsh 已备,合同扩后即跑。
- **修正**:profileRef 是 profile id 非 CLI 路径;zcodeCli/dshBin 经 builtInDrivers()+宿主 options 注入;dsh 生命周期补 mcpServers;prepare 分支注入 DEEPSEEK_API_KEY(仅环境变量,不落日志)。
- **SSH**:用户已装 capability 但 sshd.exe 实际缺(仅11客户端文件)→ 需提权重装;apps/ssh-bridge(stdio帧桥,sshd forced command 同构)实现并自测 PASS(握手/读写/观察者写拒)。
- **手机仿真**:tools/test-web-console-mobile,iPhone-13/Pixel-7 视口 PASS(无横向溢出,4区块渲染,截图);真机实测归用户。回答用户:用 Playwright 设备视口仿真即可覆盖响应式验收,Android/iOS 系统模拟器非必需。
- **ChatGPT网页交接包**:docs/执行包/AgentRouter_ChatGPT网页角色_交接包_20260912(00给ChatGPT执行说明/01操作员手册);participant-mcp 新增 Streamable HTTP 入口(http.mjs,Bearer token,无状态每请求新transport),自测401/3工具/真实落盘sha登记 PASS。Kimi 5h 限额备选:经 kimi-code 自定义 provider 指向 DeepSeek API 的配置面未查证,当前无配额压力暂不动;DeepSeek Harness 本身已可用。
- 全仓61文件395项PASS;门禁全PASS。待用户:①提权重装 OpenSSH Server 并启动;②按手册跑 ChatGPT 网页闭环;③真机手机验收;④(可选)批准 CCR-J3-DRIVER-01 后跑 dsh 生产E2E。

# 当前执行（2026-09-12 续6）：P2/P3/P4 完成提交；P5 候选打包 PASS

- **P2(4f55088)**: ZcodeLifecycle(app-server,协议帧实测)+DshLifecycle(--profile acp,session/resume);两驱动经注册制接入;NativeHarness 扩展;宿主参数白名单/profile 白名单(含 profileRef 承载 CLI 入口);prepare 分支带凭据门禁(NATIVE_CREDENTIALS_REQUIRED/版本 pin)。层级:实现+离线测试(3项)+全仓回归;真实执行闭环 BLOCKED_BY_CREDENTIALS。
- **P3(11dacb7)**: participant.artifact 原子落盘(临时文件+rename,受限文件名/类型白名单/256KB,sha256+byte_size 入库,事件流通知);Participant MCP 三工具(收件箱只读/WAITING_INPUT 用户输入/产物登记),AGENTROUTER_MANAGED_ROLE 守卫+controller 租约;集成测试含穿越/类型/重名负测。
- **P4(cbf65dc)**: 只读 Web 控制台(apps/web-console):127.0.0.1 HTTP 观察者+响应式页面(项目/角色/任务/运行);Tailscale Serve 一条命令即可挂私网(本机 tailnet 活跃 1.102.2);OpenSSH Server 安装需提权——用户动作单:管理员 PowerShell 执行 Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0.0 后启动 sshd。
- **P5(6b36a2a)**: build-win 迁移拷贝目录驱动(修复候选包缺005导致 CORE_START_FAILED);干净候选 release/AgentRouter-j3-6b36a2a4a582-*(artifact 59befa85…)打包 Electron 验证 PASS(项目创建/重载持久化/截图)。
- 全仓 60 文件 394 项 PASS;三套冻结+迁移守卫 PASS。层级:以上均为实现+离线测试+单项真实验证(P4 Web 为真实 Core HTTP 往返);多端联合/重复稳定性未做——待手机实测与 SSH 提权后。
- 用户动作单(合并): ①管理员安装 OpenSSH Server(命令见上);② tailscale serve https 127.0.0.1:8787(或自选端口)启动私网访问;③ DeepSeek DUT 登录(dsh)后解锁 P2 真实闭环;④ ChatGPT Secure MCP Tunnel 与账号 Developer/write 权限核验(P3 网页闭环)。

# 当前执行（2026-09-12 续5）：P2-a 驱动注册制完成 + 两个新Harness协议面探明

- **HarnessDriverRegistry 完成（7d05981）**：NativeProcessBackend 三家品牌分支抽取为 HarnessDriver（processArgs/requiresSessionPath/createLifecycle→统一 HarnessLifecycle：phase/initialize/open/start/cancel/accept/disconnect）。verifyCodex 门禁、kimi 配置门禁与审批、pi 会话路径要求行为不变；新驱动经 registry.register 接入，未注册 harness 拒绝 NATIVE_HARNESS_UNSUPPORTED。全仓 57 文件 389 项 PASS。
- **DeepSeek 官方 ACP 面探明**：dsh --profile acp（官方默认 profile，dsh-acp-app+dsh-acp，deepseek-v4-flash）；协议方法含 session/new/**resume**/list/update/event、turn/end、tool/call、approval/request；interrupted→cancelled。接入点明确；真实任务/恢复/取消闭环需 DeepSeek DUT 凭据（BLOCKED_BY_CREDENTIALS，不冒充）。
- **ZCode Protocol 面探明**：app-server 帧形 {id,method,params}（换行分帧，无 jsonrpc 键——实验确认）；方法面 session/create/**resume**/list/read/messages/events/subscribe/send/**stop**/fork/setModel/setThoughtLevel 等（官方发行物只读提取）；隔离杠杆 --settings/--disallowed-tools/沙箱HOME/受管env 均已实证。实验级驱动可行；实现前需对 session/create|send|events 做最小真实往返（不猜字段语义）。
- 层级：驱动注册制=实现+全仓离线回归；两个新驱动=协议面探明(实现未开始)；dsh真实闭环=BLOCKED_BY_CREDENTIALS。
- 下一动作：P2-c 续——ZCode 实验级驱动(session/create|send|events 最小往返)与 dsh 驱动骨架(注册+启动参数)，或按用户优先级先做 P3/P4。

# 当前执行（2026-09-12 续4）：P1 真实单项验证完成

- **w11-main 装配 RoleSessionExtension**（初版遗漏导致扩展帧落冻结校验并按协议断连；负路径现返回 ROLE_NOT_FOUND 干净错误）。
- **真实 MCP 回路 PASS**（临时 Core + SDK 客户端）：建项目/角色(Client API) → MCP router_role_session_list(初始会话1个/active正确) → create(第二代) → switch 切回(g3) → 幂等 switch(g不变) → history 按会话隔离。常驻 Core 已刷新至最新 bundle（pid 2624，ZCode 调试通道 28 工具）。
- 层级声明：RoleSession=实现+离线测试(3项)+真实单项(MCP回路)；联合覆盖/重复稳定性/整轮稳定性未做——后续随 P2 驱动接入与 GUI 会话页验收。
- 下一动作：P2 HarnessDriverRegistry 抽取（三家分支→注册制）+ dsh ACP/ZCode app-server 无秘密协议探测深入。

# 当前执行（2026-09-12 续3）：P1 RoleSession 最小切换闭环完成（离线层）

- 迁移005（role_sessions + tasks/runs/conversation_items.role_session_id；升级前 before-v5 备份；存量回填初始会话；新角色创建即播种会话）。
- roleSession.* 草案扩展（待CCR协商，未入冻结清单）：list/create/switch/history；create/switch 需 controller+本连接租约；switch 幂等（切到当前会话无副作用，generation 不变）。
- 任务/运行/会话条目创建时打会话戳；对话条目按其任务派生归属——旧任务的迟到写入不会混入当前会话；原生会话保存镜像到产生它的 RoleSession（原生级按会话 resume 属下一增量）。
- 顺带修复：backupStore/verifyBackup 按完整迁移集校验快照（原 v1-only openStore 在 v5 schema 上失配）；build-w11-core 迁移拷贝改目录驱动；support/registry/journal/store 测试夹具随 schema 演进更新。
- 全仓 57 文件 389 项 PASS；三套冻结 PASS；迁移 manifest+EOL guard PASS；两 bundle 已重建。MCP 工具 24→28（新增4个roleSession工具）。

# 下一轮执行包登记（2026-09-12）：AgentRouter_NextRound_ZCode_20260912

审查基线 feat/v1-finalization-j3@c32bef0 与实际 HEAD 一致，树干净。包位置 E:/AgentRouter/docs/执行包/AgentRouter_NextRound_ZCode_20260912（已读 00/01/02/09）。

本轮目标（保持真实Core/GUI/管理MCP/三家原生链/冻结合同，增量实现）：P0 基线与配置隔离/证据口径/构建EOL guard → P1 RoleSession 最小切换闭环（稳定Role ID、历史/新会话/切换/切回/generation防写/幂等switch，保留Binding与原生会话，禁重置数据库）→ P2 HarnessDriverRegistry 抽取 + DeepSeek官方Harness(先ACP能力核验,session/resume优先) + ZCode实验级驱动(先真实探测,不猜协议不用GLM冒充) → P3 Participant MCP/交互角色/产物原子落盘(ChatGPT网页角色仅用户主动唤起,attachment/generation防旧覆新) → P4 手机响应式Web+Tailscale Serve私网/桌面SSH(Windows走OpenSSH over Tailscale,最小实现) → P5 联合验收与候选包。

风险策略（来自包01/09，本轮约束）：
- 验收口径纠正：六方向交接按"覆盖率/单轮成功率/总尝试"分开记录，累计方向覆盖≠整轮稳定通过；ACK/漏finish须协议级trace（prompt/native session/turn/工具发现/事件来源），保留NEEDS_ATTENTION与失败分母，不无限重跑。
- 受管ZCode配置继承是P0优先修复项：.gitignore与独立HOME不阻止cwd向上发现 E:/AgentRouter/.zcode/config.json；须枚举用户/项目/父目录/兼容目录/启动参数来源并以实际tools/list证明只有角色工具；未确认前仅挂起受管ZCode真实凭据启动。
- 不重做已完成的管理MCP接入；不重写Core；不动冻结清单，新增字段走CCR协商草案；历史CRLF数据库须有兼容/迁移路径，不得清空用户数据；账号切换/额度查询继续不做；现有开发ZCode与hzxpro不触碰；不合main、不发版本。
- 执行规则：P0→P1→P2→P3→P4→P5，P2探测与P4只读页可并行；每完成一个真实用户闭环即提交代码+脱敏证据+断点；层级声明分离：实现/离线/真实单项/联合覆盖/重复稳定性/最终包。

# 当前执行（2026-09-12 续）：交接六方向通过、External API 接线完成、打包验证通过、回退闭环验证

- **跨Harness交接（pi/Kimi/Codex 六方向）**：pair工具泛化到三harness。单轮 6/6 PASS 两次（run-1DTgj0、run-6RE9aP，证据 evidence/J3/production-pair/a4111ae-bundle7f2f960c）。新 bundle（0254ea5/含External API）三次单轮验收中六个方向均已至少通过一次，各轮各遇1次真实模型偶发不合规（Kimi/DeepSeek源-子任务均有），Core一律 NEEDS_ATTENTION 保守呈现、不伪造结果、不重放（evidence/J3/production-pair/0254ea5-bundle53d0cd37）。已录入 known-limitations。
- **External API（CCR-J3-MCP-02）接线完成并提交 0254ea5**：external-api/1 严格schema、同连接身份+控制器租约校验（冻结帧校验前拦截，旧客户端不受影响）、Core固定Provider（core_dataset/snapshot 只读诊断）、MCP三个新工具经已认证Client转发。集成测试4项+真实Core端到端（list/describe/call/幂等/observer拒绝）通过。全仓55文件385项PASS。仅含本地只读动作；真实外部HTTP须另行授权注册。
- **打包**：新候选 release/AgentRouter-j3-0254ea5bbacf-*（artifact 70602373…）真实Electron验证 PASS（连接生产Core、SQLite项目创建、重载持久化+截图）。
- **备份/升级回退闭环验证 PASS**：旧版Core(e99782f)建v3 → 新版升v4+before-v4备份 → 恢复备份 → 旧版可开；旧版遇v4干净拒绝。
- **发现并修复迁移校验和漂移**：工作树 003/004 为 CRLF（.gitattributes 规定 LF），导致跨 checkout 构建的 Core 互相拒绝数据库；已规范为 LF 并重建 bundle。常驻Core数据集（空壳）已重建，ZCode调试通道现含24个MCP工具（含3个External API工具）。

下一批（按交接包顺序）：真实 route_send/route_wait 定向续办、产物 register/read、审批与权限拒绝矩阵、GUI 取消与断线重连补测；真实外部 HTTP 动作在用户授权前不注册。用户动作项：Codex独立DUT切号与完整重启（最后）、SSH仍按暂缓、最终验收与接受。不合main、不打标签、不发布。

# 当前执行（2026-09-12）：Kimi 生产链路修复后通过（交付+取消+负测）

**已提交并推送 1eab34d455b77a824b2dcc41155987337e87153c**（39文件，pre-commit 三套冻结+秘密扫描 PASS）；固定源码复测 PASS：evidence/J3/production-kimi/1eab34d（dirty_source=false，任务 SUCCEEDED+PUBLISHED=42+取消 CANCELLED）。dirty 阶段证据保留在 evidence/J3/production-kimi/e99782f-dirty。

run-wb9l5X 根因已定：`NATIVE_START_PROMPT_RPC_TIMEOUT`——Kimi/Pi 的业务轮 `prompt` 响应覆盖整轮（含思考+工具调用），却被 peer 30 秒控制 RPC 活性界误杀；结果 STAGED 后 30 秒整断连→UNKNOWN。工具调用、审批、结果暂存均正常工作，非断流、非 Job 屏障、非终态缺失。

修复：NativeRpcPeer/PiRpcPeer 支持每请求 `timeoutMs` 覆盖；KimiLifecycle/PiLifecycle 新增 `promptTimeoutMs` 仅用于业务轮，由 backend 传 `wallClockMs`（默认120秒，运行级墙钟仍是最终预算）；Codex `turn/start` 立即返回不受影响。控制 RPC 仍 30 秒。新增 3 项单测；全仓 54 文件 381 项 PASS；tsc PASS；C1/C1R1/C1R1P1 三套冻结 PASS；w11-core bundle 重建（hash 见证据 index）。

真实复测（新隔离根，evidence/J3/production-kimi/e99782f-dirty）：
- 假凭据负测（独立home+无效凭据）：bootstrap FAILED、BOOTSTRAP_NOT_DELIVERED，干净失败；Core 启动 NATIVE_HOME_SCOPE 边界同样验证。
- 真实 Kimi 任务：bootstrap DELIVERED、run SUCCEEDED、结果 PUBLISHED=42、资源租约清空、零 issue。
- 真实 Kimi 运行中取消：RUNNING 中经 Management MCP 取消→CANCELLED，原生取消终态+Job 屏障证实。
- dirty_source=true（HEAD e99782f+未提交修复），不冒称固定源码；固定源码复测待提交后。

Kimi 剩余：跨 Harness 交接（pi↔Kimi、Kimi↔Codex）与 KIMI_DUT 完整生命周期尚未重测；replay 用 `node tools/test-j3-production-pi.mjs --live --kimi --cancel`。

# 当前执行（2026-09-12）：ZCode 经 MCP 接入管理面完成

用户要求让 AgentRouter 像 Codex 一样通过 MCP 接入 ZCode 调试并自动连接。已完成：

- apps/management-mcp/main.ts 新增第4个参数 clientId（强制 `mcp_management_` 前缀+Id字符集），默认 mcp_management_codex 不变；ZCode 以独立身份 mcp_management_zcode 接入，Core 审计与幂等 scope 可区分客户端。bundle 已重建，tsc 通过。
- 常驻 Core pid 55872 已死（endpoint.json 陈旧），按所有权流程重启为 pid 55264（同数据目录 .local/management-live/core，owner.json 已更新）。
- 工作区配置 E:/AgentRouter/.zcode/config.json 注册 agentrouter-management（stdio，controller 模式，绝对路径，timeoutMs 60000）；顶层 .gitignore 增加 /.zcode/ 防止本机路径入库。ZCode 工作区作用域 MCP 默认自动连接，重启会话后生效。
- 验证：stdio 握手+21工具列表、router_status（mock=false、C1R1P1、62方法）、router_control_acquire/release 真实往返（mutation 输入必须含 scope）、test-management-mcp.mjs 15项全PASS、tsc PASS。当前 ZCode 会话工具列表固定于启动时，需重启会话后 mcp__agentrouter-management__* 工具才会出现。

# 最新交接入口（2026-09-11）

用户要求先总结与交接，完整现状见 [交接包](./交接包-20260911/README.md)。最新Kimi run-wb9l5X 已生成42但STAGED、运行UNKNOWN，仍FAIL，不得重放；取消未执行到。HEAD e99782f，当前有未提交修复，本文下方历史状态不代表最新全部通过。未启动新的真实任务。

# 当前执行（2026-09-11 15:42）：继续生产联合测试

HEAD e99782f7e675dcea896f0a45cfe90796c6508e23 已推送；CI 34574169187、34574169240 均成功。固定源码 Codex 真实 Bootstrap、Route42发布、同key幂等和运行中取消通过，见 evidence/J3/production-codex/e99782f。pi/Codex 双向真实交接通过，见 evidence/J3/production-pair/e99782f-dirty（明确 dirty_source=true）。

Kimi独立DUT已有新登录，Bootstrap真实ACK通过，不再等待用户登录。cUKGLD、XoAEYg原生SUCCEEDED但无Route发布，仍FAIL。已发现 tools:[] 同时禁用MCP，改为六工具精确白名单仍未解决，独立只读Reviewer正在查0.42.0 ACP加载/权限行为；不得重放旧任务。

新增External API SQLite journal及004增量迁移：重开不重新领取IN_FLIGHT、主体隔离、升级前v3备份通过。管理入口尚未接通，不计完成。候选包补齐生产RoleBridge/pi扩展/Job监督器，待固定源码构建验证。全仓首次373中371通过，2项旧迁移测试遗漏004；补齐后定向6项通过，tsc通过。无真实秘密输出、无hzxpro账号操作。

下一步：检查git状态；完成Kimi Route修复及生产取消；提交后构建生产候选并真实Electron检查；继续External API接线、Linked Continuation/恢复/GUI联合；DUT切号与完整重启最后。SSH按用户暂缓，不合main、不发布。

## 历史断点

# 当前执行（2026-09-11 15:22）：生产 Codex 首次 Route 交付已通过

最新源码仍 HEAD 1901b4ea6ac0372146eb8985b099a6bbec256ac2（已push），当前有新的未提交修复。固定源码1901b4e：pi+MCP真实任务与GUI重启/发布PASS，52文件358测试PASS；证据 evidence/J3/production-pi/1901b4e。其Windows CI34572884488失败（旧连接回调覆盖新连接），另CI34572884560成功；不要称全绿。现已修复Preload世代回调、Main旧连接覆盖、新endpoint竞态与原子发布，真实 test-w11-desktop 四项复测PASS，待重新提交/CI。

Codex生产新增：同Core/DB、独立已批准DUT、原生config/read+account/read+MCP清单+模型最低推理门禁；必须verifyCodex成功后才thread/open/prompt。假凭据原生边界 .local/j3-codex-boundary/run-SaZ79i PASS（六个RoleBridge工具、shell禁用、web禁用、零任务、Job空树）。真正业务 .local/j3-production-pi/run-ZNTN4d PASS_TASK_AND_BOOTSTRAP：Luna/low，MCP派发同key幂等，route_context/route_finish，42结果PUBLISHED，SUCCEEDED和Job收尾。dirty_source=true，不冒称1901固定源码。此前69rkR9/W4Ohl9/WK73H2原生成功却无发布，保留失败；原因native Route工具审批（auto不等于明确批准）。改为仅六个受控Route工具approval_mode=approve，默认prompt，Core继续做权限/epoch/幂等验证。任务角色使命删除含混的长期“不调用工具”表达；Bootstrap禁止工具由该轮提示单独添加。

最新全仓364项PASS（在新增ExternalApiRegistry前）；后者仅模块5假Provider测试PASS，仍需Core SQLite journal与Client契约CCR接线，不能算API完成。待Codex取消、固定源码复测、Kimi登录、联合交接/队列/恢复、生产包。DUT切号和完整重启最后，不触碰DEV hzxpro。唯一用户动作仍KIMI_DUT_LOGIN_COMPLETED。下一先git status并收拢提交，再同固定源码实测；不要重复执行旧失败任务。

## 前一断点（保留历史）

# 当前执行（2026-09-11 15:10）：生产 pi 与真实 Electron 已通过增量验证

分支 feat/v1-finalization-j3；HEAD 5ef946aa2ab4e431d9b9a330e2009c77b56de20a（尚未push），后续有未提交修复。不要丢弃修改。固定源码 pi 证据 evidence/J3/production-pi/5ef946a/report.json；GUI 开发版证据 .local/j3-production-pi/run-HPUpGv/gui-report.json（dirty_source=true，不能冒称固定源码）。真实 GUI 已实际派发唯一 GUI2 标记任务，DB SUCCEEDED/PUBLISHED，截图有内容；需要提交后固定源码复测与导出。run-BjUtlq 的 GUI 任务 QUEUED，前面取消后 NEEDS_ATTENTION 阻塞，未重放、未强行放行。

新增修复：Core 默认加载数据目录 native-runtime.json；Bootstrap 必须原生文本确认完整 Charter hash，不能把空 end_turn 当成功；Provider 相同请求去重并缓存未知/失败，避免重复计费；桌面连接使用 endpoint 快照避免重启旧凭据竞态；认证关闭立即失败；STDIO 半帧断流不再未捕获崩溃，close 与超时清理 pending，不自动重发业务。独立 Reviewer 已复现断流问题；修复后全仓 51 文件355项 PASS、tsc PASS（随后正在新增 Codex helper 单测，需最终复测）。

Kimi 生产测试 BLOCKED_ACCOUNT：旧复制凭据 Authentication required，不把旧 Bootstrap DELIVERED 当真实模型成功。唯一待用户动作：独立 PowerShell 执行 tools/login-j3-kimi-dut.ps1，回复 KIMI_DUT_LOGIN_COMPLETED；目标 .local/j3-kimi/dut/home，日常账号不修改。不要重复复制旧源覆盖刷新凭据。Codex 用户已批准当前 DUT 身份，不重复问；.local/j3-codex/dut-fj/home 为独立目标，DEV hzxpro 不触碰。Codex 生产接线尚未完成；新增 helper 与假凭据测试正在准备，真实调用前必须核对原生 MCP 精确只有 RoleBridge、模型和最低推理、身份、工具限制。

下一命令：git status --short；读取 tools/test-j3-live-gui.mjs 与 local-native-runtime.ts。先完成当前源码记录、扫描、提交、固定源码 pi/GUI/取消复测；继续 Kimi（登录后）、Codex 生产链路、External API、联合交接与包装矩阵。SSH DEFERRED_BY_USER，不合 main、不发布。开发原生 Management MCP 工具列表仍未暴露；实际 SDK MCP 已通，不声称原生直接调用通过。

以下为历史进展：

# 当前执行：生产 pi 已跑通，继续三家与 GUI

新增产品入口 AGENTROUTER_NATIVE_CONFIG 显式 LIMITED_ISOLATION，可信 Profile 注册复用现有 DB/Binding，pi NativeBackend/Job/RoleBridge/Provider 已接线。run-a3GksX 实际 STDIO SDK Management MCP 派发幂等、pi Route context/finish、结果42发布、原生与Job屏障PASS；源码尚未固定，不能将2b6dda4当本次源码。下一步固定源码复测，再产品取消、恢复、Kimi/Codex接线、GUI；SSH暂缓，DUT切号最后。

重要失败保留：LG3N9i/2hfnkg Bootstrap会话文件尚未创建；Bzn1QM旧EOF收尾UNKNOWN；Mvh1tS测试查询列错误并提前关闭Core，任务UNKNOWN；RbZjL1使用--no-tools禁用了扩展，运行成功但无结果，不认证交付。这些任务不自动重放。修复为Bootstrap限定路径预留（load必须存在），Supervisor受控stop-file后确认Job空树，pi --no-builtin-tools保留显式Route扩展，查询created_at_ms。

审查修复：晚到启动保留占用墓碑；Bridge停止撤权/关闭清理；stop预算协调；每次校验扩展hash与完整profile字段。明确失败启动墓碑保守保留，避免无法证明未启动时重复执行；Job空树不代表上游费用取消。49文件344项回归含UI通过；追加28项定向通过。开发hzxpro未操作，当前无用户行动单。

# 最新续办状态（覆盖下方旧登录等待）

用户已明确批准刚登录的独立Codex DUT账号，身份不必匹配旧fj种子。源码36a92281188eb7bfc2af714cb33ea62c58124775上的真实Luna/low任务及取消PASS，脱敏证据见real-components.md。hzxpro不动，无待用户登录动作。三家仍仅部件通过，不能宣称Core/Route/GUI全链路通过。

当前未提交：真实部件证据与文档、WindowsNativeProcessHost、NativeRoleBridge及测试。下一步修复pi Node入口参数与测试编译隔离，接现有生产Core，保持单数据库。原生开发MCP本会话仍未暴露工具；不要求重启开发会话。SSH暂缓，DUT切号与重启最后。

# 本轮真实实测增量

详情见real-components.md与evidence/J3/real-components/index.json。pi真实任务/恢复/取消通过（部件）；Kimi K2.7真实任务/取消/恢复通过（部件）。Codex fj模型Luna/low可用，但旧种子401刷新失败；用户正在独立DUT登录，不重试旧种子，hzxpro不动。tools/test-j3-codex-isolated.mjs --live现仅使用.local/j3-codex/dut-fj/home/.codex并保留最新刷新认证。登录脚本已ASCII修复；等待用户DUT_LOGIN_COMPLETED之后再测试。

当前源码8e30635含Job收尾平台组件和Kimi恢复修复；未接生产Core/Harness，不认证全链路。下一主线是可信NativeProcessHost与同一个Core实际注册/RoleBridge工具；External API注册面待完成。无main合并/发布，SSH暂缓。

# 最新授权与断点：J3-MCP-01

本节覆盖下方历史“完整隔离前不加载凭据”的笼统阻断。用户授权 LIMITED_ISOLATION 低风险实际调试；SSH暂缓、DEV hzxpro不动、DUT切号和重启最后。

当前分支 feat/v1-finalization-j3，工作目录 E:/AgentRouter/.local/w11a/integration，起点90ed45436974bfb848cfcf83ac936bac5fe967f6。Management MCP 已实现并通过15项真实STDIO→LOCAL_CORE检查；不是Harness认证。Codex用户配置已注册agentrouter-management，无秘密env；常驻Core所有权记录在.local/management-live/owner.json，不重复启动或按名称杀进程。当前会话工具列表尚未刷新，直接开发Codex调用 NOT_RUN。

下一命令：git status --short；node tools/test-management-mcp.mjs。下一工程：managed实例配置隔离、实际NativeProcessHost接线、pi→Kimi→Codex；External API注册面仍未实现。所有冻结合同保持不变。

## 以下为历史追加记录（以上节为准）

# J3 当前执行断点（唯一当前决策）

分支 feat/v1-finalization-j3；工作目录 E:/AgentRouter/.local/w11a/integration。
收敛包基线 d28aa3e8836b013d53818bcf6475b01c31154710。历史断点全部已被本页当前授权替代，见 history/checkpoint-before-convergence.md，不作为重问条件。
预算不限、最低实际思考、小任务；pi+DeepSeek→Kimi K2.7→Codex GPT-5.6 Luna；模型精确值需实际能力确认。业务目录全范围但秘密/控制面不授予工具。SSH DEFERRED_BY_USER。
Codex 切号及重启 INCLUDED_LAST_DUT_ONLY，最后执行。DEV hzxpro 认证与进程不触碰；缺独立第二会话仅挂起该用例。
当前工程：主线生产 Core 注册/配置/六工具/迁移，独立支线 pi 生命周期与 Windows 分步 ACL 诊断。安全门未过不加载真凭据。当前真实 Harness 支持数0；生产链路未完成不归因为仅缺环境。
最新原受测代码211abf3：252离线+38Electron夹具+20进程树。CI34550830283/34550830431通过；不是实际Harness认证。
下一具体动作：新迁移保存生产配置与实际运行来源，接可信后端授权到现有协调器，继续无秘密原生协议/工具测试；等待隔离诊断，不跑旧直连OK探针。

## 最新固定源码与下一命令

源码 f79037ec6a554397599d15791fb602235b0905af。当前310项全仓与38项Electron门禁退出0；生产包Core3项、真实打包Electron项目创建/重载2项通过。evidence/J3/convergence/f79037e/index.json固定哈希；真实Harness支持仍0。

独立Reviewer已复核停止隔离、会话条件写入、可信工具accepted、Provider JSON转义反射修复；未独立复跑。

用户普通PowerShell结果ed6b39e26cc2460bb953c3641f5e3a06已收到，同样primary 0xC0000022；无需重复用户操作，继续自身诊断。没有新增登录/付费请求，不触碰hzxpro。

下一工程任务：SecureProcessHost主令牌/Job/bridge完整实现；受控本地HTTPS连接清理验证及pi流式代理；实际账号/模型注册和GUI接线。随后pi→Kimi→Codex实际小任务/取消/恢复，最后独立Codex切号。未完成项是实现任务，不能仅等环境。下一只读命令：git status --short，然后检查用户新诊断JSON（只允许脱敏元数据）。

远端同步：dec0abc 源码/主要证据已push；0e59e40补交门禁文本遇连续GitHub TLS握手失败。CI新运行查询EOF，未确认；不要引用旧绿色作为新CI。下一次先git status与git log，再重试正常TLS推送，不关闭证书校验。

2026-09-11续办：私有远端已成功同步3f83eb8；dec0abc两项CI 34556676880/34556676899 SUCCESS，3f83eb8两项CI 34557140326/34557140347运行中。新增本地真实HTTPS四项PASS，证书不入用户库且自动删除。当前安全支线负责进程/桌面权限定位，真账号仍未加载。

最新已同步增量f170f1ddb639c7cafec61ce67b5973a0eef4f5a5：HTTPS五项/用户终端证据；CI34557497701、34557497703均SUCCESS。Windows startup机制诊断仍在收敛，未授权真实凭据加载；用户当前无待执行动作。

当前精确启动断点：见convergence-startup-diagnosis.md。BU+RC显式无秘密诊断可运行native cmd和Node；12cc236d节点phase3失败是icacls spawn error，无退出码，随后canary仍拒绝。孙Node未测、CLR失败，不加载真凭据。下一步记录spawn errno并定位后代创建/stdio权限，不要求用户重复操作。HTTPS五项与f170f1d双CI成功。

最新：完全访问后主线工具可用，子Agent旧运行器仍helper错误，未让其绕过权限规则。28a56e9f实际受限Node与孙Node+canary负测在新文件stdio句柄下通过；真实NUL写EPERM、自动pipe仍失败，CLR失败。下一步是受控通信句柄/pipe机制，不再笼统说Node无法运行。无真实凭据加载，无付费调用，DEV未触碰。

新增源码be75e5c：Provider缓冲SSE、两项Reviewer P1修复，独立29测试及固定源码HTTPS8项通过。详细见convergence-sse.md。真实Harness仍0，不加载凭据；下一生产工作仍是受控管道/Job/出网安全与broker接线，不是再次跑Fixture充当验收。

固定源码be75e5c6f5830adcdc5c5c556300e719916a869d：326全仓测试/类型检查/HTTPS8项PASS；证据index位于evidence/J3/convergence/be75e5c。最新未测项见convergence-sse.md与convergence-startup-diagnosis.md。

MCP 固定源码6bfdb79a6cb570ff22545935278115e2073b9c53已push；15项固定源码实测和326项原回归通过，证据evidence/J3/management-mcp/6bfdb79/report.json；工作项https://github.com/hhhzingy/AgentRouter/issues/1。当前开发工具刷新与managed启动接线待完成。

用户已启用agentrouter-management；本会话运行时仍unknown MCP server，勿重复要求启用或重启hzxpro。SDK已实际连通常驻Core：LOCAL_CORE/mock=false/revision=1，observer13工具；见connection-followup.json。6bfdb79与a7a8eb8四次CI均success。直接工具调用仍NOT_AVAILABLE，生产接线继续待办。
