import {errorMessage} from './action-state.ts';
import {HistoryPanel} from './history.tsx';
import {exactWorkspace} from './identity.ts';
/** 角色详情：Charter / 当前任务与 Run / 完整对话 / 权限与工作区 / UNKNOWN 对账。 */
import React, { useEffect, useState, useRef } from 'react';
import {
  Avatar,
  Drawer,
  Dialog,
  Badge,
  Button,
  CapabilityGate,
  Card,
  EmptyState,
  KeyValue,
  formatDateTime,
  RUN_STATE_LABEL,
} from '../../../packages/ui/index.ts';
import type {
  ConversationItemVM,
  RoleCharterVM,
  RoleVM,
} from '../../../packages/client-contract/c1r1p1/generated.ts';
import {
  Composer,
  ConversationView,
  ReconcilePanel,
  RoleStateBadges,
  TaskRow,
} from './composites.tsx';
import { useStore } from './store.tsx';

export function RolePage({ roleId }: { roleId: string }) {
  const s = useStore();
  const [settingsOpen,setSettingsOpen]=useState(false);
  const role = s.snapshot.roles.find((r) => r.id === roleId);
  const [charter, setCharter] = useState<RoleCharterVM | null>(null);
  const [charterUnavailable, setCharterUnavailable] = useState(false);

  useEffect(() => {
    setCharter(null);
    setCharterUnavailable(false);
    if (!role) return;
    if (s.capabilities.role_charters === false) {
      setCharterUnavailable(true);
      return;
    }
    const space = s.snapshot.spaces.find((sp) => sp.id === role.spaceId);
    let active = true;
    s.call('roleCharter.get', { role_id: role.id, project_id: space?.projectId ?? '' })
      .then((c) => {if(active)setCharter(c);})
      .catch(() => {if(active)setCharterUnavailable(true);});
    return () => {active=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId, s.capabilities.role_charters, role?.charterRevision, role?.bootstrapState]);

  if (!role) return <EmptyState title="角色不存在" body="可能已归档，或当前 Core 上没有该角色。" />;

  const space = s.snapshot.spaces.find((sp) => sp.id === role.spaceId);
  const project = s.snapshot.projects.find((p) => p.id === space?.projectId);
  const tasks = s.snapshot.tasks.filter((t) => t.assigneeRoleId === role.id);
  const runs = s.snapshot.runs.filter((r) => r.roleId === role.id);
  const unknownRun = runs.find((r) => r.state === 'UNKNOWN' || r.reconciliationRequired);
  const activeRun = runs.find((r) =>
    ['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'].includes(r.state),
  );
  const workspace = exactWorkspace(s.snapshot.workspaces ?? [], charter, project?.id);

  return (
    <div className="page page-role" data-page="role">
      <header className="page-head role-head">
        <Avatar name={role.name} tone="neutral" />
        <div>
          <div className="eyebrow">
            <a href="#/">项目</a> / <a href={`#/project/${project?.id}`}>{project?.name}</a> /{' '}
            {space?.name}
          </div>
          <h1>{role.name}</h1>
          <p className="role-mission">{role.description}</p>
        </div>
        <RoleStateBadges role={role} /><button className="btn" onClick={()=>setSettingsOpen(true)}>角色设置</button>
      </header>

      {unknownRun && <ReconcilePanel run={unknownRun} />}

      <div className="role-grid">
        <div className="role-col-main">
          <Card className="role-identity-card">
            <div className="section-heading"><div><span className="eyebrow">ROLE IDENTITY</span><strong className="identity-name">{charter?.displayName??role.name}</strong></div><Badge tone="neutral">Charter r{charter?.revision??role.charterRevision??'—'}</Badge></div>
            <p className="role-mission">{charter?.spec.mission||role.description}</p>
            {charterUnavailable?<p className="hint tone-warning">当前 Core 未提供 Role Charter；以下只展示 Role 主投影。</p>:!charter?<p className="muted">正在读取职责与有效权限…</p>:<div className="charter-summary"><div><h4>负责</h4><ul className="spec-list">{charter.spec.responsibilities.map((x,i)=><li key={i}>{x}</li>)}</ul></div><div><h4>不负责</h4><ul className="spec-list">{charter.spec.out_of_scope.map((x,i)=><li key={i}>{x}</li>)}</ul></div><div><h4>默认结果交给</h4><p>{charter.spec.default_completion_target.type==='user'?'用户':charter.spec.default_completion_target.role_key}</p></div></div>}
          </Card>

          <SessionWorkflow role={role} />

          <Card className="current-work">
            <div className="section-heading"><div><span className="eyebrow">CURRENT WORK</span><h2>当前工作</h2></div><Badge tone={activeRun?'active':'neutral'}>{activeRun?RUN_STATE_LABEL[activeRun.state]:'暂无运行'}</Badge></div>
            {activeRun ? (
              <div className="run-panel" data-run-id={activeRun.id}>
                <KeyValue
                  k="Run 状态"
                  v={
                    <Badge
                      tone={activeRun.state === 'SETTLING' ? 'warning' : 'active'}
                      title={activeRun.state === 'SETTLING' ? '收尾中 ≠ 完成' : undefined}
                    >
                      {RUN_STATE_LABEL[activeRun.state]}
                    </Badge>
                  }
                />
                <KeyValue k="Harness" v={activeRun.harness} />
                <KeyValue
                  k="开始于"
                  v={activeRun.startedAtMs ? formatDateTime(activeRun.startedAtMs) : '—'}
                />
                <KeyValue k="原生会话" v={activeRun.nativeSessionDisplay ?? '未上报'} />
                {activeRun.state === 'SETTLING' && (
                  <p className="hint tone-warning">
                    Run
                    正在收尾：等待原生结束与资源停止确认。结果暂存不代表已交付，此时不能视为"完成"。
                  </p>
                )}
              </div>
            ) : (
              <p className="muted">当前没有活跃 Run。角色空闲 ≠ 已完成某事。</p>
            )}
            {tasks.length > 0 && (
              <ul className="task-rows">
                {tasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="section-heading"><div><span className="eyebrow">TASK COMPOSER</span><h2>派发任务或补充输入</h2></div></div>
            <Composer role={role} spaceId={role.spaceId} />
          </Card>

          <details className="conversation-secondary" open><summary>Conversation · 业务记录与技术事件</summary><Card>
            <p className="muted">Conversation 是辅助时间线。Task、Run、Result 与 Artifact 仍以各自状态为准。</p>
            <HistoryPanel scope={{project_id:project?.id,space_id:role.spaceId}} roleId={role.id}/>
          </Card></details>

          <SlotBindingPanel roleId={role.id} />
        </div>

        {settingsOpen&&<Drawer title="角色设置" onClose={()=>setSettingsOpen(false)}><div className="role-col-side">
          <Card>
            <h3>角色说明（Role Charter）</h3><CharterHistory roleId={role.id} projectId={project?.id??''}/>
            {charterUnavailable ? (
              <p className="muted">当前 Core 不支持 Charter 查询（能力缺失，降级显示）。</p>
            ) : !charter ? (
              <p className="muted">加载中…</p>
            ) : (
              <div data-testid="charter-card" data-role-id={charter.roleId}>
                <KeyValue k="修订" v={`r${charter.revision}`} />
                <KeyValue
                  k="Bootstrap"
                  v={
                    <Badge
                      tone={
                        charter.bootstrapState === 'DELIVERED'
                          ? 'ok'
                          : charter.bootstrapState === 'FAILED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {charter.bootstrapState === 'DELIVERED'
                        ? '已完成'
                        : charter.bootstrapState === 'FAILED'
                          ? '失败'
                          : charter.bootstrapState === 'DELIVERING'
                            ? '交付中'
                            : '待初始化'}
                    </Badge>
                  }
                />
                {charter.bootstrapState !== 'DELIVERED' && (
                  <p className="hint tone-warning">初始化未完成前不会执行首个任务；已保存的任务继续等待。</p>
                )}
                <KeyValue k="生效于" v={formatDateTime(charter.effectiveAtMs)} />
                <h4>职责</h4>
                <ul className="spec-list">
                  {charter.spec.responsibilities.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <h4>非职责</h4>
                <ul className="spec-list">
                  {charter.spec.out_of_scope.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <h4>同组联系人</h4>
                {charter.directory.length === 0 ? (
                  <p className="muted">组内无其他角色。</p>
                ) : (
                  <ul className="spec-list">
                    {charter.directory.map((d) => (
                      <li key={d.roleId}>
                        <a href={`#/role/${d.roleId}`}>{d.displayName}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h3>运行配置</h3>
            <KeyValue k="Harness" v={role.harness} />
            <KeyValue
              k="支持度"
              v={
                <Badge tone={role.harnessSupport === 'UNAVAILABLE' ? 'danger' : 'warning'}>
                  {role.harnessSupport === 'CERTIFIED'
                    ? '已认证'
                    : role.harnessSupport === 'LIVE_TESTED'
                      ? '已实测'
                      : role.harnessSupport === 'PROBED'
                        ? '已探测'
                        : '不可用'}
                </Badge>
              }
            />
            <KeyValue k="模型" v={role.modelLabel ?? role.modelSelection?.model_id ?? '未选择'} />
            {workspace && (
              <>
                <h4>工作区（文件边界）</h4>
                <KeyValue k="标识" v={`⧉ ${workspace.label}`} />
                <KeyValue k="路径" v={workspace.displayPath} />
                <KeyValue
                  k="访问"
                  v={workspace.access === 'SERIAL_WRITE' ? '读写（串行）' : '只读'}
                />
                {workspace.branchLabel && <KeyValue k="分支" v={workspace.branchLabel} />}
              </>
            )}
          </Card>

          <Card>
            <h3>有效权限</h3>
            <p className="muted">仅展示 Core 实际授予的权限，与 AI 请求的权限分开。</p>
            {charter ? (
              <div data-testid="effective-permissions">
                <KeyValue
                  k="工作区"
                  v={
                    charter.effectivePermissions.workspace_access === 'read_write' ? '读写' : '只读'
                  }
                />
                <KeyValue
                  k="工具"
                  v={charter.effectivePermissions.tool_profiles.join('、') || '无'}
                />
                <KeyValue k="网络" v={charter.effectivePermissions.network_profile} />
              </div>
            ) : (
              <p className="muted">Charter 可用后展示。</p>
            )}
          </Card>
        </div></Drawer>}
      </div>
    </div>
  );
}

type RoleSessionRow = {
  id: string;
  name: string;
  seq: number;
  state: string;
  harness?: string;
  driver_id?: string;
  native_continuity?: string;
  migration_fidelity?: string;
  hasNativeSession?: boolean;
  created_at_ms?: number;
  activated_at_ms?: number;
};

type RoleSessionPreflight = {
  target_harness?: string;
  recommended_action?: 'CONTINUE_EXISTING' | 'CREATE_NEW_INHERIT';
  resume_candidate?: { id: string; name?: string; seq?: number } | null;
  new_session_available?: boolean;
  migration_fidelity?: string;
  reason_code?: string;
};

function migrationFidelityLabel(value?: string) {
  return (
    {
      EXACT: '完整',
      COMPRESSED: '已压缩',
      PARTIAL: '部分',
      UNKNOWN: '待评估',
      BLOCKED: '已阻止',
    }[value ?? 'UNKNOWN'] ?? '待评估'
  );
}

function recommendationLabel(value?: string) {
  return value === 'CONTINUE_EXISTING' ? '继续已有' : '新建并继承上下文';
}

function preflightReasonLabel(value?: string) {
  return (
    {
      NATIVE_SESSION_RESUMABLE: '已有原生会话可继续。',
      NO_WORK_SESSION_FOR_HARNESS: '目标 Harness 暂无可继续的工作会话。',
      NATIVE_SESSION_NOT_AVAILABLE: '目标工作会话没有可恢复的原生会话。',
      WORKSPACE_AFFINITY_MISMATCH: '工作区不兼容，建议新建工作会话。',
      TARGET_HARNESS_REQUIRES_BINDING: '目标 Harness 与当前角色绑定不一致，请先更新运行配置。',
      ROLE_SESSION_NOT_FOUND: '指定工作会话不存在。',
    }[value ?? ''] ?? 'Core 尚未给出可继续的原生会话。'
  );
}

function migrationNeedsAttention(value?: string) {
  return value === 'BLOCKED' || value === 'PARTIAL' || value === 'UNKNOWN';
}

/** 工作会话连续性：每个 WorkSession 固定绑定 Harness/Driver 与 Native Session。 */
function SessionWorkflow({ role }: { role:RoleVM }) {
  const s = useStore();
  const roleId=role.id;
  const [data, setData] = useState<{ sessions: RoleSessionRow[]; active_session_id: string } | null>(null);
  const [preflight, setPreflight] = useState<RoleSessionPreflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [wizardOpen,setWizardOpen]=useState(false);
  const [error, setError] = useState('');
  const [preflightError, setPreflightError] = useState('');
  const load = React.useCallback(async () => {
    try {
      const v = (await s.callExtension('roleSession.list', { role_id: roleId })) as {
        sessions: RoleSessionRow[];
        active_session_id: string;
      };
      setData(v);
      setError('');
      try {
        const p = (await s.callExtension('roleSession.preflight', { role_id: roleId })) as RoleSessionPreflight;
        setPreflight(p);
        setPreflightError('');
      } catch (e) {
        setPreflight(null);
        setPreflightError(errorMessage(e));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [roleId, s]);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (method: string, params: Record<string, unknown>) => {
    setBusy(true);
    try {
      await s.callExtension(method, params);
      await load();
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="session-card">
      <div className="section-heading"><div><span className="eyebrow">WORKSESSION</span><h2>当前 WorkSession（工作会话）</h2></div>{!s.readOnly&&<Button variant="primary" onClick={()=>setWizardOpen(true)}>新建并继承上下文</Button>}</div>
      <p className="muted">
        每个 WorkSession 固定绑定一个 Harness/Driver 与 Native Session。创建新 WorkSession 时可以从当前上下文迁移，迁移保真度由 Core 报告；历史 WorkSession 只读且永久归档。
      </p>
      {preflight && (
        <div className="session-preflight" data-testid="session-preflight" role="status">
          <p>
            目标 Harness：{preflight.target_harness ?? '待评估'}{' · '}
            建议：{recommendationLabel(preflight.recommended_action)}{' · '}
            迁移保真度：{migrationFidelityLabel(preflight.migration_fidelity)}
          </p>
          <p className={migrationNeedsAttention(preflight.migration_fidelity) ? 'hint tone-warning' : 'hint'}>
            {preflightReasonLabel(preflight.reason_code)}
            {preflight.recommended_action === 'CONTINUE_EXISTING' && preflight.resume_candidate?.name
              ? ' 候选：' + preflight.resume_candidate.name + '。'
              : preflight.new_session_available
                ? ' 新建工作会话始终可用。'
                : ''}
          </p>
          {preflight.migration_fidelity === 'BLOCKED' && (
            <p className="hint tone-warning">当前上下文迁移被 Core 安全阻止；不会静默截断上下文。</p>
          )}
        </div>
      )}
      {preflightError && <p className="hint tone-warning">恢复建议暂不可用：{preflightError}</p>}
      {data && (
        <div data-testid="session-list">
          {data.sessions.filter(w=>w.id===data.active_session_id).map(w=><article className="current-session" key={w.id}><div><span className="session-seq">W{w.seq}</span><div><b>{w.name}</b><p>{w.harness??role.harness} · {role.modelLabel??role.modelSelection?.model_id??'模型未上报'}</p></div></div><div className="session-facts"><Badge tone="active">ACTIVE</Badge><span>Native Session: {w.hasNativeSession?'已关联':'未上报'}</span><span>Context fidelity: {migrationFidelityLabel(w.migration_fidelity)}</span>{w.activated_at_ms&&<span>Started {formatDateTime(w.activated_at_ms)}</span>}</div></article>)}
          <div className="session-history"><h3>历史 WorkSession</h3>{data.sessions.filter(w=>w.id!==data.active_session_id).length===0?<p className="muted">没有历史 WorkSession。</p>:<ul>{data.sessions.filter(w=>w.id!==data.active_session_id).map(w=><li key={w.id}><div><b>W{w.seq} · {w.name}</b><span>{w.harness??'Harness 未上报'} · {w.created_at_ms?formatDateTime(w.created_at_ms):'时间未上报'}</span></div><Badge tone="neutral">Historical WorkSession · Read-only</Badge></li>)}</ul>}</div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {wizardOpen&&<CreateWorkSessionWizard role={role} preflight={preflight} busy={busy} onClose={()=>setWizardOpen(false)} onCreate={async params=>{await act('roleSession.create',params);setWizardOpen(false);}}/>}
    </Card>
  );
}

function CreateWorkSessionWizard({role,preflight,busy,onClose,onCreate}:{role:RoleVM;preflight:RoleSessionPreflight|null;busy:boolean;onClose:()=>void;onCreate:(params:Record<string,unknown>)=>Promise<void>}){
 const s=useStore();
 const [step,setStep]=useState(0),[name,setName]=useState(''),[harness,setHarness]=useState(role.harness),[contextMode,setContextMode]=useState<'blank'|'inherit'>('blank'),[error,setError]=useState('');
 const harnesses=Object.entries(s.capabilities.harnesses);
 const blocked=contextMode==='inherit'&&preflight?.migration_fidelity==='BLOCKED';
 const submit=async()=>{setError('');try{await onCreate({role_id:role.id,name:name.trim(),target_harness:harness,context_mode:contextMode});}catch(e){setError(errorMessage(e));}};
 return <Dialog title="新建 WorkSession" onClose={onClose} footer={<><Button onClick={onClose}>取消</Button>{step>0&&<Button onClick={()=>setStep(step-1)}>上一步</Button>}{step<2?<Button variant="primary" disabled={step===0&&!name.trim()||blocked} onClick={()=>setStep(step+1)}>下一步</Button>:<Button variant="primary" disabled={busy||blocked||!name.trim()} onClick={()=>void submit()}>{busy?'正在创建…':'创建 WorkSession'}</Button>}</>}>
  <ol className="wizard-steps" aria-label="创建 WorkSession 步骤"><li className={step===0?'active':''}>1 Who / Where</li><li className={step===1?'active':''}>2 Context</li><li className={step===2?'active':''}>3 Review</li></ol>
  {step===0&&<div className="wizard-panel"><h3>谁来承担这段上下文</h3><KeyValue k="Role" v={role.name}/><label className="field"><span>WorkSession 名称</span><input type="text" maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="例如：实现方向 B"/></label><label className="field"><span>Managed Harness</span><select value={harness} onChange={e=>setHarness(e.target.value as RoleVM['harness'])}>{harnesses.map(([id,cap])=><option key={id} value={id} disabled={!cap.create_session}>{id} · {cap.status}{cap.create_session?'':' · 不支持创建'}</option>)}</select></label><p className="hint">Harness、workspace 与 native session 在 WorkSession 建立后不能静默更换。</p></div>}
  {step===1&&<div className="wizard-panel"><h3>选择 Context 策略</h3><label className={`context-option ${contextMode==='blank'?'selected':''}`}><input type="radio" name="context" checked={contextMode==='blank'} onChange={()=>setContextMode('blank')}/><span><b>Start blank</b><small>创建全新上下文，不复制当前 WorkSession。</small></span></label><label className={`context-option ${contextMode==='inherit'?'selected':''}`}><input type="radio" name="context" checked={contextMode==='inherit'} onChange={()=>setContextMode('inherit')}/><span><b>Transfer from current WorkSession</b><small>Core 决定可迁移内容与保真度；UI 不估算百分比。</small></span></label>{contextMode==='inherit'&&<div className={`hint ${blocked?'tone-warning':''}`}>Capability: {preflight?.migration_fidelity??'UNKNOWN'} · {preflightReasonLabel(preflight?.reason_code)}{blocked&&' 当前迁移被 Core 阻止，请改用 Start blank。'}</div>}</div>}
  {step===2&&<div className="wizard-panel"><h3>确认创建</h3><KeyValue k="Role" v={role.name}/><KeyValue k="Harness" v={harness}/><KeyValue k="Context" v={contextMode==='blank'?'Start blank':'Transfer from current WorkSession'}/><KeyValue k="当前任务影响" v="只有 Core 成功激活后才切换；失败时当前 WorkSession 保持安全。"/><p className="hint tone-warning">旧 WorkSession 在成功切换后进入 Historical · Read-only，不能恢复。</p></div>}
  {error&&<div className="hint tone-danger" role="alert"><b>New WorkSession was not activated.</b><br/>当前 WorkSession 仍保持原状态。{error}<details><summary>技术详情</summary>{error}</details></div>}
 </Dialog>;
}

/** 规划槽位 / 参与者绑定：与执行槽（role_slots.active_run）分离。 */
function SlotBindingPanel({ roleId }: { roleId: string }) {
  const s = useStore();
  const [slots, setSlots] = useState<
    { id: string; name: string; participant_kind: string; state: string; work_session_id: string | null }[] | null
  >(null);
  const [error, setError] = useState('');
  const [creating,setCreating]=useState(false),[name,setName]=useState(''),[kind,setKind]=useState<'CHATGPT_WEB'|'MANAGED_HARNESS'|'PAIR_CODE'>('CHATGPT_WEB'),[instruction,setInstruction]=useState('');
  const load=React.useCallback(() => {
    let active = true;
    s.callExtension('participant.slot.list', { role_id: roleId })
      .then((v) => {
        if (active) setSlots((v as { slots: NonNullable<typeof slots> }).slots);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [roleId, s]);
  useEffect(() => load(), [load]);
  const create=async()=>{try{const result=await s.callExtension('participant.slot.create',{role_id:roleId,name:name.trim()||'Web Participant',participant_kind:kind}) as {slot_id:string;seq:number;claim_code?:string};const text=[`AgentRouter Participant Join`,`role_id: ${roleId}`,`slot_id: ${result.slot_id}`,`participant_kind: ${kind}`,...(result.claim_code?[`claim_code: ${result.claim_code}`]:[])].join('\n');setInstruction(text);setCreating(false);setName('');setError('');load();}catch(e){setError(errorMessage(e));}};
  const copy=async(text:string)=>{try{await navigator.clipboard.writeText(text);}catch{setError('无法访问剪贴板，请手动复制 Join Instruction。');}};
  return (
    <Card className="slot-card">
      <div className="section-heading"><div><span className="eyebrow">SLOTS & BINDINGS</span><h2>WorkSession Slots · 槽位与绑定</h2></div>{!s.readOnly&&<Button onClick={()=>setCreating(true)}>添加 Slot</Button>}</div>
      <p className="muted">
        Slot 是规划/认领位，Binding 把参与者接到一个 ACTIVE WorkSession。历史 WorkSession 只读，不能重新激活。
      </p>
      {error && <p className="hint tone-warning">槽位列表暂不可用：{error}</p>}
      {slots && slots.length === 0 && <p className="muted">当前角色没有槽位。</p>}
      {slots && slots.length > 0 && (
        <ul className="slot-list" data-testid="slot-list">
          {slots.map((slot) => (
            <li key={slot.id}>
              <div><b>{slot.name}</b><span>{slot.participant_kind}</span></div><div><Badge tone={slot.state==='BOUND'?'ok':slot.state==='OPEN'?'warning':'neutral'}>{slot.state==='BOUND'?'Bound':slot.state==='OPEN'?'Waiting participant':'Closed / Revoked'}</Badge><span>{slot.work_session_id?'WorkSession 已关联':'WorkSession 尚未关联'}</span></div>
            </li>
          ))}
        </ul>
      )}
      {instruction&&<div className="join-instruction"><div><b>Join Instruction</b><span>只显示一次；请交给预期 Participant。</span></div><pre>{instruction}</pre><Button onClick={()=>void copy(instruction)}>复制 Join Instruction</Button></div>}
      {creating&&<Dialog title="添加 WorkSession Slot" onClose={()=>setCreating(false)} footer={<><Button onClick={()=>setCreating(false)}>取消</Button><Button variant="primary" disabled={!name.trim()} onClick={()=>void create()}>创建 Slot</Button></>}><label className="field"><span>Slot 名称</span><input type="text" value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="例如：W3 Web Review"/></label><label className="field"><span>Participant 类型</span><select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="CHATGPT_WEB">ChatGPT Web</option><option value="MANAGED_HARNESS">Managed Harness</option><option value="PAIR_CODE">Pair Code Participant</option></select></label><p className="hint">创建 Slot 只准备一个 Join 位置，不代表 Participant 已绑定或正在运行。</p></Dialog>}
    </Card>
  );
}

function CharterHistory({roleId,projectId}:{roleId:string;projectId:string}){
 const s=useStore(),[rows,setRows]=useState<RoleCharterVM[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false),alive=useRef(true);
 useEffect(()=>()=>{alive.current=false;},[]);
 return <details onToggle={async e=>{if(!e.currentTarget.open||rows||busy)return;setBusy(true);try{const v=await s.call('roleCharter.listHistory',{role_id:roleId,project_id:projectId});if(alive.current){setRows(v.items);setMore(v.has_more);}}catch(e){if(alive.current)setError(errorMessage(e));}finally{if(alive.current)setBusy(false);}}}><summary>角色说明历史（原始修订）</summary>{busy&&<p>正在读取…</p>}{error&&<p role="alert">{error}；关闭后重开可重试。</p>}{rows?.map(c=><details key={c.id}><summary>修订 {c.revision} · {formatDateTime(c.effectiveAtMs)}</summary><p>{c.spec.mission}</p><pre>{JSON.stringify(c,null,2)}</pre></details>)}{more&&<p>还有历史修订；当前冻结查询没有尾页游标参数，本页不宣称完整。</p>}</details>;
}
