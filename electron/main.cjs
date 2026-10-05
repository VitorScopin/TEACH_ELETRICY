const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const nodes7 = require('nodes7')
const {
  OPCUAClient,
  AttributeIds,
  MessageSecurityMode,
  SecurityPolicy,
  UserTokenType,
} = require('node-opcua')

let plc = null
let opcClient = null
let opcSession = null
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

async function closePlc() {
  if (opcSession) {
    try {
      await opcSession.close()
    } catch {}
    opcSession = null
  }

  if (opcClient) {
    try {
      await opcClient.disconnect()
    } catch {}
    opcClient = null
  }

  if (plc) {
    await new Promise((resolve) => {
      try {
        plc.dropConnection(() => resolve())
      } catch {
        resolve()
      }
    })
    plc = null
  }

  plcConnected = false
  activeConfig = null
}

function defaultS7Tags() {
  return {
    west: { red: 'M0.0', yellow: 'M0.1', green: 'M0.2' },
    east: { red: 'M0.3', yellow: 'M0.4', green: 'M0.5' },
    north: { red: 'M0.6', yellow: 'M0.7', green: 'M1.0' },
    south: { red: 'M1.1', yellow: 'M1.2', green: 'M1.3' },
  }
}

function normalizeTags(source, fallback) {
  const result = {}
  for (const signalId of SIGNAL_IDS) {
    result[signalId] = {}
    for (const lightKey of LIGHT_KEYS) {
      result[signalId][lightKey] =
        source?.[signalId]?.[lightKey] || fallback?.[signalId]?.[lightKey] || ''
    }
  }
  return result
}

async function connectOpcUa(config) {
  const endpoint = config.opcEndpoint || `opc.tcp://${config.host || '192.168.15.1'}:4840`
  const securityMode =
    MessageSecurityMode[config.opcSecurityMode] ?? MessageSecurityMode.None
  const securityPolicy =
    SecurityPolicy[config.opcSecurityPolicy] ?? SecurityPolicy.None

  opcClient = OPCUAClient.create({
    applicationName: 'TEACH ELETRICY',
    endpointMustExist: false,
    securityMode,
    securityPolicy,
    connectionStrategy: {
      initialDelay: 250,
      maxDelay: 1000,
      maxRetry: 1,
    },
    keepSessionAlive: true,
  })

  await opcClient.connect(endpoint)

  if (config.opcUsername?.trim()) {
    opcSession = await opcClient.createSession({
      type: UserTokenType.UserName,
      userName: config.opcUsername.trim(),
      password: config.opcPassword || '',
    })
  } else {
    opcSession = await opcClient.createSession()
  }

  activeConfig = {
    ...config,
    protocol: 'opcua',
    opcEndpoint: endpoint,
    opcTags: normalizeTags(config.opcTags, {}),
  }
  plcConnected = true

  return {
    ok: true,
    message: `Altus OPC UA conectado em ${endpoint}`,
    config: activeConfig,
  }
}

async function connectS7(config) {
  const connection = new nodes7()
  const tags = normalizeTags(config.tags, defaultS7Tags())
  const aliases = []

  for (const signalId of SIGNAL_IDS) {
    for (const lightKey of LIGHT_KEYS) {
      aliases.push(`${signalId}_${lightKey}`)
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
        activeConfig = { ...config, protocol: 's7', tags }
        resolve({ ok: true, message: 'Siemens S7 conectado', config: activeConfig })
      },
    )
  })
}

ipcMain.handle('plc:connect', async (_event, config) => {
  await closePlc()

  try {
    if (config.protocol === 'opcua') {
      return await connectOpcUa(config)
    }
    return await connectS7(config)
  } catch (error) {
    await closePlc()
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
})

ipcMain.handle('plc:disconnect', async () => {
  await closePlc()
  return { ok: true }
})

ipcMain.handle('plc:status', () => ({
  connected: plcConnected,
  config: activeConfig,
}))

async function readOpcTraffic() {
  const tags = activeConfig?.opcTags
  if (!opcSession || !tags) {
    return { ok: false, message: 'Sessão OPC UA indisponível' }
  }

  const descriptors = []
  for (const signalId of SIGNAL_IDS) {
    for (const lightKey of LIGHT_KEYS) {
      const nodeId = tags[signalId]?.[lightKey]
      if (!nodeId) {
        return {
          ok: false,
          message: `NodeId OPC UA não configurado: ${signalId} / ${lightKey}`,
        }
      }
      descriptors.push({ signalId, lightKey, nodeId })
    }
  }

  const values = await opcSession.read(
    descriptors.map(({ nodeId }) => ({
      nodeId,
      attributeId: AttributeIds.Value,
    })),
    0,
  )

  const signals = {}
  for (const signalId of SIGNAL_IDS) {
    signals[signalId] = { red: false, yellow: false, green: false }
  }

  values.forEach((dataValue, index) => {
    const descriptor = descriptors[index]
    if (!dataValue?.statusCode?.isGood()) {
      throw new Error(
        `Qualidade OPC inválida em ${descriptor.nodeId}: ${dataValue?.statusCode?.toString()}`,
      )
    }
    signals[descriptor.signalId][descriptor.lightKey] = Boolean(dataValue.value?.value)
  })

  return { ok: true, values: signals, at: Date.now(), protocol: 'opcua' }
}

function readS7Traffic() {
  return new Promise((resolve) => {
    plc.readAllItems((badQuality, values) => {
      if (badQuality) {
        resolve({ ok: false, message: 'Leitura S7 com qualidade inválida', values })
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

      resolve({ ok: true, values: signals, at: Date.now(), protocol: 's7' })
    })
  })
}

ipcMain.handle('plc:read-traffic', async () => {
  if (!plcConnected || !activeConfig) {
    return { ok: false, message: 'PLC desconectado' }
  }

  try {
    return activeConfig.protocol === 'opcua'
      ? await readOpcTraffic()
      : await readS7Traffic()
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
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
