/**
 * Workbench 入口（UI Baseline V1）。
 * 后端选择：Electron 注入 window.agentrouterClient 时走真实桥；
 * 纯浏览器静态预览时回退到 packages/ui-mocks 的预览会话（?scenario=<id>）。
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ClientSession } from '../../packages/client-transport/p1/types.ts';
import { connectPreview } from '../../packages/ui-mocks/client.ts';
import { FIXED_NOW } from '../../packages/ui-mocks/data.ts';
import { StoreProvider } from './workbench/store.tsx';
import { Shell } from './workbench/shell.tsx';
import { HomePage } from './workbench/pages-home.tsx';
import { ProjectPage } from './workbench/pages-project.tsx';
import { RolePage } from './workbench/pages-role.tsx';
import { RolePlanPage } from './workbench/pages-roleplan.tsx';
import { ReconfigurePage } from './workbench/pages-reconfigure.tsx';
import { RemoteDevicesPage } from './workbench/pages-remote.tsx';
import { GlobalSettingsPage } from './workbench/pages-settings.tsx';

type RemoteNodeRecord = { id: string; name: string; url: string; deviceId: string; lastSeenMs?: number };
declare global {
  interface Window {
    agentrouterDesktop?: {
      getContext():Promise<{mode:'LOCAL_CORE'|'REMOTE_CORE'|'PREVIEW_MOCK';dataId:string;clientId:string;serverInstanceId:string}>;
      saveArtifact(id: string): Promise<{ saved: boolean }>;
      chooseProjectDirectory(): Promise<{
        name: string;
        displayPath: string;
        pathHandle: string;
      } | null>;
      hostInfo(): Promise<{ enabled: boolean; host?: string; port?: number }>;
      // W12 卡2:REMOTE_CORE 客户端节点管理(token 只在 Main;renderer 只见脱敏记录)。
      listNodes?(): Promise<RemoteNodeRecord[]>;
      pairNode?(input: { name: string; url: string; challenge: string }): Promise<RemoteNodeRecord>;
      removeNode?(nodeId: string): Promise<unknown>;
      selectNode?(nodeId: string | undefined): boolean;
    };
    agentrouterClient?: {
      connect(options: {
        clientId: string;
        clientVersion: string;
        requestedMode: 'controller' | 'observer';
        contractRevision?: 'C1R1P1' | 'C1R1';
        mode?: 'PREVIEW_MOCK' | 'LOCAL_CORE';
      }): Promise<ClientSession>;
      close(): Promise<void>;
    };
  }
}

function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const onChange = () => setHash(location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function Routes() {
  const hash = useHashRoute();
  const parts = hash.replace(/^#\//, '').split('/').filter(Boolean);
  if (parts[0] === 'project' && parts[1])
    return <ProjectPage key={parts[1]} projectId={parts[1]} tab={parts[2]} />;
  if (parts[0] === 'role' && parts[1]) return <RolePage key={parts[1]} roleId={parts[1]} />;
  if (parts[0] === 'roleplan' && parts[1]) return <RolePlanPage key={parts[1]} projectId={parts[1]} />;
  if (parts[0] === 'reconfigure' && parts[1]) return <ReconfigurePage projectId={parts[1]} />;
  if (parts[0] === 'remote') return <RemoteDevicesPage />;
  if (parts[0] === 'settings') return <GlobalSettingsPage />;
  return <HomePage />;
}

async function connect(): Promise<ClientSession> {
  const params = new URLSearchParams(location.search);
  if (window.agentrouterClient) {
    const mode = params.get('mode');
    return window.agentrouterClient.connect({
      clientId: 'workbench',
      clientVersion: '1.0.0-dev.0',
      requestedMode: params.get('as') === 'observer' ? 'observer' : 'controller',
      contractRevision: 'C1R1P1',
      ...(mode === 'PREVIEW_MOCK' || mode === 'LOCAL_CORE' ? { mode } : {}),
    });
  }
  // 静态预览：固定时钟，保证截图可复现。
  if (
    params.get('mode') === 'LOCAL_CORE' ||
    (params.get('mode') !== 'PREVIEW_MOCK' && !params.has('scenario'))
  )
    throw Error('DESKTOP_BRIDGE_REQUIRED');
  const scenario = params.get('scenario') ?? 'full';
  return connectPreview(scenario);
}

/** REMOTE_CORE 启动但尚未选定节点:先配对/选择节点,再重连。 */
function RemoteBootPanel({ retry }: { retry: () => void }) {
  const [nodes, setNodes] = React.useState<RemoteNodeRecord[]>([]);
  const [picked, setPicked] = useState<string | undefined>();
  const [form, setForm] = useState({ name: '', url: '', challenge: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () => void window.agentrouterDesktop?.listNodes?.().then(setNodes, (e: Error) => setMsg(e.message));
  useEffect(refresh, []);
  const pair = async () => {
    setMsg(null);
    try {
      const rec = await window.agentrouterDesktop?.pairNode?.({ name: form.name || '远程主机', url: form.url.trim(), challenge: form.challenge.trim() });
      if (rec) { setPicked(rec.id); window.agentrouterDesktop?.selectNode?.(rec.id); setForm({ name: '', url: '', challenge: '' }); refresh(); }
    } catch (e) { setMsg('配对失败：' + (e as Error).message); }
  };
  const go = () => { if (picked) { window.agentrouterDesktop?.selectNode?.(picked); retry(); } };
  return (
    <div className="boot" style={{ maxWidth: 520, margin: '8vh auto', padding: 16 }}>
      <h2>连接远程主机</h2>
      <p>本机以 REMOTE_CORE 模式启动。可先用主机「远程设备」页生成的配对码添加节点；或直接选择已配对节点。</p>
      <div style={{ display: 'grid', gap: 8 }}>
        <input placeholder="名称（如 家里主机）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="主机地址 http://100.x.x.x:3780" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <input placeholder="配对码（5 分钟有效，仅一次）" value={form.challenge} onChange={(e) => setForm({ ...form, challenge: e.target.value })} />
        <button onClick={() => void pair()}>配对并保存节点</button>
      </div>
      <h3>已配对节点</h3>
      {nodes.length === 0 && <p style={{ opacity: 0.7 }}>暂无。先在主机生成配对码。</p>}
      {nodes.map((n) => (
        <label key={n.id} style={{ display: 'block', padding: '6px 0' }}>
          <input type="radio" name="node" checked={picked === n.id} onChange={() => setPicked(n.id)} /> {n.name} · {n.url}
        </label>
      ))}
      {msg && <p style={{ color: '#f85149' }}>{msg}</p>}
      <button disabled={!picked} onClick={go}>连接所选节点</button>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  useEffect(() => {
    connect().then(setSession, (e) => setError(String(e)));
  }, [bootNonce]);
  if (error && /REMOTE_NODE_REQUIRED|REMOTE_NODE_UNPAIRED/.test(error))
    return <RemoteBootPanel retry={() => { setError(null); setSession(null); setBootNonce((n) => n + 1); }} />;
  if (error)
    return (
      <div className="boot" role="alert">
        无法连接 Core：{error}
      </div>
    );
  if (!session) return <div className="boot">正在连接 Core…</div>;
  const preview = !window.agentrouterClient;
  return (
    <StoreProvider session={session} now={preview ? () => FIXED_NOW : undefined}>
      <Shell>
        <Routes />
      </Shell>
    </StoreProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
