import {errorMessage} from './action-state.ts';
import {HistoryPanel} from './history.tsx';
import {exactWorkspace} from './identity.ts';
/** 角色详情：Charter / 当前任务与 Run / 完整对话 / 权限与工作区 / UNKNOWN 对账。 */
import React, { useEffect, useState, useRef } from 'react';
import {
  Avatar,
  Drawer,
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
          <details className="current-work"><summary>当前工作 · {activeRun?RUN_STATE_LABEL[activeRun.state]:"暂无运行"} · {tasks.length} 项任务</summary><Card>
            <h3>当前工作</h3>
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
          </Card></details>

          <Card>
            <h3>对话与记录</h3>
            <HistoryPanel scope={{project_id:project?.id,space_id:role.spaceId}} roleId={role.id}/>
            <Composer role={role} spaceId={role.spaceId} />
          </Card>

          <SessionWorkflow roleId={role.id} />
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

/** 工作会话切换(R4):同一角色下 A/B 会话隔离;切换生成交接包,目标会话首运行须 ACK。 */
function SessionWorkflow({ roleId }: { roleId: string }) {
  const s = useStore();
  const [data, setData] = useState<{ sessions: { id: string; name: string; seq: number; state: string; generation: number; hasNativeSession?: boolean }[]; active_session_id: string } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = React.useCallback(async () => {
    try {
      const v = (await s.callExtension('roleSession.list', { role_id: roleId })) as { sessions: { id: string; name: string; seq: number; state: string; generation: number; hasNativeSession?: boolean }[]; active_session_id: string };
      setData(v);
      setError('');
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
    <Card>
      <h3>工作会话</h3>
      <p className="muted">
        同一角色可开多个工作会话；切换会生成交接包，新会话首次运行需确认收到后才会开放工具。
      </p>
      {!s.readOnly && (
        <form
          className="role-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void act('roleSession.create', { role_id: roleId, name: name.trim() }).then(() => setName(''));
          }}
        >
          <label>
            新会话名称
            <input
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：换一个实现方向"
            />
          </label>
          <button className="btn" disabled={busy || !name.trim()} type="submit">
            新建并切换
          </button>
        </form>
      )}
      {data && (
        <ul className="spec-list" data-testid="session-list">
          {data.sessions.map((w) => (
            <li key={w.id}>
              <span>
                #{w.seq} {w.name}{' '}
                {w.id === data.active_session_id ? (
                  <Badge tone="active">当前</Badge>
                ) : (
                  <Badge tone="neutral">已归档</Badge>
                )}{' '}
                {w.hasNativeSession ? <Badge tone="ok">有原生会话</Badge> : null}
                {' · '}G{w.generation}
              </span>
              {!s.readOnly && w.id !== data.active_session_id && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void act('roleSession.switch', { role_id: roleId, session_id: w.id })}
                >
                  切换到此会话
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </Card>
  );
}

function CharterHistory({roleId,projectId}:{roleId:string;projectId:string}){
 const s=useStore(),[rows,setRows]=useState<RoleCharterVM[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[more,setMore]=useState(false),alive=useRef(true);
 useEffect(()=>()=>{alive.current=false;},[]);
 return <details onToggle={async e=>{if(!e.currentTarget.open||rows||busy)return;setBusy(true);try{const v=await s.call('roleCharter.listHistory',{role_id:roleId,project_id:projectId});if(alive.current){setRows(v.items);setMore(v.has_more);}}catch(e){if(alive.current)setError(errorMessage(e));}finally{if(alive.current)setBusy(false);}}}><summary>角色说明历史（原始修订）</summary>{busy&&<p>正在读取…</p>}{error&&<p role="alert">{error}；关闭后重开可重试。</p>}{rows?.map(c=><details key={c.id}><summary>修订 {c.revision} · {formatDateTime(c.effectiveAtMs)}</summary><p>{c.spec.mission}</p><pre>{JSON.stringify(c,null,2)}</pre></details>)}{more&&<p>还有历史修订；当前冻结查询没有尾页游标参数，本页不宣称完整。</p>}</details>;
}
