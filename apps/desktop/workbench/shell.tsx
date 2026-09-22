import {PendingPanel} from './pending-panel.tsx';
/** 全局壳：连接/角色（Controller/Observer）/Core 健康/全局计数/断线冻结横幅。 */
import React, { type ReactNode } from 'react';
import { Badge, CONNECTION_LABEL } from '../../../packages/ui/index.ts';
import { formatAsOf } from '../../../packages/ui/format.ts';
import { useStore } from './store.tsx';

export function Shell({ children }: { children: ReactNode }) {
  const s = useStore();
  const snap = s.snapshot;
  const activeRuns = snap.runs.filter((r) =>
    ['CREATED', 'STARTING', 'RUNNING', 'WAITING_APPROVAL', 'SETTLING'].includes(r.state),
  ).length;
  const openIssues = snap.issues.filter((i) => i.state !== 'RESOLVED').length;
  const pendingApprovals = snap.approvals.filter((a) => a.state === 'PENDING').length;
  const observer = s.connectionState === 'CONNECTED_OBSERVER';
  const disconnected = s.connectionState === 'DISCONNECTED';
  const reconnecting = s.connectionState === 'RECONNECTING' || s.connectionState === 'DEGRADED';
  const remote = s.contextMode === 'REMOTE_CORE';
  const hostLabel = remote ? `Remote Core ${s.hello.serverInstanceId.slice(0, 8)}` : 'This PC';
  const controlLabel = s.connectionState === 'CONNECTED_CONTROLLER' ? 'Controller' : 'Observer';
  const route = typeof location === 'undefined' ? '' : location.hash;
  React.useEffect(() => {
    const saved = localStorage.getItem('agentrouter.theme');
    const resolved =
      saved === 'light' || saved === 'dark'
        ? saved
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, []);

  return (
    <div className="wb-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="wb-topbar">
        <a className="wb-brand" href="#/">
          <b>AR</b>
          <span>
            AgentRouter<small>本地协作工作台</small>
          </span>
        </a>
        <div className="wb-core-chip" data-testid="core-identity" title={s.hello.serverInstanceId}>
          <span className={`status-dot tone-${disconnected?'danger':reconnecting?'warning':'ok'}`} aria-hidden="true" />
          <span><b>{hostLabel}</b><small>{remote?'Remote':'Local'} · {disconnected?'Disconnected':reconnecting?'Reconnecting':'Connected'} · {controlLabel}</small></span>
        </div>
        <div className="wb-topbar-status">
          {s.hello.capabilities.mock&&<Badge tone="warning">演示数据 · 不是真实执行</Badge>}
          {snap.runs.some((r) => r.nativeSessionDisplay === 'SIMULATED') && (
            <Badge tone="warning">模拟执行器 · 真实 Harness 支持 0</Badge>
          )}
          <Badge tone={disconnected||reconnecting?'warning':s.hello.health === 'OK' ? 'ok' : 'warning'} title="Core 健康状态">
            Core{' '}
            {disconnected||reconnecting?'当前健康未知':s.hello.health === 'OK' ? '正常' : s.hello.health === 'DEGRADED' ? '降级' : '仅诊断'}
          </Badge>
          {activeRuns>0&&<Badge tone="active" title="活跃 Run（不含 UNKNOWN）">
            ▶ {activeRuns} 运行
          </Badge>}
          {openIssues>0&&<Badge tone={openIssues > 0 ? 'danger' : 'neutral'} title="未解决问题">
            ◆ {openIssues} 介入
          </Badge>}
          {pendingApprovals>0&&<Badge tone={pendingApprovals > 0 ? 'warning' : 'neutral'} title="待处理审批">
            ✋ {pendingApprovals} 审批
          </Badge>}
        </div>
        <div className="wb-topbar-conn">
          <Badge
            tone={disconnected ? 'danger' : reconnecting ? 'warning' : observer ? 'queue' : 'ok'}
          >
            {CONNECTION_LABEL[s.connectionState] ?? s.connectionState}
          </Badge>
          {observer && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void s.acquireControl().catch(() => {})}
            >
              申请控制
            </button>
          )}
          {s.connectionState === 'CONNECTED_CONTROLLER' && (
            <button
              className="btn btn-ghost btn-sm"
              title="释放控制租约，转为只读观察者"
              onClick={() => void s.releaseControl().catch(() => {})}
            >
              转为只读
            </button>
          )}
        </div>
      </header>
      {observer && (
        <div className="wb-banner tone-queue" role="status">
          观察者模式：全部内容只读。申请控制后才能执行写操作。
        </div>
      )}
      {disconnected && (
        <div className="wb-banner tone-danger" role="alert">
          与 Core 的连接已断开。页面展示最后已知状态（{formatAsOf(s.frozenAtMs)}）， 远端 Run
          是否继续无法从界面确认。写操作已禁用。
        </div>
      )}
      {reconnecting && (
        <div className="wb-banner tone-warning" role="status">
          连接不稳定，正在重连。展示最后一致快照（{formatAsOf(s.frozenAtMs)}）。
        </div>
      )}
      <div className="wb-body">
        <aside className="wb-sidebar" aria-label="全局导航">
          <nav className="global-nav">
            <a className={!route || route === '#/' ? 'active' : ''} href="#/" aria-current={!route || route === '#/' ? 'page' : undefined}>
              <span aria-hidden="true">▦</span><b>Projects</b>
            </a>
            <a className={route.startsWith('#/remote') ? 'active' : ''} href="#/remote" aria-current={route.startsWith('#/remote') ? 'page' : undefined}>
              <span aria-hidden="true">⌁</span><b>Connections</b>
            </a>
            <a className={route.startsWith('#/settings') ? 'active' : ''} href="#/settings" aria-current={route.startsWith('#/settings') ? 'page' : undefined}>
              <span aria-hidden="true">⚙</span><b>Settings</b>
            </a>
          </nav>
          <div className="sidebar-identity" title={s.hello.serverInstanceId}>
            <span className={`status-dot tone-${disconnected ? 'danger' : reconnecting ? 'warning' : 'ok'}`} aria-hidden="true" />
            <span><b>{remote ? 'Remote Core' : 'Local Core'}</b><small>{controlLabel} · {disconnected ? 'Offline' : reconnecting ? 'Reconnecting' : 'Connected'}</small></span>
          </div>
        </aside>
        <div className="wb-content">
          <main className="wb-main" id="main-content"><PendingPanel />{children}</main>
          <footer className="wb-footer">
            <div className="wb-core-identity" title={s.hello.serverInstanceId}>
              Host {s.hello.platform} · Core {s.hello.serverInstanceId.slice(0, 12)} ·{' '}
              {s.hello.contractRevision ?? s.hello.protocol}
            </div>
            <details><summary>帮助与连接说明</summary><span>
              关闭窗口仅退出界面，本地 Core 独立运行；远程状态需重新连接确认。
              {s.hello.capabilities.mock && ' · 预览数据（Mock）'}
            </span>
            </details>
          </footer>
        </div>
      </div>
    </div>
  );
}
