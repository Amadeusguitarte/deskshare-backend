const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onLog: (callback) => ipcRenderer.on('log-update', (event, value) => callback(value)),
    onStatus: (callback) => ipcRenderer.on('status-update', (event, value) => callback(value))
});
