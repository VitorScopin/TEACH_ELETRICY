import * as THREE from 'three'
import { BOULEVARD_START, CITY_ROADS, ROUNDABOUT, SUPERMARKET, type ParkingSpotDefinition, type CityRoadDefinition, type Vec2Point } from './cityLayout'

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
export const HORIZONTAL_ROAD_EXIT = BOULEVARD_START + BOULEVARD_LENGTH

export function horizontalRoadPose(progress: number, laneOffset: number, reverse = false) {
  const x = reverse ? -progress : progress
  if (x <= BOULEVARD_START) {
    return { position: [x, 0.04, reverse ? -laneOffset : laneOffset] as [number, number, number], rotationY: reverse ? Math.PI : 0 }
  }
  const t = (x - BOULEVARD_START) / BOULEVARD_LENGTH
  const { point, tangent } = roadPose(BOULEVARD_CURVE, t, laneOffset, reverse)
  return { position: [point.x, 0.04, point.z] as [number, number, number], rotationY: -Math.atan2(tangent.z, tangent.x) }
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

export function parkingApproachCurve(spot: ParkingSpotDefinition) {
  const [sx] = spot.position
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-18, 0, -1.75),
    new THREE.Vector3(SUPERMARKET.entryX + 4, 0, -1.75),
    new THREE.Vector3(SUPERMARKET.entryX, 0, -6),
    new THREE.Vector3(SUPERMARKET.entryX, 0, SUPERMARKET.aisleZ + 3),
    new THREE.Vector3(SUPERMARKET.entryX + 2, 0, SUPERMARKET.aisleZ),
    new THREE.Vector3(sx - 2.8, 0, SUPERMARKET.aisleZ),
  ], false, 'catmullrom', 0.2)
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
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(spot.position[0] - 2.8, 0, SUPERMARKET.aisleZ),
    new THREE.Vector3(SUPERMARKET.exitX - 2, 0, SUPERMARKET.aisleZ),
    new THREE.Vector3(SUPERMARKET.exitX, 0, SUPERMARKET.aisleZ + 3),
    new THREE.Vector3(SUPERMARKET.exitX, 0, -6),
    new THREE.Vector3(SUPERMARKET.exitX - 3, 0, -1.75),
    new THREE.Vector3(-30, 0, -1.75),
    new THREE.Vector3(-68, 0, -1.75),
  ], false, 'catmullrom', 0.2)
}

