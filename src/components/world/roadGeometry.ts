import * as THREE from 'three'
import { BOULEVARD_START, CITY_ROADS, ROUNDABOUT, SUPERMARKET, SUPERMARKET_DRIVEWAYS, type ParkingSpotDefinition, type CityRoadDefinition, type Vec2Point } from './cityLayout'

export function roadCurve(points: Vec2Point[], y = 0) {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.35)
}

export function roadPose(curve: THREE.CatmullRomCurve3, t: number, offset = 0, reverse = false) {
  const point = curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1))
  const tangent = curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1))
  const side = reverse ? -offset : offset
  point.x -= tangent.z * side
  point.z += tangent.x * side
  return { point, tangent: reverse ? tangent.negate() : tangent }
}

export function roadWidthAt(road: CityRoadDefinition, t: number) {
  return THREE.MathUtils.lerp(road.width, road.endWidth ?? road.width, THREE.MathUtils.smoothstep(t, 0.15, 0.8))
}

export const BOULEVARD_CURVE = roadCurve(CITY_ROADS.eastBoulevard.points)
export const BOULEVARD_LENGTH = BOULEVARD_CURVE.getLength()

export function horizontalRoadPose(progress: number, laneOffset: number, reverse = false) {
  const x = reverse ? -progress : progress
  if (x <= BOULEVARD_START) {
    return { position: [x, 0.06, reverse ? -laneOffset : laneOffset] as [number, number, number], rotationY: reverse ? Math.PI : 0 }
  }
  const curve = reverse ? WEST_TRAFFIC_CURVE : EAST_TRAFFIC_CURVE
  const length = reverse ? WEST_TRAFFIC_LENGTH : EAST_TRAFFIC_LENGTH
  const distance = x - BOULEVARD_START
  const t = THREE.MathUtils.clamp(reverse ? 1 - distance / length : distance / length, 0, 1)
  const point = curve.getPointAt(t)
  const tangent = curve.getTangentAt(t)
  const yaw = -Math.atan2(tangent.z, tangent.x)
  // West curve is stored in travel direction; only progress is reversed.
  return { position: [point.x, 0.06, point.z] as [number, number, number], rotationY: reverse && yaw < 0 ? yaw + Math.PI * 2 : yaw }
}

export type RoundaboutLeg = 'west' | 'north' | 'east' | 'south'
const angles: Record<RoundaboutLeg, number> = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 }
const roads = { west: CITY_ROADS.eastBoulevard, north: CITY_ROADS.roundaboutNorth, east: CITY_ROADS.roundaboutEast, south: CITY_ROADS.roundaboutSouth }

export function roundaboutRoute(entry: RoundaboutLeg, exit: RoundaboutLeg) {
  const points: THREE.Vector3[] = []
  const radius = ROUNDABOUT.laneRadius
  const center = new THREE.Vector3(ROUNDABOUT.center[0], 0, ROUNDABOUT.center[1])
  const circle = (angle: number) => center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
  const tangent = (angle: number) => new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle))
  const start = angles[entry] - 0.65
  let finish = angles[exit] + 0.65
  while (finish >= start) finish -= 2 * Math.PI

  const appendRoad = (leg: RoundaboutLeg, incoming: boolean) => {
    const curve = roadCurve(roads[leg].points)
    const reverse = leg === 'west' ? !incoming : incoming
    // West traffic stays east of the PLC stop lines.
    const lower = leg === 'west' ? 0.25 : 0
    const steps = 80
    for (let i = 0; i <= steps; i++) {
      const t = THREE.MathUtils.lerp(reverse ? 1 : lower, reverse ? lower : 1, i / steps)
      points.push(roadPose(curve, t, 1.75, reverse).point)
    }
  }
  appendRoad(entry, true)
  const approachEnd = points[points.length - 1]
  const approachDirection = approachEnd.clone().sub(points[points.length - 2]).normalize()
  const entryJoin = new THREE.CubicBezierCurve3(approachEnd, approachEnd.clone().addScaledVector(approachDirection, 2), circle(start).addScaledVector(tangent(start), -2), circle(start))
  points.push(...entryJoin.getPoints(16).slice(1))
  const steps = Math.ceil((start - finish) * 24)
  for (let i = 1; i <= steps; i++) points.push(circle(THREE.MathUtils.lerp(start, finish, i / steps)))
  const arcEndIndex = points.length
  appendRoad(exit, false)
  const exitStart = points[arcEndIndex]
  const exitDirection = points[arcEndIndex + 1].clone().sub(exitStart).normalize()
  const exitJoin = new THREE.CubicBezierCurve3(circle(finish), circle(finish).addScaledVector(tangent(finish), 2), exitStart.clone().addScaledVector(exitDirection, -2), exitStart)
  points.splice(arcEndIndex, 0, ...exitJoin.getPoints(16).slice(1, -1))
  return new THREE.CatmullRomCurve3(points, false, 'centripetal')
}

const MARKET_ACCESS_CURVE = roadCurve(CITY_ROADS.supermarketAccess.points)
const MARKET_ENTRY_CURVE = roadCurve(SUPERMARKET_DRIVEWAYS.entry.points)
const MARKET_EXIT_CURVE = roadCurve(SUPERMARKET_DRIVEWAYS.exit.points)

function accessLanePoint(t: number, reverse = false) {
  const point = MARKET_ACCESS_CURVE.getPoint(t)
  const tangent = MARKET_ACCESS_CURVE.getTangent(t)
  const offset = reverse ? -1.75 : 1.75
  point.x -= tangent.z * offset
  point.z += tangent.x * offset
  return { point, tangent: reverse ? tangent.negate() : tangent }
}

function accessLanePoints(from: number, to: number, reverse = false) {
  return Array.from({ length: 81 }, (_, i) => accessLanePoint(THREE.MathUtils.lerp(from, to, i / 80), reverse).point)
}

export function parkingApproachCurve(spot: ParkingSpotDefinition) {
  const entryT = (SUPERMARKET.accessEntryIndex - 0.5) / (CITY_ROADS.supermarketAccess.points.length - 1)
  const laneStart = accessLanePoint(0)
  const mainTurn = new THREE.CubicBezierCurve3(
    new THREE.Vector3(CITY_ROADS.supermarketAccess.points[0][0] - 5, 0, SUPERMARKET.approachSpawn[1]),
    new THREE.Vector3(CITY_ROADS.supermarketAccess.points[0][0] + 1.75, 0, SUPERMARKET.approachSpawn[1]),
    laneStart.point.clone().addScaledVector(laneStart.tangent, -3), laneStart.point,
  )
  const laneEnd = accessLanePoint(entryT)
  const drivewayStart = MARKET_ENTRY_CURVE.getPoint(0.25)
  const drivewayTangent = MARKET_ENTRY_CURVE.getTangent(0.25)
  const turn = new THREE.CubicBezierCurve3(laneEnd.point, laneEnd.point.clone().addScaledVector(laneEnd.tangent, 2.5), drivewayStart.clone().addScaledVector(drivewayTangent, -2.5), drivewayStart)
  const points = [new THREE.Vector3(...[SUPERMARKET.approachSpawn[0], 0, SUPERMARKET.approachSpawn[1]]), ...mainTurn.getPoints(30), ...accessLanePoints(0, entryT).slice(1), ...turn.getPoints(24).slice(1)]
  for (let i = 1; i <= 48; i++) points.push(MARKET_ENTRY_CURVE.getPoint(THREE.MathUtils.lerp(0.25, 1, i / 48)))
  points.push(new THREE.Vector3(spot.position[0] - 2.8, 0, SUPERMARKET.aisleZ))
  return new THREE.CatmullRomCurve3(points, false, 'centripetal')
}

export function parkingAlignCurve(spot: ParkingSpotDefinition) {
  const [sx, , sz] = spot.position
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(sx - 2.8, 0, SUPERMARKET.aisleZ),
    new THREE.Vector3(sx - 1.2, 0, SUPERMARKET.aisleZ),
    new THREE.Vector3(sx, 0, THREE.MathUtils.lerp(SUPERMARKET.aisleZ, sz, 0.5)),
    new THREE.Vector3(sx, 0, sz),
  ], false, 'catmullrom', 0.2)
}

export function parkingExitCurve(spot: ParkingSpotDefinition) {
  const exitT = SUPERMARKET.accessExitIndex / (CITY_ROADS.supermarketAccess.points.length - 1)
  const lane = accessLanePoint(exitT, true)
  const drivewayEnd = MARKET_EXIT_CURVE.getPoint(0.65)
  const tangent = MARKET_EXIT_CURVE.getTangent(0.65)
  const turn = new THREE.CubicBezierCurve3(drivewayEnd, drivewayEnd.clone().addScaledVector(tangent, 2), lane.point.clone().addScaledVector(lane.tangent, -2), lane.point)
  const points = [new THREE.Vector3(spot.position[0] - 2.8, 0, SUPERMARKET.aisleZ), new THREE.Vector3(SUPERMARKET.exitX - 3, 0, SUPERMARKET.aisleZ)]
  for (let i = 0; i <= 48; i++) points.push(MARKET_EXIT_CURVE.getPoint(0.65 * i / 48))
  points.push(...turn.getPoints(24).slice(1), ...accessLanePoints(exitT, 0, true).slice(1))
  const end = accessLanePoint(0, true)
  const rootX = CITY_ROADS.supermarketAccess.points[0][0]
  const mainTurn = new THREE.CubicBezierCurve3(end.point, end.point.clone().addScaledVector(end.tangent, 3), new THREE.Vector3(rootX - 1.75, 0, -1.75), new THREE.Vector3(rootX - 5, 0, -1.75))
  points.push(...mainTurn.getPoints(30).slice(1), new THREE.Vector3(SUPERMARKET.departureEnd[0], 0, SUPERMARKET.departureEnd[1]))
  return new THREE.CatmullRomCurve3(points, false, 'centripetal')
}

export function supermarketPedestrianHeight(z: number) {
  const { rampStartZ, rampEndZ } = SUPERMARKET.crossing
  const t = THREE.MathUtils.clamp((z - rampStartZ) / (rampEndZ - rampStartZ), 0, 1)
  return THREE.MathUtils.lerp(0.055, SUPERMARKET.frontWalk.center[1] + SUPERMARKET.frontWalk.size[1] / 2 + 0.005, t)
}

function boulevardLanePoint(t: number, reverse = false) {
  const point = roadPose(BOULEVARD_CURVE, t, 1.75, reverse).point
  if (point.x < BOULEVARD_START + 2) point.z = reverse ? -1.75 : 1.75
  if (t === 0) point.x = BOULEVARD_START
  return point
}

// Full through routes: PLC -> boulevard -> circle -> east continuation, and back.
// Reference progress remains linear at the PLC stop bars in both directions.
const EAST_TRAFFIC_CURVE = new THREE.CatmullRomCurve3([
  ...Array.from({ length: 41 }, (_, i) => boulevardLanePoint(i / 160)),
  ...roundaboutRoute('west', 'east').getPoints(640).slice(1),
], false, 'centripetal')
const WEST_TRAFFIC_CURVE = new THREE.CatmullRomCurve3([
  ...roundaboutRoute('east', 'west').getPoints(640),
  ...Array.from({ length: 40 }, (_, i) => boulevardLanePoint(0.25 * (1 - (i + 1) / 40), true)),
], false, 'centripetal')
export const EAST_TRAFFIC_LENGTH = EAST_TRAFFIC_CURVE.getLength()
export const WEST_TRAFFIC_LENGTH = WEST_TRAFFIC_CURVE.getLength()
export const HORIZONTAL_ROAD_EXIT = BOULEVARD_START + EAST_TRAFFIC_LENGTH
export const WEST_TRAFFIC_SPAWN = -(BOULEVARD_START + WEST_TRAFFIC_LENGTH)

export function parkRoadRoute(reverse = false) {
  const curve = roadCurve(CITY_ROADS.westParkRoad.points)
  const rootX = CITY_ROADS.westParkRoad.points[0][0]
  const points: THREE.Vector3[] = []
  if (!reverse) {
    const join = roadPose(curve, 0.12, 1.75)
    const turn = new THREE.CubicBezierCurve3(new THREE.Vector3(-72, 0, 1.75), new THREE.Vector3(rootX - 6, 0, 1.75), join.point.clone().addScaledVector(join.tangent, -3), join.point)
    points.push(...turn.getPoints(40))
    for (let i = 1; i <= 100; i++) points.push(roadPose(curve, THREE.MathUtils.lerp(0.12, 1, i / 100), 1.75).point)
  } else {
    for (let i = 0; i <= 100; i++) points.push(roadPose(curve, THREE.MathUtils.lerp(1, 0.12, i / 100), 1.75, true).point)
    const end = roadPose(curve, 0.12, 1.75, true)
    const turn = new THREE.CubicBezierCurve3(end.point, end.point.clone().addScaledVector(end.tangent, 3), new THREE.Vector3(rootX - 3, 0, -1.75), new THREE.Vector3(rootX - 7, 0, -1.75))
    points.push(...turn.getPoints(30).slice(1), new THREE.Vector3(-72, 0, -1.75))
  }
  return new THREE.CatmullRomCurve3(points, false, 'centripetal')
}
