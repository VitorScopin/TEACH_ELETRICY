import { useMemo } from 'react'
import * as THREE from 'three'
import { CITY_ROADS, MAIN_ROADS, DISTRICTS, PEDESTRIAN_PATHS, type CityRoadDefinition, type Vec2Point } from './cityLayout'
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
  color = '#2a3033',
  surface = true,
}: {
  road: CityRoadDefinition
  rain?: number
  color?: string
  surface?: boolean
}) {
  const sidewalkWidth = road.sidewalkWidth ?? 0
  const curbWidth = road.curbWidth ?? 0
  const sidewalkGeometry = useMemo(
    () => buildRibbonGeometry(road.points, road.width + 2 * (curbWidth + sidewalkWidth), 0.012, (road.endWidth ?? road.width) + 2 * (curbWidth + sidewalkWidth)),
    [road.points, road.width, road.endWidth, curbWidth, sidewalkWidth],
  )
  const curbGeometry = useMemo(
    () => buildRibbonGeometry(road.points, road.width + 2 * curbWidth, 0.020, (road.endWidth ?? road.width) + 2 * curbWidth),
    [road.points, road.width, road.endWidth, curbWidth],
  )
  const roadGeometry = useMemo(
    () => buildRibbonGeometry(road.points, road.width, 0.028, road.endWidth ?? road.width),
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
        <meshStandardMaterial
          color={color}
          roughness={Math.max(0.24, 0.9 - rain * 0.54)}
          metalness={Math.min(0.2, rain * 0.18)}
        />
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
        <meshBasicMaterial color={color} toneMapped={false} />
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
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        )
      })}
    </>
  )
}

function RoadMarkings({ road }: { road: CityRoadDefinition }) {
  const center = useMemo(() => offsetPath(road, 0), [road])
  const edges = useMemo(() => [-0.485, 0.485].map(f => offsetPath(road, f)), [road])
  const dividers = useMemo(() => [-0.25, 0.25].map(f => offsetPath(road, f).slice(0, 85)), [road])
  return (
    <>
      <MarkingRibbon points={center} width={0.12} color="#e4bf3d" />
      {edges.map((points, index) => (
        <MarkingRibbon key={index} points={points} width={0.10} />
      ))}
      {road.width > 10 && dividers.map((points, index) => (
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
            position={[x + 1.15, 0.08, z + (index % 2 ? 0.45 : -0.45)]}
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
const MARKET_FOOTPATHS: CityRoadDefinition[] = PEDESTRIAN_PATHS[0].map((point, i, points) => ({
  id: `market-footpath-${i}`, points: [point, points[(i + 1) % points.length]], width: 1.4,
}))

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

  return (
    <>
      {MAIN_ROADS.map((road) => <RoadRibbon key={road.id} road={road} surface={false} />)}
      <RoadRibbon road={boulevard} rain={rain} />
      <RoadMarkings road={boulevard} />

      {quality !== 'low' && <LandscapedMedian
        points={BOULEVARD_MEDIAN}
        width={1.05}
        nightFactor={nightFactor}
      />}

      <RoadRibbon road={parkRoad} rain={rain} color="#252c2f" />
      <RoadMarkings road={parkRoad} />
      {quality !== 'low' && <>
        <CivicGarden nightFactor={nightFactor} />
        {MARKET_FOOTPATHS.map((road) => (
          <RoadRibbon key={road.id} road={road} color="#9ca3a0" />
        ))}
      </>}

      {/* Three real continuations after the roundabout. */}
      <RoadRibbon road={northAccess} rain={rain} />
      <RoadMarkings road={northAccess} />
      <RoadRibbon road={eastAccess} rain={rain} />
      <RoadMarkings road={eastAccess} />
      <RoadRibbon road={southAccess} rain={rain} />
      <RoadMarkings road={southAccess} />

      <YellowBox position={[-42, 0.066, 0]} size={[7.0, 12.0]} />
      <ZebraCrossingLocal position={[-42, 0, 11]} width={7.4} depth={2.5} />
      <ZebraCrossingLocal position={[48, 0, -43]} width={7.2} depth={2.5} />
    </>
  )
}
