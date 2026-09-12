# CCR-J3-DRIVER-01:新增 Harness 的冻结合同扩展协商

状态:待协商(2026-09-12)。冻结合同文件保持不变;本记录是新 Harness 接入的合同变更提案与临时边界。

## 背景

驱动注册制(见 commit 4f55088 与本轮)已支持注册任意 Harness;`zcode` 与 `deepseek_harness` 驱动已实现并通过离线测试。DeepSeek Harness 已在 ACP 层完成真实 API 单项验证(任务 end_turn / 恢复上下文 47 / 取消 cancelled,证据 evidence/J3/nextround-p0/)。

## 冻结冲突点

- `client-api.c1r1p1.schema.json` capabilities.harnesses:additionalProperties=false,仅 codex/kimi_code/pi;
- `rolePlan` 的 runtime.harness 枚举同上;客户端传输层(冻结 memory/stdio)在发出与接收两侧均校验该枚举。

因此:`rolePlan.validate/apply` 携带 `deepseek_harness`/`zcode` 在客户端即被拒(INVALID_FRAME),生产 E2E 无法进行,除非变更冻结合同。

## 提案(下一合同修订 C1R1P2 草案)

1. capabilities.harnesses 增加可选键 `zcode`、`deepseek_harness`(结构与现有条目一致,status 枚举增加 `EXPERIMENTAL`);
2. RolePlan runtime.harness 枚举增加两值,仅在 contractRevision=C1R1P2 协商开启后生效;旧客户端按 unknown literal 拒绝,行为不变;
3. 服务端 capabilities() 继续只上报真实 PROBED/EXPERIMENTAL 状态,不虚报 LIVE_TESTED。

## 临时边界(合同变更前)

- DeepSeek Harness:ACP 层真实三项已验证;生产 E2E(经 Core 派发的角色任务)标 `BLOCKED_BY_CONTRACT`;
- 不允许以 pi+DeepSeek 模型冒充 DeepSeek Harness;不允许绕过客户端校验直发私有帧给冻结端点;
- 驱动代码与宿主分支保持就绪,合同扩展合入后即可运行 E2E(测试脚本 --dsh 已备)。

## 影响面

冻结文件 sha256(manifest)不变;仅服务端/客户端校验枚举变化需要新 schema 版本与兼容矩阵(旧 Core 拒绝新 harness 计划为正确行为)。
