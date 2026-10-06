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
  markingInset?: number
}

export const CITY_LIMITS = {
  width: 136,
  depth: 112,
} as const

export const CITY_BORDER = 8

export const SUPERMARKET = {
  // Facade faces +Z, directly toward the parking rows and access street.
  position: [-25, 0.028, -41] as [number, number, number],
  buildingSize: [25, 5.4, 9] as [number, number, number],
  entrance: [-24.5, 0.2, -37.55] as [number, number, number],
  frontWalk: { center: [-25, 0.1, -35] as [number, number, number], size: [27, 0.2, 3] as [number, number, number] },
  parkingCenter: [-26, 0.028, -25.5] as [number, number, number],
  parkingSize: [32, 16] as [number, number],
  aisleZ: -25.5,
  rowZ: { street: -20, facade: -31 },
  bins: [-33.5, 0.2, -35] as [number, number, number],
  bollards: [[-30, 0.5, -33.8], [-19, 0.5, -33.8]] as [number, number, number][],
  aisleWidth: 6,
  entryX: -40,
  exitX: -12,
  drivewayWidth: 5.8,
  parkingEntrance: [-40, -18] as Vec2Point,
  parkingExit: [-12, -19] as Vec2Point,
  accessEntryIndex: 3,
  accessExitIndex: 5,
  approachSpawn: [-64, 1.75] as Vec2Point,
  departureEnd: [-68, -1.75] as Vec2Point,
  crossing: { x: -24.5, southZ: -17.3, northZ: -35, width: 2.2, rampStartZ: -33, rampEndZ: -34.3 },
  accessibleTransfer: { center: [-25.7, 0.044, -31] as [number, number, number], size: [1.1, 5] as [number, number] },
  entranceSign: [-43.4, 0.028, -17.5] as [number, number, number],
  exitSign: [-8.6, 0.028, -19] as [number, number, number],
  cartShelter: [-37, 0.18, -35] as [number, number, number],
  totem: [-53, 0.028, -8] as [number, number, number],
  lamps: [[-43.5, 0.028, -20], [-43.5, 0.028, -30], [-9.8, 0.028, -20], [-9.8, 0.028, -30]] as [number, number, number][],
  planters: [[-40.5, 0.028, -32], [-10.5, 0.028, -32], [-36.2, 0.028, -17.8], [-11, 0.028, -47]] as [number, number, number][],
  pedestrianPaths: [
    [[-32, -16.5], [-24.5, -16.5], [-24.5, -35], [-24.5, -37.3], [-24.5, -35], [-24.5, -16.5]],
    [[-34.5, -35], [-24.5, -35], [-24.5, -37.3], [-24.5, -35]],
  ] as Vec2Point[][],
} as const

const PARKING_ROW_X = [-34, -30.8, -27.6, -21.4, -18.2]
const PARKING_FACADE_ROW_X = [-34, -30.8, -27.6, -20.6, -17.3]
export const SUPERMARKET_PARKING_SPOTS: ParkingSpotDefinition[] = Array.from({ length: 10 }, (_, index) => {
  // Move A01 next to the facade and its transfer aisle; B03 takes its old row slot.
  const slotIndex = index === 0 ? 7 : index === 7 ? 0 : index
  const rowA = slotIndex < 5
  return {
    id: `${index < 5 ? 'A' : 'B'}0${index % 5 + 1}`,
    position: [(rowA ? PARKING_ROW_X : PARKING_FACADE_ROW_X)[slotIndex % 5], 0.04, rowA ? SUPERMARKET.rowZ.street : SUPERMARKET.rowZ.facade],
    rotationY: rowA ? -Math.PI / 2 : Math.PI / 2,
    accessible: index === 0,
    staticOccupied: [1, 3, 5, 8, 9].includes(index),
  }
})

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
  supermarketAccess: {
    id: 'supermarket-access', width: 7, laneWidth: 3.2, sidewalkWidth: 1.6, curbWidth: 0.35, markingInset: TRAFFIC_WORLD.roadWidth / 2 + 0.5,
    points: [[-46, 0], [-46, -6], [-43, -12], [-40, -12], [-32, -12], [-24, -12], [-20, -8], [-20, 0]],
  },
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
      [-46, 0],
      [-46, 9],
      [-49, 17],
      [-57, 19],
      [-CITY_LIMITS.width / 2 - CITY_BORDER, 19],
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
      [48.0, -CITY_LIMITS.depth / 2 - CITY_BORDER],
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
      [CITY_LIMITS.width / 2 + CITY_BORDER, -31.0],
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
      [CITY_LIMITS.width / 2 + CITY_BORDER, -6.0],
    ],
  },
} satisfies Record<string, CityRoadDefinition>

export const SUPERMARKET_DRIVEWAYS: Record<'entry' | 'exit', CityRoadDefinition> = {
  entry: { id: 'market-entry', width: SUPERMARKET.drivewayWidth, points: [CITY_ROADS.supermarketAccess.points[SUPERMARKET.accessEntryIndex], SUPERMARKET.parkingEntrance, [-40, -24], [-39, SUPERMARKET.aisleZ], [-37.5, SUPERMARKET.aisleZ]] },
  exit: { id: 'market-exit', width: SUPERMARKET.drivewayWidth, points: [[SUPERMARKET.exitX, SUPERMARKET.aisleZ], SUPERMARKET.parkingExit, [-16, -16], CITY_ROADS.supermarketAccess.points[SUPERMARKET.accessExitIndex]] },
}

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

export const MAIN_ROADS: CityRoadDefinition[] = [
  { id: 'plc-horizontal', points: [[-CITY_LIMITS.width / 2 - CITY_BORDER, 0], [BOULEVARD_START, 0]], width: TRAFFIC_WORLD.roadWidth, sidewalkWidth: 2.2, curbWidth: 0.42 },
  { id: 'plc-vertical', points: [[0, -CITY_LIMITS.depth / 2 - CITY_BORDER], [0, CITY_LIMITS.depth / 2 + CITY_BORDER]], width: TRAFFIC_WORLD.roadWidth, sidewalkWidth: 2.2, curbWidth: 0.42 },
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
  { variant: 'small', position: [-15, 0.028, -51], rotationY: Math.PI, scale: 0.86 },
  { variant: 'small', position: [14, 0.028, -50], rotationY: Math.PI, scale: 0.86 },
  { variant: 'medium', position: [20.0, 0.028, -36.0], rotationY: Math.PI, scale: 0.84 },
  { variant: 'large', position: [27.0, 0.028, -45.0], rotationY: Math.PI, scale: 0.82 },
  { variant: 'small', position: [-56, 0.028, -27], rotationY: Math.PI / 2, scale: 0.82 },
  { variant: 'medium', position: [-54.0, 0.028, -14.0], rotationY: Math.PI / 2, scale: 0.82 },
  { variant: 'small', position: [42.0, 0.028, -4.0], rotationY: -Math.PI / 2, scale: 0.84 },
  { variant: 'medium', position: [42.0, 0.028, 14.0], rotationY: -Math.PI / 2, scale: 0.82 },
]


export const PEDESTRIAN_PATHS: Vec2Point[][] = [
  SUPERMARKET.pedestrianPaths[0],
  [[9, 12], [30, 12], [9, 12]],
  [[-31, 22], [-19, 22], [-31, 22]],
  SUPERMARKET.pedestrianPaths[1],
]

export const MAIN_MARKING_SEGMENTS: CityRoadDefinition[] = [
  ...[[-CITY_LIMITS.width / 2 - CITY_BORDER, -51], [-41, -25], [-15, -11], [11, BOULEVARD_START]].map(([from, to], i) => ({ id: `main-horizontal-${i}`, points: [[from, 0], [to, 0]] as Vec2Point[], width: TRAFFIC_WORLD.roadWidth })),
  ...[[-CITY_LIMITS.depth / 2 - CITY_BORDER, -11], [11, CITY_LIMITS.depth / 2 + CITY_BORDER]].map(([from, to], i) => ({ id: `main-vertical-${i}`, points: [[0, from], [0, to]] as Vec2Point[], width: TRAFFIC_WORLD.roadWidth })),
]
