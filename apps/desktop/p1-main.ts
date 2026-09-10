import { app, BrowserWindow, ipcMain } from 'electron';
import { connectLocalCore } from './local-core-launcher.ts';
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
const mode = process.env.AGENTROUTER_MODE;
if (mode !== 'PREVIEW_MOCK' && mode !== 'LOCAL_CORE') throw Error('EXPLICIT_BACKEND_MODE_REQUIRED');
let win: BrowserWindow,
  transport: ClientTransport | undefined,
  session: ClientSession | undefined,
  generation = 0,
  unsubscribe: (() => void) | undefined;
const mock = mode === 'PREVIEW_MOCK' ? new MockP1Server() : undefined;
async function close() {
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
  ipcMain.handle('p1:connect', async (e, options: ConnectOptions, g: number) => {
    guard(e.sender);
    await close();
    if (options.mode && options.mode !== mode) throw Error('BACKEND_MODE_MISMATCH');
    generation = g;
    if (mock) {
      transport = new P1MemoryTransport(mock);
      session = await transport.connect(options);
    } else {
      const connected = await connectLocalCore(
        resolve(app.getPath('userData'), 'core'),
        dir,
        options,
      );
      transport = connected.transport;
      session = connected.session;
    }
    unsubscribe = session.subscribe((event) => {
      if (!e.sender.isDestroyed()) e.sender.send('p1:event', { generation: g, event });
    });
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
  win.webContents.on('did-start-navigation', () => {
    void close();
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
