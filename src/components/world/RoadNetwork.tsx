import { useMemo } from 'react'
import * as THREE from 'three'
import { StreetLamp, Tree } from './StreetFurniture'

type Vec2Point = [number, number]

function buildRibbonGeometry(points: Vec2Point[], width: number, y = 0) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, y, z)),
    false,
    'catmullrom',
    0.35,
  )
  const samples = curve.getPoints(Math.max(24, points.length * 16))
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

function RoadRibbon({
  points,
  width,
  color = '#2a3033',
  y = 0.028,
  rain = 0,
}: {
  points: Vec2Point[]
  width: number
  color?: string
  y?: number
  rain?: number
}) {
  const geometry = useMemo(() => buildRibbonGeometry(points, width, y), [points, width, y])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        roughness={Math.max(0.26, 0.9 - rain * 0.52)}
        metalness={Math.min(0.18, rain * 0.16)}
      />
    </mesh>
  )
}

function MarkingRibbon({
  points,
  width = 0.10,
  color = '#f1f1eb',
  dashed = false,
  y = 0.055,
}: {
  points: Vec2Point[]
  width?: number
  color?: string
  dashed?: boolean
  y?: number
}) {
  if (!dashed) {
    const geometry = useMemo(() => buildRibbonGeometry(points, width, y), [points, width, y])
    return (
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    )
  }

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        points.map(([x, z]) => new THREE.Vector3(x, y, z)),
        false,
        'catmullrom',
        0.35,
      ),
    [points, y],
  )
  const pieces = 18

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
            <planeGeometry args={[length * 0.76, width]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        )
      })}
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
        <meshStandardMaterial color="#5f7654" roughness={1} />
      </mesh>
      {points.slice(1, -1).map(([x, z], index) => (
        <group key={index}>
          <Tree position={[x, 0.08, z]} scale={0.42 + (index % 2) * 0.08} />
          <StreetLamp
            position={[x + 1.2, 0.08, z + (index % 2 ? 0.5 : -0.5)]}
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
  const [width, depth] = size
  const spacing = 1.65
  const diagonalLength = Math.hypot(width, depth)
  const count = Math.ceil((width + depth) / spacing)

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.08]} />
        <meshBasicMaterial color="#e5bd2e" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.001, depth]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.08]} />
        <meshBasicMaterial color="#e5bd2e" toneMapped={false} />
      </mesh>
      <mesh position={[-width / 2, 0.001, depth / 2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[depth, 0.08]} />
        <meshBasicMaterial color="#e5bd2e" toneMapped={false} />
      </mesh>
      <mesh position={[width / 2, 0.001, depth / 2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[depth, 0.08]} />
        <meshBasicMaterial color="#e5bd2e" toneMapped={false} />
      </mesh>

      {Array.from({ length: count }).map((_, index) => {
        const offset = (index - count / 2) * spacing
        return (
          <group key={index}>
            <mesh position={[offset, 0.003, depth / 2]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
              <planeGeometry args={[diagonalLength, 0.07]} />
              <meshBasicMaterial color="#e5bd2e" toneMapped={false} />
            </mesh>
            <mesh position={[offset, 0.004, depth / 2]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
              <planeGeometry args={[diagonalLength, 0.07]} />
              <meshBasicMaterial color="#e5bd2e" toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
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
          position={[
            -width / 2 + ((index + 0.5) * width) / stripes,
            0.063,
            0,
          ]}
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

const EAST_BOULEVARD_CENTER: Vec2Point[] = [
  [6.5, -2],
  [14, -3],
  [22, -5],
  [29, -9],
  [34, -15],
  [37, -23],
  [38.5, -31],
]

const EAST_BOULEVARD_LEFT_MARK: Vec2Point[] = EAST_BOULEVARD_CENTER.map(([x, z]) => [x - 3.2, z])
const EAST_BOULEVARD_RIGHT_MARK: Vec2Point[] = EAST_BOULEVARD_CENTER.map(([x, z]) => [x + 3.2, z])

const WEST_PARK_ROAD: Vec2Point[] = [
  [-7, 4],
  [-14, 7],
  [-22, 10],
  [-30, 12],
  [-38, 11],
  [-43, 7],
]

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

  return (
    <>
      {/* Sweeping multi-lane boulevard inspired by the reference image. */}
      <RoadRibbon points={EAST_BOULEVARD_CENTER} width={13.4} rain={rain} />
      <MarkingRibbon points={EAST_BOULEVARD_CENTER} width={0.12} color="#f2f2ed" dashed />
      <MarkingRibbon points={EAST_BOULEVARD_LEFT_MARK} width={0.10} color="#f2f2ed" dashed />
      <MarkingRibbon points={EAST_BOULEVARD_RIGHT_MARK} width={0.10} color="#f2f2ed" dashed />

      {/* Narrow landscaped divider follows the boulevard instead of a straight median. */}
      <LandscapedMedian
        points={[
          [13, -2.9],
          [21, -4.8],
          [28, -8.5],
          [33, -13.5],
        ]}
        width={1.15}
        nightFactor={nightFactor}
      />

      {/* Park-side curved local street. */}
      <RoadRibbon points={WEST_PARK_ROAD} width={7.4} color="#252c2f" rain={rain} />
      <MarkingRibbon points={WEST_PARK_ROAD} width={0.09} color="#f2f2ed" dashed />

      {/* Channelising islands shape entries and exits, like the reference. */}
      <Island position={[31.5, 0, -4.2]} rotationY={0.42} scale={[1.55, 0.72]} />
      <Island position={[35.4, 0, -18.8]} rotationY={-0.28} scale={[1.7, 0.72]} />
      <Island position={[-33.5, 0, 11.4]} rotationY={0.12} scale={[1.25, 0.72]} />

      {/* Secondary junction details. */}
      <YellowBox position={[-31, 0.065, 4.1]} size={[7.0, 6.2]} rotationY={0.08} />
      <YellowBox position={[3.7, 0.065, -28.0]} size={[8.4, 7.4]} rotationY={0} />

      <ZebraCrossingLocal position={[-31.4, 0, 0.5]} rotationY={Math.PI / 2} width={7.6} depth={3.0} />
      <ZebraCrossingLocal position={[-36.0, 0, 9.5]} rotationY={0.12} width={6.8} depth={2.8} />
      <ZebraCrossingLocal position={[32.0, 0, -9.0]} rotationY={0.55} width={7.4} depth={2.8} />
      <ZebraCrossingLocal position={[37.0, 0, -22.0]} rotationY={0.12} width={7.6} depth={2.8} />
    </>
  )
}
