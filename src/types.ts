export type TrafficState = {
  red: boolean
  yellow: boolean
  green: boolean
}

export type PlcConfig = {
  host: string
  rack: number
  slot: number
  tags: {
    red: string
    yellow: string
    green: string
  }
}
