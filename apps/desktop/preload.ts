import type { CoreTransport, RequestOptions } from '../../packages/client-transport/index.ts';
import type { ConnectionState, Event, LeaseVM } from '../../packages/client-contract/generated.ts';
import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('router', {
  createRole: (input: unknown) => ipcRenderer.invoke('router:createRole', input),
  setRoleStatus: (id: string, status: string) =>
    ipcRenderer.invoke('router:setRoleStatus', { id, status }),
  renameRole: (id: string, name: string) => ipcRenderer.invoke('router:renameRole', { id, name }),
  snapshot: () => ipcRenderer.invoke('router:snapshot'),
  chooseDirectory: () => ipcRenderer.invoke('router:chooseDirectory'),
  createProject: (name: string, path: string) =>
    ipcRenderer.invoke('router:createProject', { name, path }),
  archiveProject: (id: string) => ipcRenderer.invoke('router:archiveProject', id),
});

// 新 UI 只使用此 C1 入口；旧 router 保留到 W11/W17 迁移，不改变 Renderer 文件。
let c1State: ConnectionState = 'DISCONNECTED';
let expires = 0;
let generation = 0;
const handlers = new Set<(event: Event) => void>();
ipcRenderer.on('c1:event', (_event, event: Event) => {
  for (const handler of handlers) handler(event);
});
const client: CoreTransport = {
  async connect(options) {
    const sessionGeneration = ++generation;
    c1State = 'CONNECTING';
    let hello;
    try {
      hello = await ipcRenderer.invoke('c1:connect', options);
    } catch (error) {
      c1State = 'DISCONNECTED';
      throw error;
    }
    c1State = hello.connectionState;
    return {
      hello,
      async request(method, params, options: RequestOptions = {}) {
        if (sessionGeneration !== generation || c1State === 'DISCONNECTED')
          throw Error('CONNECTION_LOST');
        if (options.signal?.aborted) throw Error('REQUEST_CANCELLED');
        const { signal, ...serializable } = options;
        const reply = await ipcRenderer.invoke('c1:request', method, params, serializable);
        if (reply.error) throw Object.assign(new Error(reply.error.code), reply.error);
        if (method === 'control.acquire' || method === 'control.renew') {
          expires = (reply.result as LeaseVM).expiresAtMs;
          c1State = 'CONNECTED_CONTROLLER';
        }
        if (method === 'control.release') c1State = 'CONNECTED_OBSERVER';
        return reply.result;
      },
      subscribe(handler) {
        handlers.add(handler);
        return () => {
          handlers.delete(handler);
        };
      },
      connectionState() {
        if (c1State === 'CONNECTED_CONTROLLER' && Date.now() >= expires)
          c1State = 'CONNECTED_OBSERVER';
        return c1State;
      },
    };
  },
  async close() {
    await ipcRenderer.invoke('c1:close');
    ++generation;
    handlers.clear();
    c1State = 'DISCONNECTED';
  },
};
contextBridge.exposeInMainWorld('agentrouterClient', client);
