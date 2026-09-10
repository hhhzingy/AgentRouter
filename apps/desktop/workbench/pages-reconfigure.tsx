/** 组重构：Merge/Split → Preview blockers → 显式处置 → Commit。能力缺失正确禁用。 */
import React, { useState } from 'react';
import {
  Badge,
  Button,
  CapabilityGate,
  Card,
  EmptyState,
  KeyValue,
} from '../../../packages/ui/index.ts';
import type { SpaceReconfigurationPreviewVM } from '../../../packages/client-contract/c1r1p1/generated.ts';
import { useStore } from './store.tsx';

type Stage = 'setup' | 'preview' | 'committed';

export function ReconfigurePage({ projectId }: { projectId: string }) {
  const s = useStore();
  const project = s.snapshot.projects.find((p) => p.id === projectId);
  const spaces = s.snapshot.spaces.filter(
    (sp) => sp.projectId === projectId && sp.status === 'ACTIVE',
  );
  const [mode, setMode] = useState<'MERGE' | 'SPLIT'>('MERGE');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<Stage>('setup');
  const [preview, setPreview] = useState<SpaceReconfigurationPreviewVM | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [committed, setCommitted] = useState(false);

  if (!project) return <EmptyState title="项目不存在" body="" />;
  if (s.capabilities.space_reconfiguration === false)
    return (
      <div className="page" data-page="reconfigure">
        <EmptyState
          title="当前 Core 不支持组重构"
          body="能力缺失时入口保留但禁用。生产环境未实现该能力时不会显示为可用。"
        />
      </div>
    );

  async function runPreview() {
    const pv = (await s.call('space.reconfigure.preview', {
      plan: {
        mode,
        source_space_ids: [...selected],
        targets: [
          {
            group_key: 'g_target',
            display_name: mode === 'MERGE' ? '合并组' : '拆分组 A',
            purpose: '组重构目标',
            rules: { handoff_requirements: [], completion_definition: [], parallelism_notes: '' },
          },
        ],
        assignments: [],
        task_dispositions: [],
      },
    } as never)) as SpaceReconfigurationPreviewVM;
    setPreview(pv);
    setConfirmed(new Set());
    setStage('preview');
  }

  const blockers = preview?.blockers ?? [];
  const allConfirmed = (preview?.requiredConfirmations ?? []).every((c) => confirmed.has(c));

  return (
    <div className="page page-reconfigure" data-page="reconfigure">
      <header className="page-head">
        <div>
          <div className="eyebrow">
            <a href={`#/project/${projectId}`}>{project.name}</a> / 组重构
          </div>
          <h1>组重构</h1>
          <p>
            必须 Preview → blockers 清零 → 显式处置 → Commit。Commit 后的重构
            <b>不能在界面内一键撤销</b>；拆组不意味着模型遗忘旧上下文。
          </p>
        </div>
      </header>

      {stage === 'setup' && (
        <div data-stage="setup"><Card>
          <h3>选择方式与来源组</h3>
          <div className="mode-row" role="radiogroup" aria-label="重构方式">
            {(['MERGE', 'SPLIT'] as const).map((m) => (
              <label className={`mode-option ${mode === m ? 'active' : ''}`} key={m}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                <b>{m === 'MERGE' ? '合并组' : '拆分组'}</b>
                <span className="muted">
                  {m === 'MERGE' ? '多个组合并为一个新组，原组归档' : '一个组拆为多个新组，原组归档'}
                </span>
              </label>
            ))}
          </div>
          <h4>来源组</h4>
          {spaces.map((sp) => (
            <label className="confirm-row" key={sp.id}>
              <input
                type="checkbox"
                checked={selected.has(sp.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(sp.id);
                  else next.delete(sp.id);
                  setSelected(next);
                }}
              />
              <span>
                {sp.name} <span className="muted">（{sp.rolesCount} 角色 · 排队 {sp.queuedTasksCount}）</span>
              </span>
            </label>
          ))}
          <div className="roleplan-actions">
            <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
              <Button
                variant="primary"
                disabled={selected.size === 0 || (mode === 'MERGE' && selected.size < 2)}
                onClick={() => void runPreview()}
              >
                生成 Preview
              </Button>
            </CapabilityGate>
          </div>
        </Card></div>
      )}

      {stage === 'preview' && preview && (
        <>
          <div data-stage="preview"><Card>
            <h3>Preview</h3>
            <KeyValue k="Plan" v={preview.planId} />
            <KeyValue k="影响角色" v={preview.affectedRoleIds.join('、') || '无'} />
            <KeyValue k="影响任务" v={preview.affectedTaskIds.join('、') || '无'} />
            <KeyValue k="影响 Run" v={preview.affectedRunIds.join('、') || '无'} />
            <KeyValue k="影响工作区" v={preview.affectedWorkspaceIds.join('、') || '无'} />
          </Card></div>
          <Card>
            <h3>
              Blockers{' '}
              <Badge tone={blockers.length > 0 ? 'danger' : 'ok'}>
                {blockers.length > 0 ? `${blockers.length} 个阻断` : '无阻断'}
              </Badge>
            </h3>
            {blockers.length === 0 ? (
              <p className="muted">没有阻断项，可以进入确认。</p>
            ) : (
              <ul className="spec-list" data-testid="blockers">
                {blockers.map((b, i) => (
                  <li key={i}>
                    <Badge tone="danger">{b.code}</Badge> {b.field}
                  </li>
                ))}
              </ul>
            )}
            {blockers.length > 0 && (
              <p className="hint tone-danger">
                存在阻断项时不能 Commit，没有"忽略并继续"。请先回到项目处理（例如完成 Run
                对账、等待账号切换结束）。
              </p>
            )}
          </Card>
          {preview.requiredConfirmations.length > 0 && (
            <Card>
              <h3>必须逐项确认</h3>
              {preview.requiredConfirmations.map((c) => (
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
            <Button variant="ghost" onClick={() => setStage('setup')}>
              返回修改
            </Button>
            <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}>
              <Button
                variant="primary"
                disabled={blockers.length > 0 || !allConfirmed}
                title={blockers.length > 0 ? '存在阻断项，不能 Commit' : ''}
                onClick={() =>
                  void s
                    .call('space.reconfigure.commit', {
                      plan_id: preview.planId,
                      plan_hash: preview.planHash,
                      confirmed: [...confirmed],
                    } as never)
                    .then(() => {
                      setCommitted(true);
                      setStage('committed');
                    })
                    .catch(() => {})
                }
              >
                Commit 重构
              </Button>
            </CapabilityGate>
          </div>
        </>
      )}

      {stage === 'committed' && committed && (
        <div data-stage="committed"><Card>
          <h3>重构已提交（COMMITTED）</h3>
          <p>
            原组已归档，角色按处置方案迁移。<b>此操作不能在界面内撤销</b>；
            拆组的旧上下文假设不自动失效，请通过新的 Charter 与交接包重建共识。
          </p>
          <Button variant="primary" onClick={() => (location.hash = `#/project/${projectId}`)}>
            返回项目
          </Button>
        </Card></div>
      )}
    </div>
  );
}
