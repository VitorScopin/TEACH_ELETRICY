// Execute the production geometry with TypeScript's transpiler; no browser or GPU required.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename)
}
const THREE = require('three')
const { CITY_ROADS, ROUNDABOUT, BOULEVARD_START, CITY_LIMITS, MAIN_ROADS, CITY_FRAME_BUILDINGS, DISTRICTS, SUPERMARKET, SUPERMARKET_DRIVEWAYS, SUPERMARKET_PARKING_SPOTS } = require('../src/components/world/cityLayout.ts')
const { TRAFFIC_WORLD, TRAFFIC_GEOMETRY } = require('../src/simulation/trafficWorld.ts')
const { roadCurve, roadWidthAt, horizontalRoadPose, HORIZONTAL_ROAD_EXIT, roundaboutRoute, parkingApproachCurve, parkingAlignCurve, parkingExitCurve, supermarketPedestrianHeight } = require('../src/components/world/roadGeometry.ts')

assert(BOULEVARD_START > TRAFFIC_GEOMETRY.eastStopLineX + 4)
for (const reverse of [false, true]) {
  for (let x = -31; x <= BOULEVARD_START; x += 0.1) {
    const pose = horizontalRoadPose(reverse ? -x : x, 1.75, reverse)
    assert(Math.abs(pose.position[0] - x) < 1e-6)
    assert(Math.abs(pose.position[2] - (reverse ? -1.75 : 1.75)) < 1e-6)
  }
  const a = horizontalRoadPose(reverse ? -BOULEVARD_START : BOULEVARD_START, 1.75, reverse)
  const b = horizontalRoadPose(reverse ? -BOULEVARD_START - 1e-5 : BOULEVARD_START + 1e-5, 1.75, reverse)
  assert(new THREE.Vector3(...a.position).distanceTo(new THREE.Vector3(...b.position)) < 0.001, 'continuous straight/curve join')
  assert(Math.abs(a.rotationY - b.rotationY) < 0.001, 'continuous heading at PLC join')
}

for (const reverse of [false, true]) {
  let previous
  for (let distance = BOULEVARD_START; distance < HORIZONTAL_ROAD_EXIT; distance += 0.1) {
    const pose = horizontalRoadPose(reverse ? -distance : distance, 1.75, reverse)
    const point = new THREE.Vector3(...pose.position)
    if (previous) assert(point.distanceTo(previous) < 0.2, 'boulevard speed remains proportional to travelled distance')
    previous = point
  }
}

const roadSamples = Object.values(CITY_ROADS).flatMap(road => {
  const curve = roadCurve(road.points)
  return Array.from({ length: 1201 }, (_, i) => ({ point: curve.getPointAt(i / 1200), width: roadWidthAt(road, i / 1200) }))
})
const center = new THREE.Vector3(...[ROUNDABOUT.center[0], 0, ROUNDABOUT.center[1]])
const isPaved = point => {
  const radius = point.distanceTo(center)
  if (radius >= ROUNDABOUT.islandRadius + 0.14 && radius <= ROUNDABOUT.roadOuterRadius) return true
  return roadSamples.some(s => point.distanceTo(s.point) <= s.width / 2 + 0.03)
}
let sampled = 0
for (const entry of ['west', 'north', 'east', 'south']) {
  for (const exit of ['west', 'north', 'east', 'south']) {
    if (entry === exit) continue
    const curve = roundaboutRoute(entry, exit)
    let previous
    for (let i = 0; i <= 1000; i++) {
      const point = curve.getPointAt(i / 1000)
      const tangent = curve.getTangentAt(i / 1000)
      assert(point.distanceTo(center) > ROUNDABOUT.islandRadius + 1.05, `${entry}->${exit}: island clearance at ${i}`)
      assert(isPaved(point), `${entry}->${exit}: route leaves asphalt at ${i}`)
      // Verify the full footprint of the largest car, not just its centre.
      for (const forward of [-2.41, 2.41]) {
        for (const side of [-0.95, 0.95]) {
          const corner = point.clone().addScaledVector(tangent, forward).add(new THREE.Vector3(-tangent.z * side, 0, tangent.x * side))
          assert(corner.distanceTo(center) > ROUNDABOUT.islandRadius + 0.14, `${entry}->${exit}: body touches island at ${i}`)
          assert(isPaved(corner), `${entry}->${exit}: body leaves asphalt at ${i}: ${corner.x},${corner.z}`)
        }
      }
      if (previous) assert(point.distanceTo(previous) < 0.3, 'no position jumps')
      previous = point
      sampled++
    }
  }
}
// Conservative GLB footprints: normalized longest side bounds both axes.
for (const building of CITY_FRAME_BUILDINGS) {
  const half = ({ small: 7, medium: 9, large: 12 }[building.variant]) * (building.scale ?? 1) / 2
  const [x, , z] = building.position
  for (const road of [...Object.values(CITY_ROADS), ...MAIN_ROADS]) {
    const curve = roadCurve(road.points)
    for (let i = 0; i <= 500; i++) {
      const point = curve.getPointAt(i / 500)
      const dx = Math.max(0, Math.abs(point.x - x) - half)
      const dz = Math.max(0, Math.abs(point.z - z) - half)
      assert(Math.hypot(dx, dz) > roadWidthAt(road, i / 500) / 2 + (road.curbWidth ?? 0) + (road.sidewalkWidth ?? 0), `building ${x},${z} overlaps ${road.id} at ${i}`)
    }
  }
  const garden = DISTRICTS.garden
  assert(Math.abs(x - garden.position[0]) > half + garden.size[0] / 2 || Math.abs(z - garden.position[2]) > half + garden.size[1] / 2, 'building overlaps civic garden')
}
const { marketVehicleMustYield, marketPedestrianMustWait } = require('../src/components/world/parkingTraffic.ts')
const inRectangle = (p, x, z, width, depth) => Math.abs(p.x - x) <= width / 2 && Math.abs(p.z - z) <= depth / 2
const parkingRoadSamples = [...Object.values(SUPERMARKET_DRIVEWAYS), CITY_ROADS.supermarketAccess, ...MAIN_ROADS].flatMap(road => {
  const curve = roadCurve(road.points)
  return Array.from({ length: 1201 }, (_, i) => ({ point: curve.getPointAt(i / 1200), width: road.width }))
})
const parkingPaved = p => inRectangle(p, SUPERMARKET.parkingCenter[0], SUPERMARKET.parkingCenter[2], ...SUPERMARKET.parkingSize) || parkingRoadSamples.some(s => p.distanceTo(s.point) <= s.width / 2 + 0.03)
const bodyOverlapsRectangle = (point, tangent, x, z, width, depth) => {
  const dx = x - point.x, dz = z - point.z
  const normal = { x: -tangent.z, z: tangent.x }
  return [{ x: 1, z: 0 }, { x: 0, z: 1 }, tangent, normal].every(axis => {
    const carRadius = 2.41 * Math.abs(axis.x * tangent.x + axis.z * tangent.z) + 0.95 * Math.abs(axis.x * normal.x + axis.z * normal.z)
    const rectangleRadius = width / 2 * Math.abs(axis.x) + depth / 2 * Math.abs(axis.z)
    return Math.abs(dx * axis.x + dz * axis.z) < carRadius + rectangleRadius
  })
}
for (const spot of SUPERMARKET_PARKING_SPOTS.filter(s => !s.staticOccupied && !s.accessible)) {
  const curves = [parkingApproachCurve(spot), parkingAlignCurve(spot), parkingExitCurve(spot)]
  assert(curves[0].getPointAt(1).distanceTo(curves[1].getPointAt(0)) < 1e-6, 'continuous parking alignment')
  assert(curves[1].getPointAt(0).distanceTo(curves[2].getPointAt(0)) < 1e-6, 'reverse manoeuvre reconnects to aisle')
  for (const curve of curves) {
    for (let i = 0; i <= 500; i++) {
      const point = curve.getPointAt(i / 500)
      const tangent = curve.getTangentAt(i / 500)
      for (const occupied of SUPERMARKET_PARKING_SPOTS.filter(s => s.staticOccupied)) {
        assert(!bodyOverlapsRectangle(point, tangent, occupied.position[0], occupied.position[2], 1.9, 4.82), `parking ${spot.id}: body intersects ${occupied.id} at ${i}`)
      }
      for (const planter of SUPERMARKET.planters) assert(!bodyOverlapsRectangle(point, tangent, planter[0], planter[2], 1.45, 1.45), `parking ${spot.id}: body intersects planter at ${i}`)
      for (const forward of [-2.41, 2.41]) for (const side of [-0.95, 0.95]) {
        const corner = point.clone().addScaledVector(tangent, forward).add(new THREE.Vector3(-tangent.z * side, 0, tangent.x * side))
        assert(parkingPaved(corner), `parking ${spot.id}: body outside pavement at ${i}: ${corner.x},${corner.z}`)
        assert(!inRectangle(corner, SUPERMARKET.position[0], SUPERMARKET.position[2], SUPERMARKET.buildingSize[0], SUPERMARKET.buildingSize[2]), `parking ${spot.id}: car touches supermarket`)
        for (const planter of SUPERMARKET.planters) assert(!inRectangle(corner, planter[0], planter[2], 1.45, 1.45), `parking ${spot.id}: car touches planter ${planter}`)
        for (const occupied of SUPERMARKET_PARKING_SPOTS.filter(s => s.staticOccupied)) {
          assert(!inRectangle(corner, occupied.position[0], occupied.position[2], 1.9, 4.82), `parking ${spot.id}: collision with ${occupied.id}`)
        }
      }
    }
  }
}
const access = CITY_ROADS.supermarketAccess
assert.equal(access.points[0][1], 0, 'access street joins real main road')
assert.equal(access.points.at(-1)[1], 0, 'access street has a real continuation')
assert(access.points.at(-1)[0] + access.width / 2 < TRAFFIC_GEOMETRY.westStopLineX - 3, 'market junction stays outside PLC approach')
const accessible = SUPERMARKET_PARKING_SPOTS.find(s => s.accessible)
assert(accessible, 'accessible bay is preserved')
const doorDistance = spot => Math.hypot(spot.position[0] - SUPERMARKET.entrance[0], spot.position[2] - SUPERMARKET.entrance[2])
assert(SUPERMARKET_PARKING_SPOTS.filter(s => !s.accessible).every(s => doorDistance(s) > doorDistance(accessible)), 'accessible bay is nearest to the entrance')
for (const spot of SUPERMARKET_PARKING_SPOTS) {
  for (const other of SUPERMARKET_PARKING_SPOTS) {
    if (spot === other) continue
    assert(Math.abs(spot.position[0] - other.position[0]) >= 2.65 || Math.abs(spot.position[2] - other.position[2]) >= 5, 'parking bays do not overlap')
  }
  const transfer = SUPERMARKET.accessibleTransfer
  assert(Math.abs(spot.position[0] - transfer.center[0]) >= (2.65 + transfer.size[0]) / 2 || Math.abs(spot.position[2] - transfer.center[2]) >= (5 + transfer.size[1]) / 2, 'accessible transfer aisle stays clear of bays')
}
for (const points of SUPERMARKET.pedestrianPaths) {
  for (let segment = 0; segment < points.length; segment++) {
    const a = points[segment], b = points[(segment + 1) % points.length]
    for (let i = 0; i <= 100; i++) {
      const p = { x: THREE.MathUtils.lerp(a[0], b[0], i / 100), z: THREE.MathUtils.lerp(a[1], b[1], i / 100) }
      for (const spot of SUPERMARKET_PARKING_SPOTS) assert(!inRectangle(p, spot.position[0], spot.position[2], 2.65, 5), 'pedestrian does not walk through a bay')
      for (const planter of SUPERMARKET.planters) assert(!inRectangle(p, planter[0], planter[2], 1.8, 1.8), 'pedestrian clears planters')
      // The recessed entrance is the only opening within the building footprint.
      if (inRectangle(p, SUPERMARKET.position[0], SUPERMARKET.position[2], ...[SUPERMARKET.buildingSize[0], SUPERMARKET.buildingSize[2]])) {
        assert(Math.abs(p.x - SUPERMARKET.entrance[0]) < 2.8 && p.z > SUPERMARKET.position[2] + 2.9, 'pedestrian approaches the recessed door rather than a wall')
      }
    }
  }
}
assert(supermarketPedestrianHeight(SUPERMARKET.crossing.rampEndZ) > supermarketPedestrianHeight(SUPERMARKET.crossing.rampStartZ), 'ramp reaches raised front walk')
const cross = { x: SUPERMARKET.crossing.x, z: SUPERMARKET.aisleZ }
const moving = { visible: true, position: cross, userData: { parkingMoving: true } }
const sidewalk = { x: cross.x, z: cross.z + SUPERMARKET.aisleWidth / 2 + 0.6 }
assert(marketVehicleMustYield({ x: cross.x - 5, z: cross.z }, [{ position: cross }]), 'cars yield to a pedestrian on the zebra crossing')
assert(!marketVehicleMustYield({ x: cross.x - 5, z: cross.z }, [{ position: sidewalk }]), 'pedestrians waiting on sidewalk do not deadlock cars')
assert(marketPedestrianMustWait(sidewalk, cross.z - 6, [moving]), 'pedestrian waits before crossing a moving vehicle')
assert(!marketPedestrianMustWait(cross, cross.z - 6, [moving]), 'pedestrian already crossing continues to safety')
assert(!marketPedestrianMustWait(sidewalk, cross.z - 6, [{ ...moving, userData: { parkingMoving: false } }]), 'parked cars do not block pedestrians')
console.log(`City geometry passed: PLC straight lanes, continuous joins, ${sampled} roundabout samples, 48,048 vehicle corners, buildings, parking manoeuvres, accessible bay and pedestrian priority.`)
if (process.argv.includes('--map')) {
  const map = { buildings: CITY_FRAME_BUILDINGS, supermarket: SUPERMARKET, spots: SUPERMARKET_PARKING_SPOTS, garden: DISTRICTS.garden, roads: [...Object.values(CITY_ROADS), ...MAIN_ROADS].map(road => ({ ...road, samples: roadCurve(road.points).getSpacedPoints(180).map((p, i) => [p.x, p.z, roadWidthAt(road, i / 180)]) })), roundabout: ROUNDABOUT, limits: CITY_LIMITS }
  fs.writeFileSync(path.join(require('node:os').tmpdir(), 'teach-city-geometry.json'), JSON.stringify(map))
}
