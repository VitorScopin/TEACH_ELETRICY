const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('teachElectrify', {
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },
  plc: {
    connect: (config) => ipcRenderer.invoke('plc:connect', config),
    disconnect: () => ipcRenderer.invoke('plc:disconnect'),
    readTraffic: () => ipcRenderer.invoke('plc:read-traffic'),
    updateOpcTags: (opcTags) => ipcRenderer.invoke('plc:update-opc-tags', opcTags),
    testOpcNode: (nodeId) => ipcRenderer.invoke('plc:test-opc-node', nodeId),
    testOpcDaTag: (signalId, lightKey) => ipcRenderer.invoke('plc:test-opc-da-tag', signalId, lightKey),
    status: () => ipcRenderer.invoke('plc:status'),
  },
})
