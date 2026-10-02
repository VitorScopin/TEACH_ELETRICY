export const TRAFFIC_WORLD = {
  roadWidth: 14,
  laneWidth: 3.5,
  intersectionHalf: 7,
  crosswalkWidth: 3,
  crosswalkInnerEdge: 7.15,
  stopLineOffset: 1,
  shoulderOffset: 0.8,
  roadLength: 64,
  spawnX: -31,
  exitX: 31,
  eastboundLaneZ: 1.75,
  westboundLaneZ: -1.75,
  signalPoleHeight: 3.6,
  signalHeadHeight: 0.95,
  signalHeadWidth: 0.36,
  signalHeadDepth: 0.3,
} as const

export const TRAFFIC_GEOMETRY = {
  get westCrosswalkCenterX() {
    return -(TRAFFIC_WORLD.intersectionHalf + TRAFFIC_WORLD.crosswalkWidth / 2)
  },
  get eastCrosswalkCenterX() {
    return TRAFFIC_WORLD.intersectionHalf + TRAFFIC_WORLD.crosswalkWidth / 2
  },
  get westStopLineX() {
    return -(
      TRAFFIC_WORLD.intersectionHalf +
      TRAFFIC_WORLD.crosswalkWidth +
      TRAFFIC_WORLD.stopLineOffset
    )
  },
  get eastStopLineX() {
    return (
      TRAFFIC_WORLD.intersectionHalf +
      TRAFFIC_WORLD.crosswalkWidth +
      TRAFFIC_WORLD.stopLineOffset
    )
  },
  get northCrosswalkCenterZ() {
    return TRAFFIC_WORLD.intersectionHalf + TRAFFIC_WORLD.crosswalkWidth / 2
  },
  get southCrosswalkCenterZ() {
    return -(TRAFFIC_WORLD.intersectionHalf + TRAFFIC_WORLD.crosswalkWidth / 2)
  },
  get northStopLineZ() {
    return (
      TRAFFIC_WORLD.intersectionHalf +
      TRAFFIC_WORLD.crosswalkWidth +
      TRAFFIC_WORLD.stopLineOffset
    )
  },
  get southStopLineZ() {
    return -(
      TRAFFIC_WORLD.intersectionHalf +
      TRAFFIC_WORLD.crosswalkWidth +
      TRAFFIC_WORLD.stopLineOffset
    )
  },
  get mainSignalPosition(): [number, number, number] {
    return [
      TRAFFIC_GEOMETRY.westStopLineX - 0.25,
      0,
      TRAFFIC_WORLD.roadWidth / 2 + TRAFFIC_WORLD.shoulderOffset,
    ]
  },
} as const

export const VEHICLE_DIMENSIONS = {
  sedan: { length: 4.45, width: 1.82, bodyH: 0.72, cabinH: 0.72, cabinL: 2.15 },
  suv: { length: 4.7, width: 1.92, bodyH: 0.86, cabinH: 0.86, cabinL: 2.25 },
  hatch: { length: 4.05, width: 1.78, bodyH: 0.76, cabinH: 0.82, cabinL: 1.95 },
} as const

export type VehicleKind = keyof typeof VEHICLE_DIMENSIONS
