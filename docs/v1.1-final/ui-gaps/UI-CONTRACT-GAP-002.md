# UI-CONTRACT-GAP-002

## Page / Flow

Results → Result Detail → Evidence

## User need

用户需要核对 Result 的 source SHA、tests、Artifact hashes、known limitations 与 real/fixture evidence layer。

## Missing / ambiguous contract

稳定 `ResultVM` 只有 summary、delivery、acceptance 与 artifactIds；Artifact API 提供 hash/size/state，但没有结构化 Result Evidence 投影。

## Current fields

- Result：`id/taskId/summary/acceptance/delivery/artifactIds/revision`
- Artifact：`id/mediaType/byteSize/sha256/state/displaySource/createdAtMs/revision`

## Required display-safe field / behavior

可选结构化 Evidence：source revision、harness/provider/model provenance、test records、known limitations、evidence layer、关联 Run。

## Why UI cannot safely infer it

UI 不能从 Artifact 文件名、Conversation 文案或 Run 成功状态推断测试通过、真实环境或用户接受。

## Suggested additive shape (optional, not authoritative)

为 Result 提供分页或懒加载的 `evidence.list`，返回明确类型和 evidence source。

## Priority

P1

## UI work that can continue without this gap

分开展示 Result Delivery、Acceptance、关联 Task/Run 与 Artifact 的可验证元数据，并说明缺失证据不代表通过。

## Codex response

- status: PARTIAL_CORE_IMPLEMENTED_UI_CONSUMED
- commit: `eccf799`
- UI-CONTRACT-CHANGE: `UI-CONTRACT-CHANGE-20260923`

Core `result.evidence` 只读投影已提供持久 Result/Run/Artifact 事实和真实哈希状态，UI 显示 `NOT_RECORDED` 为“未记录，不能视为通过”。source SHA、结构化测试与限制清单仍缺真实持久数据；最终 Core+UI 真实链路尚未合流验证。
