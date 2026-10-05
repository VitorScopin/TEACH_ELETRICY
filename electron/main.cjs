const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const readline = require('node:readline')
const nodes7 = require('nodes7')
let opcUaModule = null

function getOpcUa() {
  if (!opcUaModule) {
    opcUaModule = require('node-opcua')
  }
  return opcUaModule
}

let plc = null
let opcClient = null
let opcSession = null
let opcDaBridge = null
let opcDaReader = null
let opcDaPending = []
let opcDaChain = Promise.resolve()
let opcDaStderr = ''
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
    frame: false,
    titleBarStyle: 'hidden',
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

ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
  return { ok: true }
})

ipcMain.handle('window:toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false, maximized: false }

  if (win.isMaximized()) win.unmaximize()
  else win.maximize()

  return { ok: true, maximized: win.isMaximized() }
})

ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
  return { ok: true }
})

ipcMain.handle('window:is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return { maximized: Boolean(win?.isMaximized()) }
})


function buildOpcDaPrefix(config) {
  return [
    config.opcDaPlcName?.trim(),
    config.opcDaApplicationName?.trim(),
    config.opcDaGvlName?.trim(),
  ].filter(Boolean).join('.')
}

function resolveOpcDaAddress(config, address) {
  const value = String(address || '').trim()
  if (!value) return ''
  if (value.includes('.')) return value
  const prefix = buildOpcDaPrefix(config)
  return prefix ? `${prefix}.${value}` : value
}

function opcDaBridgeCandidates(architecture = 'auto') {
  const roots = [
    path.join(__dirname, 'opc-da-bridge'),
    path.join(process.resourcesPath || '', 'opc-da-bridge'),
    process.resourcesPath || '',
  ].filter(Boolean)

  const x86 = []
  const x64 = []
  for (const root of roots) {
    x86.push(path.join(root, 'opc-da-bridge-x86.exe'))
    x86.push(path.join(root, 'publish', 'x86', 'opc-da-bridge-x86.exe'))
    x64.push(path.join(root, 'opc-da-bridge-x64.exe'))
    x64.push(path.join(root, 'publish', 'x64', 'opc-da-bridge-x64.exe'))
  }

  const order =
    architecture === 'x86' ? [...x86, ...x64] :
    architecture === 'x64' ? [...x64, ...x86] :
    [...x64, ...x86]

  return [...new Set(order)]
}

function rejectOpcDaPending(error) {
  const pending = opcDaPending.splice(0)
  for (const item of pending) item.reject(error)
}

async function stopOpcDaBridge() {
  if (!opcDaBridge) return

  try {
    await opcDaExchange({ command: 'disconnect' })
  } catch {}

  try { opcDaReader?.close() } catch {}
  opcDaReader = null

  try { opcDaBridge.kill() } catch {}
  opcDaBridge = null
  rejectOpcDaPending(new Error('Bridge OPC DA encerrado'))
}

function startOpcDaBridge(executable) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let settled = false
    opcDaStderr = ''

    child.once('error', (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
      rejectOpcDaPending(error)
    })

    child.once('spawn', () => {
      opcDaBridge = child
      opcDaReader = readline.createInterface({ input: child.stdout })

      opcDaReader.on('line', (line) => {
        const next = opcDaPending.shift()
        if (!next) return

        try {
          const response = JSON.parse(line)
          if (response?.ok) next.resolve(response.result)
          else next.reject(new Error(response?.error || 'Erro OPC DA desconhecido'))
        } catch (error) {
          next.reject(error)
        }
      })

      child.stderr.on('data', (chunk) => {
        opcDaStderr = (opcDaStderr + chunk.toString()).slice(-6000)
      })

      child.once('exit', (code) => {
        const message = opcDaStderr.trim() || `Bridge OPC DA encerrado (código ${code ?? 'desconhecido'})`
        opcDaBridge = null
        try { opcDaReader?.close() } catch {}
        opcDaReader = null
        rejectOpcDaPending(new Error(message))
      })

      if (!settled) {
        settled = true
        resolve()
      }
    })
  })
}

function opcDaExchange(request) {
  const run = opcDaChain.catch(() => undefined).then(() => new Promise((resolve, reject) => {
    if (!opcDaBridge?.stdin?.writable) {
      reject(new Error('Bridge OPC DA não está disponível'))
      return
    }

    const timer = setTimeout(() => {
      const index = opcDaPending.findIndex((item) => item.resolve === wrappedResolve)
      if (index >= 0) opcDaPending.splice(index, 1)
      reject(new Error('Timeout na comunicação com a bridge OPC DA'))
    }, 5000)

    const wrappedResolve = (value) => {
      clearTimeout(timer)
      resolve(value)
    }
    const wrappedReject = (error) => {
      clearTimeout(timer)
      reject(error)
    }

    opcDaPending.push({ resolve: wrappedResolve, reject: wrappedReject })
    opcDaBridge.stdin.write(`${JSON.stringify(request)}\n`)
  }))

  opcDaChain = run
  return run
}

async function connectOpcDa(config) {
  const tags = normalizeTags(config.opcDaTags, {})
  const mapped = []
  const fullTags = []

  for (const signalId of SIGNAL_IDS) {
    for (const lightKey of LIGHT_KEYS) {
      const rawAddress = tags[signalId]?.[lightKey]
      const fullAddress = resolveOpcDaAddress(config, rawAddress)
      if (!fullAddress) continue

      mapped.push({ signalId, lightKey, tag: fullAddress })
      fullTags.push(fullAddress)
    }
  }

  if (!fullTags.length) {
    throw new Error('Configure pelo menos uma tag OPC DA para iniciar o monitoramento.')
  }

  const candidates = opcDaBridgeCandidates(config.opcDaArchitecture)
  const available = candidates.filter((candidate) => fs.existsSync(candidate))
  if (!available.length) {
    throw new Error(
      'Bridge OPC DA não encontrada. Execute electron\\opc-da-bridge\\build-opc-da-bridge.bat antes de conectar.'
    )
  }

  const errors = []
  for (const executable of available) {
    try {
      await stopOpcDaBridge()
      await startOpcDaBridge(executable)
      const result = await opcDaExchange({
        command: 'connect',
        progId: config.opcDaProgId || 'CoDeSys.OPC.DA',
        host: config.opcDaHost || '',
        tags: fullTags,
        timeout: Number(config.opcDaTimeout || 3000),
      })

      activeConfig = {
        ...config,
        protocol: 'opcda',
        opcDaTags: tags,
        opcDaMapped: mapped,
      }
      plcConnected = true

      return {
        ok: true,
        message: `Altus OPC DA conectado via ${result?.architecture || 'bridge'} • ${mapped.length} tag(s)`,
        mapped,
        config: activeConfig,
      }
    } catch (error) {
      errors.push(`${path.basename(executable)}: ${error instanceof Error ? error.message : String(error)}`)
      try { await stopOpcDaBridge() } catch {}
    }
  }

  throw new Error(`Nenhuma bridge OPC DA conseguiu conectar. ${errors.join(' | ')}`)
}

async function readOpcDaTraffic() {
  const descriptors = activeConfig?.opcDaMapped || []
  if (!opcDaBridge) {
    return { ok: false, message: 'OPC DA desconectado' }
  }
  if (!descriptors.length) {
    return { ok: false, message: 'Nenhuma tag OPC DA está mapeada' }
  }

  const results = await opcDaExchange({
    command: 'read',
    tags: descriptors.map((item) => item.tag),
  })

  const signals = {}
  for (const signalId of SIGNAL_IDS) {
    signals[signalId] = { red: false, yellow: false, green: false }
  }

  results.forEach((result, index) => {
    const descriptor = descriptors[index]
    if (!result?.ok) {
      throw new Error(`Falha OPC DA em ${descriptor.tag} (code ${result?.code ?? '?'})`)
    }
    signals[descriptor.signalId][descriptor.lightKey] = Boolean(result.value)
  })

  return {
    ok: true,
    values: signals,
    mapped: descriptors.map(({ signalId, lightKey }) => ({ signalId, lightKey })),
    at: Date.now(),
    protocol: 'opcda',
  }
}

async function testOpcDaTag(config, signalId, lightKey) {
  if (!plcConnected || activeConfig?.protocol !== 'opcda' || !opcDaBridge) {
    return { ok: false, message: 'Conecte ao OPC DA antes de testar a tag' }
  }

  const descriptor = activeConfig.opcDaMapped?.find(
    (item) => item.signalId === signalId && item.lightKey === lightKey
  )
  const address = descriptor?.tag
  if (!address) return { ok: false, message: 'Essa lâmpada não está mapeada no OPC DA' }

  try {
    const result = (await opcDaExchange({ command: 'read', tags: [address] }))[0]
    if (!result?.ok) {
      return { ok: false, message: `Qualidade OPC DA inválida (code ${result?.code ?? '?'})` }
    }
    return {
      ok: true,
      value: Boolean(result.value),
      quality: result.quality,
      tag: address,
      at: Date.now(),
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

async function closePlc() {
  await stopOpcDaBridge()

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
  const {
    OPCUAClient,
    MessageSecurityMode,
    SecurityPolicy,
    UserTokenType,
  } = getOpcUa()

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
    if (config.protocol === 'opcua') return await connectOpcUa(config)
    if (config.protocol === 'opcda') return await connectOpcDa(config)
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

ipcMain.handle('plc:update-opc-tags', async (_event, opcTags) => {
  if (!plcConnected || activeConfig?.protocol !== 'opcua' || !opcSession) {
    return { ok: false, message: 'Conecte ao servidor OPC UA antes de sincronizar as tags' }
  }

  activeConfig = {
    ...activeConfig,
    opcTags: normalizeTags(opcTags, {}),
  }

  return {
    ok: true,
    message: 'Mapeamento OPC UA sincronizado com as 12 lâmpadas',
    opcTags: activeConfig.opcTags,
  }
})

ipcMain.handle('plc:test-opc-da-tag', async (_event, signalId, lightKey) => {
  return await testOpcDaTag(activeConfig, signalId, lightKey)
})

ipcMain.handle('plc:test-opc-node', async (_event, nodeId) => {
  const { AttributeIds } = getOpcUa()
  if (!plcConnected || activeConfig?.protocol !== 'opcua' || !opcSession) {
    return { ok: false, message: 'Conecte ao servidor OPC UA para testar a tag' }
  }

  if (!nodeId || typeof nodeId !== 'string') {
    return { ok: false, message: 'Informe um NodeId OPC UA válido' }
  }

  try {
    const dataValue = await opcSession.read({
      nodeId: nodeId.trim(),
      attributeId: AttributeIds.Value,
    })

    if (!dataValue?.statusCode?.isGood()) {
      return {
        ok: false,
        message: `Qualidade OPC inválida: ${dataValue?.statusCode?.toString()}`,
      }
    }

    const rawValue = dataValue.value?.value
    if (typeof rawValue !== 'boolean') {
      return {
        ok: false,
        message: `A tag precisa ser BOOL. Tipo recebido: ${typeof rawValue}`,
      }
    }

    return {
      ok: true,
      value: rawValue,
      statusCode: dataValue.statusCode.toString(),
      nodeId: nodeId.trim(),
      at: Date.now(),
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
})

async function readOpcTraffic() {
  const { AttributeIds } = getOpcUa()
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
    if (activeConfig.protocol === 'opcua') return await readOpcTraffic()
    if (activeConfig.protocol === 'opcda') return await readOpcDaTraffic()
    return await readS7Traffic()
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
