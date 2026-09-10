/** 角色详情：Charter / 当前任务与 Run / 完整对话 / 权限与工作区 / UNKNOWN 对账。 */
import React, { useEffect, useState } from 'react';
import {
  Avatar,
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
  RoleCharterVM,
  RoleVM,
} from '../../../packages/client-contract/c1r1p1/generated.ts';
import { Composer, ConversationView, ReconcilePanel, RoleStateBadges, TaskRow } from './composites.tsx';
import { useStore } from './store.tsx';

export function RolePage({ roleId }: { roleId: string }) {
  const s = useStore();
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
    s.call('roleCharter.get', { role_id: role.id, project_id: space?.projectId ?? '' } as never)
      .then((c) => setCharter(c as RoleCharterVM))
      .catch(() => setCharterUnavailable(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId, s.capabilities.role_charters]);

  if (!role) return <EmptyState title="角色不存在" body="可能已归档，或当前 Core 上没有该角色。" />;

  const space = s.snapshot.spaces.find((sp) => sp.id === role.spaceId);
  const project = s.snapshot.projects.find((p) => p.id === space?.projectId);
  const tasks = s.snapshot.tasks.filter((t) => t.assigneeRoleId === role.id);
  const runs = s.snapshot.runs.filter((r) => r.roleId === role.id);
  const unknownRun = runs.find((r) => r.state === 'UNKNOWN' || r.reconciliationRequired);
  const activeRun = runs.find((r) =>
    ['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'].includes(r.state),
  );
  const conversation = s.timeline.filter((it) => it.roleId === role.id);
  const workspace = (s.snapshot.workspaces ?? []).find((w) => role.workspaceLabel.includes(w.label));

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
        <RoleStateBadges role={role} />
      </header>

      {unknownRun && <ReconcilePanel run={unknownRun} />}

      <div className="role-grid">
        <div className="role-col-main">
          <Card>
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
                    Run 正在收尾：原生进程已结束，Core 正在归集结果。此时不能视为"完成"。
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
            <h3>对话（完整可见）</h3>
            <ConversationView items={conversation} now={s.now()} />
            <Composer role={role} spaceId={role.spaceId} />
          </Card>
        </div>

        <div className="role-col-side">
          <Card>
            <h3>Role Charter</h3>
            {charterUnavailable ? (
              <p className="muted">当前 Core 不支持 Charter 查询（能力缺失，降级显示）。</p>
            ) : !charter ? (
              <p className="muted">加载中…</p>
            ) : (
              <div data-testid="charter-card">
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
                  <p className="hint tone-warning">Bootstrap 未完成前不能派发首个任务。</p>
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
            <KeyValue k="模型" v={role.modelLabel ?? '未选择'} />
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
                  v={charter.effectivePermissions.workspace_access === 'read_write' ? '读写' : '只读'}
                />
                <KeyValue k="工具" v={charter.effectivePermissions.tool_profiles.join('、') || '无'} />
                <KeyValue k="网络" v={charter.effectivePermissions.network_profile} />
              </div>
            ) : (
              <p className="muted">Charter 可用后展示。</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
