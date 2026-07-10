import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: (options: unknown) => ipcRenderer.invoke('dialog:selectFile', options),
  selectFiles: (options: unknown) => ipcRenderer.invoke('dialog:selectFiles', options),
  selectFolder: (options: unknown) => ipcRenderer.invoke('dialog:selectFolder', options),
  detectJianyingAudioDir: () => ipcRenderer.invoke('jianying:detectAudioDir'),
  saveFile: (options: unknown) => ipcRenderer.invoke('dialog:saveFile', options),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  publisherLogin: (accountId: number) => ipcRenderer.invoke('publisher:login', accountId)
})
