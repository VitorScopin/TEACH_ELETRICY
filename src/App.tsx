import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BookOpen,
  Cable,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Cpu,
  Gauge,
  GraduationCap,
  Network,
  Play,
  Radio,
  Settings2,
  Unplug,
  Zap,
} from 'lucide-react'

type Mode = 'simulation' | 'plc'

const defaultConfig: PlcConfig = {
  host: '192.168.0.1',
  rack: 0,
  slot: 1,
  tags: {
    red: 'M0.0',
    yellow: 'M0.1',
    green: 'M0.2',
  },
}

const steps = [
  { title: 'Vermelho', seconds: 5, state: { red: true, yellow: false, green: false } },
  { title: 'Verde', seconds: 6, state: { red: false, yellow: false, green: true } },
  { title: 'Amarelo', seconds: 2, state: { red: false, yellow: true, green: false } },
]

function App() {
  const [mode, setMode] = useState<Mode>('simulation')
  const [traffic, setTraffic] = useState<TrafficState>(steps[0].state)
  const [phase, setPhase] = useState(0)
  const [running, setRunning] = useState(true)
  const [connected, setConnected] = useState(false)
  const [config, setConfig] = useState<PlcConfig>(defaultConfig)
  const [connectionMessage, setConnectionMessage] = useState('Modo simulação ativo')

  useEffect(() => {
    if (mode !== 'simulation' || !running) return

    const current = steps[phase]
    setTraffic(current.state)
    const timer = window.setTimeout(() => {
      setPhase((value) => (value + 1) % steps.length)
    }, current.seconds * 1000)

    return () => window.clearTimeout(timer)
  }, [mode, phase, running])

  useEffect(() => {
    if (mode !== 'plc' || !connected) return

    const poll = async () => {
      const result = await window.teachElectrify?.plc.readTraffic()
      if (result?.ok && result.values) {
        setTraffic(result.values)
        setConnectionMessage('Leitura online • atualização 250 ms')
      } else if (result) {
        setConnectionMessage(result.message || 'Falha na leitura')
      }
    }

    poll()
    const timer = window.setInterval(poll, 250)
    return () => window.clearInterval(timer)
  }, [mode, connected])

  const activeLight = useMemo(() => {
    if (traffic.green) return 'GREEN'
    if (traffic.yellow) return 'YELLOW'
    if (traffic.red) return 'RED'
    return 'OFF'
  }, [traffic])

  const connect = async () => {
    setMode('plc')
    setConnectionMessage('Conectando ao PLC...')
    const result = await window.teachElectrify?.plc.connect(config)
    if (!result) {
      setConnectionMessage('Execute pelo Electron para acessar o PLC')
      return
    }
    setConnected(result.ok)
    setConnectionMessage(result.ok ? 'PLC online • S7 Ethernet' : result.message || 'Falha ao conectar')
  }

  const disconnect = async () => {
    await window.teachElectrify?.plc.disconnect()
    setConnected(false)
    setMode('simulation')
    setConnectionMessage('Modo simulação ativo')
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

        <nav>
          <button className="nav-item active"><Gauge size={18} /> Laboratório</button>
          <button className="nav-item"><BookOpen size={18} /> Projetos</button>
          <button className="nav-item"><GraduationCap size={18} /> Trilha de estudo</button>
          <button className="nav-item"><Network size={18} /> Conexões</button>
        </nav>

        <div className="sidebar-card">
          <div className="eyebrow">PROGRESSO</div>
          <strong>Projeto 01 de 12</strong>
          <div className="progress"><span /></div>
          <small>Fundamentos de lógica sequencial</small>
        </div>

        <div className="sidebar-footer">
          <CircleDot size={14} />
          <span>Industrial Learning Lab</span>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <div className="breadcrumb">Projetos <ChevronRight size={14} /> Fundamentos</div>
            <h1>Semáforo <span>Inteligente</span></h1>
            <p>Programe a sequência no PLC e veja a lógica controlando a simulação em tempo real.</p>
          </div>
          <div className={connected ? 'status online' : 'status'}>
            <Radio size={15} />
            {connected ? 'PLC ONLINE' : mode === 'simulation' ? 'SIMULAÇÃO' : 'OFFLINE'}
          </div>
        </header>

        <section className="workspace-grid">
          <div className="simulation-card panel">
            <div className="panel-head">
              <div>
                <div className="eyebrow">DIGITAL LAB</div>
                <h2>Simulação da via</h2>
              </div>
              <div className="sim-actions">
                <button
                  className={mode === 'simulation' ? 'chip active' : 'chip'}
                  onClick={() => {
                    setMode('simulation')
                    setConnected(false)
                    setConnectionMessage('Modo simulação ativo')
                  }}
                >
                  Simulação
                </button>
                <button className={mode === 'plc' ? 'chip active' : 'chip'} onClick={() => setMode('plc')}>
                  PLC
                </button>
              </div>
            </div>

            <div className={`road-scene light-${activeLight.toLowerCase()}`}>
              <div className="city-glow glow-a" />
              <div className="city-glow glow-b" />
              <div className="road">
                <div className="lane-line line-one" />
                <div className="lane-line line-two" />
                <div className="crosswalk">
                  {Array.from({ length: 7 }).map((_, i) => <i key={i} />)}
                </div>

                <div className="traffic-pole">
                  <div className="traffic-box">
                    <span className={traffic.red ? 'lamp red on' : 'lamp red'} />
                    <span className={traffic.yellow ? 'lamp yellow on' : 'lamp yellow'} />
                    <span className={traffic.green ? 'lamp green on' : 'lamp green'} />
                  </div>
                  <div className="pole" />
                </div>

                <div className="car car-1"><span /><i /></div>
                <div className="car car-2"><span /><i /></div>
                <div className="car car-3"><span /><i /></div>
              </div>

              <div className="telemetry">
                <div><Activity size={15} /><span>Estado</span><strong>{activeLight}</strong></div>
                <div><Cpu size={15} /><span>Fonte</span><strong>{mode === 'plc' ? 'SIEMENS S7' : 'VIRTUAL'}</strong></div>
                <div><Gauge size={15} /><span>Scan</span><strong>{mode === 'plc' ? '250 ms' : 'LOCAL'}</strong></div>
              </div>
            </div>

            <div className="simulation-footer">
              <div className="phase-dots">
                {steps.map((step, index) => (
                  <button
                    key={step.title}
                    className={mode === 'simulation' && phase === index ? 'phase active' : 'phase'}
                    onClick={() => {
                      setMode('simulation')
                      setPhase(index)
                      setTraffic(step.state)
                    }}
                  >
                    <span>{index + 1}</span>
                    <div><strong>{step.title}</strong><small>{step.seconds}s</small></div>
                  </button>
                ))}
              </div>
              <button className="primary" onClick={() => setRunning((value) => !value)}>
                <Play size={17} fill="currentColor" /> {running ? 'Executando' : 'Continuar'}
              </button>
            </div>
          </div>

          <div className="right-column">
            <div className="panel connection-card">
              <div className="panel-head compact">
                <div>
                  <div className="eyebrow">CONEXÃO S7</div>
                  <h2>PLC Siemens</h2>
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
                <label><span className="tag-dot red" /> Vermelho<input value={config.tags.red} onChange={(e) => setConfig({ ...config, tags: { ...config.tags, red: e.target.value } })} /></label>
                <label><span className="tag-dot yellow" /> Amarelo<input value={config.tags.yellow} onChange={(e) => setConfig({ ...config, tags: { ...config.tags, yellow: e.target.value } })} /></label>
                <label><span className="tag-dot green" /> Verde<input value={config.tags.green} onChange={(e) => setConfig({ ...config, tags: { ...config.tags, green: e.target.value } })} /></label>
              </div>

              <div className="connection-state">
                <span className={connected ? 'pulse online' : 'pulse'} />
                <div><strong>{connectionMessage}</strong><small>ISO-on-TCP • Porta 102</small></div>
              </div>

              <button className={connected ? 'secondary danger' : 'secondary'} onClick={connected ? disconnect : connect}>
                {connected ? <Unplug size={17} /> : <Cable size={17} />}
                {connected ? 'Desconectar' : 'Conectar ao PLC'}
              </button>
            </div>

            <div className="panel lesson-card">
              <div className="eyebrow">MISSÃO DO PROJETO</div>
              <h3>Monte a sequência no TIA Portal</h3>
              <p>Faça apenas uma lâmpada permanecer ativa e respeite os tempos da sequência.</p>
              <ul>
                <li><CheckCircle2 size={16} /> Vermelho por 5 segundos</li>
                <li><CheckCircle2 size={16} /> Verde por 6 segundos</li>
                <li><CheckCircle2 size={16} /> Amarelo por 2 segundos</li>
                <li><Settings2 size={16} /> Reinício contínuo do ciclo</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel learning-panel">
            <div className="eyebrow">O QUE VOCÊ VAI APRENDER</div>
            <div className="learning-items">
              <div><span>01</span><div><strong>Temporizadores</strong><small>TON e lógica temporal</small></div></div>
              <div><span>02</span><div><strong>Sequenciamento</strong><small>Estados e transições</small></div></div>
              <div><span>03</span><div><strong>Mapeamento I/O</strong><small>Bits reais do PLC</small></div></div>
            </div>
          </div>
          <div className="panel hint-panel">
            <div><div className="eyebrow">DICA DE ENGENHARIA</div><strong>Comece criando uma máquina de estados.</strong></div>
            <p>Evite temporizadores soltos. Modele os três estados e permita somente uma transição válida por vez.</p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
