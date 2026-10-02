import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Cable,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Cpu,
  Gauge,
  GraduationCap,
  Lightbulb,
  Network,
  Pause,
  Play,
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
import type { PlcConfig, TrafficState } from './types'

type Mode = 'simulation' | 'plc'

const defaultConfig: PlcConfig = {
  ...trafficLightProject.defaultConnection,
  tags: Object.fromEntries(
    trafficLightProject.tags.map((tag) => [tag.key, tag.address]),
  ) as PlcConfig['tags'],
}

const lightToState = (key: 'red' | 'yellow' | 'green'): TrafficState => ({
  red: key === 'red',
  yellow: key === 'yellow',
  green: key === 'green',
})

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
  const previousState = useRef('')

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
        setConnectionMessage('Leitura online • ciclo de 250 ms')
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
    if (signature !== previousState.current) {
      previousState.current = signature
      setPhaseStartedAt(Date.now())
      if (activeLights.length === 1) {
        setSeenStates((current) => {
          const next = new Set(current)
          next.add(activeLights[0])
          return next
        })
      }
    }
  }, [traffic, activeLights])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhaseElapsed((Date.now() - phaseStartedAt) / 1000)
    }, 100)
    return () => window.clearInterval(timer)
  }, [phaseStartedAt])

  const score = Math.round((seenStates.size / 3) * 75 + (activeLights.length === 1 ? 25 : 0))
  const allPhasesSeen = seenStates.size === 3
  const safeNow = activeLights.length === 1

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
    setPhase(0)
    setTraffic(lightToState('red'))
    setRunning(true)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Zap size={21} /></div>
          <div>
            <strong>TEACH</strong>
            <span>ELETRICY</span>
          </div>
        </div>

        <div className="course-label">AUTOMAÇÃO INDUSTRIAL</div>
        <nav>
          <button className="nav-item active"><Gauge size={18} /> Laboratório</button>
          <button className="nav-item"><BookOpen size={18} /> Biblioteca de projetos</button>
          <button className="nav-item"><GraduationCap size={18} /> Trilha de estudo</button>
          <button className="nav-item"><Network size={18} /> Conexões PLC</button>
        </nav>

        <div className="sidebar-card">
          <div className="eyebrow">PROGRESSO DA TRILHA</div>
          <div className="progress-row">
            <strong>Projeto 01</strong>
            <span>1/12</span>
          </div>
          <div className="progress"><span /></div>
          <small>{trafficLightProject.subtitle}</small>
        </div>

        <div className="sidebar-footer">
          <CircleDot size={14} />
          <span>Industrial Learning Lab</span>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <div className="breadcrumb">Projetos <ChevronRight size={14} /> Fundamentos <ChevronRight size={14} /> Projeto 01</div>
            <div className="title-line">
              <h1>Semáforo <span>Inteligente</span></h1>
              <div className="difficulty">INICIANTE</div>
            </div>
            <p>Construa a lógica no TIA Portal e valide o comportamento do PLC em uma planta virtual.</p>
          </div>
          <div className="top-actions">
            <div className={connected ? 'status online' : 'status'}>
              <Radio size={15} />
              {connected ? 'PLC ONLINE' : mode === 'simulation' ? 'SIMULAÇÃO ATIVA' : 'OFFLINE'}
            </div>
            <button className="icon-button" onClick={resetLab} title="Reiniciar laboratório"><RotateCcw size={16} /></button>
          </div>
        </header>

        <section className="mission-strip">
          <div><Sparkles size={16} /><span>MISSÃO</span><strong>Crie um ciclo seguro com 3 estados</strong></div>
          <div><Clock3 size={15} /><span>TEMPO ESTIMADO</span><strong>{trafficLightProject.estimatedMinutes} min</strong></div>
          <div><ShieldCheck size={15} /><span>REGRA CRÍTICA</span><strong>1 saída ativa por vez</strong></div>
          <div className="score-box"><span>VALIDAÇÃO</span><strong>{score}%</strong></div>
        </section>

        <section className="workspace-grid">
          <div className="simulation-card panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">DIGITAL TWIN LAB</div>
                <h2>Via urbana virtual</h2>
              </div>
              <div className="sim-actions">
                <button
                  className={mode === 'simulation' ? 'chip active' : 'chip'}
                  onClick={() => {
                    setMode('simulation')
                    setConnected(false)
                    setConnectionMessage('Ambiente virtual pronto')
                  }}
                >
                  Simulação
                </button>
                <button className={mode === 'plc' ? 'chip active' : 'chip'} onClick={() => setMode('plc')}>
                  PLC Siemens
                </button>
              </div>
            </div>

            <div className={`road-scene light-${activeLight}`}>
              <div className="scene-grid" />
              <div className="city-silhouette">
                {Array.from({ length: 15 }).map((_, i) => <i key={i} />)}
              </div>
              <div className="city-glow glow-a" />
              <div className="city-glow glow-b" />

              <div className="scene-badge">
                <span className={safeNow ? 'pulse online' : 'pulse fault'} />
                {safeNow ? 'SISTEMA SEGURO' : 'CONDIÇÃO INVÁLIDA'}
              </div>

              <div className="road">
                <div className="road-edge" />
                <div className="lane-line line-one" />
                <div className="lane-line line-two" />
                <div className="crosswalk">
                  {Array.from({ length: 7 }).map((_, i) => <i key={i} />)}
                </div>

                <div className="traffic-pole">
                  <div className="signal-cap" />
                  <div className="traffic-box">
                    <span className={traffic.red ? 'lamp red on' : 'lamp red'} />
                    <span className={traffic.yellow ? 'lamp yellow on' : 'lamp yellow'} />
                    <span className={traffic.green ? 'lamp green on' : 'lamp green'} />
                  </div>
                  <div className="pole" />
                  <div className="pole-base" />
                </div>

                <div className="car car-1"><span /><i /></div>
                <div className="car car-2"><span /><i /></div>
                <div className="car car-3"><span /><i /></div>
              </div>

              <div className="telemetry">
                <div><Activity size={15} /><span>Estado</span><strong>{activeLight.toUpperCase()}</strong></div>
                <div><Cpu size={15} /><span>Fonte</span><strong>{mode === 'plc' ? 'SIEMENS S7' : 'VIRTUAL'}</strong></div>
                <div><Clock3 size={15} /><span>Tempo fase</span><strong>{phaseElapsed.toFixed(1)} s</strong></div>
                <div><Gauge size={15} /><span>Scan</span><strong>{mode === 'plc' ? '250 ms' : 'LOCAL'}</strong></div>
              </div>
            </div>

            <div className="simulation-footer">
              <div className="phase-dots">
                {steps.map((step, index) => {
                  const isSeen = seenStates.has(step.key)
                  return (
                    <button
                      key={step.key}
                      className={mode === 'simulation' && phase === index ? 'phase active' : 'phase'}
                      onClick={() => {
                        setMode('simulation')
                        setPhase(index)
                        setTraffic(lightToState(step.key))
                      }}
                    >
                      <span>{isSeen ? <Check size={12} /> : index + 1}</span>
                      <div><strong>{step.label}</strong><small>{step.durationMs / 1000}s • {config.tags[step.key]}</small></div>
                    </button>
                  )
                })}
              </div>
              <button className="primary" onClick={() => setRunning((value) => !value)}>
                {running ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                {running ? 'Pausar ciclo' : 'Executar ciclo'}
              </button>
            </div>
          </div>

          <div className="right-column">
            <div className="panel validation-card">
              <div className="panel-head compact">
                <div>
                  <div className="eyebrow">LIVE VALIDATOR</div>
                  <h2>Validação da lógica</h2>
                </div>
                <div className={safeNow ? 'validator-score pass' : 'validator-score fail'}>{score}</div>
              </div>

              <div className="validation-list">
                {validations.map((item) => (
                  <div className={`validation-item ${item.status}`} key={item.id}>
                    <div className="validation-icon">
                      {item.status === 'pass' ? <Check size={14} /> : item.status === 'fail' ? <AlertTriangle size={14} /> : <CircleDot size={12} />}
                    </div>
                    <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                  </div>
                ))}
                <div className={`validation-item ${allPhasesSeen ? 'pass' : 'waiting'}`}>
                  <div className="validation-icon">{allPhasesSeen ? <Check size={14} /> : <CircleDot size={12} />}</div>
                  <div><strong>Ciclo completo observado</strong><small>{allPhasesSeen ? 'As três fases foram detectadas.' : `${seenStates.size}/3 fases identificadas.`}</small></div>
                </div>
              </div>
            </div>

            <div className="panel connection-card">
              <div className="panel-head compact">
                <div>
                  <div className="eyebrow">CONEXÃO INDUSTRIAL</div>
                  <h2>Siemens S7</h2>
                </div>
                <Cable size={21} />
              </div>

              <label>
                Endereço IP
                <input value={config.host} onChange={(e) => setConfig({ ...config, host: e.target.value })} />
              </label>

              <div className="input-row">
                <label>Rack<input type="number" value={config.rack} onChange={(e) => setConfig({ ...config, rack: Number(e.target.value) })} /></label>
                <label>Slot<input type="number" value={config.slot} onChange={(e) => setConfig({ ...config, slot: Number(e.target.value) })} /></label>
              </div>

              <div className="tag-grid">
                {trafficLightProject.tags.map((tag) => (
                  <label key={tag.key}>
                    <span className={`tag-dot ${tag.key}`} />
                    {tag.label}
                    <input
                      value={config.tags[tag.key]}
                      onChange={(e) => setConfig({ ...config, tags: { ...config.tags, [tag.key]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>

              <div className="connection-state">
                <span className={connected ? 'pulse online' : 'pulse'} />
                <div><strong>{connectionMessage}</strong><small>ISO-on-TCP • TCP 102 • leitura somente</small></div>
              </div>

              <button className={connected ? 'secondary danger' : 'secondary'} onClick={connected ? disconnect : connect}>
                {connected ? <Unplug size={17} /> : <Cable size={17} />}
                {connected ? 'Desconectar' : 'Conectar ao PLC'}
              </button>
            </div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel lesson-card expanded">
            <div>
              <div className="eyebrow">MISSÃO DO PROJETO</div>
              <h3>Implemente a sequência no TIA Portal</h3>
              <p>Use uma máquina de estados. O TEACH ELETRICY observa o PLC e valida o comportamento sem precisar conhecer como você escreveu o programa.</p>
            </div>
            <div className="objective-grid">
              {steps.map((step) => (
                <div key={step.key}>
                  <span className={`objective-light ${step.key}`} />
                  <div><strong>{step.label}</strong><small>{step.durationMs / 1000} segundos</small></div>
                </div>
              ))}
              <div>
                <Settings2 size={17} />
                <div><strong>Ciclo contínuo</strong><small>Sem estados conflitantes</small></div>
              </div>
            </div>
          </div>

          <div className="panel hint-panel premium-hint">
            <div className="hint-icon"><Lightbulb size={20} /></div>
            <div>
              <div className="eyebrow">DICA DE ENGENHARIA</div>
              <strong>Pense em estados, não em lâmpadas.</strong>
              <p>Crie os estados VERMELHO → VERDE → AMARELO e derive as saídas a partir do estado atual. Isso reduz conflitos e deixa o programa mais fácil de diagnosticar.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
