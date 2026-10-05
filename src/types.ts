export type TrafficState = {
  red: boolean
  yellow: boolean
  green: boolean
}

export type SignalId = 'west' | 'east' | 'north' | 'south'

export type IntersectionTrafficState = Record<SignalId, TrafficState>

export type SignalTags = {
  red: string
  yellow: string
  green: string
}

export type PlcConfig = {
  host: string
  rack: number
  slot: number
  tags: Record<SignalId, SignalTags>
}
