# fixtures/ui-proposals — UIAI Phase A Mock 场景

28 个场景，一景一文件，索引与断言说明见 `docs/ui/09_mock-scenarios.md`。

## 文件约定

```json
{
  "scenario_id": "sc-09",
  "title": "活跃 Run",
  "description": "……",
  "ui_surfaces": ["项目概览", "角色详情"],
  "snapshot": { },      // C1 VM 形状（SnapshotVM 子集），可直接作为 Mock Transport 响应
  "x_proposal": { },    // C1 缺失、待 C1R1 的提案数据，键内标注 ccr 编号；非冻结合同
  "expected_ui": []     // Phase B 可执行断言
}
```

## 统一假名

| 实体 | id | 说明 |
|---|---|---|
| 支付中台重构 | `proj_atlas` | SSH · core-prod-01 · `~/work/pay-core` |
| 官网改版 | `proj_nova` | Local · 本机 · `D:\work\nova-site` |
| 核心实现组 | `sp_core` | proj_atlas 下，⧉wt:core |
| UI 组 | `sp_ui` | proj_atlas 下，⧉wt:ui |
| 旧平台组（归档） | `sp_legacy` | proj_atlas 下，只读 |
| 林岚/周实现/陈复核 | `r_lin`/`r_zhou`/`r_chen` | sp_core：规划/执行/复核 |
| 苏界面/唐测试/何文档 | `r_su`/`r_tang`/`r_he` | sp_ui：UI/测试/文档 |

- 时间基准：`2026-09-09T13:30:00+08:00`（ms `1788931800000`），fixture 内时刻均相对它前后偏移；
- 所有身份均已掩码；无凭据、无真实主机、无真实路径；
- `harness` 取值沿用 Role Plan Schema 枚举：`codex | kimi_code | pi`。
