const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lorenzAPI', {
  saveSettings: (settings) => ipcRenderer.invoke('lorenz:save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('lorenz:load-settings'),
  exportSessionAsWav: (arrayBuffer) => ipcRenderer.invoke('lorenz:export-wav', arrayBuffer),
  getAppVersion: () => ipcRenderer.invoke('lorenz:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('lorenz:check-updates'),
  restartAndUpdate: () => ipcRenderer.invoke('lorenz:restart-and-update'),
  
  onMenuAction: (callback) => {
    const subscription = (event, action) => callback(action);
    ipcRenderer.on('lorenz:menu-action', subscription);
    return () => {
      ipcRenderer.removeListener('lorenz:menu-action', subscription);
    };
  },
  
  onUpdateStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('lorenz:update-status', subscription);
    return () => {
      ipcRenderer.removeListener('lorenz:update-status', subscription);
    };
  }
});
