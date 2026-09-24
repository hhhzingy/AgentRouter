# J3 当前 API 使用入口

现行 C1/C1R1/C1R1P1 与 Route 契约继续有效。V1.1.0 的公开发布状态与验证边界见 [版本验证摘要](../releases/v1.1.0/VALIDATION.md)；旧 J3 执行过程已从当前树移除，仍可通过 Git 历史核对。

SPEC-CONFLICT-J3-00-01：执行包要求更新 API 入口，但旧 docs/api/README.md 被 freeze.c1.json 固定。已恢复本轮添加的前言，改新增本文件；未重算冻结hash，未改变协议含义。

新增/改义须最小 CCR、旧客户端兼容与必要新迁移，由主集成者单写并由独立Reviewer复核。任何破坏性、安全边界或费用变更直接由用户决定。
