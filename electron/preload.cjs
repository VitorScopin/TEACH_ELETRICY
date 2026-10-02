const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('teachElectrify', {
  plc: {
    connect: (config) => ipcRenderer.invoke('plc:connect', config),
    disconnect: () => ipcRenderer.invoke('plc:disconnect'),
    readTraffic: () => ipcRenderer.invoke('plc:read-traffic'),
    status: () => ipcRenderer.invoke('plc:status'),
  },
})
