/**
 * Role Plan：AI 生成（能力不足禁用）/ 导入 / 手工 → Validate → Review
 * （权限"请求 vs 拟授予"对照、模型可用性）→ 确认 → Apply（APPLIED 与 Bootstrap 分离）。
 */
import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  CapabilityGate,
  Card,
  EmptyState,
  KeyValue,
} from '../../../packages/ui/index.ts';
import type {
  RolePlanInput,
  RolePlanValidationVM,
} from '../../../packages/client-contract/c1r1p1/generated.ts';
import { useStore } from './store.tsx';

type Stage = 'entry' | 'review' | 'applied';

export function RolePlanPage({ projectId }: { projectId: string }) {
  const s = useStore();
  const project = s.snapshot.projects.find((p) => p.id === projectId);
  const [stage, setStage] = useState<Stage>('entry');
  const [plan, setPlan] = useState<RolePlanInput | null>(null);
  const [validation, setValidation] = useState<RolePlanValidationVM | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ id: string; state: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const catalog = s.snapshot.modelCatalog ?? [];
  const aiAvailable = useMemo(
    () =>
      Object.values(s.capabilities.harnesses).some(
        (h) => (h.status === 'LIVE_TESTED' || h.status === 'CERTIFIED') && h.create_session,
      ),
    [s.capabilities],
  );

  if (!project) return <EmptyState title="项目不存在" body="" />;
  if (s.capabilities.role_plans === false)
    return (
      <div className="page" data-page="roleplan">
        <EmptyState
          title="当前 Core 不支持 Role Plan"
          body="能力缺失时入口保留但禁用。可以在支持该能力的 Core 上编排角色。"
        />
      </div>
    );

  async function importPlan(file: File) {
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text()) as RolePlanInput;
      if (parsed.schema_version !== 'agentrouter-role-plan/1')
        throw new Error('schema_version 必须是 agentrouter-role-plan/1');
      const v = (await s.call('rolePlan.validate', { plan: parsed } as never)) as RolePlanValidationVM;
      setPlan(parsed);
      setValidation(v);
      setConfirmed(new Set());
      setStage('review');
    } catch (e) {
      setImportError(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function apply() {
    if (!plan || !validation) return;
    setBusy(true);
    try {
      const vm = (await s.call('rolePlan.apply', {
        plan,
        plan_hash: validation.planHash,
        confirmed: [...confirmed],
        permission_grants: plan.roles.map((r) => ({
          role_key: r.role_key,
          permissions: r.requested_permissions,
        })),
      } as never)) as { id: string; state: string };
      setApplied(vm);
      setStage('applied');
    } finally {
      setBusy(false);
    }
  }

  const allConfirmed =
    (validation?.requiredConfirmations ?? []).every((c) => confirmed.has(c)) &&
    (validation?.errors.length ?? 0) === 0;

  return (
    <div className="page page-roleplan" data-page="roleplan">
      <header className="page-head">
        <div>
          <div className="eyebrow">
            <a href={`#/project/${projectId}`}>{project.name}</a> / 编排角色
          </div>
          <h1>Role Plan</h1>
          <p>
            AI 只能<b>请求</b>权限；最终权限由 Core 与你共同确定。应用（Apply）成功 ≠ Bootstrap 完成。
          </p>
        </div>
      </header>

      {stage === 'entry' && (
        <div className="roleplan-entries" data-stage="entry">
          <Card>
            <h3>AI 生成方案</h3>
            <p>由可用 Harness 在设置会话中产出方案草稿，经你审阅后才可应用。</p>
            <CapabilityGate
              available={aiAvailable}
              unavailableReason="当前没有已认证且可建会话的 Harness，AI 生成不可用"
            >
              <Button variant="primary" disabled={!aiAvailable}>
                开始 AI 生成…
              </Button>
            </CapabilityGate>
          </Card>
          <Card>
            <h3>导入方案（JSON）</h3>
            <p>导入符合 agentrouter-role-plan/1 的方案文件，导入后先校验再审阅。</p>
            <label className="btn btn-secondary file-btn">
              选择方案文件…
              <input
                type="file"
                accept="application/json,.json"
                aria-label="导入 Role Plan JSON"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importPlan(f);
                }}
              />
            </label>
            {importError && (
              <p className="hint tone-danger" role="alert">
                {importError}
              </p>
            )}
          </Card>
          <Card>
            <h3>手工创建</h3>
            <p>从空白方案开始，逐个定义组与角色。</p>
            <Button
              variant="secondary"
              onClick={() => {
                const blank: RolePlanInput = {
                  schema_version: 'agentrouter-role-plan/1',
                  project_id: projectId,
                  title: '未命名方案',
                  source: 'human',
                  goals: [],
                  non_goals: [],
                  assumptions: [],
                  groups: [],
                  roles: [],
                  review: { requires_user_confirmation: true, known_risks: [] },
                };
                setPlan(blank);
                setValidation({ valid: true, planHash: 'manual', errors: [], warnings: [], requiredConfirmations: [] });
                setConfirmed(new Set());
                setStage('review');
              }}
            >
              新建空白方案
            </Button>
          </Card>
        </div>
      )}

      {stage === 'review' && plan && validation && (
        <div className="roleplan-review" data-stage="review">
          <Card>
            <h3>校验结果</h3>
            <KeyValue k="方案" v={plan.title} />
            <KeyValue k="Plan Hash" v={validation.planHash} />
            <KeyValue
              k="结论"
              v={
                <Badge tone={validation.valid ? 'ok' : 'danger'}>
                  {validation.valid ? '可审阅' : `存在 ${validation.errors.length} 个错误`}
                </Badge>
              }
            />
            {validation.errors.map((e, i) => (
              <p className="hint tone-danger" key={i}>
                错误 [{e.code}] {e.field}
              </p>
            ))}
            {validation.warnings.map((w, i) => (
              <p className="hint tone-warning" key={i}>
                警告 [{w.code}] {w.field}
              </p>
            ))}
          </Card>

          <Card>
            <h3>组与角色（{plan.groups.length} 组 / {plan.roles.length} 角色）</h3>
            {plan.groups.length === 0 && <p className="muted">空白方案：请继续编辑组与角色。</p>}
            {plan.groups.map((g) => (
              <section key={g.group_key} className="plan-group">
                <h4>
                  {g.display_name} <span className="muted">（{g.purpose}）</span>
                </h4>
                <ul className="spec-list">
                  {plan.roles
                    .filter((r) => r.group_key === g.group_key)
                    .map((r) => {
                      const model = catalog.find((m) => m.model_id === r.runtime.model_id);
                      const runnable = model && model.availability === 'AVAILABLE' && model.source !== 'SEED';
                      return (
                        <li key={r.role_key} className="plan-role" data-role-key={r.role_key}>
                          <b>{r.display_name}</b> — {r.mission}
                          <div className="plan-role-meta">
                            <Badge tone={runnable ? 'ok' : 'warning'} title={runnable ? '' : '种子/未验证模型不能显示为可运行'}>
                              {r.runtime.model_id} · {r.runtime.reasoning_effort}
                              {runnable ? ' · 可用' : model?.availability === 'REQUIRES_LOGIN' ? ' · 需登录验证' : ' · 未验证'}
                            </Badge>
                            <Badge tone="queue">工作区 {r.workspace_ref}</Badge>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </section>
            ))}
          </Card>

          <Card>
            <h3>权限对照（AI 请求 → 拟授予）</h3>
            <p className="muted">
              此处为"拟授予"，最终 effective permissions 以 Apply 后 Charter 为准。
            </p>
            <table className="perm-table">
              <thead>
                <tr>
                  <th>角色</th>
                  <th>工作区</th>
                  <th>工具</th>
                  <th>网络</th>
                </tr>
              </thead>
              <tbody>
                {plan.roles.map((r) => (
                  <tr key={r.role_key}>
                    <td>{r.display_name}</td>
                    <td>
                      {r.requested_permissions.workspace_access === 'read_write' ? '读写' : '只读'} →{' '}
                      <b>{r.requested_permissions.workspace_access === 'read_write' ? '读写' : '只读'}</b>
                    </td>
                    <td>{r.requested_permissions.tool_profiles.join('、') || '无'}</td>
                    <td>
                      {r.requested_permissions.network_profile}
                      {r.requested_permissions.network_profile === 'custom_request' && (
                        <Badge tone="danger">需逐项确认</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {validation.requiredConfirmations.length > 0 && (
            <Card>
              <h3>必须逐项确认</h3>
              {validation.requiredConfirmations.map((c) => (
                <label className="confirm-row" key={c}>
                  <input
                    type="checkbox"
                    checked={confirmed.has(c)}
                    onChange={(e) => {
                      const next = new Set(confirmed);
                      if (e.target.checked) next.add(c);
                      else next.delete(c);
                      setConfirmed(next);
                    }}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </Card>
          )}

          <div className="roleplan-actions">
            <Button variant="ghost" onClick={() => setStage('entry')}>
              返回
            </Button>
            <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
              <Button variant="primary" disabled={!allConfirmed || busy} onClick={() => void apply()}>
                确认并应用
              </Button>
            </CapabilityGate>
          </div>
        </div>
      )}

      {stage === 'applied' && applied && (
        <div data-stage="applied"><Card>
          <h3>已应用（APPLIED）</h3>
          <p>
            方案 {applied.id} 已创建组与角色。<b>Apply 完成 ≠ Bootstrap 完成</b>
            ：每个新角色仍需完成 Charter Bootstrap 才能接收首个任务，请在角色详情查看初始化状态。
          </p>
          <Button variant="primary" onClick={() => (location.hash = `#/project/${projectId}`)}>
            返回项目
          </Button>
        </Card></div>
      )}
    </div>
  );
}
