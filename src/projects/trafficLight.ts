export type TrafficLightKey = 'red' | 'yellow' | 'green'

export type TrafficProjectStep = {
  key: TrafficLightKey
  label: string
  durationMs: number
}

export const trafficLightProject = {
  id: 'traffic-light-01',
  order: 1,
  title: 'Semáforo Inteligente',
  subtitle: 'Fundamentos de lógica sequencial',
  difficulty: 'Iniciante',
  estimatedMinutes: 35,
  protocol: 'S7',
  scanMs: 250,
  defaultConnection: {
    host: '192.168.0.1',
    rack: 0,
    slot: 1,
  },
  tags: [
    { key: 'red', label: 'Vermelho', address: 'M0.0', kind: 'BOOL' },
    { key: 'yellow', label: 'Amarelo', address: 'M0.1', kind: 'BOOL' },
    { key: 'green', label: 'Verde', address: 'M0.2', kind: 'BOOL' },
  ],
  sequence: [
    { key: 'red', label: 'Vermelho', durationMs: 5000 },
    { key: 'green', label: 'Verde', durationMs: 6000 },
    { key: 'yellow', label: 'Amarelo', durationMs: 2000 },
  ] satisfies TrafficProjectStep[],
  objectives: [
    'Criar uma sequência cíclica de três estados.',
    'Garantir exclusividade entre as três lâmpadas.',
    'Aplicar temporização previsível para cada etapa.',
    'Mapear sinais BOOL do PLC para uma aplicação externa.',
  ],
  skills: ['TON', 'Máquina de estados', 'Intertravamento', 'Mapeamento I/O'],
} as const
