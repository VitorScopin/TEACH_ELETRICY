export type TrafficState = {
  red: boolean
  yellow: boolean
  green: boolean
}

export type SignalId = 'west' | 'east' | 'north' | 'south'
export type PlcProtocol = 's7' | 'opcua' | 'opcda'
export type OpcDaArchitecture = 'auto' | 'x86' | 'x64'
export type OpcSecurityMode = 'None' | 'Sign' | 'SignAndEncrypt'
export type OpcSecurityPolicy = 'None' | 'Basic256Sha256'

export type IntersectionTrafficState = Record<SignalId, TrafficState>

export type SignalTags = {
  red: string
  yellow: string
  green: string
}

export type PlcConfig = {
  protocol: PlcProtocol
  host: string
  rack: number
  slot: number
  tags: Record<SignalId, SignalTags>
  opcEndpoint: string
  opcSecurityMode: OpcSecurityMode
  opcSecurityPolicy: OpcSecurityPolicy
  opcUsername: string
  opcPassword: string
  opcTags: Record<SignalId, SignalTags>
  opcDaProgId: string
  opcDaHost: string
  opcDaArchitecture: OpcDaArchitecture
  opcDaPlcName: string
  opcDaApplicationName: string
  opcDaGvlName: string
  opcDaTimeout: number
  opcDaTags: Record<SignalId, SignalTags>
}
