'use strict';
// Minimal, explicit bridge: the web UI gets these functions and nothing else.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('airspaceDesktop', {
  isDesktop: true,
  fetchFaaSchedules: (names) => ipcRenderer.invoke('faa:fetch', names),
  getFaaDiagnostics: () => ipcRenderer.invoke('faa:diagnostics'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveCredentials: (user, pwd) => ipcRenderer.invoke('settings:save-credentials', { user, pwd }),
  clearCredentials: () => ipcRenderer.invoke('settings:clear-credentials'),
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),
  showDebugFolder: () => ipcRenderer.invoke('app:show-debug'),
});
