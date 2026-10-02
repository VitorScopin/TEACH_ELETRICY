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
import type { PlcConfig, TrafficState } from './types'

type Mode = 'simulation' | 'plc'
type TrafficKey = 'red' | 'yellow' | 'green'

const defaultConfig: PlcConfig = {
  ...trafficLightProject.defaultConnection,
  tags: Object.fromEntries(
    trafficLightProject.tags.map((tag) => [tag.key, tag.address]),
  ) as PlcConfig['tags'],
}

const lightToState = (key: TrafficKey): TrafficState => ({
  red: key === 'red',
  yellow: key === 'yellow',
  green: key === 'green',
})

const stateLabel: Record<string, string> = {
  red: 'VERMELHO',
  yellow: 'AMARELO',
  green: 'VERDE',
  fault: 'FALHA',
  off: 'DESLIGADO',
}

function App() {
  const [mode, setMode] = useState<Mode>('simulation')
  const [traffic, setTraffic] = useState<TrafficState>(lightToState('red'))
  const [phase, setPhase] = useState(0)
  const [running, setRunning] = useState(true)
  const [connected, setConnected] = useState(false)
  const [config, setConfig] = useState<PlcConfig>(defaultConfig)
  const [connectionMessage, setConnectionMessage] = useState('Ambiente virtual pronto')
  const [seenStates, setSeenStates] = useState(() => new Set<string>())
  const [phaseStartedAt, setPhaseStartedAt] = useState(Date.now())
  const [phaseElapsed, setPhaseElapsed] = useState(0)
  const [timingPass, setTimingPass] = useState(() => new Set<string>())
  const [sequenceFault, setSequenceFault] = useState(false)
  const previousState = useRef('')
  const lastPhase = useRef<TrafficKey | null>(null)
  const phaseStartedAtRef = useRef(Date.now())
  const steps = trafficLightProject.sequence

  useEffect(() => {
    if (mode !== 'simulation' || !running) return
    const current = steps[phase]
    setTraffic(lightToState(current.key))
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
        setTraffic(result.values)
        setConnectionMessage('PLC Siemens conectado')
      } else if (result) {
        setConnectionMessage(result.message || 'Falha na leitura do PLC')
      }
    }
    poll()
    const timer = window.setInterval(poll, trafficLightProject.scanMs)
    return () => window.clearInterval(timer)
  }, [mode, connected])

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

  useEffect(() => {
    const timer = window.setInterval(() => setPhaseElapsed((Date.now() - phaseStartedAt) / 1000), 100)
    return () => window.clearInterval(timer)
  }, [phaseStartedAt])

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
      setConnectionMessage('Abra pelo Electron para acessar o driver S7')
      return
    }
    setConnected(result.ok)
    setConnectionMessage(result.ok ? 'PLC Siemens conectado' : result.message || 'Falha ao conectar')
  }

  const disconnect = async () => {
    await window.teachElectrify?.plc.disconnect()
    setConnected(false)
    setMode('simulation')
    setConnectionMessage('Ambiente virtual pronto')
  }

  const resetLab = () => {
    setSeenStates(new Set())
    setTimingPass(new Set())
    setSequenceFault(false)
    lastPhase.current = null
    phaseStartedAtRef.current = Date.now()
    setPhase(0)
    setTraffic(lightToState('red'))
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
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark"><Zap size={27} /></div>
            <div>
              <strong>TEACH ELETRICY</strong>
              <span>AUTOMAÇÃO INDUSTRIAL</span>
            </div>
          </div>

          <nav>
            <button className="nav-item active"><FlaskConical size={19} /><span>Laboratório</span></button>
            <button className="nav-item"><FolderOpen size={19} /><span>Biblioteca de projetos</span></button>
            <button className="nav-item"><BookOpen size={19} /><span>Trilha de estudo</span></button>
            <button className="nav-item"><Cpu size={19} /><span>Conexões PLC</span></button>
          </nav>

          <div className="sidebar-progress">
            <div className="progress-head">
              <BarChart3 size={17} />
              <strong>Projeto 01</strong>
              <span>1/12</span>
            </div>
            <div className="progress"><span /></div>
          </div>

          <div className="industrial-art" aria-hidden="true">
            <div className="tower t1" /><div className="tower t2" /><div className="tower t3" />
            <div className="pipe p1" /><div className="pipe p2" /><div className="pipe p3" />
            <div className="plant-glow" />
          </div>

          <div className="sidebar-motto">
            <span>APRENDER</span><span>SIMULAR</span><span>CONECTAR</span><span>EVOLUIR</span><i />
          </div>
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
                <TrafficSimulation3D traffic={traffic} running={running} />

                <div className="telemetry-overlay">
                  <div><span>Estado Atual</span><strong><i className={`state-led ${activeLight}`} />{stateLabel[activeLight]}</strong></div>
                  <div><span>Fonte</span><strong>{mode === 'plc' ? 'TIA Portal / PLC S7' : 'Simulador interno'}</strong></div>
                  <div><span>Tempo fase</span><strong>{phaseElapsed.toFixed(1)} s / {(steps[phase]?.durationMs ?? 0) / 1000} s</strong></div>
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
                        setTraffic(lightToState(step.key))
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

              <section className="panel connection-card">
                <div className="connection-top">
                  <div className="panel-kicker"><Cpu size={16} /><span>CONEXÃO INDUSTRIAL</span></div>
                  <div className={connected ? 'plc-status online' : 'plc-status'}><i />{connected ? 'PLC ONLINE' : 'OFFLINE'}</div>
                </div>
                <h2>Siemens S7</h2>

                <div className="connection-fields">
                  <label className="ip-field">Endereço IP<input value={config.host} onChange={(e) => setConfig({...config,host:e.target.value})}/></label>
                  <label>Rack<input type="number" value={config.rack} onChange={(e)=>setConfig({...config,rack:Number(e.target.value)})}/></label>
                  <label>Slot<input type="number" value={config.slot} onChange={(e)=>setConfig({...config,slot:Number(e.target.value)})}/></label>
                </div>

                <div className="tag-heading">Tags de saída (Q)</div>
                <div className="tag-list">
                  {trafficLightProject.tags.map(tag=>(
                    <label key={tag.key}>
                      <i className={`tag-dot ${tag.key}`}/>
                      <span>{tag.label}</span>
                      <input value={config.tags[tag.key]} onChange={(e)=>setConfig({...config,tags:{...config.tags,[tag.key]:e.target.value}})}/>
                    </label>
                  ))}
                </div>

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
