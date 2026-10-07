import { ASPHALT_HEIGHT, asphaltMaterial, connectingPavementCovers } from './roadSurface'
import { useMemo } from 'react'
import * as THREE from 'three'
import { CITY_ROADS, MAIN_ROADS, MAIN_MARKING_SEGMENTS, DISTRICTS, SUPERMARKET_DRIVEWAYS, type CityRoadDefinition, type Vec2Point } from './cityLayout'
import { roadCurve as curveFrom, roadPose, roadWidthAt } from './roadGeometry'
import { StreetLamp, Tree } from './StreetFurniture'

function buildRibbonGeometry(points: Vec2Point[], width: number, y = 0, endWidth = width) {
  const curve = curveFrom(points, y)
  const samples = curve.getSpacedPoints(Math.min(256, Math.max(28, points.length * 18)))
  const vertices: number[] = []
  const indices: number[] = []

  for (let i = 0; i < samples.length; i++) {
    const half = THREE.MathUtils.lerp(width, endWidth, THREE.MathUtils.smoothstep(i / (samples.length - 1), 0.15, 0.8)) / 2
    const current = samples[i]
    const prev = samples[Math.max(0, i - 1)]
    const next = samples[Math.min(samples.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dz = next.z - prev.z
    const length = Math.max(0.0001, Math.hypot(dx, dz))
    const nx = -dz / length
    const nz = dx / length

    vertices.push(current.x + nx * half, y, current.z + nz * half)
    vertices.push(current.x - nx * half, y, current.z - nz * half)

    if (i < samples.length - 1) {
      const base = i * 2
      indices.push(base, base + 2, base + 1)
      indices.push(base + 1, base + 2, base + 3)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// Sidewalks and curbs are side bands; they do not occupy the road underneath.
// Leave actual openings at junctions and driveways instead of painting over a curb.
function buildShoulderGeometry(road: CityRoadDefinition, innerExtra: number, outerExtra: number, y: number) {
  const curve = curveFrom(road.points)
  const count = Math.min(256, Math.max(48, road.points.length * 24))
  const vertices: number[] = [], indices: number[] = []
  for (const side of [-1, 1] as const) {
    const base = vertices.length / 3
    for (let i = 0; i <= count; i++) {
      const t = i / count, point = curve.getPointAt(t), tangent = curve.getTangentAt(t)
      const half = roadWidthAt(road, t) / 2
      for (const extra of [innerExtra, outerExtra]) {
        vertices.push(point.x - tangent.z * side * (half + extra), y, point.z + tangent.x * side * (half + extra))
      }
      if (i === count) continue
      const mid = curve.getPointAt((i + 0.5) / count)
      const midTangent = curve.getTangentAt((i + 0.5) / count)
      const midHalf = roadWidthAt(road, (i + 0.5) / count) / 2
      if ([innerExtra, (innerExtra + outerExtra) / 2, outerExtra].some(extra => connectingPavementCovers(road.id,
        [mid.x - midTangent.z * side * (midHalf + extra), mid.z + midTangent.x * side * (midHalf + extra)]))) continue
      const n = base + i * 2
      if (side === 1) indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2)
      else indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  return geometry
}

function edgeSegments(road: CityRoadDefinition, points: Vec2Point[]) {
  const result: Vec2Point[][] = [], current: Vec2Point[] = []
  for (const p of points) {
    const blocked = connectingPavementCovers(road.id, p)
    if (blocked) {
      if (current.length > 1) result.push(current.splice(0))
      else current.length = 0
    } else current.push(p)
  }
  if (current.length > 1) result.push(current)
  return result
}

function offsetPath(road: CityRoadDefinition, fraction: number): Vec2Point[] {
  const curve = curveFrom(road.points)
  return Array.from({ length: 161 }, (_, i) => {
    const t = i / 160
    const { point } = roadPose(curve, t, roadWidthAt(road, t) * fraction)
    return [point.x, point.z]
  })
}

function RoadRibbon({
  road,
  rain = 0,
  surface = true,
}: {
  road: CityRoadDefinition
  rain?: number
  surface?: boolean
}) {
  const sidewalkWidth = road.sidewalkWidth ?? 0
  const curbWidth = road.curbWidth ?? 0
  const sidewalkGeometry = useMemo(
    () => buildShoulderGeometry(road, curbWidth, curbWidth + sidewalkWidth, 0.012),
    [road, curbWidth, sidewalkWidth],
  )
  const curbGeometry = useMemo(
    () => buildShoulderGeometry(road, 0, curbWidth, 0.020),
    [road, curbWidth],
  )
  const roadGeometry = useMemo(
    () => buildRibbonGeometry(road.points, road.width, ASPHALT_HEIGHT, road.endWidth ?? road.width),
    [road.points, road.width, road.endWidth],
  )

  return (
    <group>
      {sidewalkWidth > 0 && (
        <mesh geometry={sidewalkGeometry}>
          <meshStandardMaterial color="#9ca3a0" roughness={0.96} />
        </mesh>
      )}
      {curbWidth > 0 && (
        <mesh geometry={curbGeometry}>
          <meshStandardMaterial color="#c1c3be" roughness={0.93} />
        </mesh>
      )}
      {surface && <mesh geometry={roadGeometry}>
        <meshStandardMaterial {...asphaltMaterial(rain)} />
      </mesh>
      }
    </group>
  )
}

function MarkingRibbon({
  points,
  width = 0.10,
  color = '#f1f1eb',
  dashed = false,
  y = 0.056,
}: {
  points: Vec2Point[]
  width?: number
  color?: string
  dashed?: boolean
  y?: number
}) {
  const geometry = useMemo(() => buildRibbonGeometry(points, width, y), [points, width, y])
  const curve = useMemo(() => curveFrom(points, y), [points, y])

  if (!dashed) {
    return (
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
    )
  }

  const pieces = 22
  return (
    <>
      {Array.from({ length: pieces }).map((_, index) => {
        if (index % 2 === 1) return null
        const a = curve.getPointAt(index / pieces)
        const b = curve.getPointAt((index + 1) / pieces)
        const mid = a.clone().lerp(b, 0.5)
        const length = a.distanceTo(b)
        const angle = -Math.atan2(b.z - a.z, b.x - a.x)

        return (
          <mesh key={index} position={[mid.x, y, mid.z]} rotation={[-Math.PI / 2, 0, angle]}>
            <planeGeometry args={[length * 0.72, width]} />
            <meshBasicMaterial color={color} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
          </mesh>
        )
      })}
    </>
  )
}

function RoadMarkings({ road }: { road: CityRoadDefinition }) {
  const paths = useMemo(() => {
    const inset = Math.ceil((road.markingInset ?? 0) / curveFrom(road.points).getLength() * 160)
    const trim = (points: Vec2Point[]) => inset ? points.slice(inset, points.length - inset) : points
    return {
      center: trim(offsetPath(road, 0)),
      edges: ([-1, 1] as const).flatMap(side => edgeSegments(road, trim(offsetPath(road, side * 0.485)))),
      dividers: [-0.25, 0.25].map(f => { const points = trim(offsetPath(road, f)); return (road.endWidth ?? road.width) < road.width ? points.slice(0, 85) : points }),
    }
  }, [road])
  return (
    <>
      <MarkingRibbon points={paths.center} width={0.12} color="#e4bf3d" />
      {paths.edges.map((points, index) => (
        <MarkingRibbon key={index} points={points} width={0.10} />
      ))}
      {road.width > 10 && paths.dividers.map((points, index) => (
        <MarkingRibbon key={index} points={points} dashed />
      ))}
    </>
  )
}

function LandscapedMedian({
  points,
  width,
  nightFactor,
}: {
  points: Vec2Point[]
  width: number
  nightFactor: number
}) {
  const geometry = useMemo(() => buildRibbonGeometry(points, width, 0.07), [points, width])

  return (
    <>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#5b7652" roughness={1} />
      </mesh>
      {points.filter((_, i) => i > 0 && i < points.length - 1 && i % 16 === 0).map(([x, z], index) => (
        <group key={index}>
          <Tree position={[x, 0.08, z]} scale={0.40 + (index % 2) * 0.08} />
          <StreetLamp
            position={[x, 0.08, z]}
            nightFactor={nightFactor}
          />
        </group>
      ))}
    </>
  )
}

function YellowBox({
  position,
  size,
  rotationY = 0,
}: {
  position: [number, number, number]
  size: [number, number]
  rotationY?: number
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.clearRect(0, 0, 512, 512)
    ctx.strokeStyle = '#e5bd2e'
    ctx.lineWidth = 8
    ctx.strokeRect(4, 4, 504, 504)

    const spacing = 72
    ctx.save()
    ctx.beginPath()
    ctx.rect(4, 4, 504, 504)
    ctx.clip()

    for (let x = -512; x < 1024; x += spacing) {
      ctx.beginPath()
      ctx.moveTo(x, 512)
      ctx.lineTo(x + 512, 0)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + 512, 512)
      ctx.stroke()
    }
    ctx.restore()

    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    return result
  }, [])

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotationY]}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={texture ?? undefined}
        transparent
        opacity={0.94}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function ZebraCrossingLocal({
  position,
  rotationY = 0,
  width = 8,
  depth = 3.2,
}: {
  position: [number, number, number]
  rotationY?: number
  width?: number
  depth?: number
}) {
  const stripes = 9
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: stripes }).map((_, index) => (
        <mesh
          key={index}
          position={[-width / 2 + ((index + 0.5) * width) / stripes, 0.063, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[width / stripes * 0.62, depth]} />
          <meshBasicMaterial color="#f1f1ec" toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function CivicGarden({ nightFactor }: { nightFactor: number }) {
  return (
    <group position={DISTRICTS.garden.position}>
      <mesh position={[0, 0.10, 0]}>
        <boxGeometry args={[DISTRICTS.garden.size[0], 0.20, DISTRICTS.garden.size[1]]} />
        <meshStandardMaterial color="#587451" roughness={1} />
      </mesh>

      {[
        [-5.4, -1.8],
        [-2.4, 1.5],
        [1.0, -1.6],
        [4.9, 1.2],
      ].map(([x, z], index) => (
        <Tree key={index} position={[x, 0.18, z]} scale={0.54 + (index % 2) * 0.1} />
      ))}

      {[-6.5, -3.25, 0, 3.25, 6.5].map((x) => (
        <mesh key={x} position={[x, 0.23, 2.35]}>
          <boxGeometry args={[2.25, 0.24, 1.05]} />
          <meshStandardMaterial color={x === 0 ? '#6f5b86' : '#496d49'} roughness={1} />
        </mesh>
      ))}

      <StreetLamp position={[-6.4, 0.1, -2.4]} nightFactor={nightFactor} />
      <StreetLamp position={[6.4, 0.1, 2.4]} nightFactor={nightFactor} />
    </group>
  )
}

const BOULEVARD_MEDIAN = offsetPath(CITY_ROADS.eastBoulevard, 0).slice(25, 85)
export function UrbanRoadNetwork({
  rain,
  nightFactor,
  quality,
}: {
  rain: number
  nightFactor: number
  quality: 'low' | 'medium' | 'high'
}) {

  const boulevard = CITY_ROADS.eastBoulevard
  const parkRoad = CITY_ROADS.westParkRoad
  const northAccess = CITY_ROADS.roundaboutNorth
  const eastAccess = CITY_ROADS.roundaboutEast
  const southAccess = CITY_ROADS.roundaboutSouth
  const parkCrossing = useMemo(() => {
    const curve = curveFrom(parkRoad.points)
    return roadPose(curve, 12 / curve.getLength())
  }, [parkRoad])

  return (
    <>
      {MAIN_MARKING_SEGMENTS.map(road => <RoadMarkings key={road.id} road={road} />)}
      {MAIN_ROADS.map((road) => <RoadRibbon key={road.id} road={road} surface={false} />)}
      <RoadRibbon road={CITY_ROADS.supermarketAccess} rain={rain} />
      <RoadMarkings road={CITY_ROADS.supermarketAccess} />
      <mesh position={[-32, 0.05, -11.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 3]} />
        <meshStandardMaterial color="#587451" roughness={1} />
      </mesh>
      {quality !== 'low' && <Tree position={[-32, 0.06, -11.5]} scale={0.65} />}
      {Object.values(SUPERMARKET_DRIVEWAYS).map(road => <RoadRibbon key={road.id} road={road} rain={rain} />)}
      <RoadRibbon road={boulevard} rain={rain} />
      <RoadMarkings road={boulevard} />

      {quality !== 'low' && <LandscapedMedian
        points={BOULEVARD_MEDIAN}
        width={1.05}
        nightFactor={nightFactor}
      />}

      <RoadRibbon road={parkRoad} rain={rain} />
      <RoadMarkings road={parkRoad} />
      {quality !== 'low' && <>
        <CivicGarden nightFactor={nightFactor} />
      </>}

      {/* Three real continuations after the roundabout. */}
      <RoadRibbon road={northAccess} rain={rain} />
      <RoadMarkings road={northAccess} />
      <RoadRibbon road={eastAccess} rain={rain} />
      <RoadMarkings road={eastAccess} />
      <RoadRibbon road={southAccess} rain={rain} />
      <RoadMarkings road={southAccess} />

      <YellowBox position={[CITY_ROADS.westParkRoad.points[0][0], 0.066, 0]} size={[7.0, 12.0]} />
      <ZebraCrossingLocal position={[parkCrossing.point.x, 0, parkCrossing.point.z]} rotationY={Math.PI / 2 - Math.atan2(parkCrossing.tangent.z, parkCrossing.tangent.x)} width={parkRoad.width} depth={2.5} />
      <ZebraCrossingLocal position={[48, 0, -43]} width={7.2} depth={2.5} />
    </>
  )
}
