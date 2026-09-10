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

declare global {
  interface Window {
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
  if (parts[0] === 'project' && parts[1]) return <ProjectPage projectId={parts[1]} tab={parts[2]} />;
  if (parts[0] === 'role' && parts[1]) return <RolePage roleId={parts[1]} />;
  if (parts[0] === 'roleplan' && parts[1]) return <RolePlanPage projectId={parts[1]} />;
  if (parts[0] === 'reconfigure' && parts[1]) return <ReconfigurePage projectId={parts[1]} />;
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
  const scenario = params.get('scenario') ?? 'full';
  return connectPreview(scenario);
}

function App() {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    connect().then(setSession, (e) => setError(String(e)));
  }, []);
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
