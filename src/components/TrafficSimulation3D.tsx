import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { TrafficState } from '../types'

type CarKind = 'sedan' | 'suv' | 'hatch'

type CarData = {
  id: number
  kind: CarKind
  color: string
  x: number
  speed: number
  desiredSpeed: number
  length: number
}

type TrafficSimulation3DProps = {
  traffic: TrafficState
  running: boolean
}

const COLORS = ['#2b6cb0', '#718096', '#dfe7eb', '#8b2f3c', '#263746', '#165a72']
const KINDS: CarKind[] = ['sedan', 'suv', 'hatch']

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.34, z]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.33, 0.33, 0.22, 20]} />
        <meshStandardMaterial color="#0c1115" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.235, 16]} />
        <meshStandardMaterial color="#73808a" metalness={0.65} roughness={0.35} />
      </mesh>
    </group>
  )
}

function CarModel({
  kind,
  color,
}: {
  kind: CarKind
  color: string
}) {
  const dims = useMemo(() => {
    if (kind === 'suv') return { length: 3.0, width: 1.46, bodyH: 0.58, cabinH: 0.64, cabinL: 1.48 }
    if (kind === 'hatch') return { length: 2.55, width: 1.38, bodyH: 0.52, cabinH: 0.58, cabinL: 1.28 }
    return { length: 2.8, width: 1.4, bodyH: 0.52, cabinH: 0.54, cabinL: 1.36 }
  }, [kind])

  const wheelX = dims.length * 0.31
  const wheelZ = dims.width * 0.48

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.58, 0]}>
        <boxGeometry args={[dims.length, dims.bodyH, dims.width]} />
        <meshStandardMaterial color={color} metalness={0.45} roughness={0.35} />
      </mesh>

      <mesh castShadow position={[-0.16, 0.58 + dims.bodyH * 0.72, 0]}>
        <boxGeometry args={[dims.cabinL, dims.cabinH, dims.width * 0.86]} />
        <meshStandardMaterial color={color} metalness={0.35} roughness={0.28} />
      </mesh>

      <mesh position={[-0.02, 0.86, dims.width * 0.435]}>
        <boxGeometry args={[dims.cabinL * 0.7, dims.cabinH * 0.46, 0.02]} />
        <meshStandardMaterial color="#19313e" metalness={0.05} roughness={0.1} transparent opacity={0.82} />
      </mesh>

      <mesh position={[-0.02, 0.86, -dims.width * 0.435]}>
        <boxGeometry args={[dims.cabinL * 0.7, dims.cabinH * 0.46, 0.02]} />
        <meshStandardMaterial color="#19313e" metalness={0.05} roughness={0.1} transparent opacity={0.82} />
      </mesh>

      <mesh position={[dims.length * 0.505, 0.62, dims.width * 0.3]}>
        <boxGeometry args={[0.04, 0.16, 0.22]} />
        <meshStandardMaterial color="#fff0b2" emissive="#ffe7a0" emissiveIntensity={2.1} />
      </mesh>
      <mesh position={[dims.length * 0.505, 0.62, -dims.width * 0.3]}>
        <boxGeometry args={[0.04, 0.16, 0.22]} />
        <meshStandardMaterial color="#fff0b2" emissive="#ffe7a0" emissiveIntensity={2.1} />
      </mesh>

      <mesh position={[-dims.length * 0.505, 0.62, dims.width * 0.31]}>
        <boxGeometry args={[0.04, 0.15, 0.23]} />
        <meshStandardMaterial color="#ff3838" emissive="#ff2020" emissiveIntensity={2.3} />
      </mesh>
      <mesh position={[-dims.length * 0.505, 0.62, -dims.width * 0.31]}>
        <boxGeometry args={[0.04, 0.15, 0.23]} />
        <meshStandardMaterial color="#ff3838" emissive="#ff2020" emissiveIntensity={2.3} />
      </mesh>

      <Wheel x={wheelX} z={wheelZ} />
      <Wheel x={wheelX} z={-wheelZ} />
      <Wheel x={-wheelX} z={wheelZ} />
      <Wheel x={-wheelX} z={-wheelZ} />
    </group>
  )
}

function TrafficLight3D({ traffic }: { traffic: TrafficState }) {
  const light = (on: boolean, color: string, y: number) => (
    <mesh position={[0, y, -0.19]}>
      <sphereGeometry args={[0.105, 18, 18]} />
      <meshStandardMaterial
        color={on ? color : '#12181c'}
        emissive={on ? color : '#000000'}
        emissiveIntensity={on ? 2.8 : 0}
        roughness={0.28}
      />
    </mesh>
  )

  return (
    <group position={[-5.9, 0, 3.65]} rotation={[0, Math.PI / 2, 0]}>
      <mesh castShadow position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.055, 0.07, 2.9, 14]} />
        <meshStandardMaterial color="#59666d" metalness={0.7} roughness={0.34} />
      </mesh>

      <mesh castShadow position={[0, 2.9, 0]}>
        <boxGeometry args={[0.42, 1.12, 0.38]} />
        <meshStandardMaterial color="#080d11" metalness={0.18} roughness={0.62} />
      </mesh>

      {light(traffic.red, '#ff332f', 3.23)}
      {light(traffic.yellow, '#ffca3a', 2.90)}
      {light(traffic.green, '#35e879', 2.57)}

      <mesh castShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 0.16, 14]} />
        <meshStandardMaterial color="#323d43" metalness={0.45} roughness={0.5} />
      </mesh>
    </group>
  )
}

function CityBlocks() {
  const blocks = useMemo(
    () => [
      [-10, 1.8, -8, 3.2, 3.6, 3.2],
      [-6, 2.6, -9, 2.4, 5.2, 2.7],
      [-1, 2.1, -9.2, 3.2, 4.2, 2.7],
      [4.3, 3.1, -9, 3.0, 6.2, 2.7],
      [9.2, 2.25, -8.6, 3.2, 4.5, 3.1],
    ],
    [],
  )

  return (
    <>
      {blocks.map(([x, y, z, sx, sy, sz], index) => (
        <mesh key={index} position={[x, y, z]} receiveShadow>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial color={index % 2 ? '#102936' : '#0d2330'} roughness={0.82} />
        </mesh>
      ))}
    </>
  )
}

function RoadMark({
  position,
  size,
  color = '#e7e8e1',
}: {
  position: [number, number, number]
  size: [number, number]
  color?: string
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

function RoadScene() {
  const intersectionHalf = 4.2

  const horizontalDashX = [-18, -15, -12, -9, 9, 12, 15, 18]
  const verticalDashZ = [-10, -7, 7, 10]

  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[44, 28]} />
        <meshStandardMaterial color="#0c1216" roughness={0.98} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[44, 8.4]} />
        <meshStandardMaterial color="#242b2f" roughness={0.86} metalness={0.04} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[8.4, 28]} />
        <meshStandardMaterial color="#242b2f" roughness={0.86} metalness={0.04} />
      </mesh>

      {/* Double yellow center line - horizontal road, interrupted through intersection */}
      {[-0.13, 0.13].map((z, lineIndex) => (
        <group key={`hy-${lineIndex}`}>
          <RoadMark position={[-13.1, 0.018, z]} size={[17.8, 0.07]} color="#e5c84e" />
          <RoadMark position={[13.1, 0.018, z]} size={[17.8, 0.07]} color="#e5c84e" />
        </group>
      ))}

      {/* Double yellow center line - vertical road */}
      {[-0.13, 0.13].map((x, lineIndex) => (
        <group key={`vy-${lineIndex}`}>
          <RoadMark position={[x, 0.019, -9.1]} size={[0.07, 9.8]} color="#e5c84e" />
          <RoadMark position={[x, 0.019, 9.1]} size={[0.07, 9.8]} color="#e5c84e" />
        </group>
      ))}

      {/* Dashed white lane separators - horizontal */}
      {[-2.1, 2.1].map((z) =>
        horizontalDashX.map((x, i) => (
          <RoadMark key={`hd-${z}-${i}`} position={[x, 0.02, z]} size={[1.55, 0.075]} />
        )),
      )}

      {/* Dashed white lane separators - vertical */}
      {[-2.1, 2.1].map((x) =>
        verticalDashZ.map((z, i) => (
          <RoadMark key={`vd-${x}-${i}`} position={[x, 0.021, z]} size={[0.075, 1.55]} />
        )),
      )}

      {/* Edge lines */}
      <RoadMark position={[0, 0.018, 4.05]} size={[44, 0.08]} />
      <RoadMark position={[0, 0.018, -4.05]} size={[44, 0.08]} />
      <RoadMark position={[4.05, 0.019, 0]} size={[0.08, 28]} />
      <RoadMark position={[-4.05, 0.019, 0]} size={[0.08, 28]} />

      {/* Stop lines before pedestrian crossings */}
      <RoadMark position={[-5.55, 0.03, 2.05]} size={[0.16, 3.65]} />
      <RoadMark position={[5.55, 0.03, -2.05]} size={[0.16, 3.65]} />
      <RoadMark position={[-2.05, 0.031, -5.55]} size={[3.65, 0.16]} />
      <RoadMark position={[2.05, 0.031, 5.55]} size={[3.65, 0.16]} />

      {/* Zebra crossings on all four sides */}
      {Array.from({ length: 7 }).map((_, i) => (
        <RoadMark key={`cw-west-${i}`} position={[-4.95 + i * 0.18, 0.034, 0]} size={[0.10, 7.25]} />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <RoadMark key={`cw-east-${i}`} position={[4.95 - i * 0.18, 0.034, 0]} size={[0.10, 7.25]} />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <RoadMark key={`cw-south-${i}`} position={[0, 0.035, -4.95 + i * 0.18]} size={[7.25, 0.10]} />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <RoadMark key={`cw-north-${i}`} position={[0, 0.035, 4.95 - i * 0.18]} size={[7.25, 0.10]} />
      ))}

      {/* Intersection boundary / asphalt patch */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, 0]}>
        <planeGeometry args={[intersectionHalf * 2, intersectionHalf * 2]} />
        <meshStandardMaterial color="#20272b" roughness={0.84} metalness={0.03} />
      </mesh>

      <CityBlocks />
    </>
  )
}

function TrafficCars({
  traffic,
}: {
  traffic: TrafficState
}) {
  const [cars, setCars] = useState<CarData[]>([])
  const carsRef = useRef<CarData[]>([])
  const refs = useRef(new Map<number, THREE.Group>())
  const idRef = useRef(1)
  const spawnClock = useRef(0)
  const stopLine = -5.55
  const exitX = 21
  const spawnX = -21

  useEffect(() => {
    carsRef.current = cars
  }, [cars])

  useFrame((_state, deltaRaw) => {
    const delta = Math.min(deltaRaw, 0.05)
    spawnClock.current += delta

    const ordered = [...carsRef.current].sort((a, b) => b.x - a.x)
    const firstSpawnGap = ordered.length === 0 || Math.min(...ordered.map((car) => car.x)) > -13.5

    if (spawnClock.current > 1.7 && firstSpawnGap) {
      spawnClock.current = 0
      const id = idRef.current++
      const kind = KINDS[id % KINDS.length]
      const car: CarData = {
        id,
        kind,
        color: COLORS[id % COLORS.length],
        x: spawnX,
        speed: 0,
        desiredSpeed: 4.6 + (id % 3) * 0.35,
        length: kind === 'suv' ? 3.0 : kind === 'hatch' ? 2.55 : 2.8,
      }
      carsRef.current = [...carsRef.current, car]
      setCars([...carsRef.current])
    }

    const nextCars = [...carsRef.current].sort((a, b) => b.x - a.x)

    nextCars.forEach((car, index) => {
      const ahead = index > 0 ? nextCars[index - 1] : null
      const crossedStopLine = car.x > stopLine + car.length * 0.5 + 0.15
      const mustStopForSignal = !traffic.green && !crossedStopLine

      let targetX = Number.POSITIVE_INFINITY

      if (mustStopForSignal) {
        targetX = stopLine - car.length * 0.36
      }

      if (ahead) {
        const queueGap = Math.max(1.05, car.length * 0.34)
        const behindAhead = ahead.x - ahead.length * 0.36 - queueGap - car.length * 0.36
        targetX = Math.min(targetX, behindAhead)
      }

      const distanceToConstraint = targetX - car.x
      let targetSpeed = car.desiredSpeed

      if (Number.isFinite(targetX)) {
        if (distanceToConstraint <= 0.05) {
          targetSpeed = 0
        } else if (distanceToConstraint < 4.8) {
          targetSpeed = Math.min(targetSpeed, Math.max(0, distanceToConstraint * 0.95))
        }
      }

      const accel = targetSpeed > car.speed ? 2.3 : 4.8
      const deltaSpeed = THREE.MathUtils.clamp(targetSpeed - car.speed, -accel * delta, accel * delta)
      car.speed = Math.max(0, car.speed + deltaSpeed)
      car.x += car.speed * delta

      const group = refs.current.get(car.id)
      if (group) {
        group.position.x = car.x
        const wheelSpin = car.speed * delta * 2.1
        group.traverse((child) => {
          if (child.userData.wheel === true) child.rotation.z -= wheelSpin
        })
      }
    })

    const alive = nextCars.filter((car) => car.x < exitX)
    if (alive.length !== carsRef.current.length) {
      carsRef.current = alive
      setCars([...alive])
    }
  })

  return (
    <>
      {cars.map((car, index) => (
        <group
          key={car.id}
          ref={(node) => {
            if (node) refs.current.set(car.id, node)
            else refs.current.delete(car.id)
          }}
          position={[car.x, 0.02, 2.0]}
          scale={0.72}
        >
          <CarModel kind={car.kind} color={car.color} />
        </group>
      ))}
    </>
  )
}

function Scene({ traffic }: { traffic: TrafficState }) {
  return (
    <>
      <color attach="background" args={['#07141e']} />
      <fog attach="fog" args={['#07141e', 18, 38]} />
      <ambientLight intensity={0.75} />
      <directionalLight
        castShadow
        position={[7, 12, 5]}
        intensity={2.1}
        color="#d9efff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-5, 5, 3]} intensity={22} distance={18} color="#7ed7ff" />
      <pointLight position={[4, 3, 5]} intensity={12} distance={15} color="#ffd28a" />

      <RoadScene />
      <TrafficLight3D traffic={traffic} />
      <TrafficCars traffic={traffic} />

      <OrbitControls
        makeDefault
        target={[0, 0.7, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={7}
        maxDistance={28}
        minPolarAngle={0.35}
        maxPolarAngle={1.42}
        panSpeed={0.85}
        rotateSpeed={0.7}
        zoomSpeed={0.9}
      />
    </>
  )
}

export function TrafficSimulation3D({ traffic }: TrafficSimulation3DProps) {
  return (
    <div className="traffic-3d-root">
      <Canvas
        shadows
        dpr={[1, 1.7]}
        camera={{ position: [6.6, 8.6, 13.7], fov: 43 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <Scene traffic={traffic} />
      </Canvas>
      <div className="traffic-3d-label">
        <span>TRÁFEGO 3D</span>
        <strong>Fila dinâmica • spawn / despawn • semáforo ativo</strong>
      </div>
      <div className="traffic-3d-help">
        <span>Arraste: girar</span>
        <span>Botão direito: mover</span>
        <span>Scroll: zoom</span>
      </div>
    </div>
  )
}
