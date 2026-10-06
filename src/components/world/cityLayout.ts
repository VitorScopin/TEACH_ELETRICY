export type Vec2Point = [number, number]

export type ParkingSpotDefinition = {
  id: string
  position: [number, number, number]
  rotationY: number
  accessible?: boolean
  staticOccupied?: boolean
}

export type CityRoadDefinition = {
  id: string
  points: Vec2Point[]
  width: number
  laneWidth?: number
  sidewalkWidth?: number
  curbWidth?: number
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

/**
 * Single source of truth for the urban road network.
 * Changing a road's points moves its asphalt, curbs, sidewalks and markings together.
 */
export const CITY_ROADS = {
  eastBoulevard: {
    id: 'east-boulevard',
    width: 13.4,
    laneWidth: 3.2,
    sidewalkWidth: 2.2,
    curbWidth: 0.42,
    points: [
      [6.5, -2.0],
      [14.0, -3.0],
      [22.0, -5.0],
      [29.0, -9.0],
      [34.0, -15.0],
      [37.0, -23.0],
      [39.35, -31.0],
    ],
  },
  westParkRoad: {
    id: 'west-park-road',
    width: 7.4,
    laneWidth: 3.2,
    sidewalkWidth: 1.8,
    curbWidth: 0.38,
    points: [
      [-7.0, 4.0],
      [-14.0, 7.0],
      [-22.0, 10.0],
      [-30.0, 12.0],
      [-38.0, 11.0],
      [-46.0, 7.0],
    ],
  },
  roundaboutNorth: {
    id: 'roundabout-north',
    width: 7.2,
    laneWidth: 3.2,
    sidewalkWidth: 1.7,
    curbWidth: 0.38,
    points: [
      [48.0, -40.2],
      [48.0, -46.0],
      [46.5, -51.0],
    ],
  },
  roundaboutEast: {
    id: 'roundabout-east',
    width: 7.2,
    laneWidth: 3.2,
    sidewalkWidth: 1.7,
    curbWidth: 0.38,
    points: [
      [57.2, -31.0],
      [62.0, -31.0],
      [67.0, -28.5],
    ],
  },
  roundaboutSouth: {
    id: 'roundabout-south',
    width: 7.2,
    laneWidth: 3.2,
    sidewalkWidth: 1.7,
    curbWidth: 0.38,
    points: [
      [48.0, -21.8],
      [49.0, -16.0],
      [53.0, -10.0],
      [59.0, -6.0],
    ],
  },
} satisfies Record<string, CityRoadDefinition>

export const ROUNDABOUT = {
  center: [48.0, -31.0] as const,
  islandRadius: 4.0,
  laneRadius: 6.25,
  roadOuterRadius: 8.0,

  entryWest: [39.35, -31.0] as const,
  exitWest: [37.5, -31.0] as const,

  entryNorth: [48.0, -40.2] as const,
  exitNorth: [48.0, -43.2] as const,

  entryEast: [57.2, -31.0] as const,
  exitEast: [60.2, -31.0] as const,

  entrySouth: [48.0, -21.8] as const,
  exitSouth: [48.0, -18.8] as const,
} as const

export const CITY_LIMITS = {
  width: 136,
  depth: 112,
} as const

export type WorldWaypoint = {
  x: number
  z: number
  speed?: number
  wait?: number
}
