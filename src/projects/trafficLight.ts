export type TrafficLightKey = 'red' | 'yellow' | 'green'
export type SignalId = 'west' | 'east' | 'north' | 'south'

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
  signals: [
    {
      id: 'west',
      label: 'Oeste',
      tags: [
        { key: 'red', label: 'Vermelho', address: 'M0.0', kind: 'BOOL' },
        { key: 'yellow', label: 'Amarelo', address: 'M0.1', kind: 'BOOL' },
        { key: 'green', label: 'Verde', address: 'M0.2', kind: 'BOOL' },
      ],
    },
    {
      id: 'east',
      label: 'Leste',
      tags: [
        { key: 'red', label: 'Vermelho', address: 'M0.3', kind: 'BOOL' },
        { key: 'yellow', label: 'Amarelo', address: 'M0.4', kind: 'BOOL' },
        { key: 'green', label: 'Verde', address: 'M0.5', kind: 'BOOL' },
      ],
    },
    {
      id: 'north',
      label: 'Norte',
      tags: [
        { key: 'red', label: 'Vermelho', address: 'M0.6', kind: 'BOOL' },
        { key: 'yellow', label: 'Amarelo', address: 'M0.7', kind: 'BOOL' },
        { key: 'green', label: 'Verde', address: 'M1.0', kind: 'BOOL' },
      ],
    },
    {
      id: 'south',
      label: 'Sul',
      tags: [
        { key: 'red', label: 'Vermelho', address: 'M1.1', kind: 'BOOL' },
        { key: 'yellow', label: 'Amarelo', address: 'M1.2', kind: 'BOOL' },
        { key: 'green', label: 'Verde', address: 'M1.3', kind: 'BOOL' },
      ],
    },
  ] as const,
  sequence: [
    { key: 'red', label: 'Vermelho', durationMs: 5000 },
    { key: 'green', label: 'Verde', durationMs: 6000 },
    { key: 'yellow', label: 'Amarelo', durationMs: 2000 },
  ] satisfies TrafficProjectStep[],
  objectives: [
    'Criar uma sequência cíclica de três estados.',
    'Garantir exclusividade entre as três lâmpadas.',
    'Aplicar temporização previsível para cada etapa.',
    'Controlar quatro semáforos independentes por memórias do PLC.',
  ],
  skills: ['TON', 'Máquina de estados', 'Intertravamento', 'Mapeamento I/O'],
} as const
