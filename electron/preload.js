// Ponte segura entre a interface (React) e o backend (Electron main).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  cli: {
    run: (args, opts) => ipcRenderer.invoke('cli:run', { args, ...(opts || {}) })
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (obj) => ipcRenderer.invoke('config:save', obj)
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder')
  },
  shell: {
    openPath: (p) => ipcRenderer.invoke('shell:openPath', p)
  },
  mule: {
    apps: (creds) => ipcRenderer.invoke('mule:apps', creds),
    spec: (creds, appId) => ipcRenderer.invoke('mule:spec', { creds, appId }),
    configurarLog: (params) => ipcRenderer.invoke('mule:configurarLog', params),
    reverterLog: (params) => ipcRenderer.invoke('mule:reverterLog', params),
    readLog: (params) => ipcRenderer.invoke('mule:readLog', params),
    clearLog: (caminho) => ipcRenderer.invoke('mule:clearLog', caminho)
  },
  logs: {
    fetch: (creds, appId, spec) => ipcRenderer.invoke('logs:fetch', { creds, appId, spec })
  },
  automacao: {
    run: (params) => ipcRenderer.invoke('automacao:run', params),
    cancel: () => ipcRenderer.send('automacao:cancel'),
    onProgress: (cb) => {
      const h = (_e, d) => cb(d)
      ipcRenderer.on('automacao:progress', h)
      return () => ipcRenderer.removeListener('automacao:progress', h)
    }
  },
  rede: {
    listarPortas: () => ipcRenderer.invoke('rede:listarPortas'),
    fecharPorta: (porta) => ipcRenderer.invoke('rede:fecharPorta', porta)
  },
  relatorio: {
    ler: (caminho) => ipcRenderer.invoke('relatorio:ler', caminho)
  },
  fs: {
    deleteFile: (arquivo) => ipcRenderer.invoke('fs:deleteFile', arquivo),
    cleanFolder: (pasta) => ipcRenderer.invoke('fs:cleanFolder', pasta)
  }
})
