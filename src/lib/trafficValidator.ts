import type { TrafficState } from '../types'

export type ValidationItem = {
  id: string
  title: string
  detail: string
  status: 'pass' | 'fail' | 'waiting'
}

export function getActiveLights(state: TrafficState) {
  return (['red', 'yellow', 'green'] as const).filter((key) => state[key])
}

export function validateTrafficState(state: TrafficState): ValidationItem[] {
  const active = getActiveLights(state)

  return [
    {
      id: 'one-hot',
      title: 'Exclusividade das lâmpadas',
      detail: active.length === 1
        ? 'Somente uma saída está ativa.'
        : active.length === 0
          ? 'Nenhuma saída está ativa.'
          : 'Duas ou mais saídas estão ativas simultaneamente.',
      status: active.length === 1 ? 'pass' : 'fail',
    },
    {
      id: 'safe-red',
      title: 'Estado vermelho reconhecido',
      detail: state.red ? 'Estado de parada detectado.' : 'Aguardando fase vermelha.',
      status: state.red && active.length === 1 ? 'pass' : 'waiting',
    },
    {
      id: 'go-green',
      title: 'Estado verde reconhecido',
      detail: state.green ? 'Estado de liberação detectado.' : 'Aguardando fase verde.',
      status: state.green && active.length === 1 ? 'pass' : 'waiting',
    },
    {
      id: 'transition-yellow',
      title: 'Transição amarela reconhecida',
      detail: state.yellow ? 'Estado de transição detectado.' : 'Aguardando fase amarela.',
      status: state.yellow && active.length === 1 ? 'pass' : 'waiting',
    },
  ]
}
