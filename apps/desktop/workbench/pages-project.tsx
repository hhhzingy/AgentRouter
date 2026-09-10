/** 单项目页：概览/协作组/时间线/收件箱/审批与问题/产物/模型与账号/设置。 */
import React, { useState } from 'react';
import {
  Badge,
  Button,
  CapabilityGate,
  Card,
  EmptyState,
  KeyValue,
  Tabs,
  ToneBadge,
  formatBytes,
  formatDateTime,
  summaryTone,
  RUN_STATE_LABEL,
} from '../../../packages/ui/index.ts';
import type { RoleVM } from '../../../packages/client-contract/c1r1p1/generated.ts';
import { ConversationView, DispatchDrawer, SpaceCard, TaskRow } from './composites.tsx';
import { useStore } from './store.tsx';

const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'spaces', label: '协作组' },
  { key: 'timeline', label: '时间线' },
  { key: 'inbox', label: '收件箱' },
  { key: 'issues', label: '审批与问题' },
  { key: 'artifacts', label: '产物' },
  { key: 'models', label: '模型与账号' },
  { key: 'settings', label: '设置' },
];

export function ProjectPage({ projectId, tab }: { projectId: string; tab?: string }) {
  const s = useStore();
  const project = s.snapshot.projects.find((p) => p.id === projectId);
  const [activeTab, setActiveTab] = useState(tab ?? 'overview');
  const [dispatchRole, setDispatchRole] = useState<RoleVM | null>(null);
  if (!project) return <EmptyState title="项目不存在" body="可能已归档或连接的是另一个 Core。" />;

  const spaces = s.snapshot.spaces.filter((sp) => sp.projectId === projectId && sp.status !== 'ARCHIVED');
  const roles = s.snapshot.roles.filter((r) => spaces.some((sp) => sp.id === r.spaceId));
  const roleIds = roles.map((r) => r.id);
  const tasks = s.snapshot.tasks.filter((t) => spaces.some((sp) => sp.id === t.spaceId));
  const runs = s.snapshot.runs.filter((r) => roleIds.includes(r.roleId));
  const issues = s.snapshot.issues.filter((i) => i.projectId === projectId);
  const approvals = s.snapshot.approvals.filter((a) => runs.some((r) => r.id === a.runId));
  const results = s.snapshot.results.filter((r) => tasks.some((t) => t.id === r.taskId));
  const artifacts = s.snapshot.results
    .flatMap((r) => r.artifactIds)
    .map((id) => ({ id }))
    .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
  const ssh = project.hostLabel.startsWith('SSH');

  const tabBadges: Record<string, number | undefined> = {
    inbox: results.filter((r) => r.acceptance === 'PENDING').length,
    issues: issues.filter((i) => i.state !== 'RESOLVED').length + approvals.filter((a) => a.state === 'PENDING').length,
  };

  return (
    <div className="page page-project" data-page="project">
      <header className="page-head project-head">
        <div>
          <div className="eyebrow">
            <a href="#/">项目</a> / {project.name}
          </div>
          <h1>
            {project.name}
            <span className="project-host-badge" title={ssh ? '远程 Core（SSH）' : '本地 Core'}>
              {ssh ? '⌁ ' : ''}
              {project.hostLabel}
            </span>
          </h1>
          <p className="project-root">{project.displayRoot}</p>
        </div>
        <div className="project-head-actions">
          <CapabilityGate
            available={s.capabilities.role_plans !== false && !s.readOnly}
            unavailableReason={
              s.capabilities.role_plans === false ? '当前 Core 不支持 Role Plan' : '观察者只读'
            }
          >
            <Button variant="secondary" onClick={() => (location.hash = `#/roleplan/${projectId}`)}>
              编排角色（Role Plan）
            </Button>
          </CapabilityGate>
          <CapabilityGate
            available={s.capabilities.space_reconfiguration !== false && !s.readOnly}
            unavailableReason={
              s.capabilities.space_reconfiguration === false ? '当前 Core 不支持组重构' : '观察者只读'
            }
          >
            <Button variant="secondary" onClick={() => (location.hash = `#/reconfigure/${projectId}`)}>
              组重构
            </Button>
          </CapabilityGate>
        </div>
      </header>
      <Tabs
        tabs={TABS.map((t) => ({ ...t, badge: tabBadges[t.key] }))}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'overview' && (
        <div className="tab-body" data-tab="overview">
          <div className="overview-strip">
            <KeyValue k="协作组" v={spaces.length} />
            <KeyValue k="角色" v={roles.length} />
            <KeyValue
              k="活跃 Run"
              v={runs.filter((r) => ['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'].includes(r.state)).length}
            />
            <KeyValue k="排队任务" v={tasks.filter((t) => t.state === 'QUEUED').length} />
            <KeyValue k="未解决问题" v={issues.filter((i) => i.state !== 'RESOLVED').length} />
          </div>
          {spaces.map((sp) => (
            <SpaceCard key={sp.id} space={sp} onDispatch={setDispatchRole} />
          ))}
          {spaces.length === 0 && (
            <EmptyState
              title="还没有协作组"
              body="协作组是通信与规则边界。通过「编排角色」生成或导入 Role Plan 来创建第一个组。"
            />
          )}
          <Card>
            <h3>进行中的任务</h3>
            {tasks.filter((t) => ['ACTIVE', 'QUEUED', 'WAITING_INPUT', 'NEEDS_ATTENTION'].includes(t.state)).length ===
            0 ? (
              <p className="muted">当前没有进行中的任务。</p>
            ) : (
              <ul className="task-rows">
                {tasks
                  .filter((t) => ['ACTIVE', 'QUEUED', 'WAITING_INPUT', 'NEEDS_ATTENTION'].includes(t.state))
                  .map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'spaces' && (
        <div className="tab-body" data-tab="spaces">
          {spaces.map((sp) => (
            <SpaceCard key={sp.id} space={sp} onDispatch={setDispatchRole} />
          ))}
          <p className="muted">
            协作组（Space）是通信与规则边界；工作区（Workspace/Worktree）是文件边界。跨组角色不能直接通信。
          </p>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="tab-body" data-tab="timeline">
          <ConversationView
            items={s.timeline.filter((it) => {
              const role = roles.find((r) => r.id === it.roleId);
              return !it.roleId || !!role;
            })}
            now={s.now()}
          />
        </div>
      )}

      {activeTab === 'inbox' && (
        <div className="tab-body" data-tab="inbox">
          {results.length === 0 ? (
            <EmptyState
              title="收件箱为空"
              body="只有显式发给你的结果会出现在这里；成功发信不产生回执，通知不唤醒角色。"
            />
          ) : (
            <ul className="inbox-list">
              {results.map((r) => (
                <li key={r.id} className="inbox-item">
                  <div>
                    <Badge tone={r.acceptance === 'PENDING' ? 'warning' : 'neutral'}>
                      {r.acceptance === 'PENDING'
                        ? '待验收'
                        : r.acceptance === 'ACCEPTED'
                          ? '已接受'
                          : r.acceptance === 'REJECTED'
                            ? '已拒绝'
                            : '无需验收'}
                    </Badge>{' '}
                    <b>{r.summary}</b>
                    <div className="muted">
                      关联任务 {r.taskId} · 产物 {r.artifactIds.length} 个
                    </div>
                  </div>
                  {r.acceptance === 'PENDING' && (
                    <div className="inbox-actions">
                      <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
                        <Button variant="primary" onClick={() => void s.call('result.accept', { id: r.id } as never)}>
                          接受
                        </Button>
                        <Button variant="secondary" onClick={() => void s.call('result.reject', { id: r.id } as never)}>
                          拒绝
                        </Button>
                      </CapabilityGate>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'issues' && (
        <div className="tab-body" data-tab="issues">
          <Card>
            <h3>待审批</h3>
            {approvals.length === 0 ? (
              <p className="muted">没有待处理的审批。</p>
            ) : (
              <ul className="approval-list">
                {approvals.map((a) => (
                  <li key={a.id}>
                    <Badge tone={a.riskLevel === 'HIGH' ? 'danger' : a.riskLevel === 'MEDIUM' ? 'warning' : 'neutral'}>
                      {a.riskLevel === 'HIGH' ? '高风险' : a.riskLevel === 'MEDIUM' ? '中风险' : '低风险'}
                    </Badge>{' '}
                    <b>{a.title}</b>
                    <span className="muted">
                      {' '}
                      · {RUN_STATE_LABEL[s.snapshot.runs.find((r) => r.id === a.runId)?.state ?? 'CREATED']} ·{' '}
                      {formatDateTime(a.requestedAtMs)}
                      {a.expiresAtMs ? ` · ${formatDateTime(a.expiresAtMs)} 过期` : ''}
                    </span>
                    {a.state === 'PENDING' && (
                      <span className="inbox-actions">
                        <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
                          <Button variant="primary" onClick={() => void s.call('approval.decide', { id: a.id, decision: 'APPROVE' } as never)}>
                            批准
                          </Button>
                          <Button variant="danger" onClick={() => void s.call('approval.decide', { id: a.id, decision: 'DENY' } as never)}>
                            拒绝
                          </Button>
                        </CapabilityGate>
                      </span>
                    )}
                    {a.state !== 'PENDING' && <Badge tone="neutral">{a.state}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h3>问题</h3>
            {issues.length === 0 ? (
              <p className="muted">问题列表为空。注意：无未解决问题不等于系统健康。</p>
            ) : (
              <ul className="issue-list">
                {issues.map((i) => (
                  <li key={i.id}>
                    <Badge tone={i.state === 'OPEN' ? 'danger' : 'warning'}>
                      {i.state === 'OPEN' ? '待介入' : i.state === 'ACKNOWLEDGED' ? '已知悉' : '已解决'}
                    </Badge>{' '}
                    <b>{i.messageKey}</b>
                    <span className="muted">
                      {' '}
                      · {i.code} · {formatDateTime(i.createdAtMs)}
                      {i.runId ? ` · Run ${i.runId}` : ''}
                    </span>
                    {i.state === 'OPEN' && (
                      <span className="inbox-actions">
                        <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
                          <Button variant="secondary" onClick={() => void s.call('issue.acknowledge', { id: i.id } as never)}>
                            知悉
                          </Button>
                        </CapabilityGate>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'artifacts' && (
        <div className="tab-body" data-tab="artifacts">
          {artifacts.length === 0 ? (
            <EmptyState title="暂无产物" body="角色交付的产物会列出在这里，可校验与下载。" />
          ) : (
            <ArtifactList ids={artifacts.map((a) => a.id)} />
          )}
        </div>
      )}

      {activeTab === 'models' && <ModelsTab />}

      {activeTab === 'settings' && (
        <div className="tab-body" data-tab="settings">
          <Card>
            <h3>项目设置</h3>
            <KeyValue k="项目 ID" v={project.id} />
            <KeyValue k="Core" v={project.hostLabel} />
            <KeyValue k="根路径（来自 Core）" v={project.displayRoot} />
            <KeyValue k="数据修订" v={`r${project.revision}`} />
            <p className="muted">
              项目没有独立的"暂停派发"开关；派发暂停是全局动作（运行时 pauseDispatch），不会在项目页伪装成项目开关。
            </p>
          </Card>
        </div>
      )}

      {dispatchRole && <DispatchDrawer role={dispatchRole} onClose={() => setDispatchRole(null)} />}
    </div>
  );
}

function ArtifactList({ ids }: { ids: string[] }) {
  const s = useStore();
  const [items, setItems] = useState<
    Array<{ id: string; mediaType: string; byteSize: number; displaySource: string; state: string }>
  >([]);
  React.useEffect(() => {
    void Promise.all(ids.map((id) => s.call('artifact.get', { id, scope: {} } as never))).then(
      (rows) => setItems(rows as never),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);
  return (
    <ul className="artifact-list">
      {items.map((a) => (
        <li key={a.id}>
          <b>{a.displaySource}</b>
          <span className="muted">
            {' '}
            · {a.mediaType} · {formatBytes(a.byteSize)} · {a.state}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 模型与账号页签：脱敏、来源/可用性徽标、无 Secret 输入框。 */
export function ModelsTab() {
  const s = useStore();
  const catalog = s.snapshot.modelCatalog ?? [];
  const sourceLabel: Record<string, string> = {
    RUNTIME: '运行时实测',
    VERIFIED_CACHE: '已验证缓存',
    SEED: '种子目录',
  };
  const availTone = (a: string) =>
    a === 'AVAILABLE' ? 'ok' : a === 'REQUIRES_LOGIN' ? 'warning' : a === 'RETIRED' ? 'neutral' : 'danger';
  const availLabel: Record<string, string> = {
    AVAILABLE: '可用',
    REQUIRES_LOGIN: '需登录验证',
    UNVERIFIED: '未验证',
    RETIRED: '已下线',
  };
  return (
    <div className="tab-body" data-tab="models">
      <Card>
        <h3>账号（脱敏）</h3>
        <AccountsBlock />
      </Card>
      <Card>
        <h3>模型目录</h3>
        <p className="muted">
          种子目录与未验证模型不显示为"可运行"；可用性以 Core 报告为准。
        </p>
        {catalog.length === 0 ? (
          <EmptyState title="模型目录不可用" body="当前 Core 未提供模型目录能力。" />
        ) : (
          <table className="model-table">
            <thead>
              <tr>
                <th>模型</th>
                <th>Harness</th>
                <th>来源</th>
                <th>可用性</th>
                <th>推理档位</th>
                <th>工具</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((m) => (
                <tr key={m.id} data-model-id={m.id}>
                  <td>
                    <b>{m.display_name}</b>
                    <div className="muted">{m.model_id}</div>
                  </td>
                  <td>{m.harness}</td>
                  <td>
                    <Badge tone={m.source === 'RUNTIME' ? 'ok' : m.source === 'VERIFIED_CACHE' ? 'queue' : 'warning'}>
                      {sourceLabel[m.source] ?? m.source}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={availTone(m.availability)}>{availLabel[m.availability] ?? m.availability}</Badge>
                  </td>
                  <td>
                    {m.reasoning.levels.length > 0
                      ? `${m.reasoning.levels.join('/')}（默认 ${m.reasoning.default ?? '—'}）`
                      : '不可调'}
                  </td>
                  <td>{m.tool_support === 'SUPPORTED' ? '支持' : m.tool_support === 'UNSUPPORTED' ? '不支持' : '运行时确认'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function AccountsBlock() {
  const s = useStore();
  const accounts = s.accounts;
  const quotas = s.quotas;
  if (accounts.length === 0) return <p className="muted">没有已登记的账号 Profile。</p>;
  return (
    <ul className="account-list">
      {accounts.map((a) => {
        const q = quotas.find((x) => x.profileId === a.id);
        return (
          <li key={a.id} data-account-id={a.id}>
            <b>{a.label}</b>
            <span className="muted"> {a.maskedIdentity ?? '身份未验证'}</span>
            <Badge
              tone={a.status === 'READY' ? 'ok' : a.status === 'UNKNOWN' ? 'warning' : 'danger'}
            >
              {a.status === 'READY'
                ? '就绪'
                : a.status === 'UNKNOWN'
                  ? '状态未知'
                  : a.status === 'EXPIRED'
                    ? '已过期'
                    : a.status}
            </Badge>
            <Badge tone={q?.status === 'OK' ? 'ok' : 'warning'} title="额度以 Core 观测为准">
              额度：
              {q?.remainingPercent != null ? `剩余 ${q.remainingPercent}%` : q?.status === 'STALE' ? '数据过期' : '未知'}
            </Badge>
            <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
              <Button
                variant="secondary"
                title="切换账号期间新派发会被阻断；凭据由 Core 管理，界面不提供输入框"
                onClick={() => void s.call('account.switch', { auth_unit_id: a.label, profile_id: a.id } as never).catch(() => {})}
              >
                切换到此账号
              </Button>
            </CapabilityGate>
          </li>
        );
      })}
      <li className="muted">凭据由 Core 与系统管理；本界面不提供 Secret 输入。</li>
    </ul>
  );
}

export function projectSummaryToneWrap(projectId: string) {
  return summaryTone({});
}

export { ToneBadge };
