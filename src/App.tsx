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
type HubPanel = 'simulation' | 'validation' | 's7' | 'opcua'
type OpcTagTestState = {
  loading: boolean
  ok?: boolean
  value?: boolean
  message?: string
}

const defaultOpcTags: PlcConfig['opcTags'] = {
  west: {
    red: 'ns=4;s=|var|Application.GVL_Semaforo.OESTE_VERMELHO',
    yellow: 'ns=4;s=|var|Application.GVL_Semaforo.OESTE_AMARELO',
    green: 'ns=4;s=|var|Application.GVL_Semaforo.OESTE_VERDE',
  },
  east: {
    red: 'ns=4;s=|var|Application.GVL_Semaforo.LESTE_VERMELHO',
    yellow: 'ns=4;s=|var|Application.GVL_Semaforo.LESTE_AMARELO',
    green: 'ns=4;s=|var|Application.GVL_Semaforo.LESTE_VERDE',
  },
  north: {
    red: 'ns=4;s=|var|Application.GVL_Semaforo.NORTE_VERMELHO',
    yellow: 'ns=4;s=|var|Application.GVL_Semaforo.NORTE_AMARELO',
    green: 'ns=4;s=|var|Application.GVL_Semaforo.NORTE_VERDE',
  },
  south: {
    red: 'ns=4;s=|var|Application.GVL_Semaforo.SUL_VERMELHO',
    yellow: 'ns=4;s=|var|Application.GVL_Semaforo.SUL_AMARELO',
    green: 'ns=4;s=|var|Application.GVL_Semaforo.SUL_VERDE',
  },
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

const stateLabel: Record<string, string> = {
  red: 'VERMELHO',
  yellow: 'AMARELO',
  green: 'VERDE',
  fault: 'FALHA',
  off: 'DESLIGADO',
}

function App() {
  const [mode, setMode] = useState<Mode>('simulation')
  const [hubPanel, setHubPanel] = useState<HubPanel>('simulation')
  const [traffic, setTraffic] = useState<TrafficState>(lightToState('red'))
  const [signals, setSignals] = useState<IntersectionTrafficState>(() =>
    buildSimulationSignals(lightToState('red')),
  )
  const [phase, setPhase] = useState(0)
  const [running, setRunning] = useState(true)
  const [connected, setConnected] = useState(false)
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
        const nextSignals = result.values

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
    <div className="desktop-frame">
      <div className="window-strip">
        <div className="window-dots"><i /><i /><i /></div>
        <div className="window-title">TEACH ELETRICY • INDUSTRIAL LEARNING LAB</div>
        <div className="window-actions"><span>—</span><span>□</span><span>×</span></div>
      </div>

      <div className="app-shell">
        <aside className="command-rail">
          <div className="rail-brand" title="TEACH ELETRICY">
            <Zap size={24} />
          </div>

          <nav className="rail-nav">
            <button
              className={`rail-button ${hubPanel === 'simulation' ? 'active' : ''}`}
              onClick={() => setHubPanel('simulation')}
              title="Simulação"
            >
              <FlaskConical size={19} />
              <span>Simulação</span>
            </button>
            <button
              className={`rail-button ${hubPanel === 'validation' ? 'active' : ''}`}
              onClick={() => setHubPanel('validation')}
              title="Validação"
            >
              <ShieldCheck size={19} />
              <span>Validação</span>
            </button>
            <button
              className={`rail-button ${hubPanel === 's7' ? 'active' : ''}`}
              onClick={() => {
                setHubPanel('s7')
                if (!connected) setConfig({...config, protocol:'s7'})
              }}
              title="Configuração Siemens S7"
            >
              <Cpu size={19} />
              <span>Siemens</span>
            </button>
            <button
              className={`rail-button ${hubPanel === 'opcua' ? 'active' : ''}`}
              onClick={() => {
                setHubPanel('opcua')
                if (!connected) setConfig({...config, protocol:'opcua'})
              }}
              title="Configuração Altus OPC UA"
            >
              <Radio size={19} />
              <span>Altus OPC</span>
            </button>
          </nav>

          <button className="rail-reset" onClick={resetLab} title="Reiniciar laboratório">
            <RotateCcw size={18} />
          </button>
        </aside>

        <main>
          <header className="topbar">
            <div className="header-copy">
              <div className="breadcrumb">
                <span className="home-dot">⌂</span><ChevronRight size={13} />
                Projetos <ChevronRight size={13} /> Fundamentos <ChevronRight size={13} /> Projeto 01
              </div>
              <div className="title-line">
                <h1>Semáforo Inteligente</h1>
                <div className="difficulty">INICIANTE</div>
              </div>
              <p>Construa a lógica no <b>TIA Portal</b> e valide o funcionamento em uma planta virtual realista.</p>
            </div>

            <div className="top-actions">
              <button
                className={mode === 'simulation' ? 'run-status active' : 'run-status'}
                onClick={() => {
                  setMode('simulation')
                  setConnected(false)
                  setConnectionMessage('Ambiente virtual pronto')
                }}
              >
                <Play size={14} fill="currentColor" />
                SIMULAÇÃO ATIVA
              </button>
              <button className="icon-button" onClick={resetLab} title="Reiniciar laboratório"><RotateCcw size={16} /></button>
            </div>
          </header>

          <section className="mission-strip">
            <div className="mission-item">
              <div className="stat-icon blue"><Sparkles size={19} /></div>
              <div><span>MISSÃO</span><strong>Crie um ciclo seguro com 3 estados</strong></div>
            </div>
            <div className="mission-item">
              <div className="stat-icon blue"><Clock3 size={19} /></div>
              <div><span>TEMPO ESTIMADO</span><strong>{trafficLightProject.estimatedMinutes} min</strong></div>
            </div>
            <div className="mission-item">
              <div className="stat-icon red"><AlertTriangle size={19} /></div>
              <div><span>REGRA CRÍTICA</span><strong>1 saída ativa por vez</strong></div>
            </div>
            <div className="mission-item score-card">
              <div className="stat-icon cyan"><BarChart3 size={19} /></div>
              <div><span>VALIDAÇÃO</span><strong>{score}%</strong></div>
            </div>
          </section>

          <section className="workspace-grid">
            <section className="simulation-card panel">
              <div className="city-lab city-lab-3d">
                <TrafficSimulation3D
                  signals={signals}
                  running={running}
                />

                <div className="telemetry-overlay">
                  <div><span>Estado Atual</span><strong><i className={`state-led ${activeLight}`} />{stateLabel[activeLight]}</strong></div>
                  <div>
                    <span>Fonte</span>
                    <strong>
                      {mode === 'plc'
                        ? config.protocol === 'opcua'
                          ? 'MasterTool / Altus OPC UA'
                          : 'TIA Portal / Siemens S7'
                        : 'Simulador interno'}
                    </strong>
                  </div>
                  <div>
                    <span>Tempo fase</span>
                    <PhaseElapsedDisplay
                      startedAt={phaseStartedAt}
                      durationMs={steps[phase]?.durationMs ?? 0}
                    />
                  </div>
                  <div><span>Scan do PLC</span><strong>{mode === 'plc' ? '250 ms' : 'LOCAL'}</strong></div>
                </div>

                <div className="plant-virtual">
                  <Building2 size={17} />
                  <div><span>PLANTA VIRTUAL</span><strong>Interseção 3D</strong></div>
                  <ChevronRight size={14} className="rotate-90" />
                </div>
              </div>

              <div className="phase-control">
                <div className="phase-title">
                  <strong>CONTROLE DAS FASES</strong>
                  <span>Ajuste os tempos para testar sua lógica</span>
                </div>
                <div className="phase-row">
                  {steps.map((step, index) => (
                    <button
                      key={step.key}
                      className={`phase-card ${step.key} ${mode === 'simulation' && phase === index ? 'active' : ''}`}
                      onClick={() => {
                        setMode('simulation')
                        setPhase(index)
                        const selected = lightToState(step.key)
                        setTraffic(selected)
                        setSignals(buildSimulationSignals(selected))
                      }}
                    >
                      <i className={`phase-lamp ${step.key}`} />
                      <div><span>{step.label}</span><strong>{step.durationMs / 1000} segundos</strong></div>
                      <div className="phase-arrows"><span>⌃</span><span>⌄</span></div>
                    </button>
                  ))}
                  <button className="execute-button" onClick={() => setRunning((v) => !v)}>
                    {running ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                    {running ? 'Pausar ciclo' : 'Executar ciclo'}
                  </button>
                </div>
              </div>
            </section>

            <aside className="right-column">
              {(hubPanel === 'validation' || hubPanel === 'simulation') && (
              <section className="panel validation-card">
                <div className="panel-kicker"><FlaskConical size={16} /><span>LIVE VALIDATOR</span></div>
                <div className="validator-header">
                  <h2>Validação da lógica</h2>
                  <div className="score-ring" style={{'--score': `${score * 3.6}deg`} as React.CSSProperties}>
                    <div>{score}<small>%</small></div>
                  </div>
                </div>

                <div className="validation-list">
                  {validations.map((item) => (
                    <div className={`validation-item ${item.status}`} key={item.id}>
                      <div className="validation-icon">
                        {item.status === 'pass' ? <Check size={13} /> : item.status === 'fail' ? <AlertTriangle size={13} /> : <CircleDot size={11} />}
                      </div>
                      <strong>{item.title}</strong>
                      <span>{item.status === 'pass' ? 'OK' : item.status === 'fail' ? 'ERRO' : '...'}</span>
                    </div>
                  ))}
                  <div className={`validation-item ${sequenceFault ? 'fail' : sequencePass ? 'pass' : 'waiting'}`}>
                    <div className="validation-icon">{sequenceFault ? <AlertTriangle size={13} /> : sequencePass ? <Check size={13} /> : <CircleDot size={11} />}</div>
                    <strong>Ordem da sequência</strong><span>{sequenceFault ? 'ERRO' : sequencePass ? 'OK' : '...'}</span>
                  </div>
                  <div className={`validation-item ${timingPass.size === 3 ? 'pass' : 'waiting'}`}>
                    <div className="validation-icon">{timingPass.size === 3 ? <Check size={13} /> : <Clock3 size={11} />}</div>
                    <strong>Temporização das fases</strong><span>{timingPass.size === 3 ? 'OK' : '...'}</span>
                  </div>
                  <div className={`validation-item ${allPhasesSeen ? 'pass' : 'waiting'}`}>
                    <div className="validation-icon">{allPhasesSeen ? <Check size={13} /> : <CircleDot size={11} />}</div>
                    <strong>Ciclo completo observado</strong><span>{allPhasesSeen ? 'OK' : 'AGUARDANDO'}</span>
                  </div>
                </div>
              </section>
              )}

              {(hubPanel === 's7' || hubPanel === 'opcua') && (
              <section className="panel connection-card">
                <div className="connection-top">
                  <div className="panel-kicker"><Cpu size={16} /><span>CONEXÃO INDUSTRIAL</span></div>
                  <div className={connected ? 'plc-status online' : 'plc-status'}><i />{connected ? 'PLC ONLINE' : 'OFFLINE'}</div>
                </div>
                <h2>{config.protocol === 'opcua' ? 'Altus OPC UA' : 'Siemens S7'}</h2>

                <div className="protocol-selector">
                  <button
                    className={config.protocol === 's7' ? 'active' : ''}
                    disabled={connected}
                    onClick={() => setConfig({...config, protocol:'s7'})}
                  >
                    Siemens S7
                  </button>
                  <button
                    className={config.protocol === 'opcua' ? 'active' : ''}
                    disabled={connected}
                    onClick={() => setConfig({...config, protocol:'opcua'})}
                  >
                    Altus OPC UA
                  </button>
                </div>

                {config.protocol === 's7' ? (
                  <div className="connection-fields">
                    <label className="ip-field">Endereço IP<input value={config.host} onChange={(e) => setConfig({...config,host:e.target.value})}/></label>
                    <label>Rack<input type="number" value={config.rack} onChange={(e)=>setConfig({...config,rack:Number(e.target.value)})}/></label>
                    <label>Slot<input type="number" value={config.slot} onChange={(e)=>setConfig({...config,slot:Number(e.target.value)})}/></label>
                  </div>
                ) : (
                  <div className="opc-config">
                    <label>
                      Endpoint OPC UA
                      <input
                        value={config.opcEndpoint}
                        onChange={(e)=>setConfig({...config,opcEndpoint:e.target.value})}
                        placeholder="opc.tcp://192.168.15.1:4840"
                      />
                    </label>
                    <div className="opc-security-row">
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
                    <div className="opc-security-row">
                      <label>Usuário (opcional)<input value={config.opcUsername} onChange={(e)=>setConfig({...config,opcUsername:e.target.value})}/></label>
                      <label>Senha (opcional)<input type="password" value={config.opcPassword} onChange={(e)=>setConfig({...config,opcPassword:e.target.value})}/></label>
                    </div>
                    <small className="opc-hint">
                      Para teste rápido no XP340 use porta 4840 e segurança None. Os NodeIds abaixo podem variar conforme o projeto; confirme-os no UaExpert/cliente OPC.
                    </small>
                  </div>
                )}

                {config.protocol === 'opcua' ? (
                  <>
                    <div className="opc-mapping-head">
                      <div>
                        <span>MAPEAMENTO OPC → LÂMPADAS</span>
                        <small>Cada NodeId abaixo controla diretamente uma lâmpada da cena 3D.</small>
                      </div>
                      <button
                        className="opc-sync-button"
                        onClick={syncOpcTags}
                        title="Aplicar o mapeamento atual sem reconectar"
                      >
                        <Radio size={13} />
                        Sincronizar tags
                      </button>
                    </div>

                    <div className="opc-mapping-grid">
                      {trafficLightProject.signals.map((signal) => {
                        const signalId = signal.id as SignalId
                        return (
                          <div className="opc-signal-card" key={signal.id}>
                            <div className="opc-signal-title">
                              <strong>Semáforo {signal.label}</strong>
                              <span>{connected ? 'SINCRONIZAÇÃO AO VIVO' : 'AGUARDANDO CONEXÃO'}</span>
                            </div>

                            {signal.tags.map((tag) => {
                              const lightKey = tag.key as TrafficKey
                              const testKey = `${signal.id}:${tag.key}`
                              const test = opcTagTests[testKey]
                              const liveValue = signals[signalId][lightKey]

                              return (
                                <div
                                  className={`opc-tag-map ${connected && liveValue ? 'live-on' : ''}`}
                                  key={testKey}
                                >
                                  <div className="opc-lamp-binding">
                                    <i className={`tag-dot ${tag.key} ${connected && liveValue ? 'on' : ''}`} />
                                    <div>
                                      <strong>{tag.label}</strong>
                                      <small>{signal.label} → {tag.label}</small>
                                    </div>
                                  </div>

                                  <input
                                    className="opc-node-input"
                                    value={config.opcTags[signalId][lightKey]}
                                    onChange={(e) => {
                                      setConfig({
                                        ...config,
                                        opcTags: {
                                          ...config.opcTags,
                                          [signalId]: {
                                            ...config.opcTags[signalId],
                                            [lightKey]: e.target.value,
                                          },
                                        },
                                      })
                                      setOpcTagTests((current) => ({
                                        ...current,
                                        [testKey]: { loading: false },
                                      }))
                                    }}
                                    placeholder="ns=4;s=|var|Application.GVL..."
                                    title="NodeId OPC UA"
                                  />

                                  <button
                                    className="opc-test-button"
                                    disabled={!connected || test?.loading}
                                    onClick={() => testOpcTag(signalId, lightKey)}
                                  >
                                    {test?.loading ? '...' : 'Testar'}
                                  </button>

                                  <span
                                    className={`opc-live-value ${
                                      test?.ok
                                        ? test.value
                                          ? 'true'
                                          : 'false'
                                        : connected
                                          ? liveValue
                                            ? 'true'
                                            : 'false'
                                          : ''
                                    }`}
                                    title={test?.message || 'Valor BOOL atual'}
                                  >
                                    {test?.loading
                                      ? 'LENDO'
                                      : test?.ok
                                        ? test.value
                                          ? 'TRUE'
                                          : 'FALSE'
                                        : connected
                                          ? liveValue
                                            ? 'TRUE'
                                            : 'FALSE'
                                          : '—'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="tag-heading">Memórias dos semáforos</div>
                    <div className="signal-memory-grid">
                      {trafficLightProject.signals.map((signal) => (
                        <div className="signal-memory-group" key={signal.id}>
                          <strong>{signal.label}</strong>
                          <div className="tag-list">
                            {signal.tags.map((tag) => (
                              <label key={`${signal.id}-${tag.key}`}>
                                <i className={`tag-dot ${tag.key}`}/>
                                <span>{tag.label}</span>
                                <input
                                  value={config.tags[signal.id as SignalId][tag.key]}
                                  onChange={(e) =>
                                    setConfig({
                                      ...config,
                                      tags: {
                                        ...config.tags,
                                        [signal.id]: {
                                          ...config.tags[signal.id as SignalId],
                                          [tag.key]: e.target.value,
                                        },
                                      },
                                    })
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className={connected ? 'connection-health online' : 'connection-health'}>
                  <ShieldCheck size={16}/><span>{connectionMessage}</span>
                </div>

                <div className="connection-actions">
                  <button className={connected ? 'connect-button danger' : 'connect-button'} onClick={connected ? disconnect : connect}>
                    {connected ? <Unplug size={16}/> : <PlugZap size={16}/>}
                    {connected ? 'Desconectar PLC' : 'Conectar ao PLC'}
                  </button>
                  <button className="settings-button"><Settings2 size={17}/></button>
                </div>
              </section>
              )}
            </aside>
          </section>

          <section className="bottom-grid">
            <section className="panel mission-bottom">
              <div className="bottom-heading">
                <div className="mini-icon cyan"><Network size={16}/></div>
                <div><span>MISSÃO DO PROJETO</span><p>Implemente um semáforo de 3 estados com temporização e ciclo contínuo.</p></div>
              </div>
              <div className="objective-row">
                {steps.map(step=>(
                  <div className="objective-card" key={step.key}>
                    <i className={`phase-lamp ${step.key}`}/>
                    <div><span>{step.label}</span><strong>{step.durationMs/1000} segundos</strong><small>{step.key==='red'?'Via principal fechada':step.key==='green'?'Via principal liberada':'Transição de segurança'}</small></div>
                  </div>
                ))}
                <div className="objective-card">
                  <RotateCcw size={20}/>
                  <div><span>Ciclo contínuo</span><strong>Automático</strong><small>Repete automaticamente a sequência</small></div>
                </div>
              </div>
            </section>

            <section className="panel engineering-tip">
              <div className="tip-icon"><Lightbulb size={19}/></div>
              <div>
                <span>DICA DE ENGENHARIA</span>
                <h3>Pense em estados, não em lâmpadas.</h3>
                <p>Modele o problema como uma máquina de estados (FSM). Em cada estado, defina o tempo, a condição de transição e quais saídas devem estar ativas.</p>
              </div>
              <div className="brain-orb"><Cpu size={30}/></div>
            </section>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
