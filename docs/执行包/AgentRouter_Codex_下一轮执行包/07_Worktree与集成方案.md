# Worktree 与并行开发方案

## 一、是否需要多个 worktree

需要。

原因：

- Codex 和 UIAI 是两个独立执行主体；
- 两者会同时操作同一仓库；
- UI 需要在 Core 尚未完成时基于 Mock 并行；
- 不使用 worktree 会造成未提交文件、依赖安装、构建输出和分支切换互相干扰；
- 远程 Linux Core 和 Windows GUI 的测试环境不同。

但不建议无限增加 worktree。V1.0 下一轮只需要：

1. 一个集成工作区；
2. 一个 Codex Core worktree；
3. 一个 UIAI worktree。

## 二、创建顺序

### 阶段 A：合同冻结，不并行

Codex 从 `16370d3` 创建：

```bash
git switch -c feat/contract-c1 16370d3
```

完成 W10，提交 C1。

复核后将 C1 合并到：

```text
integration/v1.0-next
```

### 阶段 B：从同一 C1 提交创建两个 worktree

示例：

```bash
git worktree add .worktrees/core -b feat/core-api-ssh <C1_COMMIT>
git worktree add .worktrees/ui -b feat/ui-workbench <C1_COMMIT>
```

主仓库或独立集成目录保持：

```text
integration/v1.0-next
```

## 三、所有权矩阵

| 范围 | Codex | UIAI | 集成负责人 |
|---|---|---|---|
| Client Schema | 主责 | 只读 | 复核 |
| 生成类型 | 主责 | 使用 | 复核 |
| Core/SQLite | 主责 | 禁止 | 复核 |
| SSH/Linux | 主责 | 禁止 | 复核 |
| Harness | 主责 | 禁止 | 复核 |
| Electron main/preload | 主责 | 只读 | 复核 |
| Renderer/组件/样式 | 禁止主动改 | 主责 | 复核 |
| Mock API | 提供协议 Mock | 提供 UI 场景 | 协调 |
| UI E2E | 支持 | 主责 | 运行 |
| 端到端真实集成 | 主责 | 协助定位 | 最终决定 |
| 文档 | 技术文档 | UI 文档 | 汇总 |

## 四、共享文件规则

以下文件视为受保护合同：

```text
packages/client-contract/**
docs/api/**
contracts/**
apps/desktop/preload.*
```

UIAI 需要变更时，不直接编辑，提交 Contract Change Request。

Codex 不得为了临时让 UI 通过而改变状态含义。新增能力使用 capability 或可选字段。

## 五、合并顺序

1. C1；
2. Core API 与传输基础；
3. UI Mock 实现；
4. UI 分支 rebase 最新 C1；
5. 合并 UI；
6. 合并 SSH 和 Linux；
7. 模拟端到端；
8. 安全 Gate；
9. 真实 Harness；
10. 发布验收。

不要让 UI 分支依赖尚未提交的 Core 本地文件。

## 六、依赖与构建隔离

每个 worktree：

- 独立 `node_modules` 或 pnpm 正确链接；
- 独立 `.local`、测试数据库和产物目录；
- 不共用运行中 Core Socket；
- 不共用 Harness 账号目录；
- 不把真实凭据复制到任何 worktree；
- 使用不同测试端口/Socket；
- 设置明显的 `AGENTROUTER_DATA`。

## 七、集成冲突处理

- 合同冲突：Codex 提案，用户/复核者确认；
- UI 需求冲突：UIAI提交可复现用户场景；
- 状态语义冲突：以 Core 持久化状态为准；
- 视觉冲突：UIAI决定；
- 安全冲突：默认选择更小权限和失败关闭；
- 测试冲突：不得删除另一方测试来通过。

## 八、是否需要专门第三个 AI

下一轮不需要再增加专门 Integration AI。

Codex 已经承担技术总集成，用户/ChatGPT承担复核。只有当两个分支规模显著扩大、冲突频繁或 Codex无法同时维护 Core 和集成时，再增加 Integration 角色。
