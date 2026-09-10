/**
 * 状态合成：UI Baseline V1 的唯一状态解释层。
 *
 * 产品红线（见 docs/ui/baseline-v1/PRODUCT_RULES.md）：
 * - SETTLING 显示"收尾中"，绝不显示"完成"；完成只认 Run SUCCEEDED + 显式 Result。
 * - UNKNOWN 始终独立可见，不被其他状态掩盖，不自动重跑。
 * - 角色 ACTIVE ≠ 执行中；执行只认 Run。
 * - 暂停与排队是两个独立信号，同时存在时并列显示。
 * - 队列位置只显示 Core 返回的 queuePosition，UI 不自行估算。
 */
import type {
  ApprovalVM,
  IssueVM,
  RoleVM,
  RunState,
  RunVM,
  TaskState,
  TaskVM,
} from '../client-contract/c1r1p1/generated.ts';

export type DisplayTone =
  | 'danger' // 需介入 / UNKNOWN
  | 'warning' // 待审批 / 收尾 / 暂停
  | 'active' // 执行中
  | 'queue' // 排队 / 等待
  | 'neutral' // 空闲 / 其他
  | 'ok'; // 最近完成（辅助，不覆盖主状态）

export interface DisplayState {
  key: string;
  label: string;
  tone: DisplayTone;
  /** 合成优先级，数值越小越优先（用于同屏多信号时选主状态）。 */
  priority: number;
}

export const RUN_STATE_LABEL: Record<RunState, string> = {
  CREATED: '已创建',
  STARTING: '启动中',
  RUNNING: '执行中',
  WAITING_APPROVAL: '等待审批',
  SETTLING: '收尾中',
  SUCCEEDED: '已成功',
  FAILED: '已失败',
  CANCELLED: '已取消',
  UNKNOWN: '状态未知',
};

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  QUEUED: '排队中',
  ACTIVE: '进行中',
  WAITING_INPUT: '等待输入',
  RESULT_STAGED: '结果待验收',
  DELIVERED: '已交付',
  HANDED_OFF: '已转交',
  PARTIAL: '部分完成',
  FAILED: '已失败',
  CANCELLED: '已取消',
  NEEDS_ATTENTION: '需要关注',
  SUSPENDED: '已挂起',
};

const ACTIVE_RUN: RunState[] = ['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'];

/**
 * 角色主展示态合成。输入为角色与其关联实体，输出按优先级排序的展示态列表；
 * 第一项为主状态，其余作为并列标签（例如"暂停派发 + 排队 2"）。
 */
export function roleDisplayStates(input: {
  role: RoleVM;
  tasks: TaskVM[];
  runs: RunVM[];
  approvals: ApprovalVM[];
  issues: IssueVM[];
}): DisplayState[] {
  const { role, tasks, runs, approvals, issues } = input;
  const states: DisplayState[] = [];
  const myRuns = runs.filter((r) => r.roleId === role.id);
  const myTasks = tasks.filter((t) => t.assigneeRoleId === role.id);
  const unknownRun = myRuns.find((r) => r.state === 'UNKNOWN' || r.reconciliationRequired);
  const attentionTask = myTasks.find((t) => t.state === 'NEEDS_ATTENTION');
  const openIssue = issues.find((i) => i.roleId === role.id && i.state !== 'RESOLVED');
  const pendingApproval = approvals.find(
    (a) => a.state === 'PENDING' && myRuns.some((r) => r.id === a.runId),
  );
  const activeRun = myRuns.find((r) => ACTIVE_RUN.includes(r.state));
  const waitingTask = myTasks.find((t) => t.state === 'WAITING_INPUT');
  const queuedCount = myTasks.filter((t) => t.state === 'QUEUED').length;

  if (role.interventionState && role.interventionState !== 'NONE') {
    const label =
      role.interventionState === 'BOOTSTRAP_REQUIRED'
        ? '待初始化'
        : role.interventionState === 'BOOTSTRAP_FAILED'
          ? '初始化失败'
          : '模型未验证';
    states.push({ key: 'intervention', label, tone: 'danger', priority: 1 });
  }
  if (unknownRun) states.push({ key: 'unknown', label: '状态未知', tone: 'danger', priority: 2 });
  if (attentionTask || openIssue)
    states.push({ key: 'attention', label: '需要介入', tone: 'danger', priority: 3 });
  if (pendingApproval)
    states.push({ key: 'approval', label: '等待审批', tone: 'warning', priority: 4 });
  if (activeRun) {
    if (activeRun.state === 'SETTLING')
      states.push({ key: 'settling', label: '收尾中', tone: 'warning', priority: 5 });
    else if (activeRun.state === 'WAITING_APPROVAL') {
      // 与审批实体徽标去重：有 ApprovalVM 时不重复显示 Run 态
      if (!pendingApproval)
        states.push({ key: 'wait-approval', label: '等待审批', tone: 'warning', priority: 6 });
    } else states.push({ key: 'running', label: '执行中', tone: 'active', priority: 7 });
  }
  if (waitingTask) states.push({ key: 'waiting', label: '等待输入', tone: 'queue', priority: 8 });
  if (queuedCount > 0)
    states.push({
      key: 'queued',
      label: `排队 ${queuedCount}`,
      tone: 'queue',
      priority: 9,
    });
  if (role.status === 'PAUSED')
    states.push({ key: 'paused', label: '暂停派发', tone: 'warning', priority: 10 });
  if (role.status === 'DISABLED')
    states.push({ key: 'disabled', label: '已停用', tone: 'neutral', priority: 11 });
  if (role.status === 'ARCHIVED')
    states.push({ key: 'archived', label: '已归档', tone: 'neutral', priority: 12 });
  if (states.length === 0)
    states.push({ key: 'idle', label: '空闲', tone: 'neutral', priority: 20 });
  return states.sort((a, b) => a.priority - b.priority);
}

/** 项目卡/组卡状态灯：只能来自聚合计数，不能凭空推断。 */
export function summaryTone(counts: {
  unknown?: number;
  issues?: number;
  approvals?: number;
  activeRuns?: number;
  queued?: number;
}): DisplayState {
  if ((counts.unknown ?? 0) > 0)
    return { key: 'unknown', label: '状态未知', tone: 'danger', priority: 1 };
  if ((counts.issues ?? 0) > 0)
    return { key: 'issues', label: `待介入 ${counts.issues}`, tone: 'danger', priority: 2 };
  if ((counts.approvals ?? 0) > 0)
    return { key: 'approvals', label: `待审批 ${counts.approvals}`, tone: 'warning', priority: 3 };
  if ((counts.activeRuns ?? 0) > 0)
    return {
      key: 'running',
      label: `${counts.activeRuns} 个活跃 Run`,
      tone: 'active',
      priority: 4,
    };
  if ((counts.queued ?? 0) > 0)
    return { key: 'queued', label: `排队 ${counts.queued}`, tone: 'queue', priority: 5 };
  return { key: 'idle', label: '空闲', tone: 'neutral', priority: 9 };
}

/** 连接状态文案：Local 断线 ≠ 协议不兼容；SSH 断线只承诺"最后已知状态"。 */
export const CONNECTION_LABEL: Record<string, string> = {
  DISCONNECTED: '已断开',
  CONNECTING: '连接中',
  CONNECTED_CONTROLLER: '已连接 · 控制者',
  CONNECTED_OBSERVER: '已连接 · 观察者（只读）',
  RECONNECTING: '重连中',
  DEGRADED: '已降级',
  INCOMPATIBLE: '协议不兼容',
};

export function isReadOnly(connectionState: string): boolean {
  return connectionState !== 'CONNECTED_CONTROLLER';
}

export const STAGED_RESULT_LABEL = '结果已暂存';
