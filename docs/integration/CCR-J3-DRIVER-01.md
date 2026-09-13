# CCR-J3-DRIVER-01(重写版):C1R1P2 动态 HarnessId 与 DriverRegistry 协商

状态:**设计定稿,待批准后实施**(2026-09-12 重写,取代旧"枚举扩两值"方案)。C1/C1R1/C1R1P1 冻结文件保持字节不变。

## 与旧方案的区别

旧方案:在 C1R1P1 枚举里追加 `zcode`/`deepseek_harness` 两个静态值。
**问题**:每接一个新 Harness 都要改冻结合同,不可持续;静态枚举与服务端注册状态脱节。
新方案:**C1R1P2 引入动态 HarnessId + capabilities map**,合法 Harness 集合由服务端 `HarnessDriverRegistry` 在运行时判定,合同不再为每个 Harness 修改。

## C1R1P2 设计(草案,实施时以仓库实际代码为准)

1. **协商**:客户端仍以 C1R1P1 帧完成 `system.initialize`(冻结枚举不写 C1R1P2),随后调用扩展方法 `contract.upgrade { revision: "C1R1P2" }`;服务端校验连接已授权后翻转该连接的 revision。旧客户端/旧 Core 不感知该扩展,行为不变。
2. **动态 HarnessId**:`rolePlan` 的 `runtime.harness` 对 C1R1P2 连接放宽为 string(HarnessId 模式 `^[a-z][a-z0-9_]{1,40}$`),服务端在 validate/apply 时对照 `HarnessDriverRegistry.has(harness)` 判定:未注册 → `CAPABILITY_UNAVAILABLE`;已注册但宿主未配置(如缺 CLI/凭据)→ `NATIVE_CREDENTIALS_REQUIRED`/等。
3. **capabilities map**:`contract.upgrade` 结果返回 `harnesses: registry.list()` 与每家能力(`probe` 状态、`create_session`/`cancel` 支持位),来源为服务端注册表,不由客户端声明。
4. **响应兼容**:C1R1P2 连接的 rolePlan/binding 响应含动态 harness 字符串;C1R1P1 连接的快照/事件投影继续裁剪为三家(现有 capabilities 投影逻辑),互不影响。
5. **实现载体**:C1R1P1 冻结文件(schema json、c1r1p1/index.ts、generated.ts、p1/types.ts)字节不变;C1R1P2 校验逻辑落在内存派生 schema(枚举放宽)+ 注册表检查,位于新文件与 connection 分支内。

## 兼容性测试(实施完成定义)

- C1R1P1 客户端发 `deepseek_harness`/`zcode` 计划 → 客户端/服务端均 `INVALID_FRAME`(与今日行为一致);
- C1R1P1 客户端 `contract.upgrade` 不可见(扩展方法不在其工具/合同面);
- C1R1P2 客户端升级后:validate/apply 通过注册表判定;未注册 harness 拒绝;
- 升级后 C1R1P1 第二连接的快照校验不因新 harness 计划而失败(投影裁剪);
- 事件流对未升级连接不携带动态 harness 计划内容。

## 实施后立即可跑

- DeepSeek Harness 生产 E2E(task/resume/cancel/handoff,`test-j3-production-pi.mjs --dsh` 已备,DEEPSEEK_API_KEY 注入已实现);
- ZCode 驱动同等路径(若 ZCODE_DUT 认证就绪;未就绪则标 BLOCKED_BY_CREDENTIALS,不以 Management MCP 连通冒充)。

## 批准与回退

- 批准即实施 C1R1P2 最小面(上述 1–5);实施后全仓回归 + 兼容性测试全绿方可跑 DeepSeek 生产 E2E;
- 回退:revision 分支隔离,C1R1P1 路径零改动,关闭 upgrade 扩展即回退。
