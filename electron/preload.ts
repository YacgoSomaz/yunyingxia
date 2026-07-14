import { contextBridge, ipcRenderer } from 'electron'

function onUpdate(channel: string, listener: (payload: unknown) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (options: unknown) => ipcRenderer.invoke('dialog:selectFile', options),
  selectFiles: (options: unknown) => ipcRenderer.invoke('dialog:selectFiles', options),
  selectFolder: (options: unknown) => ipcRenderer.invoke('dialog:selectFolder', options),
  detectJianyingAudioDir: () => ipcRenderer.invoke('jianying:detectAudioDir'),
  saveFile: (options: unknown) => ipcRenderer.invoke('dialog:saveFile', options),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  publisherLogin: (accountId: number) => ipcRenderer.invoke('publisher:login', accountId),
  account: {
    me: () => ipcRenderer.invoke('account:me'),
    plans: () => ipcRenderer.invoke('account:plans'),
    sendCode: (phone: string) => ipcRenderer.invoke('account:sendCode', phone),
    login: (phone: string, code: string) => ipcRenderer.invoke('account:login', phone, code),
    logout: () => ipcRenderer.invoke('account:logout'),
    openRechargePortal: () => ipcRenderer.invoke('account:openRechargePortal'),
  },
  update: {
    checkNow: () => ipcRenderer.invoke('update:check'),
    installNow: () => ipcRenderer.invoke('update:install'),
    onChecking: (listener: (payload: unknown) => void) => onUpdate('update:checking', listener),
    onAvailable: (listener: (payload: unknown) => void) => onUpdate('update:available', listener),
    onNotAvailable: (listener: (payload: unknown) => void) => onUpdate('update:not-available', listener),
    onProgress: (listener: (payload: unknown) => void) => onUpdate('update:progress', listener),
    onDownloaded: (listener: (payload: unknown) => void) => onUpdate('update:downloaded', listener),
    onError: (listener: (payload: unknown) => void) => onUpdate('update:error', listener)
  }
})
