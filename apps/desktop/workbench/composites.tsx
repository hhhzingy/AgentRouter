import {SafeText} from './safe-text.tsx';
import {TaskEditor} from './task-editor.tsx';
import {actionTone,failureState,errorMessage,type ActionState} from './action-state.ts';
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
  const needsSetup=roles.filter(r=>r.interventionState==='BOOTSTRAP_REQUIRED'||r.interventionState==='MODEL_UNVERIFIED').length;
  const unknown=s.snapshot.runs.filter(r=>roles.some(x=>x.id===r.roleId)&&(r.state==='UNKNOWN'||r.reconciliationRequired)).length;
  const tone = unknown ? {key:'unknown',label:`${unknown} 个状态未知`,tone:'danger' as const,priority:1} : needsSetup && !project.activeRunsCount && !project.issuesCount ? {key:'setup',label:`${needsSetup} 个角色待设置`,tone:'neutral' as const,priority:15} : summaryTone({issues:project.issuesCount,activeRuns:project.activeRunsCount,approvals:roles.reduce((n,r)=>n+r.pendingApprovalsCount,0)});
  const ssh = project.hostLabel.startsWith('SSH');
  return (
    <article className="project-card" data-project-id={project.id}>
      <header>
        <StatusDot tone={tone.tone} label={tone.label} />
        <div className="project-card-title">
          <h2><a href={`#/project/${project.id}`}>{project.name}</a></h2>
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
        {spaces.slice(0,3).map((sp) => {
          const members = roles.filter((r) => r.spaceId === sp.id);
          return (
            <div className="project-card-group" key={sp.id}>
              <span className="group-name">{sp.name}</span>
              <span className="group-avatars">
                {members.slice(0, 5).map((r) => (
                  <a key={r.id} href={`#/role/${r.id}`} aria-label={`${r.name} · ${roleDisplayStates(roleCtx(s.snapshot,r)).map(x=>x.label).join('、')}`}><Avatar name={r.name} tone="neutral"/><StatusDot tone={roleDisplayStates(roleCtx(s.snapshot,r))[0].tone} label={roleDisplayStates(roleCtx(s.snapshot,r))[0].label}/></a>
                ))}
                {members.length > 5 && <span className="avatar-more">+{members.length - 5}</span>}
              </span>
            </div>
          );
        })}
      {spaces.length>3&&<a href={`#/project/${project.id}`}>另有 {spaces.length-3} 个小组</a>}</div>
      <footer>
        <span>
          {project.activeRunsCount > 0 ? `▶${project.activeRunsCount} 运行 ` : ''}
          {project.issuesCount > 0 ? `◆${project.issuesCount} 介入` : ''}
          {project.activeRunsCount === 0 && project.issuesCount === 0 && (needsSetup ? `${needsSetup} 个角色待设置` : '无进行中的工作')}
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
      setError(errorMessage(e));
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
  const ws = undefined; // 无权威 workspaceId 时不按显示名称猜测。
  const tone = summaryTone({
    activeRuns: space.activeRunsCount,
    issues: s.snapshot.issues.filter(i=>roles.some(r=>r.id===i.roleId)&&i.state!=='RESOLVED').length,
    queued: space.queuedTasksCount,
    approvals: roles.reduce((n, r) => n + r.pendingApprovalsCount, 0),
  });
  return (
    <section className="space-card" data-space-id={space.id}>
      <header className="space-card-head">
        <div>
          <h3>
            {space.name}

          </h3>
          {space.purpose && <p className="space-purpose">{space.purpose}</p>}
        </div>
        <div className="space-card-meta"><details><summary>管理小组</summary><a href={`#/reconfigure/${space.projectId}`}>合并小组 / 拆分小组（未开放）</a></details>
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

export function DispatchDrawer({role,onClose}:{role:RoleVM;onClose:()=>void}){
 return <Drawer title={`派发给 ${role.name}`} onClose={onClose} footer={<Button onClick={onClose}>取消</Button>}><TaskEditor role={role}/></Drawer>;
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
          {it.body && (it.kind==='TOOL_CALL'||it.kind==='TOOL_RESULT'?<details><summary>查看工具记录</summary><SafeText text={it.body}/></details>:<SafeText text={it.body}/>) }
        </li>
      ))}
    </ol>
  );
}

/* ---------- 对话输入（无回执红线） ---------- */

export function Composer({role,spaceId:_spaceId}:{role:RoleVM;spaceId:string}){return <TaskEditor role={role}/>;}

/* ---------- UNKNOWN 对账面板 ---------- */

export function ReconcilePanel({ run }: { run: RunVM }) {
  const s = useStore();
  const [done, setDone] = useState<string | null>(null);
  const [action,setAction]=useState<ActionState>('idle');
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
                  .then(() => {setAction('succeeded');setDone('已提交对账动作：'+label);})
                  .catch((e) => {setAction(failureState(e));setDone(errorMessage(e));})
              }
            >
              {label}
            </Button>
          </CapabilityGate>
        ))}
      </div>
      {done && (
        <div className={`hint tone-${actionTone(action)}`} role="status">
          {done}
        </div>
      )}
    </section>
  );
}
