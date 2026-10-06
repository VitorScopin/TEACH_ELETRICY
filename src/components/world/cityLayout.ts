import { TRAFFIC_WORLD } from '../../simulation/trafficWorld'

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
  endWidth?: number
  laneWidth?: number
  sidewalkWidth?: number
  curbWidth?: number
}

export const SUPERMARKET_PARKING_SPOTS: ParkingSpotDefinition[] = Array.from({ length: 10 }, (_, index) => {
  const rowA = index < 5
  return {
    id: `${rowA ? 'A' : 'B'}0${index % 5 + 1}`,
    position: [-28 + (index % 5) * 3.2, 0.04, rowA ? -14 : -24],
    rotationY: rowA ? -Math.PI / 2 : Math.PI / 2,
    accessible: index === 0,
    staticOccupied: [1, 3, 5, 8, 9].includes(index),
  }
})

export const SUPERMARKET = {
  position: [-21.5, 0.028, -30.5] as [number, number, number],
  parkingCenter: [-22.5, 0.028, -19] as [number, number, number],
  parkingSize: [25, 16] as [number, number],
  aisleZ: -19,
  entryX: -34,
  exitX: -12,
  drivewayWidth: 5.4,
} as const

export const DISTRICTS = {
  garden: { position: [-25, 0.04, 25] as [number, number, number], size: [15.5, 7] as [number, number] },
  commercialZ: 17.2,
} as const

// Include the crosswalk and the east stop bar in the straight PLC approach.
export const BOULEVARD_START = TRAFFIC_WORLD.intersectionHalf + TRAFFIC_WORLD.crosswalkWidth + TRAFFIC_WORLD.stopLineOffset + 5

/**
 * Single source of truth for the urban road network.
 * Changing a road's points moves its asphalt, curbs, sidewalks and markings together.
 */
export const CITY_ROADS = {
  eastBoulevard: {
    id: 'east-boulevard',
    width: TRAFFIC_WORLD.roadWidth,
    endWidth: 7.2,
    laneWidth: 3.2,
    sidewalkWidth: 2.2,
    curbWidth: 0.42,
    points: [
      [BOULEVARD_START, 0],
      [22, 0],
      [29, -6],
      [29, -15],
      [29, -24],
      [33, -30],
      [37, -31],
      [40.5, -31],
    ],
  },
  westParkRoad: {
    id: 'west-park-road',
    width: 7.4,
    laneWidth: 3.2,
    sidewalkWidth: 1.8,
    curbWidth: 0.38,
    points: [
      [-42, 0],
      [-42, 10],
      [-47, 17],
      [-57, 19],
      [-72, 19],
    ],
  },
  roundaboutNorth: {
    id: 'roundabout-north',
    width: 7.2,
    laneWidth: 3.2,
    sidewalkWidth: 1.7,
    curbWidth: 0.38,
    points: [
      [48.0, -38.5],
      [48.0, -46.0],
      [48.0, -60.0],
    ],
  },
  roundaboutEast: {
    id: 'roundabout-east',
    width: 7.2,
    laneWidth: 3.2,
    sidewalkWidth: 1.7,
    curbWidth: 0.38,
    points: [
      [55.5, -31.0],
      [62.0, -31.0],
      [72.0, -31.0],
    ],
  },
  roundaboutSouth: {
    id: 'roundabout-south',
    width: 7.2,
    laneWidth: 3.2,
    sidewalkWidth: 1.7,
    curbWidth: 0.38,
    points: [
      [48.0, -23.5],
      [48.0, -16.0],
      [53.0, -10.0],
      [59.0, -6.0],
      [72.0, -6.0],
    ],
  },
} satisfies Record<string, CityRoadDefinition>

export const ROUNDABOUT = {
  center: [48.0, -31.0] as const,
  islandRadius: 4.0,
  laneRadius: 6.25,
  roadOuterRadius: 8.0,

  entryWest: CITY_ROADS.eastBoulevard.points[CITY_ROADS.eastBoulevard.points.length - 1],
  exitWest: [37.5, -31.0] as const,

  entryNorth: CITY_ROADS.roundaboutNorth.points[0],
  exitNorth: [48.0, -43.2] as const,

  entryEast: CITY_ROADS.roundaboutEast.points[0],
  exitEast: [60.2, -31.0] as const,

  entrySouth: CITY_ROADS.roundaboutSouth.points[0],
  exitSouth: [48.0, -18.8] as const,
} as const

export const CITY_LIMITS = {
  width: 136,
  depth: 112,
} as const

export const MAIN_ROADS: CityRoadDefinition[] = [
  { id: 'plc-horizontal', points: [[-CITY_LIMITS.width / 2, 0], [BOULEVARD_START, 0]], width: TRAFFIC_WORLD.roadWidth, sidewalkWidth: 2.2, curbWidth: 0.42 },
  { id: 'plc-vertical', points: [[0, -CITY_LIMITS.depth / 2], [0, CITY_LIMITS.depth / 2]], width: TRAFFIC_WORLD.roadWidth, sidewalkWidth: 2.2, curbWidth: 0.42 },
]

export type WorldWaypoint = {
  x: number
  z: number
  speed?: number
  wait?: number
}

export const CITY_FRAME_BUILDINGS: Array<{
  variant: 'small' | 'medium' | 'large'
  position: [number, number, number]
  rotationY?: number
  scale?: number
}> = [
  { variant: 'medium', position: [-31.0, 0.028, 17.5], rotationY: Math.PI, scale: 0.82 },
  { variant: 'small', position: [-22.5, 0.028, 17.4], rotationY: Math.PI, scale: 0.84 },
  { variant: 'medium', position: [-13.8, 0.028, 17.2], rotationY: Math.PI, scale: 0.80 },
  { variant: 'medium', position: [-48.0, 0.028, -35.8], rotationY: Math.PI, scale: 0.84 },
  { variant: 'large', position: [-48.0, 0.028, -47.0], rotationY: Math.PI, scale: 0.88 },
  { variant: 'small', position: [-16, 0.028, -43], rotationY: Math.PI, scale: 0.86 },
  { variant: 'small', position: [14, 0.028, -50], rotationY: Math.PI, scale: 0.86 },
  { variant: 'medium', position: [20.0, 0.028, -36.0], rotationY: Math.PI, scale: 0.84 },
  { variant: 'large', position: [27.0, 0.028, -45.0], rotationY: Math.PI, scale: 0.82 },
  { variant: 'small', position: [-42.0, 0.028, -14.0], rotationY: Math.PI / 2, scale: 0.82 },
  { variant: 'medium', position: [-54.0, 0.028, -14.0], rotationY: Math.PI / 2, scale: 0.82 },
  { variant: 'small', position: [42.0, 0.028, -4.0], rotationY: -Math.PI / 2, scale: 0.84 },
  { variant: 'medium', position: [42.0, 0.028, 14.0], rotationY: -Math.PI / 2, scale: 0.82 },
]


export const PEDESTRIAN_PATHS: Array<Array<[number, number]>> = [
    // Walk around the supermarket rather than through its parking rows/building.
    [[-36.5, -10.2], [-10.1, -10.2], [-10.1, -35], [-36.5, -35]],
    // Frontage pavement, returning along the same sidewalk.
    [[9, 12], [30, 12], [9, 12]],
    // Garden paths stay inside the garden, clear of the buildings to its north.
    [[-31, 22], [-19, 22], [-31, 22]],
  ]
