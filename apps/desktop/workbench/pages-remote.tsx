/** W09:远程 Windows GUI——本机远程网关状态、手机/二机配对码生成与设备撤销。 */
import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from './store.tsx';
import {Badge,Button,CapabilityGate,formatDateTime} from '../../../packages/ui/index.ts';

type Device = {
  deviceId: string;
  kind: string;
  displayName: string;
  state: string;
  canRequestController: boolean;
  scope: string[];
  lastSeenMs: number | null;
};
type HostInfo = { enabled: boolean; host?: string; port?: number };

export function RemoteDevicesPage() {
  const s = useStore();
  const [info, setInfo] = useState<HostInfo>({ enabled: false });
  const [devices, setDevices] = useState<Device[]>([]);
  const [pair, setPair] = useState<{ challenge: string; expiresAtMs: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (window.agentrouterDesktop as { hostInfo?: () => Promise<HostInfo> })?.hostInfo?.().then(
      setInfo,
      () => setInfo({ enabled: false }),
    );
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = (await s.callExtension('remoteDevice.listDevices', {})) as {
        devices: Device[];
      };
      setDevices(r.devices);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, [s]);
  useEffect(() => void refresh(), [refresh]);
  const activeProjects = s.snapshot.projects.filter((p) => p.status === 'ACTIVE');
  const [pairKind, setPairKind] = useState<'MOBILE' | 'DESKTOP'>('MOBILE');
  const [pairController, setPairController] = useState(false);
  const [pairScope, setPairScope] = useState<string[]>([]);
  const create = async () => {
    setError(null);
    const kind = pairKind;
    const name = kind === 'MOBILE' ? '手机' : '二机';
    try {
      // WC03/W-03:MOBILE/DESKTOP 均可被授予 controller 申请资格与显式项目 scope;
      // 空 scope 保持最小权限(仅自创建项目可见),不放宽为 ALL。
      const r = (await s.callExtension('remoteDevice.createPairing', {
        displayName: name,
        kind,
        canRequestController: pairController,
        ...(pairScope.length ? { scope: pairScope.map((id) => 'project:' + id) } : {}),
        ttlMs: 300000,
      })) as { challenge: string; expiresAtMs: number };
      setPair({ ...r, name });
      void refresh();
    } catch (e) {
      setError(String((e as Error).message));
    }
  };
  const revoke = async (id: string) => {
    await s.callExtension('remoteDevice.revoke', { deviceId: id }).catch((e: Error) => setError(e.message));
    void refresh();
  };
  return (
    <div className="page" data-page="remote">
      <header className="page-head">
        <div>
          <h1>远程设备</h1>
          <p>
            {info.enabled && info.port
              ? `本机远程控制台已启用:手机浏览器访问 http://${info.host}:${info.port}/ 并输入下方配对码(5 分钟有效)。生产环境经 Tailscale 地址访问。`
              : '本机远程网关未启用(启动 core 时设 AGENTROUTER_REMOTE_ENABLED=1)。'}
          </p>
        </div>
      </header>
      <section className="remote-identity" aria-label="远程连接身份">
        <div><span className="eyebrow">CURRENT CORE</span><b>{s.contextMode==='REMOTE_CORE'?'Remote Core':'This PC'}</b><small>{s.hello.serverInstanceId.slice(0,12)} · {s.connectionState==='CONNECTED_CONTROLLER'?'Controller':'Observer'}</small></div>
        <div><Badge tone={s.connectionState==='CONNECTED_CONTROLLER'?'ok':'queue'}>{s.connectionState==='CONNECTED_CONTROLLER'?'可执行受权 mutation':'只读观察'}</Badge><Badge tone="warning">Transport security 未验证</Badge></div>
      </section>
      {error && <p role="alert">操作失败:{error}</p>}
      <section className="card">
        <h2>生成配对</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            设备类型
            <select value={pairKind} onChange={(e) => setPairKind(e.target.value as 'MOBILE' | 'DESKTOP')}>
              <option value="MOBILE">手机</option>
              <option value="DESKTOP">第二台电脑</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={pairController} onChange={(e) => setPairController(e.target.checked)} />
            允许申请控制器(资格;仍需获取租约,观察者默认只读)
          </label>
          <fieldset style={{ border: '1px solid #262c36', borderRadius: 8 }}>
            <legend>可见项目 scope(不选=仅自创建项目)</legend>
            {activeProjects.map((p) => (
              <label key={p.id} style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={pairScope.includes(p.id)}
                  onChange={(e) =>
                    setPairScope(e.target.checked ? [...pairScope, p.id] : pairScope.filter((x) => x !== p.id))
                  }
                />{' '}
                {p.name}
              </label>
            ))}
          </fieldset>
          <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}><Button variant="primary" onClick={() => void create()}>生成配对码（5 分钟有效）</Button></CapabilityGate>
        </div>
      </section>
      {pair && (
        <section className="card" aria-label="配对码">
          <h2>{pair.name} 配对码(仅显示一次)</h2>
          <p style={{ fontSize: 22, wordBreak: 'break-all', fontFamily: 'monospace' }}>{pair.challenge}</p>
          <p>有效期至 {formatDateTime(pair.expiresAtMs)}</p>
        </section>
      )}
      <section className="card">
        <h2>已登记设备</h2>
        {devices.length === 0 && <p>尚无设备。生成配对码后,对方完成配对即出现在此。</p>}
        <ul>
          {devices.map((d) => (
            <li key={d.deviceId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span>
                {d.displayName} · {d.kind} · {d.state}
                {d.canRequestController ? ' · 可控制' : ''}
                {d.lastSeenMs ? ` · 最近在线 ${formatDateTime(d.lastSeenMs)}` : ' · Last seen 未提供'}
              </span>
              {d.state === 'ACTIVE' && <CapabilityGate available={!s.readOnly} unavailableReason={s.readOnlyReason}><Button variant="danger" onClick={() => void revoke(d.deviceId)}>撤销设备</Button></CapabilityGate>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
