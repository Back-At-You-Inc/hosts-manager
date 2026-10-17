import { contextBridge, ipcRenderer } from 'electron';
import type { HostsApi, StateUpdate, UpdateStatus, UpdateDownloadProgress } from '../shared/types';
const api: HostsApi = {
  load: () => ipcRenderer.invoke('load'),
  readSystem: () => ipcRenderer.invoke('read-system'),
  saveSystem: (content, expected) => ipcRenderer.invoke('save-system', content, expected),
  save: state => ipcRenderer.invoke('save', state),
  apply: state => ipcRenderer.invoke('apply', state),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  openUpdate: () => ipcRenderer.invoke('open-update'),
  onUpdateDownload: callback => {
    const listener = (_event: Electron.IpcRendererEvent, data: UpdateDownloadProgress) => callback(data);
    ipcRenderer.on('update-download', listener);
    return () => ipcRenderer.removeListener('update-download', listener);
  },
  onUpdateAvailable: callback => {
    const listener = (_event: Electron.IpcRendererEvent, data: UpdateStatus) => callback(data);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  onUpdate: callback => {
    const listener = (_event: Electron.IpcRendererEvent, data: StateUpdate) => callback(data);
    ipcRenderer.on('state-update', listener);
    return () => ipcRenderer.removeListener('state-update', listener);
  }
};
contextBridge.exposeInMainWorld('hosts', api);
