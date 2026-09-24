import { installC1Preview } from './c1-preview.ts';
import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { JsonLfDecoder } from '../../packages/platform/framing.ts';
const dir = dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow | null = null,
  tray: Tray | null = null,
  child: ChildProcessWithoutNullStreams;
let quitting = false,
  sequence = 0;
if (process.env.AGENTROUTER_SOFTWARE_RENDERING === '1') app.disableHardwareAcceleration();
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
>();
function rpc(method: string, params: unknown = {}) {
  return new Promise<any>((res, rej) => {
    const request = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(request);
      rej(Error('CORE_TIMEOUT'));
    }, 10000);
    pending.set(request, { resolve: res, reject: rej, timer });
    child.stdin.write(JSON.stringify({ id: request, method, params }) + '\n');
  });
}
function window() {
  if (win && !win.isDestroyed()) {
    win.show();
    return;
  }
  win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: '#10151d',
    webPreferences: {
      preload: resolve(dir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.loadFile(resolve(dir, 'index.html'));
  win.once('ready-to-show', () => win?.show());
  win.on('close', async (e) => {
    if (quitting) return;
    e.preventDefault();
    const answer = await dialog.showMessageBox(win!, {
      type: 'question',
      message: '关闭窗口后的操作',
      buttons: ['后台继续', '停止并退出', '取消'],
      defaultId: 2,
      cancelId: 2,
    });
    if (answer.response === 0) win?.hide();
    if (answer.response === 1) await stop();
  });
}
async function stop() {
  if (quitting) return;
  quitting = true;
  try {
    await rpc('shutdown');
  } catch {}
  child?.kill();
  tray?.destroy();
  app.quit();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => window());
  app.whenReady().then(() => {
    installC1Preview(process.env.AGENTROUTER_C1_MOCK === '1');
    const data = process.env.AGENTROUTER_DATA ?? app.getPath('userData');
    const runtime = resolve(dir, '../runtime/node.exe');
    child = spawn(runtime, [resolve(dir, 'core.mjs')], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        AGENTROUTER_DATA: data,
      },
    });
    const decoder = new JsonLfDecoder();
    child.stdout.on('data', (b) => {
      try {
        for (const msg of decoder.push(b)) {
          const waiter = pending.get(msg.id);
          if (!waiter) continue;
          pending.delete(msg.id);
          clearTimeout(waiter.timer);
          if (msg.error) waiter.reject(Error(msg.error.code));
          else waiter.resolve(msg.result);
        }
      } catch {
        child.kill();
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => {});
    child.on('close', () => {
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(Error('CORE_DISCONNECTED'));
      }
      pending.clear();
    });
    const approved = new Set<string>();
    ipcMain.handle('router:snapshot', () => rpc('snapshot'));
    ipcMain.handle('router:createRole', (_, input) => rpc('createRole', input));
    ipcMain.handle('router:setRoleStatus', (_, input) => rpc('setRoleStatus', input));
    ipcMain.handle('router:renameRole', (_, input) => rpc('renameRole', input));
    ipcMain.handle('router:chooseDirectory', async () => {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (r.canceled) return null;
      approved.add(r.filePaths[0]);
      return r.filePaths[0];
    });
    ipcMain.handle('router:createProject', (_, input) => {
      if (!input || !approved.has(input.path)) throw Error('DIRECTORY_NOT_AUTHORIZED');
      return rpc('createProject', input);
    });
    ipcMain.handle('router:archiveProject', (_, id) => {
      if (typeof id !== 'string') throw Error('INVALID_PROJECT');
      return rpc('archiveProject', { id });
    });
    const icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    );
    tray = new Tray(icon);
    tray.setToolTip('AgentRouter');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开 AgentRouter', click: window },
        { label: '停止并退出', click: () => void stop() },
      ]),
    );
    tray.on('double-click', window);
    window();
    if (process.env.AGENTROUTER_SMOKE_REPORT) {
      const reportPath = process.env.AGENTROUTER_SMOKE_REPORT;
      win!.webContents.once('did-finish-load', async () => {
        try {
          const snapshot = await rpc('snapshot');
          await new Promise((r) => setTimeout(r, 1000));
          const renderer = await win!.webContents.executeJavaScript(
            '({node:typeof window.require,text:document.body.innerText})',
          );
          if (renderer.node !== 'undefined' || !renderer.text.includes('Core 已连接'))
            throw Error('RENDERER_ASSERTION');
          const image = await win!.webContents.capturePage();
          writeFileSync(reportPath + '.png', image.toPNG());
          writeFileSync(
            reportPath,
            JSON.stringify(
              {
                at: new Date().toISOString(),
                status: 'PASS',
                exit_code: 0,
                scope: 'Electron 自检，不替代 Playwright 完整 E2E',
                runtime: snapshot.runtime,
                rendererNodeDisabled: true,
                softwareRendering: process.env.AGENTROUTER_SOFTWARE_RENDERING === '1',
              },
              null,
              2,
            ),
          );
        } catch (e) {
          writeFileSync(
            reportPath,
            JSON.stringify({ status: 'FAIL', code: 'CHECK_FAILED', redacted: true, exit_code: 1 }),
          );
        } finally {
          await stop();
        }
      });
    }
  });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    quitting = true;
    child?.stdin.end();
  });
}
