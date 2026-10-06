import { useMemo } from 'react'
import * as THREE from 'three'
import { CITY_ROADS, ROUNDABOUT, type CityRoadDefinition, type Vec2Point } from './cityLayout'
import { StreetLamp, Tree } from './StreetFurniture'

function curveFrom(points: Vec2Point[], y = 0) {
  return new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, y, z)),
    false,
    'catmullrom',
    0.35,
  )
}

function buildRibbonGeometry(points: Vec2Point[], width: number, y = 0) {
  const curve = curveFrom(points, y)
  const samples = curve.getPoints(Math.max(28, points.length * 18))
  const half = width / 2
  const vertices: number[] = []
  const indices: number[] = []

  for (let i = 0; i < samples.length; i++) {
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

function offsetPath(points: Vec2Point[], offset: number): Vec2Point[] {
  return points.map(([x, z], index) => {
    const prev = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const dx = next[0] - prev[0]
    const dz = next[1] - prev[1]
    const length = Math.max(0.0001, Math.hypot(dx, dz))
    const nx = -dz / length
    const nz = dx / length
    return [x + nx * offset, z + nz * offset]
  })
}

function RoadRibbon({
  road,
  rain = 0,
  color = '#2a3033',
}: {
  road: CityRoadDefinition
  rain?: number
  color?: string
}) {
  const sidewalkWidth = road.sidewalkWidth ?? 0
  const curbWidth = road.curbWidth ?? 0
  const sidewalkGeometry = useMemo(
    () => buildRibbonGeometry(road.points, road.width + 2 * (curbWidth + sidewalkWidth), 0.012),
    [road.points, road.width, curbWidth, sidewalkWidth],
  )
  const curbGeometry = useMemo(
    () => buildRibbonGeometry(road.points, road.width + 2 * curbWidth, 0.020),
    [road.points, road.width, curbWidth],
  )
  const roadGeometry = useMemo(
    () => buildRibbonGeometry(road.points, road.width, 0.028),
    [road.points, road.width],
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
      <mesh geometry={roadGeometry}>
        <meshStandardMaterial
          color={color}
          roughness={Math.max(0.24, 0.9 - rain * 0.54)}
          metalness={Math.min(0.2, rain * 0.18)}
        />
      </mesh>
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
  const laneWidth = road.laneWidth ?? 3.2
  const dividerCount = Math.max(1, Math.round(road.width / laneWidth) - 1)
  const offsets = Array.from(
    { length: dividerCount },
    (_, index) => (index + 1) * (road.width / (dividerCount + 1)) - road.width / 2,
  )

  return (
    <>
      {offsets.map((offset) => (
        <MarkingRibbon
          key={offset}
          points={offsetPath(road.points, offset)}
          width={0.10}
          dashed
        />
      ))}
      <MarkingRibbon
        points={offsetPath(road.points, road.width / 2 - 0.18)}
        width={0.10}
      />
      <MarkingRibbon
        points={offsetPath(road.points, -road.width / 2 + 0.18)}
        width={0.10}
      />
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
      {points.slice(1, -1).map(([x, z], index) => (
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

function Island({
  position,
  rotationY = 0,
  scale = [1, 1] as [number, number],
}: {
  position: [number, number, number]
  rotationY?: number
  scale?: [number, number]
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={[scale[0], 1, scale[1]]}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[2.3, 2.45, 0.16, 32]} />
        <meshStandardMaterial color="#8c9491" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.19, 0]}>
        <cylinderGeometry args={[2.08, 2.18, 0.18, 32]} />
        <meshStandardMaterial color="#55724d" roughness={1} />
      </mesh>
      <Tree position={[0, 0.2, 0]} scale={0.62} />
    </group>
  )
}

function CivicGarden({ nightFactor }: { nightFactor: number }) {
  return (
    <group position={[-24.5, 0.04, 15.3]} rotation={[0, -0.18, 0]}>
      <mesh position={[0, 0.10, 0]}>
        <boxGeometry args={[15.5, 0.20, 7.0]} />
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

export function UrbanRoadNetwork({
  rain,
  nightFactor,
  quality,
}: {
  rain: number
  nightFactor: number
  quality: 'low' | 'medium' | 'high'
}) {
  if (quality === 'low') return null

  const boulevard = CITY_ROADS.eastBoulevard
  const parkRoad = CITY_ROADS.westParkRoad
  const northAccess = CITY_ROADS.roundaboutNorth
  const eastAccess = CITY_ROADS.roundaboutEast
  const southAccess = CITY_ROADS.roundaboutSouth

  return (
    <>
      <RoadRibbon road={boulevard} rain={rain} />
      <RoadMarkings road={boulevard} />

      <LandscapedMedian
        points={boulevard.points.slice(1, -2)}
        width={1.05}
        nightFactor={nightFactor}
      />

      <RoadRibbon road={parkRoad} rain={rain} color="#252c2f" />
      <RoadMarkings road={parkRoad} />
      <CivicGarden nightFactor={nightFactor} />

      {/* Three real continuations after the roundabout. */}
      <RoadRibbon road={northAccess} rain={rain} />
      <RoadMarkings road={northAccess} />
      <RoadRibbon road={eastAccess} rain={rain} />
      <RoadMarkings road={eastAccess} />
      <RoadRibbon road={southAccess} rain={rain} />
      <RoadMarkings road={southAccess} />

      {/* Channelising islands guide turning traffic rather than decorating a park. */}
      <Island position={[31.2, 0, -4.4]} rotationY={0.42} scale={[1.45, 0.66]} />
      <Island position={[35.5, 0, -18.7]} rotationY={-0.25} scale={[1.55, 0.68]} />
      <Island
        position={[ROUNDABOUT.entryWest[0] - 2.4, 0, ROUNDABOUT.entryWest[1] + 4.4]}
        rotationY={-0.18}
        scale={[1.1, 0.58]}
      />

      <YellowBox position={[-31, 0.066, 4.1]} size={[7.0, 6.2]} rotationY={0.08} />

      <ZebraCrossingLocal position={[-31.4, 0, 0.5]} rotationY={Math.PI / 2} width={7.6} depth={3.0} />
      <ZebraCrossingLocal position={[-36.0, 0, 9.5]} rotationY={0.12} width={6.8} depth={2.8} />

      {/* Crossings sit on straight approach sections, not inside the circle. */}
      <ZebraCrossingLocal
        position={[ROUNDABOUT.entryWest[0] - 2.0, 0, ROUNDABOUT.entryWest[1]]}
        rotationY={Math.PI / 2}
        width={7.0}
        depth={2.5}
      />
      <ZebraCrossingLocal
        position={[ROUNDABOUT.entryNorth[0], 0, ROUNDABOUT.entryNorth[1] - 2.0]}
        width={7.0}
        depth={2.5}
      />
    </>
  )
}
