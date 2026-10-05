const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const nodes7 = require('nodes7')

let plc = null
let plcConnected = false
let activeConfig = null

const SIGNAL_IDS = ['west', 'east', 'north', 'south']
const LIGHT_KEYS = ['red', 'yellow', 'green']

function createWindow() {
  const win = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#071018',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function closePlc() {
  return new Promise((resolve) => {
    if (!plc) {
      plcConnected = false
      activeConfig = null
      resolve()
      return
    }

    try {
      plc.dropConnection(() => {
        plc = null
        plcConnected = false
        activeConfig = null
        resolve()
      })
    } catch {
      plc = null
      plcConnected = false
      activeConfig = null
      resolve()
    }
  })
}

ipcMain.handle('plc:connect', async (_event, config) => {
  await closePlc()

  const connection = new nodes7()
  const defaults = {
    west: { red: 'M0.0', yellow: 'M0.1', green: 'M0.2' },
    east: { red: 'M0.3', yellow: 'M0.4', green: 'M0.5' },
    north: { red: 'M0.6', yellow: 'M0.7', green: 'M1.0' },
    south: { red: 'M1.1', yellow: 'M1.2', green: 'M1.3' },
  }

  const tags = {}
  const aliases = []

  for (const signalId of SIGNAL_IDS) {
    tags[signalId] = {}
    for (const lightKey of LIGHT_KEYS) {
      const alias = `${signalId}_${lightKey}`
      tags[signalId][lightKey] = config.tags?.[signalId]?.[lightKey] || defaults[signalId][lightKey]
      aliases.push(alias)
    }
  }

  return new Promise((resolve) => {
    connection.initiateConnection(
      {
        host: config.host,
        port: 102,
        rack: Number(config.rack ?? 0),
        slot: Number(config.slot ?? 1),
        timeout: 3000,
      },
      (err) => {
        if (err) {
          plcConnected = false
          resolve({ ok: false, message: String(err) })
          return
        }

        connection.setTranslationCB((alias) => {
          const [signalId, lightKey] = alias.split('_')
          return tags[signalId]?.[lightKey]
        })
        connection.addItems(aliases)

        plc = connection
        plcConnected = true
        activeConfig = { ...config, tags }
        resolve({ ok: true, message: 'PLC conectado', config: activeConfig })
      },
    )
  })
})

ipcMain.handle('plc:disconnect', async () => {
  await closePlc()
  return { ok: true }
})

ipcMain.handle('plc:status', () => ({
  connected: plcConnected,
  config: activeConfig,
}))

ipcMain.handle('plc:read-traffic', async () => {
  if (!plc || !plcConnected) {
    return { ok: false, message: 'PLC desconectado' }
  }

  return new Promise((resolve) => {
    plc.readAllItems((badQuality, values) => {
      if (badQuality) {
        resolve({ ok: false, message: 'Leitura com qualidade inválida', values })
        return
      }

      const signals = {}
      for (const signalId of SIGNAL_IDS) {
        signals[signalId] = {
          red: Boolean(values[`${signalId}_red`]),
          yellow: Boolean(values[`${signalId}_yellow`]),
          green: Boolean(values[`${signalId}_green`]),
        }
      }

      resolve({
        ok: true,
        values: signals,
        at: Date.now(),
      })
    })
  })
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await closePlc()
  if (process.platform !== 'darwin') app.quit()
})
