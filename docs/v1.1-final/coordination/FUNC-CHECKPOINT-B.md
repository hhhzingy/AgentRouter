# FUNC-CHECKPOINT-B — Role Identity / Slot / Binding / Participant

状态：`FUNCTIONALLY_STABLE_WITH_SECURITY_APPROVAL_AND_REAL_WEB_PENDING`；不是 Windows RC

## Source

- source SHA：`dd785fb852cc21d72ee7d92af6d9de895d7bd037`
- parent：`bf1fdbca5325d5160d284156a1ba9cd3468a6b22`
- branch：`feat/v1.1-functional-closeout-codex`
- UI Base：`89a41b5e0ff6af198141ded3c1d5c627fdcf9a52`
- UI delta：`UI-CONTRACT-DELTA-002-PARTICIPANT-SESSION.md`
- schema/migration：无新增 migration；沿用已冻结 `001`—`018`

## N3 capability matrix

| Gate | 证据 | 判定 |
|---|---|---|
| Role + Slot，无 WS → Join 创建一次 | C5-A | PASS_AUTOMATED |
| Role + 预建未绑定 WS → Join 复用 | C5-B | PASS_AUTOMATED |
| 第二 Participant 抢占冲突 | C5-C | PASS_AUTOMATED |
| 同 grant/session 重连 + 同 request key | C5-D | PASS_AUTOMATED |
| replacement → 新 WS，旧 WS 只读 | C5 replacement | PASS_AUTOMATED |
| old generation 迟到写拒绝 | C5-C + participant grant tests | PASS_AUTOMATED |
| 未 drain Task/Run 阻止 leave | C5 leave | PASS_AUTOMATED |
| Charter revision → Identity 刷新 | C6 joint | PASS_AUTOMATED |
| Managed Harness 新 WS 自动 Binding | C5-E/F/G + production wiring | PASS_AUTOMATED_PACKAGED |
| Participant claim/artifact/result/downstream | C6 joint + participant workloop | PASS_DUT_AUTOMATED |
| Web ChatGPT 真实链 | 无本 SHA 网页实测 | NOT_RUN_REAL_WEB |
| Identity current assignment 全载荷 | 安全审查要求明确授权 | USER_APPROVAL_REQUIRED |

## Invariants now enforced

- 一个 Role 同时只有一个 ACTIVE Participant Binding；同 principal/request replay 不新建。
- Slot/Participant kind、grant、request key、binding generation 分别校验，`session_id` 不等于权限。
- leave/replacement 前检查 WS 的未完成 Task/Run，不静默遗留到 HISTORY。
- replacement 不复活旧 WS；旧 WS/activation 终止，新 WS 使用新 identity。
- Planned QUEUED Task 在 Join 创建新 WS 时原子绑定，conversation 仅从 null 归属到该新 WS，不重算既有历史归属。
- RoleSession 新建/Context Transfer commit 与 Managed Participant Binding 同一事务提交。
- Identity Pack 增加 project display、Slot/WS state 与安全协议；effective permissions 继续来自最新已批准 charter permissions。

## Verification

- typecheck：PASS
- lint：PASS
- unit：41 files / 213 tests PASS
- integration：49 files / 215 tests PASS
- contract：8 files / 67 tests PASS
- chaos：1 file / 3 tests PASS
- packaged local Core rebuild：PASS
- packaged C7 DUT + Participant workloop：2 files / 4 tests PASS
- staged secret scan：PASS
- protected assets：PASS；未触碰生产 HOME、账号、旧会话或 UI 工作树

## Remaining / next stage

- 需用户明确授权后，才能把实际 Task body/input refs/expected/result target 复制到 Identity Pack；此前保持通过 `participant.inbox` 的既有受限读取路径。
- Web ChatGPT 真实 Participant 链待 N7。
- Pair code / OpenAI Tunnel 稳定 session correlation 仍是 UNKNOWN；不得推断。
- N4：Context Transfer / ZCode cold-vs-warm / native lifecycle 当前 SHA 深度复核与真实能力矩阵。

未经授权不 merge main、tag 或 release。
