import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron';
import { LocalCoreTransport } from '../../packages/client-transport/p1/local.ts';
import { RemoteWebSocketTransport } from '../../packages/client-transport/remote/websocket.ts';
import { RemoteNodeLedger } from '../../packages/remote/node-ledger.ts';
import { connectLocalCore } from './local-core-launcher.ts';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadP1Scenario } from '../../packages/core-api/mock-p1-scenario.ts';
import { MockP1Server } from '../../packages/core-api/mock-p1.ts';
import { P1MemoryTransport } from '../../packages/client-transport/p1/memory.ts';
import type {
  ClientTransport,
  ClientSession,
  ConnectOptions,
  RequestOptions,
} from '../../packages/client-transport/p1/types.ts';
import type { Method, MethodMap } from '../../packages/client-contract/c1r1p1/generated.ts';
const dir = dirname(fileURLToPath(import.meta.url));
// 运行时可切 REMOTE_CORE(打包默认 LOCAL_CORE;第二机设 AGENTROUTER_MODE=REMOTE_CORE 启动即切)。
const mode = process.env.AGENTROUTER_MODE ?? 'LOCAL_CORE';
if (mode !== 'PREVIEW_MOCK' && mode !== 'LOCAL_CORE' && mode !== 'REMOTE_CORE') throw Error('EXPLICIT_BACKEND_MODE_REQUIRED');
// K09:必须在任何依赖 userData 的对象构造之前确定数据根,否则 DUT/生产账本落错目录。
app.disableHardwareAcceleration();
if (process.env.AGENTROUTER_DATA) app.setPath('userData', process.env.AGENTROUTER_DATA);
const nodeLedger = new RemoteNodeLedger(resolve(app.getPath('userData'), 'remote-nodes'), safeStorage);
let win: BrowserWindow,
  transport: ClientTransport | undefined,
  session: ClientSession | undefined,
  generation = 0,
  unsubscribe: (() => void) | undefined,
  connectionStateTimer: ReturnType<typeof setInterval> | undefined;
const mock = mode === 'PREVIEW_MOCK' ? new MockP1Server() : undefined;
async function close() {
  if (connectionStateTimer) clearInterval(connectionStateTimer);
  connectionStateTimer = undefined;
  unsubscribe?.();
  unsubscribe = undefined;
  const previous = transport;
  transport = undefined;
  session = undefined;
  await previous?.close();
}
function guard(sender: Electron.WebContents) {
  if (!win || sender !== win.webContents) throw Error('SCOPE_DENIED');
}
app.disableHardwareAcceleration();
if (process.env.AGENTROUTER_DATA) app.setPath('userData', process.env.AGENTROUTER_DATA);
app.whenReady().then(async () => {
  if (mock && process.env.AGENTROUTER_PREVIEW_SCENARIO)
    await loadP1Scenario(mock, process.env.AGENTROUTER_PREVIEW_SCENARIO);
  ipcMain.handle('desktop:context',async(e)=>{
    guard(e.sender);if(!session)throw Error('CONNECTION_LOST');
    if(transport instanceof LocalCoreTransport)return {mode,...await transport.desktopContext()};
    return {mode,dataId:session.hello.serverInstanceId,serverInstanceId:session.hello.serverInstanceId,clientId:'workbench'};
  });
  ipcMain.handle('desktop:choose-project-directory', async (e) => {
    guard(e.sender);
    if (!session || session.connectionState() !== 'CONNECTED_CONTROLLER')
      throw Error('CONTROL_LEASE_REQUIRED');
    const selected = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '选择项目目录',
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    if (!(transport instanceof LocalCoreTransport)) throw Error('CAPABILITY_UNAVAILABLE');
    return transport.grantSelectedDirectory(selected.filePaths[0]);
  });
  ipcMain.handle('desktop:save-artifact', async (e, id: string) => {
    guard(e.sender);
    if (!session || session.connectionState() !== 'CONNECTED_CONTROLLER')
      throw Error('CONTROL_LEASE_REQUIRED');
    const current = session;
    const artifact = await current.request('artifact.verify', { id });
    if (artifact.state !== 'AVAILABLE' || artifact.byteSize > 20971520)
      throw Error('ARTIFACT_UNAVAILABLE');
    const selected = await dialog.showSaveDialog(win, {
      title: '保存已校验产物',
      defaultPath: 'artifact-' + id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) + '.bin',
    });
    if (selected.canceled || !selected.filePath) return { saved: false };
    const chunks: Buffer[] = [];
    let offset = 0;
    do {
      const chunk = await current.request('artifact.download', {
        id,
        offset_bytes: offset,
        limit_bytes: 65536,
      });
      const bytes = Buffer.from(chunk.content, 'base64');
      if (
        chunk.offset !== offset ||
        bytes.length !== chunk.byteSize ||
        offset + bytes.length > artifact.byteSize
      )
        throw Error('ARTIFACT_TRANSFER_INVALID');
      chunks.push(bytes);
      offset += bytes.length;
      if (!chunk.hasMore) break;
      if (bytes.length === 0) throw Error('ARTIFACT_TRANSFER_INVALID');
    } while (offset < artifact.byteSize);
    const bytes = Buffer.concat(chunks);
    if (
      bytes.length !== artifact.byteSize ||
      createHash('sha256').update(bytes).digest('hex') !== artifact.sha256
    )
      throw Error('ARTIFACT_CHECKSUM_FAILED');
    if (session !== current || current.connectionState() !== 'CONNECTED_CONTROLLER')
      throw Error('CONTROL_LEASE_REQUIRED');
    writeFileSync(selected.filePath, bytes);
    return { saved: true, artifactId: id, byteSize: bytes.length };
  });
  ipcMain.handle('p1:connect', async (e, options: ConnectOptions, g: number, nodeId?: string) => {
    guard(e.sender);
    await close();
    if (options.mode && options.mode !== mode) throw Error('BACKEND_MODE_MISMATCH');
    generation = g;
    if (mock) {
      transport = new P1MemoryTransport(mock);
      session = await transport.connect(options);
    } else if (mode === 'REMOTE_CORE') {
      // Renderer 只交 nodeId;设备 token 仅 Main 经 safeStorage 解密,绝不回传 renderer。
      if (!nodeId) throw Error('REMOTE_NODE_REQUIRED');
      const token = nodeLedger.credentialFor(nodeId);
      const node = nodeLedger.list().find(n => n.id === nodeId);
      if (!token || !node) throw Error('REMOTE_NODE_UNPAIRED');
      const wsUrl = node.url.replace(/^http/, 'ws') + '/ws';
      transport = new RemoteWebSocketTransport({ url: wsUrl, token, requestTimeoutMs: 15000 });
      session = await transport.connect(options);
      nodeLedger.markSeen(nodeId);
    } else {
      const connected = await connectLocalCore(
        resolve(app.getPath('userData'), 'core'),
        dir,
        options,
      );
      if (generation !== g) {
        await connected.transport.close();
        throw Error('CONNECTION_LOST');
      }
      transport = connected.transport;
      session = connected.session;
    }
    unsubscribe = session.subscribe((event) => {
      if (!e.sender.isDestroyed()) e.sender.send('p1:event', { generation: g, event });
    });
    const connectedSession = session;
    let lastConnectionState = connectedSession.connectionState();
    connectionStateTimer = setInterval(() => {
      if (session !== connectedSession || generation !== g) return;
      const nextState = connectedSession.connectionState();
      if (nextState === lastConnectionState) return;
      lastConnectionState = nextState;
      if (!e.sender.isDestroyed())
        e.sender.send('p1:connection-state', { generation: g, state: nextState });
    }, 500);
    connectionStateTimer.unref();
    return session.hello;
  });
  ipcMain.handle(
    'p1:request',
    async (
      e,
      g: number,
      method: Method,
      params: MethodMap[Method]['params'],
      options: RequestOptions,
    ) => {
      guard(e.sender);
      if (g !== generation || !session) throw Error('CONNECTION_LOST');
      try {
        return { result: await session.request(method, params, options) };
      } catch (error) {
        const x = error as { code?: string; message?: string; category?: string };
        return {
          error: {
            code: x.code ?? x.message ?? 'INTERNAL_ERROR',
            category: x.category ?? 'INTERNAL',
          },
        };
      }
    },
  );
  ipcMain.handle('p1:close', async (e) => {
    guard(e.sender);
    ++generation;
    await close();
  });
  ipcMain.handle('remote:listNodes', (e) => { guard(e.sender); return nodeLedger.list(); });
  // W09:本机若以 REMOTE_CORE opt-in 启动了网关,GUI 读取其信息以展示控制台地址。
  ipcMain.handle('remote:hostInfo', (e) => {
    guard(e.sender);
    try {
      return JSON.parse(
        readFileSync(resolve(app.getPath('userData'), 'core', 'remote-gateway.json'), 'utf8'),
      ) as {
        enabled: boolean;
        host: string;
        port: number;
      };
    } catch {
      return { enabled: false };
    }
  });
  ipcMain.handle('remote:pair', async (e, input: { name: string; url: string; challenge: string }) => {
    guard(e.sender);
    const res = await fetch(input.url.replace(/\/$/, '') + '/pair', { method: 'POST', body: JSON.stringify({ challenge: input.challenge }) });
    const body = await res.json().catch(() => null) as { deviceId?: string; token?: string; kind?: string; displayName?: string; scope?: string[]; canRequestController?: boolean; error?: string } | null;
    if (!res.ok || !body?.token || !body.deviceId) throw Error(body?.error ?? 'REMOTE_PAIR_FAILED');
    return nodeLedger.add({ name: input.name, url: input.url, deviceId: body.deviceId, token: body.token });
  });
  ipcMain.handle('remote:removeNode', (e, nodeId: string) => { guard(e.sender); nodeLedger.remove(nodeId); return {}; });
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: resolve(dir, 'p1-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) void close();
  });
  win.webContents.on('render-process-gone', () => {
    void close();
  });
  win.loadFile(resolve(dir, 'workbench.html'), { query: { mode } });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    void close();
  });
});
app.on('window-all-closed', () => app.quit());
