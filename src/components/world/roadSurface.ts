import { CITY_ROADS, MAIN_ROADS, SUPERMARKET_DRIVEWAYS, type Vec2Point } from './cityLayout'
import { roadCurve, roadWidthAt } from './roadGeometry'

export const ASPHALT_HEIGHT = 0.03
export function asphaltMaterial(rain: number) {
  return {
    color: '#252b2e',
    roughness: Math.max(0.24, 0.86 - rain * 0.54),
    metalness: Math.min(0.2, 0.035 + rain * 0.165),
    polygonOffset: false,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 0,
  }
}

const pavement = [...Object.values(CITY_ROADS), ...MAIN_ROADS, ...Object.values(SUPERMARKET_DRIVEWAYS)].map(road => {
  const curve = roadCurve(road.points)
  const samples = Array.from({ length: 513 }, (_, i) => {
    const point = curve.getPointAt(i / 512)
    return { x: point.x, z: point.z, half: roadWidthAt(road, i / 512) / 2 + 0.06 }
  })
  return { id: road.id, samples,
    minX: Math.min(...samples.map(p => p.x - p.half)), maxX: Math.max(...samples.map(p => p.x + p.half)),
    minZ: Math.min(...samples.map(p => p.z - p.half)), maxZ: Math.max(...samples.map(p => p.z + p.half)),
  }
})

// Clip shoulders and edge paint using the actual connecting road footprint.
export function connectingPavementCovers(roadId: string, [x, z]: Vec2Point) {
  const ownId = roadId.startsWith('main-horizontal-') ? 'plc-horizontal' : roadId.startsWith('main-vertical-') ? 'plc-vertical' : roadId
  return pavement.some(road => road.id !== ownId && x >= road.minX && x <= road.maxX && z >= road.minZ && z <= road.maxZ &&
    road.samples.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 <= p.half ** 2))
}
