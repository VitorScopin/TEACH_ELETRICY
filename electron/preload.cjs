const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('teachElectrify', {
  plc: {
    connect: (config) => ipcRenderer.invoke('plc:connect', config),
    disconnect: () => ipcRenderer.invoke('plc:disconnect'),
    readTraffic: () => ipcRenderer.invoke('plc:read-traffic'),
    updateOpcTags: (opcTags) => ipcRenderer.invoke('plc:update-opc-tags', opcTags),
    testOpcNode: (nodeId) => ipcRenderer.invoke('plc:test-opc-node', nodeId),
    status: () => ipcRenderer.invoke('plc:status'),
  },
})
