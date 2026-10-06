export type ParkingSpotDefinition = {
  id: string
  position: [number, number, number]
  rotationY: number
  accessible?: boolean
  staticOccupied?: boolean
}

export const SUPERMARKET_PARKING_SPOTS: ParkingSpotDefinition[] = [
  { id: 'A01', position: [-28.0, 0.23, -10.6], rotationY: Math.PI / 2, accessible: true },
  { id: 'A02', position: [-24.8, 0.23, -10.6], rotationY: Math.PI / 2, staticOccupied: true },
  { id: 'A03', position: [-21.6, 0.23, -10.6], rotationY: Math.PI / 2 },
  { id: 'A04', position: [-18.4, 0.23, -10.6], rotationY: Math.PI / 2, staticOccupied: true },
  { id: 'A05', position: [-15.2, 0.23, -10.6], rotationY: Math.PI / 2 },
  { id: 'B01', position: [-28.0, 0.23, -13.6], rotationY: -Math.PI / 2, staticOccupied: true },
  { id: 'B02', position: [-24.8, 0.23, -13.6], rotationY: -Math.PI / 2 },
  { id: 'B03', position: [-21.6, 0.23, -13.6], rotationY: -Math.PI / 2 },
  { id: 'B04', position: [-18.4, 0.23, -13.6], rotationY: -Math.PI / 2, staticOccupied: true },
  { id: 'B05', position: [-15.2, 0.23, -13.6], rotationY: -Math.PI / 2, staticOccupied: true },
]

export const ROUNDABOUT = {
  center: [21.5, -14.5] as const,
  laneRadius: 6.15,
  entryWest: [12.0, -14.5] as const,
  exitWest: [10.0, -14.5] as const,
  entryNorth: [21.5, -24.0] as const,
  exitNorth: [21.5, -26.0] as const,
  entryEast: [31.0, -14.5] as const,
  exitEast: [33.0, -14.5] as const,
}

export type WorldWaypoint = {
  x: number
  z: number
  speed?: number
  wait?: number
}
