import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  TRAFFIC_GEOMETRY,
  TRAFFIC_WORLD,
  VEHICLE_DIMENSIONS,
  type VehicleKind,
} from '../simulation/trafficWorld'
import type { TrafficState } from '../types'

type VehicleModelSource = 'kenney' | 'mit'

type CarData = {
  id: number
  kind: VehicleKind
  modelSource: VehicleModelSource
  color: string
  x: number
  speed: number
  desiredSpeed: number
  length: number
  braking: boolean
}

type TrafficSimulation3DProps = {
  traffic: TrafficState
  running: boolean
}

const COLORS = ['#2b6cb0', '#718096', '#dfe7eb', '#8b2f3c', '#263746', '#165a72']
const KINDS: VehicleKind[] = ['sedan', 'suv', 'hatch']

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.38, z]} rotation={[Math.PI / 2, 0, 0]} userData={{ wheel: true }}>
      <mesh castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.24, 20]} />
        <meshStandardMaterial color="#0b0f12" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.125, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.25, 16]} />
        <meshStandardMaterial color="#65727a" metalness={0.65} roughness={0.32} />
      </mesh>
    </group>
  )
}

function CarModel({
  kind,
  color,
  braking,
}: {
  kind: VehicleKind
  color: string
  braking: boolean
}) {
  const dims = VEHICLE_DIMENSIONS[kind]
  const wheelX = dims.length * 0.31
  const wheelZ = dims.width * 0.47
  const bodyY = 0.68
  const cabinY = bodyY + dims.bodyH * 0.72

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, bodyY, 0]}>
        <boxGeometry args={[dims.length, dims.bodyH, dims.width]} />
        <meshStandardMaterial color={color} metalness={0.42} roughness={0.34} />
      </mesh>

      <mesh castShadow position={[-0.16, cabinY, 0]}>
        <boxGeometry args={[dims.cabinL, dims.cabinH, dims.width * 0.86]} />
        <meshStandardMaterial color={color} metalness={0.32} roughness={0.28} />
      </mesh>

      <mesh position={[0.02, cabinY + 0.02, dims.width * 0.435]}>
        <boxGeometry args={[dims.cabinL * 0.68, dims.cabinH * 0.48, 0.025]} />
        <meshStandardMaterial color="#18313f" transparent opacity={0.84} roughness={0.1} />
      </mesh>
      <mesh position={[0.02, cabinY + 0.02, -dims.width * 0.435]}>
        <boxGeometry args={[dims.cabinL * 0.68, dims.cabinH * 0.48, 0.025]} />
        <meshStandardMaterial color="#18313f" transparent opacity={0.84} roughness={0.1} />
      </mesh>

      {[-0.31, 0.31].map((z) => (
        <mesh key={`head-${z}`} position={[dims.length * 0.505, bodyY, dims.width * z]}>
          <boxGeometry args={[0.045, 0.17, 0.24]} />
          <meshStandardMaterial color="#fff3bd" emissive="#ffe49a" emissiveIntensity={1.9} />
        </mesh>
      ))}

      {[-0.31, 0.31].map((z) => (
        <mesh key={`tail-${z}`} position={[-dims.length * 0.505, bodyY, dims.width * z]}>
          <boxGeometry args={[0.045, 0.17, 0.24]} />
          <meshStandardMaterial
            color="#ff3838"
            emissive="#ff2020"
            emissiveIntensity={braking ? 4.2 : 1.1}
          />
        </mesh>
      ))}

      <Wheel x={wheelX} z={wheelZ} />
      <Wheel x={wheelX} z={-wheelZ} />
      <Wheel x={-wheelX} z={wheelZ} />
      <Wheel x={-wheelX} z={-wheelZ} />
    </group>
  )
}


const VEHICLE_MODEL_PATHS: Record<VehicleModelSource, string> = {
  kenney: `${import.meta.env.BASE_URL}models/vehicles/kenney-sedan.glb`,
  mit: `${import.meta.env.BASE_URL}models/vehicles/mit-car.glb`,
}

function ImportedCarModel({
  source,
  kind,
  braking,
}: {
  source: VehicleModelSource
  kind: VehicleKind
  braking: boolean
}) {
  const { scene } = useGLTF(VEHICLE_MODEL_PATHS[source])

  const normalized = useMemo(() => {
    const model = scene.clone(true)
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => material.clone())
        } else if (child.material) {
          child.material = child.material.clone()
        }
      }
    })

    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const rawLength = Math.max(size.x, size.z, 0.001)
    const scale = VEHICLE_DIMENSIONS[kind].length / rawLength
    const rotationY = size.z >= size.x ? Math.PI / 2 : 0

    return {
      model,
      scale,
      rotationY,
      offset: new THREE.Vector3(-center.x, -bounds.min.y, -center.z),
    }
  }, [scene, kind])

  const dims = VEHICLE_DIMENSIONS[kind]

  return (
    <group>
      <group rotation={[0, normalized.rotationY, 0]} scale={normalized.scale}>
        <primitive object={normalized.model} position={normalized.offset} />
      </group>

      {/* Generic brake lights guarantee visible traffic feedback even when the source GLB has no emissive lamps. */}
      {[-0.31, 0.31].map((z) => (
        <mesh key={z} position={[-dims.length * 0.505, 0.7, dims.width * z]}>
          <boxGeometry args={[0.035, 0.12, 0.2]} />
          <meshStandardMaterial
            color="#ff3434"
            emissive="#ff2020"
            emissiveIntensity={braking ? 4.5 : 0.8}
          />
        </mesh>
      ))}
    </group>
  )
}

useGLTF.preload(VEHICLE_MODEL_PATHS.kenney)
useGLTF.preload(VEHICLE_MODEL_PATHS.mit)

function SignalHead({ traffic }: { traffic: TrafficState }) {
  const lamps = [
    { key: 'red', y: 0.29, color: '#ff332f', active: traffic.red },
    { key: 'yellow', y: 0, color: '#ffca3a', active: traffic.yellow },
    { key: 'green', y: -0.29, color: '#35e879', active: traffic.green },
  ] as const

  return (
    <group>
      <mesh castShadow>
        <boxGeometry
          args={[
            TRAFFIC_WORLD.signalHeadWidth,
            TRAFFIC_WORLD.signalHeadHeight,
            TRAFFIC_WORLD.signalHeadDepth,
          ]}
        />
        <meshStandardMaterial color="#080d11" metalness={0.15} roughness={0.64} />
      </mesh>

      {lamps.map((lamp) => (
        <mesh key={lamp.key} position={[0, lamp.y, -TRAFFIC_WORLD.signalHeadDepth * 0.52]}>
          <sphereGeometry args={[0.09, 18, 18]} />
          <meshStandardMaterial
            color={lamp.active ? lamp.color : '#12181c'}
            emissive={lamp.active ? lamp.color : '#000000'}
            emissiveIntensity={lamp.active ? 2.8 : 0}
            roughness={0.25}
          />
        </mesh>
      ))}
    </group>
  )
}

function TrafficLight3D({
  traffic,
  position,
  rotationY = Math.PI / 2,
}: {
  traffic: TrafficState
  position: [number, number, number]
  rotationY?: number
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow position={[0, TRAFFIC_WORLD.signalPoleHeight / 2, 0]}>
        <cylinderGeometry args={[0.055, 0.072, TRAFFIC_WORLD.signalPoleHeight, 14]} />
        <meshStandardMaterial color="#59666d" metalness={0.7} roughness={0.34} />
      </mesh>

      <group position={[0, TRAFFIC_WORLD.signalPoleHeight - 0.18, 0]}>
        <SignalHead traffic={traffic} />
      </group>

      <mesh castShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.13, 0.17, 0.14, 14]} />
        <meshStandardMaterial color="#323d43" metalness={0.42} roughness={0.52} />
      </mesh>
    </group>
  )
}

function Building({
  position,
  size,
  index,
}: {
  position: [number, number, number]
  size: [number, number, number]
  index: number
}) {
  return (
    <mesh position={position} receiveShadow castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={index % 2 ? '#102936' : '#0d2330'} roughness={0.82} />
    </mesh>
  )
}

function CityBlocks() {
  const blocks = useMemo(
    () => [
      { position: [-14, 2.6, -12] as [number, number, number], size: [4.5, 5.2, 4.2] as [number, number, number] },
      { position: [-8.8, 3.8, -13] as [number, number, number], size: [3.2, 7.6, 3.6] as [number, number, number] },
      { position: [9.5, 3.2, -13] as [number, number, number], size: [4.2, 6.4, 4.0] as [number, number, number] },
      { position: [15, 2.8, -12] as [number, number, number], size: [3.8, 5.6, 4.5] as [number, number, number] },
    ],
    [],
  )

  return (
    <>
      {blocks.map((block, index) => (
        <Building key={index} {...block} index={index} />
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

function ZebraCrossing({
  axis,
  center,
}: {
  axis: 'x' | 'z'
  center: number
}) {
  const stripeCount = 8
  const stripeWidth = TRAFFIC_WORLD.crosswalkWidth / stripeCount

  return (
    <>
      {Array.from({ length: stripeCount }).map((_, i) => {
        const offset = -TRAFFIC_WORLD.crosswalkWidth / 2 + stripeWidth / 2 + i * stripeWidth
        return axis === 'x' ? (
          <RoadMark
            key={i}
            position={[center + offset, 0.036, 0]}
            size={[stripeWidth * 0.54, TRAFFIC_WORLD.roadWidth - 0.9]}
          />
        ) : (
          <RoadMark
            key={i}
            position={[0, 0.036, center + offset]}
            size={[TRAFFIC_WORLD.roadWidth - 0.9, stripeWidth * 0.54]}
          />
        )
      })}
    </>
  )
}

function RoadScene() {
  const halfRoad = TRAFFIC_WORLD.roadWidth / 2
  const halfLength = TRAFFIC_WORLD.roadLength / 2
  const dashPositions = [-29, -25, -21, -17, -13, 13, 17, 21, 25, 29]

  return (
    <>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[70, 46]} />
        <meshStandardMaterial color="#0d161b" roughness={0.98} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadLength, TRAFFIC_WORLD.roadWidth]} />
        <meshStandardMaterial color="#282e31" roughness={0.88} metalness={0.03} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadWidth, 46]} />
        <meshStandardMaterial color="#282e31" roughness={0.88} metalness={0.03} />
      </mesh>

      {/* Sidewalk blocks */}
      {[
        [-halfLength / 2, 0.06, halfRoad + 1.4, halfLength, 2.6],
        [halfLength / 2, 0.06, halfRoad + 1.4, halfLength, 2.6],
        [-halfLength / 2, 0.06, -halfRoad - 1.4, halfLength, 2.6],
        [halfLength / 2, 0.06, -halfRoad - 1.4, halfLength, 2.6],
      ].map(([x, y, z, sx, sz], i) => (
        <mesh key={i} receiveShadow position={[x, y, z]}>
          <boxGeometry args={[sx, 0.12, sz]} />
          <meshStandardMaterial color="#5a6164" roughness={0.95} />
        </mesh>
      ))}

      {/* Double yellow center line */}
      {[-0.12, 0.12].map((z, lineIndex) => (
        <group key={lineIndex}>
          <RoadMark position={[-19.5, 0.025, z]} size={[25, 0.075]} color="#e1c34c" />
          <RoadMark position={[19.5, 0.025, z]} size={[25, 0.075]} color="#e1c34c" />
        </group>
      ))}

      {/* Lane separators */}
      {[-TRAFFIC_WORLD.laneWidth, TRAFFIC_WORLD.laneWidth].map((z) =>
        dashPositions.map((x, i) => (
          <RoadMark key={`${z}-${i}`} position={[x, 0.027, z]} size={[1.9, 0.075]} />
        )),
      )}

      {/* Edge lines */}
      <RoadMark position={[0, 0.025, halfRoad - 0.12]} size={[TRAFFIC_WORLD.roadLength, 0.09]} />
      <RoadMark position={[0, 0.025, -halfRoad + 0.12]} size={[TRAFFIC_WORLD.roadLength, 0.09]} />

      {/* Stop lines */}
      <RoadMark
        position={[TRAFFIC_GEOMETRY.westStopLineX, 0.04, TRAFFIC_WORLD.roadWidth / 4]}
        size={[0.18, TRAFFIC_WORLD.roadWidth / 2 - 0.35]}
      />
      <RoadMark
        position={[TRAFFIC_GEOMETRY.eastStopLineX, 0.04, -TRAFFIC_WORLD.roadWidth / 4]}
        size={[0.18, TRAFFIC_WORLD.roadWidth / 2 - 0.35]}
      />
      <RoadMark
        position={[-TRAFFIC_WORLD.roadWidth / 4, 0.041, TRAFFIC_GEOMETRY.southStopLineZ]}
        size={[TRAFFIC_WORLD.roadWidth / 2 - 0.35, 0.18]}
      />
      <RoadMark
        position={[TRAFFIC_WORLD.roadWidth / 4, 0.041, TRAFFIC_GEOMETRY.northStopLineZ]}
        size={[TRAFFIC_WORLD.roadWidth / 2 - 0.35, 0.18]}
      />

      <ZebraCrossing axis="x" center={TRAFFIC_GEOMETRY.westCrosswalkCenterX} />
      <ZebraCrossing axis="x" center={TRAFFIC_GEOMETRY.eastCrosswalkCenterX} />
      <ZebraCrossing axis="z" center={TRAFFIC_GEOMETRY.southCrosswalkCenterZ} />
      <ZebraCrossing axis="z" center={TRAFFIC_GEOMETRY.northCrosswalkCenterZ} />

      {/* Clean central intersection */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadWidth, TRAFFIC_WORLD.roadWidth]} />
        <meshStandardMaterial color="#252b2e" roughness={0.88} metalness={0.02} />
      </mesh>

      <CityBlocks />
    </>
  )
}

function TrafficCars({
  traffic,
  running,
}: {
  traffic: TrafficState
  running: boolean
}) {
  const [cars, setCars] = useState<CarData[]>([])
  const carsRef = useRef<CarData[]>([])
  const refs = useRef(new Map<number, THREE.Group>())
  const idRef = useRef(1)
  const spawnClock = useRef(0)

  useFrame((_state, deltaRaw) => {
    const delta = Math.min(deltaRaw, 0.05)
    if (!running) return

    spawnClock.current += delta

    const ordered = [...carsRef.current].sort((a, b) => b.x - a.x)
    const lastCar = ordered.length ? ordered[ordered.length - 1] : null
    const spawnClear = !lastCar || lastCar.x > TRAFFIC_WORLD.spawnX + 8

    if (spawnClock.current > 2.1 && spawnClear) {
      spawnClock.current = 0
      const id = idRef.current++
      const kind = KINDS[id % KINDS.length]
      const dims = VEHICLE_DIMENSIONS[kind]

      const car: CarData = {
        id,
        kind,
        modelSource: id % 2 === 0 ? 'kenney' : 'mit',
        color: COLORS[id % COLORS.length],
        x: TRAFFIC_WORLD.spawnX,
        speed: 0,
        desiredSpeed: 6.2 + (id % 3) * 0.45,
        length: dims.length,
        braking: false,
      }

      carsRef.current = [...carsRef.current, car]
      setCars([...carsRef.current])
    }

    const nextCars = [...carsRef.current].sort((a, b) => b.x - a.x)

    nextCars.forEach((car, index) => {
      const ahead = index > 0 ? nextCars[index - 1] : null
      const carFront = car.x + car.length / 2
      const hasEnteredIntersection = carFront > TRAFFIC_GEOMETRY.westCrosswalkCenterX + TRAFFIC_WORLD.crosswalkWidth / 2
      const mustStopForSignal = !traffic.green && !hasEnteredIntersection

      let targetFrontX = Number.POSITIVE_INFINITY

      if (mustStopForSignal) {
        targetFrontX = TRAFFIC_GEOMETRY.westStopLineX - 0.18
      }

      if (ahead) {
        const safeGap = Math.max(2.0, car.speed * 0.48)
        const aheadRear = ahead.x - ahead.length / 2
        targetFrontX = Math.min(targetFrontX, aheadRear - safeGap)
      }

      const distance = targetFrontX - carFront
      let targetSpeed = car.desiredSpeed

      if (Number.isFinite(targetFrontX)) {
        if (distance <= 0.08) targetSpeed = 0
        else if (distance < 8) targetSpeed = Math.min(targetSpeed, Math.max(0, distance * 0.78))
      }

      car.braking = targetSpeed < car.speed - 0.15
      const accel = targetSpeed > car.speed ? 2.1 : 5.2
      car.speed = Math.max(
        0,
        car.speed + THREE.MathUtils.clamp(targetSpeed - car.speed, -accel * delta, accel * delta),
      )
      car.x += car.speed * delta

      const group = refs.current.get(car.id)
      if (group) {
        group.position.x = car.x
        const wheelSpin = car.speed * delta / 0.34
        group.traverse((child) => {
          if (child.userData.wheel) child.rotation.z -= wheelSpin
        })
      }
    })

    const alive = nextCars.filter((car) => car.x < TRAFFIC_WORLD.exitX)
    carsRef.current = alive

    if (alive.length !== cars.length || alive.some((car, i) => cars[i]?.braking !== car.braking)) {
      setCars(alive.map((car) => ({ ...car })))
    }
  })

  return (
    <>
      {cars.map((car) => (
        <group
          key={car.id}
          ref={(node) => {
            if (node) refs.current.set(car.id, node)
            else refs.current.delete(car.id)
          }}
          position={[car.x, 0.02, TRAFFIC_WORLD.eastboundLaneZ]}
        >
          <Suspense fallback={<CarModel kind={car.kind} color={car.color} braking={car.braking} />}>
            <ImportedCarModel source={car.modelSource} kind={car.kind} braking={car.braking} />
          </Suspense>
        </group>
      ))}
    </>
  )
}

function Scene({
  traffic,
  running,
}: {
  traffic: TrafficState
  running: boolean
}) {
  const farSignalPosition: [number, number, number] = [
    TRAFFIC_WORLD.intersectionHalf + TRAFFIC_WORLD.crosswalkWidth + 0.6,
    0,
    -TRAFFIC_WORLD.roadWidth / 2 - TRAFFIC_WORLD.shoulderOffset,
  ]

  return (
    <>
      <color attach="background" args={['#07141e']} />
      <fog attach="fog" args={['#07141e', 30, 62]} />

      <ambientLight intensity={0.62} />
      <directionalLight
        castShadow
        position={[12, 22, 10]}
        intensity={1.8}
        color="#d9efff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-8, 7, 8]} intensity={18} distance={26} color="#7ed7ff" />
      <pointLight position={[9, 5, 10]} intensity={10} distance={22} color="#ffd28a" />

      <RoadScene />

      {/* Two heads for the controlled eastbound approach: near-side and far-side. */}
      <TrafficLight3D traffic={traffic} position={TRAFFIC_GEOMETRY.mainSignalPosition} />
      <TrafficLight3D traffic={traffic} position={farSignalPosition} />

      <TrafficCars traffic={traffic} running={running} />

      <OrbitControls
        makeDefault
        target={[0, 1.2, 0]}
        enableDamping
        dampingFactor={0.075}
        enablePan
        enableRotate
        enableZoom
        minDistance={10}
        maxDistance={46}
        maxPolarAngle={Math.PI / 2 - 0.08}
        panSpeed={0.9}
        rotateSpeed={0.65}
        zoomSpeed={0.9}
      />
    </>
  )
}

export function TrafficSimulation3D({ traffic, running }: TrafficSimulation3DProps) {
  return (
    <div className="traffic-3d-root">
      <Canvas
        shadows
        dpr={[1, 1.6]}
        camera={{ position: [18, 16, 24], fov: 50 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <Scene traffic={traffic} running={running} />
      </Canvas>

      <div className="traffic-3d-label">
        <span>TRÁFEGO 3D</span>
        <strong>Escala métrica • fila dinâmica • semáforo ligado ao PLC</strong>
      </div>

      <div className="traffic-3d-help">
        <span>Arraste: girar</span>
        <span>Botão direito: mover</span>
        <span>Scroll: zoom</span>
      </div>
    </div>
  )
}
