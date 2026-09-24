# W10 回归与三轮固定负载报告(2026-09-16)

分支 `feat/v1.1-final-windows-mobile`,基线起点:V1.1 组合前 422 用例(W00 交接)。

## 全量回归(自动化四套,CI 同款命令)

`node node_modules/vitest/vitest.mjs run tests/integration tests/unit tests/contract tests/chaos`

- 结果:**431 / 431 通过**(85 文件),本地与 CI(main 上等价集合曾 430)一致增长。
- 增量来源:W02 负面测试(复活拒绝、legacy 表改名仍工作)、W03 一次性转移决定表与继承拒绝、
  W04 诊断 ring 与 stderr 透传、W05 kimi/zcode 百炼 profile 单测(含注入负例)、
  W06 scope 强制/撤销/幂等网关用例、W09 remoteDevice 扩展用例。

## 旧测试映射(禁止机械对齐 422)

| 处置 | 数量口径 | 说明 |
| --- | --- | --- |
| 保留(语义不变) | ≈410 | 安全回归、账本、租约、Plan、Remote 既有语义全部原样通过 |
| 替代(旧语义→新语义) | 4 | WS 切回复活:`role-session.test.ts` 切回用例、`work-session-cross-harness.test.ts` A→B→A、`v11-w02-ws-readonly` 新增负例承接;网关 REMOTE-01 从"空scope可见全部"改为"W06 空scope不可见既有项目+自创建可见+幂等重放不重复" |
| 新增 | 21+ | 上节增量 |
| 平台专属(live/手动) | 4 文件 | `tests/live/*`(真实 zcode CLI 列表、真 Chromium 手机控制台、打包 core REMOTE 启动)+ 候选包验证;不进 CI |
| BLOCKED(物理/人工) | 0 自动化项 | 双机/手机/Tailscale 真链路在 W12,不伪装成测试通过 |

## 三轮固定负载(fixture 驱动,零付费;tools/v11-fixed-load.mjs)

每轮独立 fork 真实打包芯 `.local/w11-core/core.mjs`(AGENTROUTER_FIXTURE=1,隔离数据目录+marker),
固定集合完全一致:6 角色 plan→bootstrap DELIVERED→4 完成 + 1 同 operation 重放 + 1 运行中取消
(steps:[] + delayMs 5000)→断线重连不复活→conversation 历史可读→活动工作清空→DB/迁移/完整性→shutdownCore 进程退出屏障。

| 轮 | 结果 | 关键观测 |
| --- | --- | --- |
| 1 | PASS | 完成 5(含幂等 SAME、单任务)、取消 CANCELLED、重连 count=6 不复活、integrity ok、64 表、RSS≈203MB |
| 2 | PASS | 同上,RSS≈200MB(无增长趋势) |
| 3 | PASS | 同上,RSS≈200MB,active work drained=0 |

报告:`.local/v10-load/fixed-load-report.json`(本地工件,不入库)。

### 负载暴露并已修复的根因记录

1. `task.submitFromUser` params 必须是 `{ request: {...} }` 包装(工具自身缺陷,非产品)。
2. fixture 取消窗口须 `steps:[]`+`delayMs`(事件同步发出,terminal 才有停留)——负载脚本采用既有测试同款场景。
3. 产品侧无新缺陷由负载揭示;W07 真浏览器曾揭示 3 个真实缺陷(meta 表布尔形状、配对成功后骨架丢失、controller requested_mode)已在 7826ec6 修复。

## 候选包

`release/AgentRouter-j3-3c91b80*-...`(manifest:sourceSHA 3c91b80、dirty=false、
backendModes=[LOCAL_CORE, REMOTE_CORE(opt-in)]、console 资产 sha 记录在案)。
