import { Canvas, useFrame } from '@react-three/fiber'
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
    if (kind === 'suv') return { length: 3.15, width: 1.55, bodyH: 0.62, cabinH: 0.7, cabinL: 1.55 }
    if (kind === 'hatch') return { length: 2.65, width: 1.45, bodyH: 0.55, cabinH: 0.65, cabinL: 1.35 }
    return { length: 2.95, width: 1.48, bodyH: 0.54, cabinH: 0.58, cabinL: 1.45 }
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
  const light = (on: boolean, color: string) => (
    <mesh>
      <sphereGeometry args={[0.18, 18, 18]} />
      <meshStandardMaterial
        color={on ? color : '#14191d'}
        emissive={on ? color : '#000000'}
        emissiveIntensity={on ? 3.2 : 0}
        roughness={0.25}
      />
    </mesh>
  )

  return (
    <group position={[-2.2, 0, -2.5]}>
      <mesh castShadow position={[0, 2.3, 0]}>
        <boxGeometry args={[0.15, 4.6, 0.15]} />
        <meshStandardMaterial color="#4e5b63" metalness={0.72} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 4.55, 0]}>
        <boxGeometry args={[0.8, 1.95, 0.62]} />
        <meshStandardMaterial color="#080d11" metalness={0.2} roughness={0.6} />
      </mesh>
      <group position={[0, 5.05, -0.33]}>{light(traffic.red, '#ff332f')}</group>
      <group position={[0, 4.55, -0.33]}>{light(traffic.yellow, '#ffca3a')}</group>
      <group position={[0, 4.05, -0.33]}>{light(traffic.green, '#35e879')}</group>
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

function RoadScene() {
  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[40, 24]} />
        <meshStandardMaterial color="#0b1115" roughness={0.95} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[40, 7.3]} />
        <meshStandardMaterial color="#20272b" roughness={0.78} metalness={0.08} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, -0.05]}>
        <planeGeometry args={[7.5, 24]} />
        <meshStandardMaterial color="#20272b" roughness={0.78} metalness={0.08} />
      </mesh>

      {Array.from({ length: 12 }).map((_, i) => (
        <mesh
          key={`lane-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-17 + i * 3.1, 0.03, 0]}
        >
          <planeGeometry args={[1.5, 0.08]} />
          <meshBasicMaterial color="#d8d8c6" />
        </mesh>
      ))}

      {Array.from({ length: 7 }).map((_, i) => (
        <mesh
          key={`cross-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-1.2 + i * 0.42, 0.035, 2.25]}
        >
          <planeGeometry args={[0.22, 2.6]} />
          <meshBasicMaterial color="#d9dfdd" />
        </mesh>
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.55, 0.04, 1.8]}>
        <planeGeometry args={[0.12, 3]} />
        <meshBasicMaterial color="#ffffff" />
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
  const stopLine = -3.5
  const exitX = 18
  const spawnX = -18

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
        length: kind === 'suv' ? 3.15 : kind === 'hatch' ? 2.65 : 2.95,
      }
      carsRef.current = [...carsRef.current, car]
      setCars([...carsRef.current])
    }

    const nextCars = [...carsRef.current].sort((a, b) => b.x - a.x)

    nextCars.forEach((car, index) => {
      const ahead = index > 0 ? nextCars[index - 1] : null
      const crossedStopLine = car.x > stopLine + 0.25
      const mustStopForSignal = !traffic.green && !crossedStopLine

      let targetX = Number.POSITIVE_INFINITY

      if (mustStopForSignal) {
        targetX = stopLine - car.length * 0.5
      }

      if (ahead) {
        const queueGap = Math.max(1.25, car.length * 0.38)
        const behindAhead = ahead.x - ahead.length * 0.5 - queueGap - car.length * 0.5
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
          position={[car.x, 0.02, 1.7]}
          scale={index % 2 === 0 ? 0.9 : 0.82}
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
    </div>
  )
}
