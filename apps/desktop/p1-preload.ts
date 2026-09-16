import { contextBridge, ipcRenderer } from 'electron';
import type {
  ClientTransport,
  ClientSession,
  RequestOptions,
} from '../../packages/client-transport/p1/types.ts';
import type {
  Event,
  ConnectionState,
  LeaseVM,
} from '../../packages/client-contract/c1r1p1/generated.ts';
let generation = 0,
  state: ConnectionState = 'DISCONNECTED',
  expires = 0,
  activeNodeId: string | undefined; // REMOTE_CORE:选定的已配对节点 id(token 只在 Main,renderer 不经手)
const handlers = new Set<(event: Event) => void>();
ipcRenderer.on('p1:event', (_e, envelope: { generation: number; event: Event }) => {
  if (envelope.generation !== generation) return;
  for (const h of handlers) h(envelope.event);
});
const client: ClientTransport = {
  async connect(options) {
    handlers.clear();
    const current = ++generation;
    state = 'CONNECTING';
    try {
      const hello = await ipcRenderer.invoke('p1:connect', options, current, activeNodeId);
      if (generation !== current) throw Error('CONNECTION_LOST');
      state = hello.connectionState;
      return {
        hello,
        async request(method, params, opts: RequestOptions = {}) {
          if (generation !== current || state === 'DISCONNECTED') throw Error('CONNECTION_LOST');
          if (opts.signal?.aborted) throw Error('REQUEST_CANCELLED');
          const { signal, ...serializable } = opts;
          const reply = await ipcRenderer.invoke(
            'p1:request',
            current,
            method,
            params,
            serializable,
          );
          if (reply.error) {
            if (['CONNECTION_LOST', 'CORE_CONNECT_TIMEOUT'].includes(reply.error.code)) {
              state = 'DISCONNECTED';
              expires = 0;
            }
            throw Object.assign(new Error(reply.error.code), reply.error);
          }
          if (method === 'control.acquire' || method === 'control.renew') {
            expires = (reply.result as LeaseVM).expiresAtMs;
            state = 'CONNECTED_CONTROLLER';
          }
          if (method === 'control.release') state = 'CONNECTED_OBSERVER';
          return reply.result;
        },
        subscribe(fn) {
          handlers.add(fn);
          return () => {
            handlers.delete(fn);
          };
        },
        connectionState() {
          if (state === 'CONNECTED_CONTROLLER' && expires <= Date.now())
            state = 'CONNECTED_OBSERVER';
          return state;
        },
      } as ClientSession;
    } catch (e) {
      if (generation === current) state = 'DISCONNECTED';
      throw e;
    }
  },
  async close() {
    ++generation;
    handlers.clear();
    state = 'DISCONNECTED';
    expires = 0;
    await ipcRenderer.invoke('p1:close');
  },
};
contextBridge.exposeInMainWorld('agentrouterClient', client);
contextBridge.exposeInMainWorld('agentrouterDesktop', {
  getContext: () => ipcRenderer.invoke('desktop:context'),
  chooseProjectDirectory: () => ipcRenderer.invoke('desktop:choose-project-directory'),
  saveArtifact: (id: string) => ipcRenderer.invoke('desktop:save-artifact', id),
  // K10:远程节点登记/选择/token 只在 Main(safeStorage),renderer 仅拿脱敏节点元数据与选择权。
  listNodes: () => ipcRenderer.invoke('remote:listNodes'),
  // W09:本机远程网关信息(启用时供"添加远程设备/手机配对"面板展示)。
  hostInfo: () => ipcRenderer.invoke('remote:hostInfo'),
  pairNode: (input: { name: string; url: string; challenge: string }) => ipcRenderer.invoke('remote:pair', input),
  removeNode: (nodeId: string) => ipcRenderer.invoke('remote:removeNode', nodeId),
  selectNode: (nodeId: string | undefined) => {
    activeNodeId = nodeId;
    return true;
  },
});
