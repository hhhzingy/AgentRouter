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
