import type { IntersectionTrafficState, PlcConfig } from './types'

export {}

declare global {
  interface Window {
    teachElectrify?: {
      windowControls: {
        minimize: () => Promise<{ ok: boolean }>
        toggleMaximize: () => Promise<{ ok: boolean; maximized: boolean }>
        close: () => Promise<{ ok: boolean }>
        isMaximized: () => Promise<{ maximized: boolean }>
      }
      plc: {
        connect: (config: PlcConfig) => Promise<{ ok: boolean; message?: string }>
        disconnect: () => Promise<{ ok: boolean }>
        readTraffic: () => Promise<{
          ok: boolean
          message?: string
          values?: IntersectionTrafficState
          mapped?: Array<{ signalId: 'west' | 'east' | 'north' | 'south'; lightKey: 'red' | 'yellow' | 'green' }>
          at?: number
        }>
        updateOpcTags: (opcTags: PlcConfig['opcTags']) => Promise<{
          ok: boolean
          message?: string
          opcTags?: PlcConfig['opcTags']
        }>
        testOpcNode: (nodeId: string) => Promise<{
          ok: boolean
          message?: string
          value?: boolean
          statusCode?: string
          nodeId?: string
          at?: number
        }>
        testOpcDaTag: (signalId: string, lightKey: string) => Promise<{
          ok: boolean
          message?: string
          value?: boolean
          quality?: number
          tag?: string
          at?: number
        }>
        status: () => Promise<{ connected: boolean; config?: PlcConfig | null }>
      }
    }
  }
}
