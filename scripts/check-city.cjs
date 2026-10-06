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
const { CITY_ROADS, ROUNDABOUT, BOULEVARD_START, CITY_LIMITS, MAIN_ROADS, CITY_FRAME_BUILDINGS, DISTRICTS, SUPERMARKET, SUPERMARKET_PARKING_SPOTS } = require('../src/components/world/cityLayout.ts')
const { TRAFFIC_WORLD, TRAFFIC_GEOMETRY } = require('../src/simulation/trafficWorld.ts')
const { roadCurve, roadWidthAt, horizontalRoadPose, HORIZONTAL_ROAD_EXIT, roundaboutRoute, parkingApproachCurve, parkingAlignCurve, parkingExitCurve } = require('../src/components/world/roadGeometry.ts')

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
const inRectangle = (p, x, z, width, depth) => Math.abs(p.x - x) <= width / 2 && Math.abs(p.z - z) <= depth / 2
const parkingPaved = p => inRectangle(p, -42, 0, 60, 14) ||
  inRectangle(p, SUPERMARKET.parkingCenter[0], SUPERMARKET.parkingCenter[2], ...SUPERMARKET.parkingSize) ||
  [SUPERMARKET.entryX, SUPERMARKET.exitX].some(x => inRectangle(p, x, -10, SUPERMARKET.drivewayWidth, 19))
for (const spot of SUPERMARKET_PARKING_SPOTS.filter(s => !s.staticOccupied && !s.accessible)) {
  const curves = [parkingApproachCurve(spot), parkingAlignCurve(spot), parkingExitCurve(spot)]
  assert(curves[0].getPointAt(1).distanceTo(curves[1].getPointAt(0)) < 1e-6, 'continuous parking alignment')
  assert(curves[1].getPointAt(0).distanceTo(curves[2].getPointAt(0)) < 1e-6, 'reverse manoeuvre reconnects to aisle')
  for (const curve of curves) {
    for (let i = 0; i <= 500; i++) {
      const point = curve.getPointAt(i / 500)
      const tangent = curve.getTangentAt(i / 500)
      for (const forward of [-2.41, 2.41]) for (const side of [-0.95, 0.95]) {
        const corner = point.clone().addScaledVector(tangent, forward).add(new THREE.Vector3(-tangent.z * side, 0, tangent.x * side))
        assert(parkingPaved(corner), `parking ${spot.id}: body outside pavement at ${i}: ${corner.x},${corner.z}`)
        for (const occupied of SUPERMARKET_PARKING_SPOTS.filter(s => s.staticOccupied)) {
          assert(!inRectangle(corner, occupied.position[0], occupied.position[2], 1.9, 4.82), `parking ${spot.id}: collision with ${occupied.id}`)
        }
      }
    }
  }
}
console.log(`City geometry passed: PLC straight lanes, continuous joins, ${sampled} roundabout samples, 48,048 vehicle corners, buildings and parking manoeuvres.`)
if (process.argv.includes('--map')) {
  const map = { buildings: CITY_FRAME_BUILDINGS, supermarket: SUPERMARKET, spots: SUPERMARKET_PARKING_SPOTS, garden: DISTRICTS.garden, roads: [...Object.values(CITY_ROADS), ...MAIN_ROADS].map(road => ({ ...road, samples: roadCurve(road.points).getSpacedPoints(180).map((p, i) => [p.x, p.z, roadWidthAt(road, i / 180)]) })), roundabout: ROUNDABOUT, limits: CITY_LIMITS }
  fs.writeFileSync(path.join(require('node:os').tmpdir(), 'teach-city-geometry.json'), JSON.stringify(map))
}
