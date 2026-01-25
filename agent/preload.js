const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onLog: (callback) => ipcRenderer.on('log-update', (event, value) => callback(value)),
    onStatus: (callback) => ipcRenderer.on('status-update', (event, value) => callback(value)),
    openUrl: (url) => ipcRenderer.send('open-url', url),
    openDataFolder: () => ipcRenderer.send('open-data-folder'),
    retryVNC: () => ipcRenderer.send('retry-vnc')
});
