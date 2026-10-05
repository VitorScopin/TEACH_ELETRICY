import type { IntersectionTrafficState, PlcConfig } from './types'

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
          values?: IntersectionTrafficState
          at?: number
        }>
        status: () => Promise<{ connected: boolean; config?: PlcConfig | null }>
      }
    }
  }
}
