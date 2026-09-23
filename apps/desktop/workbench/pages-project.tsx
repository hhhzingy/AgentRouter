import {CommandButton} from './command-button.tsx';
import {LocalDataPanel} from './pending-panel.tsx';
import {errorMessage} from './action-state.ts';
import {HistoryPanel} from './history.tsx';
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
import {WaitingInputSheet} from './task-editor.tsx';
import { useStore } from './store.tsx';

const TABS = [{key:'overview',label:'工作台'},{key:'timeline',label:'动态'},{key:'inbox',label:'成果'},{key:'settings',label:'设置'}];

export function ProjectPage({ projectId, tab }: { projectId: string; tab?: string }) {
  const s = useStore();
  const project = s.snapshot.projects.find((p) => p.id === projectId);
  const activeTab = tab ?? 'overview';
  const primaryTab=({spaces:'overview',artifacts:'inbox',models:'settings',issues:'overview'} as Record<string,string>)[activeTab]??activeTab;
  const [historyGroup,setHistoryGroup]=useState(''),[historyRole,setHistoryRole]=useState('');
  const setActiveTab = (next:string) => {location.hash = `#/project/${projectId}/${next}`;};
  const [dispatchRole, setDispatchRole] = useState<RoleVM | null>(null);
  const [waitingTaskId,setWaitingTaskId]=useState<string|null>(null);
  const [selectedResultId,setSelectedResultId]=useState<string|null>(null);
  if (!project) return <EmptyState title="项目不存在" body="可能已归档或连接的是另一个 Core。" />;

  const spaces = s.snapshot.spaces.filter(
    (sp) => sp.projectId === projectId && sp.status !== 'ARCHIVED',
  );
  const roles = s.snapshot.roles.filter((r) => spaces.some((sp) => sp.id === r.spaceId));
  const roleIds = roles.map((r) => r.id);
  const tasks = s.snapshot.tasks.filter((t) => spaces.some((sp) => sp.id === t.spaceId));
  const runs = s.snapshot.runs.filter((r) => roleIds.includes(r.roleId));
  const issues = s.snapshot.issues.filter((i) => i.projectId === projectId);
  const approvals = s.snapshot.approvals.filter((a) => runs.some((r) => r.id === a.runId));
  const results = s.snapshot.results.filter((r) => tasks.some((t) => t.id === r.taskId));
  const artifacts = results
    .flatMap((r) => r.artifactIds)
    .map((id) => ({ id }))
    .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
  const ssh = project.hostLabel.startsWith('SSH');
  const waitingTask=tasks.find(t=>t.id===waitingTaskId);
  const waitingRole=waitingTask?s.snapshot.roles.find(r=>r.id===waitingTask.assigneeRoleId):undefined;
  const attentionTasks=tasks.filter(t=>t.state==='WAITING_INPUT'||t.state==='NEEDS_ATTENTION'||Boolean(t.blockedReason));
  const unknownRuns=runs.filter(r=>r.state==='UNKNOWN'||r.reconciliationRequired);
  const pendingResults=results.filter(r=>r.acceptance==='PENDING'||r.delivery==='UNKNOWN'||r.delivery==='UNDELIVERABLE');
  const attentionCount=attentionTasks.length+unknownRuns.length+approvals.filter(a=>a.state==='PENDING').length+issues.filter(i=>i.state!=='RESOLVED').length+pendingResults.length;

  const tabBadges: Record<string, number | undefined> = {
    inbox: results.filter((r) => r.acceptance === 'PENDING').length,
    issues:
      issues.filter((i) => i.state !== 'RESOLVED').length +
      approvals.filter((a) => a.state === 'PENDING').length,
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
              添加角色
            </Button>
          </CapabilityGate>
          <button className="btn" onClick={()=>setActiveTab('issues')}>待处理（{tabBadges.issues??0}）</button>
        </div>
      </header>
      <Tabs
        tabs={TABS.map((t) => ({ ...t, badge: tabBadges[t.key] }))}
        active={primaryTab}
        onChange={setActiveTab}
      />

      {primaryTab==='inbox'&&<nav aria-label="成果分类"><button className="btn" aria-pressed={activeTab==='inbox'} onClick={()=>setActiveTab('inbox')}>交付给我</button><button className="btn" aria-pressed={activeTab==='artifacts'} onClick={()=>setActiveTab('artifacts')}>文件与报告</button></nav>}
      {primaryTab==='settings'&&<nav aria-label="设置分类"><button className="btn" onClick={()=>setActiveTab('settings')}>项目设置</button><button className="btn" onClick={()=>setActiveTab('models')}>运行环境</button></nav>}
      {activeTab === 'overview' && (
        <div className="tab-body" data-tab="overview">
          <section className="workbench-section needs-attention-section" aria-labelledby="needs-attention-title">
            <div className="section-heading"><div><span className="eyebrow">ACTION CENTER</span><h2 id="needs-attention-title">需要关注</h2></div><Badge tone={attentionCount?'warning':'neutral'}>{attentionCount} 项</Badge></div>
            {attentionCount===0?<p className="attention-empty">当前没有需要你介入的事项。空闲不代表工作已经完成。</p>:<div className="attention-list" data-testid="needs-attention">
              {attentionTasks.map(t=>{const role=roles.find(r=>r.id===t.assigneeRoleId);return <article className="attention-item" key={'task-'+t.id}>
                <div><Badge tone={t.state==='WAITING_INPUT'?'warning':'danger'}>{t.state==='WAITING_INPUT'?'等待你的输入':'任务受阻'}</Badge><h3>{t.summary}</h3><p>{role?.name??t.assigneeRoleId} · {t.blockedReason||'需要检查任务详情'}</p></div>
                <div className="attention-actions">{t.state==='WAITING_INPUT'&&role&&<CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}><Button variant="primary" onClick={()=>setWaitingTaskId(t.id)}>回复</Button></CapabilityGate>}<a className="btn btn-secondary" href={`#/role/${t.assigneeRoleId}`}>查看角色</a></div>
              </article>})}
              {unknownRuns.map(r=><article className="attention-item" key={'run-'+r.id}><div><Badge tone="danger">状态未知</Badge><h3>Run 状态未知，需要对账</h3><p>{r.exitReason||'作用是否已经发生仍未确认；请勿盲目重试。'}</p></div><a className="btn btn-secondary" href={`#/role/${r.roleId}`}>检查并对账</a></article>)}
              {approvals.filter(a=>a.state==='PENDING').map(a=><article className="attention-item" key={'approval-'+a.id}><div><Badge tone="warning">等待审批 · {a.riskLevel}</Badge><h3>{a.title}</h3><p>关联 Run {a.runId}</p></div><Button onClick={()=>setActiveTab('issues')}>查看审批</Button></article>)}
              {pendingResults.map(r=><article className="attention-item" key={'result-'+r.id}><div><Badge tone={r.delivery==='UNDELIVERABLE'?'danger':'warning'}>{r.acceptance==='PENDING'?'结果等待复核':'结果交付异常'}</Badge><h3>{r.summary}</h3><p>Delivery {r.delivery} · Acceptance {r.acceptance}</p></div><Button onClick={()=>{setSelectedResultId(r.id);setActiveTab('inbox');}}>查看结果</Button></article>)}
              {issues.filter(i=>i.state!=='RESOLVED').map(i=><article className="attention-item" key={'issue-'+i.id}><div><Badge tone="danger">{i.state==='OPEN'?'问题待介入':'问题已知悉'}</Badge><h3>{i.messageKey}</h3><p>{i.code}</p></div><Button onClick={()=>setActiveTab('issues')}>查看问题</Button></article>)}
            </div>}
          </section>
          <div className="overview-strip">
            <KeyValue k="协作组" v={spaces.length} />
            <KeyValue k="角色" v={roles.length} />
            <KeyValue
              k="活跃 Run"
              v={
                runs.filter((r) =>
                  ['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'].includes(
                    r.state,
                  ),
                ).length
              }
            />
            <KeyValue k="排队任务" v={tasks.filter((t) => t.state === 'QUEUED').length} />
            <KeyValue k="未解决问题" v={issues.filter((i) => i.state !== 'RESOLVED').length} />
          </div>
          <section className="workbench-section"><div className="section-heading"><div><span className="eyebrow">TEAM</span><h2>角色</h2></div><Button variant="secondary" onClick={() => (location.hash = `#/roleplan/${projectId}`)}>编排角色</Button></div>
          {spaces.map((sp) => (
            <SpaceCard key={sp.id} space={sp} onDispatch={setDispatchRole} />
          ))}
          {spaces.length === 0 && (
            <EmptyState
              title="还没有协作组"
              body="协作组是通信与规则边界。通过「编排角色」生成或导入 Role Plan 来创建第一个组。"
            />
          )}
          </section>
          <Card className="workbench-section">
            <div className="section-heading"><div><span className="eyebrow">WORK</span><h2>进行中与队列</h2></div></div>
            {tasks.filter((t) =>
              ['ACTIVE', 'QUEUED', 'WAITING_INPUT', 'NEEDS_ATTENTION'].includes(t.state),
            ).length === 0 ? (
              <p className="muted">当前没有进行中的任务。</p>
            ) : (
              <ul className="task-rows">
                {tasks
                  .filter((t) =>
                    ['ACTIVE', 'QUEUED', 'WAITING_INPUT', 'NEEDS_ATTENTION'].includes(t.state),
                  )
                  .map((t) => (
                    <TaskRow key={t.id} task={t} />
                  ))}
              </ul>
            )}
          </Card>
          <Card className="workbench-section">
            <div className="section-heading"><div><span className="eyebrow">DELIVERIES</span><h2>最近结果</h2></div><Button variant="ghost" onClick={()=>setActiveTab('inbox')}>查看全部</Button></div>
            {results.length===0?<p className="muted">尚无结果。Run 成功也不会自动生成或接受 Result。</p>:<ul className="recent-results">{results.slice(0,4).map(r=><li key={r.id}><div><b>{r.summary}</b><small>Task {r.taskId} · {r.artifactIds.length} 个产物</small></div><div><Badge tone={r.delivery==='DELIVERED'?'ok':r.delivery==='UNKNOWN'||r.delivery==='UNDELIVERABLE'?'danger':'neutral'}>交付 {r.delivery}</Badge> <Badge tone={r.acceptance==='ACCEPTED'?'ok':r.acceptance==='PENDING'?'warning':'neutral'}>验收 {r.acceptance}</Badge></div></li>)}</ul>}
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
          <label className="field">筛选小组<select aria-label="动态小组" value={historyGroup} onChange={e=>{setHistoryGroup(e.target.value);setHistoryRole('');}}><option value="">整个项目</option>{spaces.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label className="field">筛选角色<select aria-label="动态角色" value={historyRole} onChange={e=>setHistoryRole(e.target.value)}><option value="">范围内全部角色</option>{roles.filter(r=>!historyGroup||r.spaceId===historyGroup).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><HistoryPanel scope={{project_id:projectId,...(historyGroup?{space_id:historyGroup}:{})}} roleId={historyRole||undefined}/>
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
            <div className="results-layout"><ul className="inbox-list result-list">
              {results.map((r) => (
                <li key={r.id} className={`inbox-item ${selectedResultId===r.id?'selected':''}`}>
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
                    <div className="muted">Task {r.taskId} · Delivery {r.delivery} · 产物 {r.artifactIds.length} 个</div>
                  </div>
                  <Button variant="ghost" onClick={()=>setSelectedResultId(r.id)}>详情</Button>
                  {r.acceptance === 'PENDING' && (
                    <div className="inbox-actions">
                      <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
                        <CommandButton method="result.accept" params={{id:r.id}}>接受</CommandButton>
                        <CommandButton method="result.reject" params={{id:r.id}}>拒绝</CommandButton>
                      </CapabilityGate>
                    </div>
                  )}
                </li>
              ))}
            </ul><ResultDetail result={results.find(r=>r.id===(selectedResultId??results[0]?.id))} /></div>
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
                    <Badge
                      tone={
                        a.riskLevel === 'HIGH'
                          ? 'danger'
                          : a.riskLevel === 'MEDIUM'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {a.riskLevel === 'HIGH'
                        ? '高风险'
                        : a.riskLevel === 'MEDIUM'
                          ? '中风险'
                          : '低风险'}
                    </Badge>{' '}
                    <b>{a.title}</b>
                    <span className="muted">
                      {' '}
                      ·{' '}
                      {
                        RUN_STATE_LABEL[
                          s.snapshot.runs.find((r) => r.id === a.runId)?.state ?? 'CREATED'
                        ]
                      }{' '}
                      · {formatDateTime(a.requestedAtMs)}
                      {a.expiresAtMs ? ` · ${formatDateTime(a.expiresAtMs)} 过期` : ''}
                    </span>
                    {a.state === 'PENDING' && (
                      <span className="inbox-actions">
                        <CapabilityGate
                          available={
                            !s.readOnly && s.capabilities.methods.includes('approval.decide')
                          }
                          unavailableReason={
                            s.readOnly ? s.readOnlyReason : '当前 Core 未开放此操作'
                          }
                        >
                          <CommandButton method="approval.decide" params={{id:a.id,decision:"APPROVE"}}>批准</CommandButton>
                          <CommandButton method="approval.decide" params={{id:a.id,decision:"DENY"}}>拒绝</CommandButton>
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
                      {i.state === 'OPEN'
                        ? '待介入'
                        : i.state === 'ACKNOWLEDGED'
                          ? '已知悉'
                          : '已解决'}
                    </Badge>{' '}
                    <b>{i.messageKey}</b>
                    <span className="muted">
                      {' '}
                      · {i.code} · {formatDateTime(i.createdAtMs)}
                      {i.runId ? ` · Run ${i.runId}` : ''}
                    </span>
                    {i.state === 'OPEN' && (
                      <span className="inbox-actions">
                        <CapabilityGate
                          available={
                            !s.readOnly && s.capabilities.methods.includes('issue.acknowledge')
                          }
                          unavailableReason={
                            s.readOnly ? s.readOnlyReason : '当前 Core 未开放此操作'
                          }
                        >
                          <CommandButton method="issue.acknowledge" params={{id:i.id}}>知悉</CommandButton>
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
          <div className="settings-grid"><Card>
            <span className="eyebrow">PROJECT</span><h3>项目</h3><LocalDataPanel/>
            <KeyValue k="项目 ID" v={project.id} />
            <KeyValue k="Core" v={project.hostLabel} />
            <KeyValue k="根路径（来自 Core）" v={project.displayRoot} />
            <KeyValue k="数据修订" v={`r${project.revision}`} />
            <p className="muted">
              项目没有独立的"暂停派发"开关；派发暂停是全局动作（运行时
              pauseDispatch），不会在项目页伪装成项目开关。
            </p>
          </Card><Card><span className="eyebrow">ROLES & PERMISSIONS</span><h3>角色与权限</h3><p>{roles.length} 个 Role；有效权限来自 Core 的 Role Charter。</p><Button onClick={()=>location.hash=`#/roleplan/${projectId}`}>管理角色方案</Button></Card><Card><span className="eyebrow">HARNESSES & MODELS</span><h3>Harness 与模型</h3><p>可用性、账号与 capability 均按 Core 原值展示。</p><Button onClick={()=>setActiveTab('models')}>查看 Harness 与模型</Button></Card><Card><span className="eyebrow">WORKSPACES</span><h3>工作区</h3><p>{(s.snapshot.workspaces??[]).filter(w=>w.projectId===projectId).length} 个已登记 workspace。</p><details><summary>查看路径</summary>{(s.snapshot.workspaces??[]).filter(w=>w.projectId===projectId).map(w=><KeyValue key={w.id} k={w.label} v={w.displayPath}/>)}</details></Card><Card><span className="eyebrow">CONNECTIONS</span><h3>连接与设备</h3><p>Management MCP 客户端属于连接，不属于 Role。</p><a className="btn btn-secondary" href="#/remote">远程设备与 Controller</a></Card><Card><span className="eyebrow">ADVANCED</span><h3>诊断</h3><details><summary>技术字段</summary><KeyValue k="Core instance" v={s.hello.serverInstanceId}/><KeyValue k="Contract" v={s.hello.contractRevision??s.hello.protocol}/><KeyValue k="Snapshot revision" v={s.snapshot.revision}/></details></Card></div>
        </div>
      )}

      {dispatchRole && <DispatchDrawer role={dispatchRole} onClose={() => setDispatchRole(null)} />}
      {waitingTask&&waitingRole&&<WaitingInputSheet role={waitingRole} task={waitingTask} onClose={()=>setWaitingTaskId(null)}/>}
    </div>
  );
}

function ResultDetail({result}:{result:ReturnType<typeof useStore>['snapshot']['results'][number]|undefined}){
 const s=useStore();
 if(!result)return null;
 const task=s.snapshot.tasks.find(t=>t.id===result.taskId);
 const role=task?s.snapshot.roles.find(r=>r.id===task.assigneeRoleId):undefined;
 const run=task?s.snapshot.runs.filter(r=>r.taskId===task.id).at(-1):undefined;
 return <Card className="result-detail"><span className="eyebrow">RESULT DETAIL</span><h2>{result.summary}</h2>
  <div className="result-state-grid"><KeyValue k="Task" v={task?.summary??result.taskId}/><KeyValue k="Role" v={role?.name??'Core 未提供'}/><KeyValue k="Run" v={run?`${run.id} · ${RUN_STATE_LABEL[run.state]}`:'未关联'}/><KeyValue k="Delivery" v={<Badge tone={result.delivery==='DELIVERED'?'ok':result.delivery==='UNKNOWN'||result.delivery==='UNDELIVERABLE'?'danger':'neutral'}>{result.delivery}</Badge>}/><KeyValue k="Acceptance" v={<Badge tone={result.acceptance==='ACCEPTED'?'ok':result.acceptance==='PENDING'?'warning':'neutral'}>{result.acceptance}</Badge>}/></div>
  <h3>Artifacts / Evidence</h3><p className="muted">Artifact 可读、测试通过与用户接受是不同事实。以下只显示 Core 可验证的产物元数据。</p>
  {result.artifactIds.length?<ArtifactList ids={result.artifactIds}/>:<p className="muted">该 Result 没有声明 Artifact。</p>}
 </Card>;
}

function ArtifactList({ ids }: { ids: string[] }) {
  const s = useStore();
  const [artifactMessage, setArtifactMessage] = useState<string | null>(null);
  const [items, setItems] = useState<
    Array<{ id: string; mediaType: string; byteSize: number; displaySource: string; state: string }>
  >([]);
  React.useEffect(() => {
    let active=true;setItems([]);setArtifactMessage(null);
    void Promise.all(ids.map((id) => s.call('artifact.get', { id, scope: {} }))).then(
      (rows) => {if(active)setItems(rows);},
      (e) => {if(active)setArtifactMessage(errorMessage(e));},
    );
    return ()=>{active=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);
  return (
    <div>
      {artifactMessage && <p role="status">{artifactMessage}</p>}
      <ul className="artifact-list">
        {items.map((a) => (
          <li key={a.id}>
            <b>{a.displaySource}</b>
            <span className="muted">
              {' '}
              · {a.mediaType} · {formatBytes(a.byteSize)} · {a.state}
            </span>
            <Button
              disabled={s.readOnly || !s.capabilities.methods.includes('artifact.verify')}
              onClick={() =>
                void s
                  .call('artifact.verify', { id: a.id })
                  .then((v) => {
                    setItems((rows) => rows.map((x) => (x.id === v.id ? v : x)));
                    setArtifactMessage('校验状态：' + v.state);
                  })
                  .catch((e) => setArtifactMessage(e.message))
              }
            >
              校验
            </Button>
            <Button
              disabled={
                s.readOnly ||
                a.state !== 'AVAILABLE' ||
                !s.capabilities.methods.includes('artifact.download') ||
                typeof window === 'undefined' ||
                !window.agentrouterDesktop
              }
              onClick={() =>
                void window.agentrouterDesktop
                  ?.saveArtifact(a.id)
                  .then((v) => setArtifactMessage(v.saved ? '已保存并校验' : '已取消保存'))
                  .catch((e) => setArtifactMessage(e.message))
              }
            >
              保存产物…
            </Button>
          </li>
        ))}
      </ul>
    </div>
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
    a === 'AVAILABLE'
      ? 'ok'
      : a === 'REQUIRES_LOGIN'
        ? 'warning'
        : a === 'RETIRED'
          ? 'neutral'
          : 'danger';
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
        <p className="muted">种子目录与未验证模型不显示为"可运行"；可用性以 Core 报告为准。</p>
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
                    <Badge
                      tone={
                        m.source === 'RUNTIME'
                          ? 'ok'
                          : m.source === 'VERIFIED_CACHE'
                            ? 'queue'
                            : 'warning'
                      }
                    >
                      {sourceLabel[m.source] ?? m.source}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={availTone(m.availability)}>
                      {availLabel[m.availability] ?? m.availability}
                    </Badge>
                  </td>
                  <td>
                    {m.reasoning.levels.length > 0
                      ? `${m.reasoning.levels.join('/')}（默认 ${m.reasoning.default ?? '—'}）`
                      : '不可调'}
                  </td>
                  <td>
                    {m.tool_support === 'SUPPORTED'
                      ? '支持'
                      : m.tool_support === 'UNSUPPORTED'
                        ? '不支持'
                        : '运行时确认'}
                  </td>
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
              {q?.remainingPercent != null
                ? `剩余 ${q.remainingPercent}%`
                : q?.status === 'STALE'
                  ? '数据过期'
                  : '未知'}
            </Badge>
            <button className="btn" disabled title="本轮不开放真实账号操作；缺少经确认的认证单元身份">切换到此账号</button><small>账号切换未开放，凭据由 Core 管理。</small>
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
