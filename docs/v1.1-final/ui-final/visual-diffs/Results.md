# Results List / Result Detail — BLOCKED

| TARGET | 本轮 CURRENT / FIXTURE |
|---|---|
| `refs/PRIMARY/17_24_58-3.png` | `screenshots/04-results-evidence.png`、`13-results-dark.png` |

Result Detail 保留交付与验收独立状态，Run ID 移入技术详情。列表新增“全部成果/待我验收”筛选和可读任务摘要。UI 已消费 Core `result.evidence` 的持久事实，未记录测试明确显示为未通过验证；“请求修改”使用原子 `result.requestChanges` 与未知结果 `result.reviewStatus`，不用旧 `result.reject`。17 号截图展示反馈弹层。当前 UI 分支尚未合流 Core `eccf799`，真实 Artifact/Evidence/修改闭环仍待联合验收；GAP-002 的源码修订和结构化测试事实仍缺。
