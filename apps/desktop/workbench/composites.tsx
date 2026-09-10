import { STAGED_RESULT_LABEL } from '../../../packages/ui/status.ts';
/** 页面级复合组件：项目卡、组卡、角色行、派发抽屉、对话视图、对账面板。 */
import React, { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  CapabilityGate,
  Drawer,
  EmptyState,
  KeyValue,
  StatusDot,
  ToneBadge,
  roleDisplayStates,
  summaryTone,
  formatAgo,
  formatDateTime,
  formatQueuePosition,
  RUN_STATE_LABEL,
  TASK_STATE_LABEL,
} from '../../../packages/ui/index.ts';
import type {
  ConversationItemVM,
  ProjectVM,
  RoleVM,
  RunVM,
  SpaceVM,
  TaskVM,
} from '../../../packages/client-contract/c1r1p1/generated.ts';
import { useStore } from './store.tsx';

/* ---------- 项目卡（首页） ---------- */

export function ProjectCard({ project }: { project: ProjectVM }) {
  const s = useStore();
  const spaces = s.snapshot.spaces.filter(
    (sp) => sp.projectId === project.id && sp.status === 'ACTIVE',
  );
  const roles = s.snapshot.roles.filter((r) => spaces.some((sp) => sp.id === r.spaceId));
  const tone = summaryTone({
    issues: project.issuesCount,
    activeRuns: project.activeRunsCount,
    approvals: s.snapshot.approvals.filter(
      (a) =>
        a.state === 'PENDING' &&
        s.snapshot.runs.some((run) => run.id === a.runId && roles.some((r) => r.id === run.roleId)),
    ).length,
  });
  const ssh = project.hostLabel.startsWith('SSH');
  return (
    <article className="project-card" data-project-id={project.id}>
      <header>
        <StatusDot tone={tone.tone} label={tone.label} />
        <div className="project-card-title">
          <h2>{project.name}</h2>
          <span
            className="project-card-host"
            title={ssh ? '远程 Core，路径由 Core 提供' : '本地 Core'}
          >
            {ssh ? '⌁ ' : ''}
            {project.hostLabel}
          </span>
        </div>
        <ToneBadge state={tone} />
      </header>
      <p className="project-card-root">{project.displayRoot}</p>
      <div className="project-card-groups">
        {spaces.map((sp) => {
          const members = roles.filter((r) => r.spaceId === sp.id);
          return (
            <div className="project-card-group" key={sp.id}>
              <span className="group-name">{sp.name}</span>
              <span className="group-avatars">
                {members.slice(0, 5).map((r) => (
                  <Avatar
                    key={r.id}
                    name={r.name}
                    tone={roleDisplayStates(roleCtx(s.snapshot, r))[0].tone}
                  />
                ))}
                {members.length > 5 && <span className="avatar-more">+{members.length - 5}</span>}
              </span>
            </div>
          );
        })}
      </div>
      <footer>
        <span>
          {project.activeRunsCount > 0 ? `▶${project.activeRunsCount} 运行 ` : ''}
          {project.issuesCount > 0 ? `◆${project.issuesCount} 介入` : ''}
          {project.activeRunsCount === 0 && project.issuesCount === 0 && '无进行中的工作'}
        </span>
        <a className="btn btn-secondary btn-sm" href={`#/project/${project.id}`}>
          打开
        </a>
      </footer>
    </article>
  );
}

/** 与项目卡同尺寸的创建入口卡（规则 1）。 */
export function CreateProjectCard() {
  const s = useStore();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const entry = await window.agentrouterDesktop?.chooseProjectDirectory();
      if (!entry) return;
      await s.call('filesystem.validateProjectRoot', { path_handle: entry.pathHandle });
      const project = await s.call('project.create', {
        name: entry.name,
        path_handle: entry.pathHandle,
      });
      location.hash = '#/project/' + project.id;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="project-card project-card-create">
      <div className="create-inner">
        <span className="create-plus" aria-hidden="true">
          ＋
        </span>
        <h2>创建新项目</h2>
        <p>选择一个 Core（本机或已配置的 SSH）与项目目录。</p>
        <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
          <Button
            variant="primary"
            disabled={
              busy ||
              s.readOnly ||
              typeof window === 'undefined' ||
              !window.agentrouterDesktop ||
              !s.capabilities.methods.includes('project.create')
            }
            onClick={() => void create()}
          >
            选择目录…
          </Button>
        </CapabilityGate>
        {error && <p role="alert">{error}</p>}
      </div>
    </article>
  );
}

/* ---------- 角色状态工具 ---------- */

function roleCtx(snap: ReturnType<typeof useStore>['snapshot'], role: RoleVM) {
  return {
    role,
    tasks: snap.tasks,
    runs: snap.runs,
    approvals: snap.approvals,
    issues: snap.issues,
  };
}

export function RoleStateBadges({ role }: { role: RoleVM }) {
  const s = useStore();
  const states = roleDisplayStates(roleCtx(s.snapshot, role));
  return (
    <span className="role-states">
      {states.map((st) => (
        <ToneBadge key={st.key} state={st} />
      ))}
    </span>
  );
}

/* ---------- 组卡（项目页） ---------- */

export function SpaceCard({
  space,
  onDispatch,
}: {
  space: SpaceVM;
  onDispatch: (role: RoleVM) => void;
}) {
  const s = useStore();
  const roles = s.snapshot.roles.filter((r) => r.spaceId === space.id && r.status !== 'ARCHIVED');
  const ws = (s.snapshot.workspaces ?? []).find((w) =>
    roles.some((r) => r.workspaceLabel.includes(w.label)),
  );
  const tone = summaryTone({
    activeRuns: space.activeRunsCount,
    issues: space.needsUserCount,
    queued: space.queuedTasksCount,
    approvals: roles.reduce((n, r) => n + r.pendingApprovalsCount, 0),
  });
  return (
    <section className="space-card" data-space-id={space.id}>
      <header className="space-card-head">
        <div>
          <h3>
            {space.name}
            {ws && (
              <span className="ws-badge" title={`工作区：${ws.displayPath}（文件边界，≠ 协作组）`}>
                ⧉ {ws.label}
                {ws.branchLabel ? ` · ${ws.branchLabel}` : ''}
              </span>
            )}
          </h3>
          {space.purpose && <p className="space-purpose">{space.purpose}</p>}
        </div>
        <div className="space-card-meta">
          <ToneBadge state={tone} />
          {space.policyRevision !== undefined && (
            <span className="policy-rev" title="组规则版本">
              规则 r{space.policyRevision}
            </span>
          )}
        </div>
      </header>
      <ul className="role-rows">
        {roles.map((r) => (
          <li key={r.id} className="role-row">
            <Avatar name={r.name} tone={roleDisplayStates(roleCtx(s.snapshot, r))[0].tone} />
            <a className="role-name" href={`#/role/${r.id}`}>
              {r.name}
            </a>
            <span className="role-desc">{r.description}</span>
            <RoleStateBadges role={r} />
            <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
              <Button
                variant="ghost"
                ariaLabel={`向 ${r.name} 派发任务`}
                onClick={() => onDispatch(r)}
              >
                派发
              </Button>
            </CapabilityGate>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- 派发抽屉 ---------- */

export function DispatchDrawer({ role, onClose }: { role: RoleVM; onClose: () => void }) {
  const s = useStore();
  const [text, setText] = useState('');
  const [target, setTarget] = useState('user');
  const [handoff, setHandoff] = useState(false);
  const [expected, setExpected] = useState('提交成果');
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const active = s.snapshot.tasks.find(
    (t) => t.assigneeRoleId === role.id && ['ACTIVE', 'WAITING_INPUT'].includes(t.state),
  );
  const queued = s.snapshot.tasks.filter(
    (t) => t.assigneeRoleId === role.id && t.state === 'QUEUED',
  );
  const willQueue = !!active || role.status === 'PAUSED';

  async function submit() {
    setSending(true);
    try {
      const task = await s.call('task.submitFromUser', {
        request: {
          kind: 'task.request',
          to: { type: 'role', id: role.id },
          summary: text.slice(0, 240),
          body: text,
          inputs: [],
          expected: expected.split('\n').filter(Boolean),
          completion:
            handoff && target !== 'user'
              ? {
                  mode: 'handoff',
                  to: { type: 'role', id: target },
                  instruction: '按任务正文接续工作',
                }
              : {
                  mode: 'result',
                  to: target === 'user' ? { type: 'user' } : { type: 'role', id: target },
                },
        },
      });
      // 红线：只显示"已提交/已入队"，不声称角色已接收或已处理。
      setNotice(
        task.state === 'QUEUED'
          ? `已入队${task.queuePosition ? `，${formatQueuePosition(task.queuePosition)}` : ''}（位置以 Core 返回为准）`
          : '已提交',
      );
      setText('');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Drawer
      title={`派发给 ${role.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={s.readOnly || !text.trim() || !expected.trim() || sending}
            onClick={() => void submit()}
          >
            {willQueue ? '派发到队列' : '提交任务'}
          </Button>
        </>
      }
    >
      {active && (
        <div className="hint tone-warning">
          该角色正在处理「{active.summary}」。新任务将进入队列 。
        </div>
      )}
      {role.status === 'PAUSED' && (
        <div className="hint tone-warning">该角色已暂停派发，任务将留在队列中等待恢复。</div>
      )}
      <label className="field">
        <span>任务内容（去向：{role.name}）</span>
        <textarea
          value={text}
          maxLength={8192}
          rows={6}
          onChange={(e) => setText(e.target.value)}
          placeholder="描述任务与完成定义…"
        />
      </label>
      <label className="field">
        <span>预期成果（每行一项）</span>
        <textarea
          aria-label="预期成果"
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
        />
      </label>
      <label className="field">
        <span>结果去向</span>
        <select aria-label="结果去向" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="user">用户</option>
          {s.snapshot.roles
            .filter((r) => r.spaceId === role.spaceId && r.id !== role.id)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      {target !== 'user' && (
        <label>
          <input type="checkbox" checked={handoff} onChange={(e) => setHandoff(e.target.checked)} />
          交接任务给目标角色
        </label>
      )}
      {notice && (
        <div className="hint tone-ok" role="status">
          {notice}
        </div>
      )}
    </Drawer>
  );
}

/* ---------- 任务 / Run 行 ---------- */

export function TaskRow({ task }: { task: TaskVM }) {
  const run = useStore()
    .snapshot.runs.filter((r) => r.taskId === task.id)
    .sort((a, b) => b.startedAtMs! - a.startedAtMs!)[0];
  return (
    <li className="task-row" data-task-id={task.id}>
      <div className="task-row-main">
        <span className="task-summary">{task.summary}</span>
        <span className="task-target">去向：{task.completionTargetLabel}</span>
      </div>
      <div className="task-row-states">
        <Badge
          tone={
            task.state === 'NEEDS_ATTENTION'
              ? 'danger'
              : task.state === 'QUEUED'
                ? 'queue'
                : 'neutral'
          }
        >
          {run?.state === 'SETTLING' && task.state === 'RESULT_STAGED'
            ? STAGED_RESULT_LABEL
            : TASK_STATE_LABEL[task.state]}
          {task.state === 'QUEUED' && task.queuePosition !== undefined
            ? ` · ${formatQueuePosition(task.queuePosition)}`
            : ''}
        </Badge>
        {run && (
          <Badge
            tone={
              run.state === 'UNKNOWN'
                ? 'danger'
                : run.state === 'SETTLING'
                  ? 'warning'
                  : run.state === 'RUNNING'
                    ? 'active'
                    : 'neutral'
            }
            title={run.state === 'SETTLING' ? '收尾中 ≠ 完成' : undefined}
          >
            Run {RUN_STATE_LABEL[run.state]}
          </Badge>
        )}
      </div>
    </li>
  );
}

/* ---------- 对话视图 ---------- */

const KIND_LABEL: Record<ConversationItemVM['kind'], string> = {
  USER_MESSAGE: '用户',
  ASSISTANT_MESSAGE: '角色',
  TOOL_CALL: '工具调用',
  TOOL_RESULT: '工具结果',
  ROUTE_TASK: '任务路由',
  ROUTE_RESULT: '结果路由',
  NOTICE: '通知',
  APPROVAL: '审批',
  SYSTEM_EVENT: '系统',
  GAP: '缺口',
};

export function ConversationView({ items, now }: { items: ConversationItemVM[]; now: number }) {
  if (items.length === 0)
    return <EmptyState title="暂无对话" body="该范围还没有可见的协作记录。" />;
  return (
    <ol className="conversation">
      {items.map((it) => (
        <li key={it.id} className={`cv-item kind-${it.kind.toLowerCase()}`} data-kind={it.kind}>
          <header>
            <Badge
              tone={
                it.kind === 'GAP'
                  ? 'warning'
                  : it.kind === 'APPROVAL'
                    ? 'danger'
                    : it.kind === 'SYSTEM_EVENT'
                      ? 'queue'
                      : 'neutral'
              }
            >
              {KIND_LABEL[it.kind]}
            </Badge>
            {it.title && <span className="cv-title">{it.title}</span>}
            <time title={formatDateTime(it.occurredAtMs)}>{formatAgo(it.occurredAtMs, now)}</time>
          </header>
          {it.body && <p className="cv-body">{it.body}</p>}
        </li>
      ))}
    </ol>
  );
}

/* ---------- 对话输入（无回执红线） ---------- */

export function Composer({ role, spaceId: _spaceId }: { role: RoleVM; spaceId: string }) {
  const s = useStore();
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const activeTask = s.snapshot.tasks.find(
    (t) => t.assigneeRoleId === role.id && t.state === 'WAITING_INPUT',
  );
  const disabled = s.readOnly || s.connectionState === 'DISCONNECTED' || !activeTask;
  async function send() {
    try {
      await s.call('conversation.sendUserInput', {
        role_id: role.id,
        task_id: activeTask!.id,
        body: text,
      } as never);
      setText('');
      // 只说"已提交"，不伪造"已读/已处理"。
      setNote('已提交。对方是否接收与处理以后续事件为准。');
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div className="composer">
      <textarea
        aria-label={`给 ${role.name} 发送输入`}
        placeholder={
          s.readOnly || s.connectionState === 'DISCONNECTED'
            ? '只读或断线时不可发送'
            : !activeTask
              ? '没有进行中的任务；补充输入需关联任务，新任务请使用「派发」'
              : `就「${activeTask.summary}」补充输入…`
        }
        value={text}
        disabled={disabled}
        rows={2}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="composer-foot">
        {note && (
          <span className="hint tone-ok" role="status">
            {note}
          </span>
        )}
        <Button variant="primary" disabled={disabled || !text.trim()} onClick={() => void send()}>
          发送
        </Button>
      </div>
    </div>
  );
}

/* ---------- UNKNOWN 对账面板 ---------- */

export function ReconcilePanel({ run }: { run: RunVM }) {
  const s = useStore();
  const [done, setDone] = useState<string | null>(null);
  const actions = [
    ['confirm_native_completed', '确认原生已完成'],
    ['confirm_no_side_effect_and_retry', '确认无副作用'],
    ['mark_failed', '标记失败'],
    ['reattach_native_session', '重接原生会话'],
    ['quarantine_workspace', '隔离工作区'],
    ['release_after_manual_verification', '人工核验后释放'],
  ] as const;
  return (
    <section className="reconcile-panel" data-testid="reconcile-panel">
      <h3>Run 状态未知 — 需要对账</h3>
      <p>
        与原生会话失去确认（{run.nativeSessionDisplay ?? '无会话标识'}）。界面不会自动重跑；
        {s.capabilities.methods.includes('run.reconcile')
          ? '请选择一种对账动作，该动作会留审计记录。'
          : '当前 Core 未开放受控对账，资源保持隔离。'}
      </p>
      <KeyValue k="开始于" v={run.startedAtMs ? formatDateTime(run.startedAtMs) : '未知'} />
      <KeyValue k="失联原因" v={run.exitReason ?? '未提供'} />
      <div className="reconcile-actions">
        {actions.map(([action, label]) => (
          <CapabilityGate
            key={action}
            available={!s.readOnly && s.capabilities.methods.includes('run.reconcile')}
            unavailableReason={s.readOnly ? '观察者只读' : '当前 Core 未开放受控对账'}
          >
            <Button
              variant={action === 'quarantine_workspace' ? 'danger' : 'secondary'}
              onClick={() =>
                void s
                  .call('run.reconcile', { run_id: run.id, action, evidence_ids: [] } as never)
                  .then(() => setDone(label))
                  .catch((e) => setDone(e.message))
              }
            >
              {label}
            </Button>
          </CapabilityGate>
        ))}
      </div>
      {done && (
        <div className="hint tone-ok" role="status">
          已提交对账动作：{done}
        </div>
      )}
    </section>
  );
}
