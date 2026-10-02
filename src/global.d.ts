export {}

declare global {
  interface Window {
    teachElectrify?: {
      plc: {
        connect: (config: PlcConfig) => Promise<{ ok: boolean; message?: string }>
        disconnect: () => Promise<{ ok: boolean }>
        readTraffic: () => Promise<{
          ok: boolean
          message?: string
          values?: TrafficState
          at?: number
        }>
        status: () => Promise<{ connected: boolean; config?: PlcConfig | null }>
      }
    }
  }

  type TrafficState = {
    red: boolean
    yellow: boolean
    green: boolean
  }

  type PlcConfig = {
    host: string
    rack: number
    slot: number
    tags: {
      red: string
      yellow: string
      green: string
    }
  }
}
