import { CITY_ROADS, MAIN_ROADS, SUPERMARKET_DRIVEWAYS, CITY_FRAME_BUILDINGS, ROUNDABOUT } from './cityLayout'
import { roadCurve, roadWidthAt } from './roadGeometry'

const samples = [...Object.values(CITY_ROADS), ...Object.values(SUPERMARKET_DRIVEWAYS), ...MAIN_ROADS].flatMap(road => {
  const curve = roadCurve(road.points)
  return Array.from({ length: 401 }, (_, i) => ({ point: curve.getPointAt(i / 400), halfWidth: roadWidthAt(road, i / 400) / 2, clearance: roadWidthAt(road, i / 400) / 2 + (road.curbWidth ?? 0) + (road.sidewalkWidth ?? 0) + 0.6 }))
})
const distanceToLot = (x: number, z: number, px: number, pz: number) => Math.hypot(Math.max(0, Math.abs(px - x) - 4), Math.max(0, Math.abs(pz - z) - 4.5))
const reserved = [
  { x: -26, z: -39, width: 38, depth: 38 }, // supermarket, parking and walks
  { x: 26, z: 13, width: 40, depth: 26 }, // shops and service station
  { x: -25, z: 25, width: 21, depth: 12 }, // public garden
]
export const URBAN_LOTS: Array<{ x: number; z: number; height: number; color: string }> = []
for (let z = -49; z <= 49; z += 12) {
  for (let x = -62; x <= 62; x += 11) {
    if (samples.some(s => distanceToLot(x, z, s.point.x, s.point.z) <= s.clearance)) continue
    if (distanceToLot(x, z, ...ROUNDABOUT.center) <= ROUNDABOUT.roadOuterRadius + 2.7) continue
    if (reserved.some(r => Math.abs(x - r.x) < 4 + r.width / 2 + 1 && Math.abs(z - r.z) < 4.5 + r.depth / 2 + 1)) continue
    if (CITY_FRAME_BUILDINGS.some(b => {
      const half = ({ small: 7, medium: 9, large: 12 }[b.variant]) * (b.scale ?? 1) / 2
      return Math.abs(x - b.position[0]) < 4 + half + 1 && Math.abs(z - b.position[2]) < 4.5 + half + 1
    })) continue
    const index = URBAN_LOTS.length
    URBAN_LOTS.push({ x, z, height: [5.5, 8, 11, 6.5, 4.2][index % 5], color: ['#d3c5a8', '#bdc7c5', '#b98366', '#e2d8c0', '#9daeb5'][index % 5] })
  }
}

export const AVENUE_FURNITURE = [
  ...[-48, -36, -24, 24, 36, 48].flatMap(z => [-9.7, 9.7].map(x => ({ x, z }))),
  ...[-60, -36, -24, 12].flatMap(x => [-9.7, 9.7].map(z => ({ x, z }))),
].filter(p => !samples.some(s => Math.hypot(s.point.x - p.x, s.point.z - p.z) < s.halfWidth + 1.2))
