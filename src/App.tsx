import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  Cable,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Cpu,
  FlaskConical,
  FolderOpen,
  Gauge,
  GraduationCap,
  Lightbulb,
  Network,
  Pause,
  Play,
  PlugZap,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Unplug,
  Zap,
} from 'lucide-react'
import { trafficLightProject } from './projects/trafficLight'
import { getActiveLights, validateTrafficState } from './lib/trafficValidator'
import { TrafficSimulation3D } from './components/TrafficSimulation3D'
import type { IntersectionTrafficState, PlcConfig, SignalId, TrafficState } from './types'

type Mode = 'simulation' | 'plc'
type TrafficKey = 'red' | 'yellow' | 'green'
type GraphicsQuality = 'low' | 'medium' | 'high'
type HubPanel = 'connections' | 'settings' | null
type OpcTagTestState = {
  loading: boolean
  ok?: boolean
  value?: boolean
  message?: string
}

const defaultOpcTags: PlcConfig['opcTags'] = {
  west: { red: '', yellow: '', green: '' },
  east: { red: '', yellow: '', green: '' },
  north: { red: '', yellow: '', green: '' },
  south: { red: '', yellow: '', green: '' },
}

const defaultOpcDaTags: PlcConfig['opcDaTags'] = {
  west: { red: '', yellow: '', green: '' },
  east: { red: '', yellow: '', green: '' },
  north: { red: '', yellow: '', green: '' },
  south: { red: '', yellow: '', green: '' },
}

const defaultConfig: PlcConfig = {
  protocol: 's7',
  ...trafficLightProject.defaultConnection,
  tags: Object.fromEntries(
    trafficLightProject.signals.map((signal) => [
      signal.id,
      Object.fromEntries(signal.tags.map((tag) => [tag.key, tag.address])),
    ]),
  ) as PlcConfig['tags'],
  opcEndpoint: 'opc.tcp://192.168.15.1:4840',
  opcSecurityMode: 'None',
  opcSecurityPolicy: 'None',
  opcUsername: '',
  opcPassword: '',
  opcTags: defaultOpcTags,
  opcDaProgId: 'CoDeSys.OPC.DA',
  opcDaHost: '',
  opcDaArchitecture: 'auto',
  opcDaPlcName: 'PLC_GW3',
  opcDaApplicationName: 'Application',
  opcDaGvlName: 'GVL_NEXTRON_ROBOT',
  opcDaTimeout: 3000,
  opcDaTags: defaultOpcDaTags,
}

const lightToState = (key: TrafficKey): TrafficState => ({
  red: key === 'red',
  yellow: key === 'yellow',
  green: key === 'green',
})

const oppositeState = (main: TrafficState): TrafficState =>
  main.red
    ? { red: false, yellow: false, green: true }
    : { red: true, yellow: false, green: false }

const buildSimulationSignals = (main: TrafficState): IntersectionTrafficState => ({
  west: main,
  east: main,
  north: oppositeState(main),
  south: oppositeState(main),
})

const sameTrafficState = (a: TrafficState, b: TrafficState) =>
  a.red === b.red && a.yellow === b.yellow && a.green === b.green

const sameIntersectionState = (
  a: IntersectionTrafficState,
  b: IntersectionTrafficState,
) =>
  (['west', 'east', 'north', 'south'] as SignalId[]).every((signalId) =>
    sameTrafficState(a[signalId], b[signalId]),
  )

function PhaseElapsedDisplay({
  startedAt,
  durationMs,
}: {
  startedAt: number
  durationMs: number
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const update = () => setElapsed((Date.now() - startedAt) / 1000)
    update()
    const timer = window.setInterval(update, 500)
    return () => window.clearInterval(timer)
  }, [startedAt])

  return <strong>{elapsed.toFixed(1)} s / {durationMs / 1000} s</strong>
}

const protocolLabel = (protocol: PlcConfig['protocol']) =>
  protocol === 'opcua' ? 'ALTUS OPC UA' : protocol === 'opcda' ? 'ALTUS OPC DA' : 'SIEMENS S7'

const stateLabel: Record<string, string> = {
  red: 'VERMELHO',
  yellow: 'AMARELO',
  green: 'VERDE',
  fault: 'FALHA',
  off: 'DESLIGADO',
}

function App() {
  const [mode, setMode] = useState<Mode>('simulation')
  const [hubPanel, setHubPanel] = useState<HubPanel>(null)
  const [traffic, setTraffic] = useState<TrafficState>(lightToState('red'))
  const [signals, setSignals] = useState<IntersectionTrafficState>(() =>
    buildSimulationSignals(lightToState('red')),
  )
  const [phase, setPhase] = useState(0)
  const [running, setRunning] = useState(true)
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>('medium')
  const [targetFps, setTargetFps] = useState(30)
  const [connected, setConnected] = useState(false)
  const [windowMaximized, setWindowMaximized] = useState(false)
  const [config, setConfig] = useState<PlcConfig>(defaultConfig)
  const [opcTagTests, setOpcTagTests] = useState<Record<string, OpcTagTestState>>({})
  const [connectionMessage, setConnectionMessage] = useState('Ambiente virtual pronto')
  const [seenStates, setSeenStates] = useState(() => new Set<string>())
  const [phaseStartedAt, setPhaseStartedAt] = useState(Date.now())
  const [timingPass, setTimingPass] = useState(() => new Set<string>())
  const [sequenceFault, setSequenceFault] = useState(false)
  const previousState = useRef('')
  const signalsRef = useRef(signals)
  const lastPhase = useRef<TrafficKey | null>(null)
  const phaseStartedAtRef = useRef(Date.now())
  const steps = trafficLightProject.sequence

  useEffect(() => {
    window.teachElectrify?.windowControls.isMaximized().then((result) => {
      setWindowMaximized(result.maximized)
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    signalsRef.current = signals
  }, [signals])

  useEffect(() => {
    if (mode !== 'simulation' || !running) return
    const current = steps[phase]
    const mainState = lightToState(current.key)
    setTraffic(mainState)
    setSignals(buildSimulationSignals(mainState))
    const timer = window.setTimeout(() => {
      setPhase((value) => (value + 1) % steps.length)
    }, current.durationMs)
    return () => window.clearTimeout(timer)
  }, [mode, phase, running, steps])

  useEffect(() => {
    if (mode !== 'plc' || !connected) return
    const poll = async () => {
      const result = await window.teachElectrify?.plc.readTraffic()
      if (result?.ok && result.values) {
        const mapped = result.mapped ?? []
        const nextSignals =
          config.protocol === 'opcda' && mapped.length > 0
            ? mapped.reduce<IntersectionTrafficState>((acc, item) => {
                acc[item.signalId] = {
                  ...acc[item.signalId],
                  [item.lightKey]: result.values?.[item.signalId]?.[item.lightKey] ?? false,
                }
                return acc
              }, {
                west: { ...signalsRef.current.west },
                east: { ...signalsRef.current.east },
                north: { ...signalsRef.current.north },
                south: { ...signalsRef.current.south },
              })
            : result.values

        if (!sameIntersectionState(signalsRef.current, nextSignals)) {
          signalsRef.current = nextSignals
          setSignals(nextSignals)

          setTraffic((current) =>
            sameTrafficState(current, nextSignals.west) ? current : nextSignals.west,
          )
        }

        const onlineMessage =
          config.protocol === 'opcua'
            ? 'Altus OPC UA conectado • 4 semáforos independentes'
            : config.protocol === 'opcda'
              ? `Altus OPC DA conectado • ${result.mapped?.length ?? 0} tag(s) monitorada(s)`
              : 'Siemens S7 conectado • 4 semáforos independentes'

        setConnectionMessage((current) =>
          current === onlineMessage ? current : onlineMessage,
        )
      } else if (result) {
        setConnectionMessage(result.message || 'Falha na leitura do PLC')
      }
    }
    poll()
    const timer = window.setInterval(poll, trafficLightProject.scanMs)
    return () => window.clearInterval(timer)
  }, [mode, connected, config.protocol])

  const activeLights = useMemo(() => getActiveLights(traffic), [traffic])
  const activeLight = activeLights.length === 1 ? activeLights[0] : activeLights.length > 1 ? 'fault' : 'off'
  const validations = useMemo(() => validateTrafficState(traffic), [traffic])

  useEffect(() => {
    const signature = `${traffic.red ? 1 : 0}${traffic.yellow ? 1 : 0}${traffic.green ? 1 : 0}`
    if (signature === previousState.current) return

    previousState.current = signature
    const now = Date.now()
    const currentKey = activeLights.length === 1 ? activeLights[0] : null
    const previousKey = lastPhase.current

    if (previousKey && currentKey && previousKey !== currentKey) {
      const elapsedMs = now - phaseStartedAtRef.current
      const expected = steps.find((step) => step.key === previousKey)
      if (expected && Math.abs(elapsedMs - expected.durationMs) <= 850) {
        setTimingPass((current) => new Set(current).add(previousKey))
      }

      const previousIndex = steps.findIndex((step) => step.key === previousKey)
      const expectedNext = steps[(previousIndex + 1) % steps.length]?.key
      if (expectedNext !== currentKey) setSequenceFault(true)
    }

    phaseStartedAtRef.current = now
    setPhaseStartedAt(now)

    if (currentKey) {
      lastPhase.current = currentKey
      setSeenStates((current) => new Set(current).add(currentKey))
    }
  }, [traffic, activeLights, steps])

  const allPhasesSeen = seenStates.size === 3
  const safeNow = activeLights.length === 1
  const sequencePass = seenStates.size >= 2 && !sequenceFault
  const score = Math.min(
    100,
    (safeNow ? 20 : 0) + seenStates.size * 10 + timingPass.size * 10 + (sequencePass ? 20 : 0),
  )

  const connect = async () => {
    setMode('plc')
    setConnectionMessage('Conectando ao PLC...')
    const result = await window.teachElectrify?.plc.connect(config)
    if (!result) {
      setConnectionMessage('Abra pelo Electron para acessar os drivers industriais')
      return
    }
    setConnected(result.ok)
    setConnectionMessage(
      result.ok
        ? config.protocol === 'opcua'
          ? 'Altus OPC UA conectado'
          : config.protocol === 'opcda'
            ? 'Altus OPC DA conectado'
            : 'Siemens S7 conectado'
        : result.message || 'Falha ao conectar',
    )
  }

  const disconnect = async () => {
    await window.teachElectrify?.plc.disconnect()
    setConnected(false)
    setMode('simulation')
    setConnectionMessage('Ambiente virtual pronto')
  }

  const syncOpcTags = async () => {
    if (config.protocol !== 'opcua') return

    if (!connected) {
      setConnectionMessage('As tags OPC serão aplicadas ao conectar')
      return
    }

    setConnectionMessage('Sincronizando tags OPC com as lâmpadas...')
    const result = await window.teachElectrify?.plc.updateOpcTags(config.opcTags)

    if (!result) {
      setConnectionMessage('Abra pelo Electron para sincronizar as tags OPC')
      return
    }

    setConnectionMessage(
      result.ok
        ? 'Mapeamento OPC sincronizado • 12 lâmpadas vinculadas'
        : result.message || 'Falha ao sincronizar tags OPC',
    )
  }

  const testOpcTag = async (signalId: SignalId, lightKey: TrafficKey) => {
    const key = `${signalId}:${lightKey}`
    const nodeId = config.opcTags[signalId][lightKey]

    setOpcTagTests((current) => ({
      ...current,
      [key]: { loading: true },
    }))

    const result = await window.teachElectrify?.plc.testOpcNode(nodeId)

    if (!result) {
      setOpcTagTests((current) => ({
        ...current,
        [key]: { loading: false, ok: false, message: 'Use o app pelo Electron' },
      }))
      return
    }

    setOpcTagTests((current) => ({
      ...current,
      [key]: {
        loading: false,
        ok: result.ok,
        value: result.value,
        message: result.message,
      },
    }))

    if (result.ok && typeof result.value === 'boolean') {
      const nextSignals: IntersectionTrafficState = {
        ...signals,
        [signalId]: {
          ...signals[signalId],
          [lightKey]: result.value,
        },
      }
      setSignals(nextSignals)
      if (signalId === 'west') setTraffic(nextSignals.west)
      setConnectionMessage(
        `Teste OPC: ${signalId.toUpperCase()} / ${lightKey.toUpperCase()} = ${result.value ? 'TRUE' : 'FALSE'}`,
      )
    } else {
      setConnectionMessage(result.message || 'Falha ao testar NodeId OPC')
    }
  }

  const testOpcDaTag = async (signalId: SignalId, lightKey: TrafficKey) => {
    const key = `opcda:${signalId}:${lightKey}`
    setOpcTagTests((current) => ({ ...current, [key]: { loading: true } }))

    const result = await window.teachElectrify?.plc.testOpcDaTag(signalId, lightKey)
    if (!result) {
      setOpcTagTests((current) => ({
        ...current,
        [key]: { loading: false, ok: false, message: 'Use o app pelo Electron' },
      }))
      return
    }

    setOpcTagTests((current) => ({
      ...current,
      [key]: {
        loading: false,
        ok: result.ok,
        value: result.value,
        message: result.message,
      },
    }))

    if (result.ok && typeof result.value === 'boolean') {
      const nextSignals: IntersectionTrafficState = {
        ...signals,
        [signalId]: {
          ...signals[signalId],
          [lightKey]: result.value,
        },
      }
      signalsRef.current = nextSignals
      setSignals(nextSignals)
      if (signalId === 'west') setTraffic(nextSignals.west)
      setConnectionMessage(
        `Teste OPC DA: ${signalId.toUpperCase()} / ${lightKey.toUpperCase()} = ${result.value ? 'TRUE' : 'FALSE'}`,
      )
    } else {
      setConnectionMessage(result.message || 'Falha ao testar tag OPC DA')
    }
  }

  const resetLab = () => {
    setSeenStates(new Set())
    setTimingPass(new Set())
    setSequenceFault(false)
    lastPhase.current = null
    phaseStartedAtRef.current = Date.now()
    setPhase(0)
    const resetState = lightToState('red')
    setTraffic(resetState)
    setSignals(buildSimulationSignals(resetState))
    setRunning(true)
  }

  return (
    <div className="immersive-app">
      <header className="app-titlebar">
        <div className="app-titlebar-brand">
          <Zap size={14} />
          <strong>TEACH ELETRICY</strong>
          <span>INDUSTRIAL LEARNING LAB</span>
        </div>

        <div className="app-titlebar-drag">
          <span>SEMÁFORO INTELIGENTE</span>
          <i />
          <small>{connected ? protocolLabel(config.protocol) : 'SIMULAÇÃO LOCAL'}</small>
        </div>

        <div className="app-titlebar-actions">
          <button
            onClick={() => window.teachElectrify?.windowControls.minimize()}
            title="Minimizar"
            aria-label="Minimizar"
          >
            <span className="window-minimize-glyph" />
          </button>
          <button
            onClick={async () => {
              const result = await window.teachElectrify?.windowControls.toggleMaximize()
              if (result) setWindowMaximized(result.maximized)
            }}
            title={windowMaximized ? 'Restaurar' : 'Maximizar'}
            aria-label={windowMaximized ? 'Restaurar' : 'Maximizar'}
          >
            <span className={windowMaximized ? 'window-restore-glyph' : 'window-maximize-glyph'} />
          </button>
          <button
            className="window-close-button"
            onClick={() => window.teachElectrify?.windowControls.close()}
            title="Fechar"
            aria-label="Fechar"
          >
            <span className="window-close-glyph" />
          </button>
        </div>
      </header>
      <aside className="immersive-rail">
        <div className="immersive-brand" title="TEACH ELETRICY">
          <Zap size={24} />
        </div>

        <nav className="immersive-nav">
          <button
            className={`immersive-nav-button ${hubPanel === 'connections' ? 'active' : ''}`}
            onClick={() => setHubPanel((current) => current === 'connections' ? null : 'connections')}
            title="Conexões"
          >
            <Cable size={20} />
            <span>Conexões</span>
          </button>

          <button
            className={`immersive-nav-button ${hubPanel === 'settings' ? 'active' : ''}`}
            onClick={() => setHubPanel((current) => current === 'settings' ? null : 'settings')}
            title="Configurações"
          >
            <Settings2 size={20} />
            <span>Configurações</span>
          </button>
        </nav>

        <div className="immersive-status">
          <i className={connected ? 'online' : ''} />
          <span>{connected ? 'ONLINE' : 'LOCAL'}</span>
        </div>
      </aside>

      <main className="immersive-stage">
        <TrafficSimulation3D signals={signals} running={running} quality={graphicsQuality} targetFps={targetFps} />

        <div className="immersive-topbar">
          <div className="immersive-title">
            <span>TEACH ELETRICY</span>
            <strong>Semáforo Inteligente</strong>
          </div>

          <div className="immersive-runtime">
            <div>
              <span>Fonte</span>
              <strong>
                {mode === 'plc' ? protocolLabel(config.protocol) : 'SIMULAÇÃO'}
              </strong>
            </div>
            <div>
              <span>Estado</span>
              <strong><i className={`state-led ${activeLight}`} />{stateLabel[activeLight]}</strong>
            </div>
            <button
              className="immersive-pause"
              onClick={() => setRunning((value) => !value)}
              title={running ? 'Pausar simulação' : 'Continuar simulação'}
            >
              {running ? <Pause size={15} /> : <Play size={15} />}
            </button>
          </div>
        </div>

        {hubPanel && (
          <>
            <button
              className="panel-backdrop"
              aria-label="Fechar painel"
              onClick={() => setHubPanel(null)}
            />

            <aside className="immersive-drawer">
              <div className="drawer-header">
                <div>
                  <span>{hubPanel === 'connections' ? 'COMUNICAÇÃO INDUSTRIAL' : 'LABORATÓRIO'}</span>
                  <h2>{hubPanel === 'connections' ? 'Conexões' : 'Configurações'}</h2>
                </div>
                <button className="drawer-close" onClick={() => setHubPanel(null)}>×</button>
              </div>

              {hubPanel === 'connections' ? (
                <div className="drawer-content">
                  <div className="connection-choice">
                    <button
                      className={config.protocol === 's7' ? 'active' : ''}
                      disabled={connected}
                      onClick={() => setConfig({...config, protocol:'s7'})}
                    >
                      <Cpu size={19} />
                      <div>
                        <strong>Siemens S7</strong>
                        <span>ISO-on-TCP / porta 102</span>
                      </div>
                      <i />
                    </button>
                    <button
                      className={config.protocol === 'opcda' ? 'active' : ''}
                      disabled={connected}
                      onClick={() => setConfig({...config, protocol:'opcda'})}
                    >
                      <Cable size={19} />
                      <div>
                        <strong>Altus OPC DA</strong>
                        <span>CoDeSys.OPC.DA / bridge Windows</span>
                      </div>
                      <i />
                    </button>
                    <button
                      className={config.protocol === 'opcua' ? 'active' : ''}
                      disabled={connected}
                      onClick={() => setConfig({...config, protocol:'opcua'})}
                    >
                      <Radio size={19} />
                      <div>
                        <strong>Altus OPC UA</strong>
                        <span>XP340 / MasterTool</span>
                      </div>
                      <i />
                    </button>
                  </div>

                  <div className="drawer-divider" />

                  {config.protocol === 's7' ? (
                    <div className="drawer-section">
                      <div className="drawer-section-title">
                        <span>CONFIGURAÇÃO SIEMENS</span>
                        <strong>S7 Connection</strong>
                      </div>

                      <div className="drawer-fields three">
                        <label>
                          Endereço IP
                          <input value={config.host} onChange={(e)=>setConfig({...config,host:e.target.value})}/>
                        </label>
                        <label>
                          Rack
                          <input type="number" value={config.rack} onChange={(e)=>setConfig({...config,rack:Number(e.target.value)})}/>
                        </label>
                        <label>
                          Slot
                          <input type="number" value={config.slot} onChange={(e)=>setConfig({...config,slot:Number(e.target.value)})}/>
                        </label>
                      </div>

                      <div className="drawer-section-title compact">
                        <span>MEMÓRIAS DOS SEMÁFOROS</span>
                      </div>

                      <div className="drawer-signal-grid">
                        {trafficLightProject.signals.map((signal) => (
                          <div className="drawer-signal-card" key={signal.id}>
                            <strong>{signal.label}</strong>
                            {signal.tags.map((tag) => (
                              <label key={`${signal.id}-${tag.key}`}>
                                <i className={`tag-dot ${tag.key}`} />
                                <span>{tag.label}</span>
                                <input
                                  value={config.tags[signal.id as SignalId][tag.key]}
                                  onChange={(e) =>
                                    setConfig({
                                      ...config,
                                      tags:{
                                        ...config.tags,
                                        [signal.id]:{
                                          ...config.tags[signal.id as SignalId],
                                          [tag.key]:e.target.value,
                                        },
                                      },
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : config.protocol === 'opcda' ? (
                    <div className="drawer-section">
                      <div className="drawer-section-title">
                        <span>ALTUS • MESMA ARQUITETURA DO NEXTRON CORE</span>
                        <strong>OPC DA / CoDeSys</strong>
                      </div>

                      <div className="opcda-core-note">
                        <strong>Bridge OPC DA Windows</strong>
                        <span>Pré-configurado com o mesmo perfil do Nextron Core: <b>CoDeSys.OPC.DA</b> • PLC_GW3 • Application • GVL_NEXTRON_ROBOT. Preencha apenas as tags que quiser acompanhar; campos vazios são ignorados.</span>
                      </div>

                      <div className="mastertool-sim-preset">
                        <div className="mastertool-sim-head">
                          <div>
                            <span>PRESET OFICIAL ALTUS</span>
                            <strong>MasterTool em modo Simulação</strong>
                          </div>
                          <b>SIMULAÇÃO</b>
                        </div>
                        <div className="mastertool-sim-grid">
                          <div><span>Active IP</span><strong>127.0.0.1</strong></div>
                          <div><span>Device Port</span><strong>11739</strong></div>
                          <div><span>OPC Server</span><strong>CoDeSys.OPC.DA</strong></div>
                        </div>
                        <small>
                          No MasterTool: Comunicação → Simulação → Login/Run → Comunicação → Configuração OPC.
                          O 127.0.0.1 é do simulador OPC DA do próprio PC e não tem relação com o endereço do Vite.
                        </small>
                      </div>

                      <div className="drawer-fields two">
                        <label>
                          ProgID
                          <input
                            value={config.opcDaProgId}
                            onChange={(e)=>setConfig({...config,opcDaProgId:e.target.value})}
                            placeholder="CoDeSys.OPC.DA"
                          />
                        </label>
                        <label>
                          Arquitetura
                          <select
                            value={config.opcDaArchitecture}
                            onChange={(e)=>setConfig({...config,opcDaArchitecture:e.target.value as PlcConfig['opcDaArchitecture']})}
                          >
                            <option value="auto">Auto</option>
                            <option value="x86">x86</option>
                            <option value="x64">x64</option>
                          </select>
                        </label>
                      </div>

                      <div className="drawer-fields two">
                        <label>
                          Host OPC DA
                          <input
                            value={config.opcDaHost}
                            onChange={(e)=>setConfig({...config,opcDaHost:e.target.value})}
                            placeholder="vazio = servidor local"
                          />
                        </label>
                        <label>
                          Timeout
                          <input
                            type="number"
                            value={config.opcDaTimeout}
                            onChange={(e)=>setConfig({...config,opcDaTimeout:Number(e.target.value)})}
                          />
                        </label>
                      </div>

                      <div className="drawer-fields three">
                        <label>
                          PLC
                          <input value={config.opcDaPlcName} onChange={(e)=>setConfig({...config,opcDaPlcName:e.target.value})} placeholder="PLC_GW3"/>
                        </label>
                        <label>
                          Application
                          <input value={config.opcDaApplicationName} onChange={(e)=>setConfig({...config,opcDaApplicationName:e.target.value})} placeholder="Application"/>
                        </label>
                        <label>
                          GVL
                          <input value={config.opcDaGvlName} onChange={(e)=>setConfig({...config,opcDaGvlName:e.target.value})} placeholder="GVL_NEXTRON_ROBOT"/>
                        </label>
                      </div>

                      <div className="opcda-prefix-preview">
                        <span>Prefixo gerado</span>
                        <strong>{[config.opcDaPlcName, config.opcDaApplicationName, config.opcDaGvlName].filter(Boolean).join('.') || '—'}.</strong>
                      </div>

                      <div className="drawer-section-title compact mapping-title">
                        <div>
                          <span>TAGS OPC DA → LÂMPADAS</span>
                          <small>Mapeamento opcional. Preencha 1, 2 ou quantas tags quiser; as demais não participam da conexão.</small>
                        </div>
                      </div>

                      <div className="drawer-opc-signals">
                        {trafficLightProject.signals.map((signal) => {
                          const signalId = signal.id as SignalId
                          return (
                            <div className="drawer-opc-card" key={signal.id}>
                              <div className="drawer-opc-head">
                                <strong>{signal.label}</strong>
                                <span>{connected && config.protocol === 'opcda' ? 'AO VIVO' : 'OFFLINE'}</span>
                              </div>
                              {signal.tags.map((tag) => {
                                const lightKey = tag.key as TrafficKey
                                const testKey = `opcda:${signal.id}:${tag.key}`
                                const test = opcTagTests[testKey]
                                const liveValue = signals[signalId][lightKey]
                                const isMapped = Boolean(config.opcDaTags[signalId][lightKey].trim())
                                return (
                                  <div className={`drawer-opc-row ${isMapped ? 'mapped' : 'unmapped'}`} key={testKey}>
                                    <i className={`tag-dot ${tag.key} ${connected && liveValue ? 'on' : ''}`} />
                                    <span>{tag.label}</span>
                                    <input
                                      value={config.opcDaTags[signalId][lightKey]}
                                      onChange={(e)=>setConfig({
                                        ...config,
                                        opcDaTags:{
                                          ...config.opcDaTags,
                                          [signalId]:{
                                            ...config.opcDaTags[signalId],
                                            [lightKey]:e.target.value,
                                          },
                                        },
                                      })}
                                      placeholder="ex.: xEnable ou OESTE_VERMELHO"
                                    />
                                    <button
                                      disabled={!connected || config.protocol !== 'opcda' || !isMapped || test?.loading}
                                      onClick={() => testOpcDaTag(signalId, lightKey)}
                                    >
                                      {test?.loading ? '...' : 'Testar'}
                                    </button>
                                    <b className={connected && liveValue ? 'true' : ''}>
                                      {!isMapped ? 'IGNORAR' : connected && config.protocol === 'opcda' ? (liveValue ? 'TRUE' : 'FALSE') : '—'}
                                    </b>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>

                      <div className="opcda-build-hint">
                        <strong>Primeiro uso neste PC</strong>
                        <span>Execute <code>npm run build:opcda</code> uma vez para gerar as bridges x86 e x64. Requer .NET SDK 8.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="drawer-section">
                      <div className="drawer-section-title">
                        <span>CONFIGURAÇÃO ALTUS</span>
                        <strong>OPC UA Client</strong>
                      </div>

                      <div className="drawer-fields">
                        <label>
                          Endpoint OPC UA
                          <input
                            value={config.opcEndpoint}
                            onChange={(e)=>setConfig({...config,opcEndpoint:e.target.value})}
                            placeholder="opc.tcp://IP_DO_XP340:4840"
                          />
                        </label>
                      </div>

                      <div className="altus-opc-guide">
                        <strong>Configuração recomendada para XP340</strong>
                        <span>MasterTool: Active IP = IP do CLP • Device Port = 11740 • Gateway = IP do CLP • Gateway Port = 4840 • “Use gateway on CP” habilitado.</span>
                        <span>Cliente: conecte em <b>opc.tcp://IP_DO_CLP:4840</b>. Publique as variáveis em Application → Symbol Configuration e habilite “Support for OPC UA features”.</span>
                        <span>Os NodeIds abaixo não têm namespace fixo. Copie o NodeId real pelo UaExpert/Address Space.</span>
                      </div>

                      <div className="drawer-fields two">
                        <label>
                          Security Mode
                          <select
                            value={config.opcSecurityMode}
                            onChange={(e)=>setConfig({...config,opcSecurityMode:e.target.value as PlcConfig['opcSecurityMode']})}
                          >
                            <option value="None">None</option>
                            <option value="Sign">Sign</option>
                            <option value="SignAndEncrypt">SignAndEncrypt</option>
                          </select>
                        </label>
                        <label>
                          Security Policy
                          <select
                            value={config.opcSecurityPolicy}
                            onChange={(e)=>setConfig({...config,opcSecurityPolicy:e.target.value as PlcConfig['opcSecurityPolicy']})}
                          >
                            <option value="None">None</option>
                            <option value="Basic256Sha256">Basic256Sha256</option>
                          </select>
                        </label>
                      </div>

                      <div className="drawer-fields two">
                        <label>
                          Usuário
                          <input value={config.opcUsername} onChange={(e)=>setConfig({...config,opcUsername:e.target.value})}/>
                        </label>
                        <label>
                          Senha
                          <input type="password" value={config.opcPassword} onChange={(e)=>setConfig({...config,opcPassword:e.target.value})}/>
                        </label>
                      </div>

                      <div className="drawer-section-title compact mapping-title">
                        <div>
                          <span>MAPEAMENTO OPC → LÂMPADAS</span>
                          <small>Associe cada NodeId à lâmpada correspondente.</small>
                        </div>
                        <button className="drawer-sync" onClick={syncOpcTags}>
                          <Radio size={13}/> Sincronizar
                        </button>
                      </div>

                      <div className="drawer-opc-signals">
                        {trafficLightProject.signals.map((signal) => {
                          const signalId = signal.id as SignalId
                          return (
                            <div className="drawer-opc-card" key={signal.id}>
                              <div className="drawer-opc-head">
                                <strong>{signal.label}</strong>
                                <span>{connected ? 'AO VIVO' : 'OFFLINE'}</span>
                              </div>
                              {signal.tags.map((tag) => {
                                const lightKey = tag.key as TrafficKey
                                const testKey = `${signal.id}:${tag.key}`
                                const test = opcTagTests[testKey]
                                const liveValue = signals[signalId][lightKey]
                                return (
                                  <div className="drawer-opc-row" key={testKey}>
                                    <i className={`tag-dot ${tag.key} ${connected && liveValue ? 'on' : ''}`} />
                                    <span>{tag.label}</span>
                                    <input
                                      value={config.opcTags[signalId][lightKey]}
                                      onChange={(e)=>{
                                        setConfig({
                                          ...config,
                                          opcTags:{
                                            ...config.opcTags,
                                            [signalId]:{
                                              ...config.opcTags[signalId],
                                              [lightKey]:e.target.value,
                                            },
                                          },
                                        })
                                      }}
                                    />
                                    <button
                                      disabled={!connected || test?.loading}
                                      onClick={() => testOpcTag(signalId, lightKey)}
                                    >
                                      {test?.loading ? '...' : 'Testar'}
                                    </button>
                                    <b className={connected && liveValue ? 'true' : ''}>
                                      {connected ? (liveValue ? 'TRUE' : 'FALSE') : '—'}
                                    </b>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className={connected ? 'drawer-health online' : 'drawer-health'}>
                    <ShieldCheck size={15}/>
                    <span>{connectionMessage}</span>
                  </div>

                  <button
                    className={connected ? 'drawer-connect danger' : 'drawer-connect'}
                    onClick={connected ? disconnect : connect}
                  >
                    {connected ? <Unplug size={17}/> : <PlugZap size={17}/>}
                    {connected ? 'Desconectar' : `Conectar via ${config.protocol === 'opcua' ? 'OPC UA' : config.protocol === 'opcda' ? 'OPC DA' : 'Siemens S7'}`}
                  </button>
                </div>
              ) : (
                <div className="drawer-content settings-content">
                  <div className="drawer-section">
                    <div className="drawer-section-title">
                      <span>SIMULAÇÃO</span>
                      <strong>Controle do laboratório</strong>
                    </div>

                    <div className="graphics-settings-card">
                      <div className="graphics-settings-head">
                        <div>
                          <span>DESEMPENHO VISUAL</span>
                          <strong>Gráficos e FPS</strong>
                        </div>
                        <b>{targetFps} FPS</b>
                      </div>

                      <label>
                        Qualidade gráfica
                        <select
                          value={graphicsQuality}
                          onChange={(e)=>setGraphicsQuality(e.target.value as GraphicsQuality)}
                        >
                          <option value="low">Baixo — máximo desempenho</option>
                          <option value="medium">Médio — equilibrado</option>
                          <option value="high">Alto — melhor visual</option>
                        </select>
                      </label>

                      <label>
                        Limite de FPS
                        <select
                          value={targetFps}
                          onChange={(e)=>setTargetFps(Number(e.target.value))}
                        >
                          <option value={20}>20 FPS</option>
                          <option value={30}>30 FPS</option>
                          <option value={45}>45 FPS</option>
                          <option value={60}>60 FPS</option>
                        </select>
                      </label>

                      <small>
                        FPS maior deixa os carros mais fluidos, mas aumenta CPU/GPU. Para testar PLC, 30–45 FPS costuma ser o melhor equilíbrio.
                      </small>
                    </div>

                    <div className="settings-runtime-card">
                      <div>
                        <span>Execução</span>
                        <strong>{running ? 'Em andamento' : 'Pausada'}</strong>
                      </div>
                      <button onClick={() => setRunning((value)=>!value)}>
                        {running ? <Pause size={15}/> : <Play size={15}/>}
                        {running ? 'Pausar' : 'Executar'}
                      </button>
                    </div>

                    <div className="settings-phases">
                      {steps.map((step,index)=>(
                        <button
                          key={step.key}
                          className={phase === index && mode === 'simulation' ? 'active' : ''}
                          onClick={()=>{
                            setMode('simulation')
                            setPhase(index)
                            const selected=lightToState(step.key)
                            setTraffic(selected)
                            setSignals(buildSimulationSignals(selected))
                          }}
                        >
                          <i className={`phase-lamp ${step.key}`} />
                          <div>
                            <span>{step.label}</span>
                            <strong>{step.durationMs / 1000}s</strong>
                          </div>
                        </button>
                      ))}
                    </div>

                    <button className="settings-reset" onClick={resetLab}>
                      <RotateCcw size={15}/> Reiniciar laboratório
                    </button>
                  </div>

                  <div className="drawer-divider" />

                  <div className="drawer-section">
                    <div className="drawer-section-title">
                      <span>VALIDAÇÃO</span>
                      <strong>Diagnóstico da lógica</strong>
                    </div>

                    <div className="settings-score">
                      <strong>{score}<small>%</small></strong>
                      <span>pontuação atual</span>
                    </div>

                    <div className="settings-validation">
                      {validations.map((item)=>(
                        <div className={item.status} key={item.id}>
                          {item.status === 'pass' ? <Check size={13}/> : item.status === 'fail' ? <AlertTriangle size={13}/> : <CircleDot size={12}/>}
                          <span>{item.title}</span>
                          <b>{item.status === 'pass' ? 'OK' : item.status === 'fail' ? 'ERRO' : '...'}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </>
        )}
      </main>
    </div>
  )
}

export default App
