import { ASPHALT_HEIGHT, asphaltMaterial } from './world/roadSurface'
import { UrbanNeighborhoods } from './world/UrbanNeighborhoods'
import { updateVehicleVisuals } from './world/vehicleVisuals'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  TRAFFIC_GEOMETRY,
  TRAFFIC_WORLD,
  type VehicleKind,
} from '../simulation/trafficWorld'
import type { IntersectionTrafficState, SignalId, TrafficState } from '../types'
import { CityDistricts, RoundaboutDistrict } from './world/CityDistricts'
import { SupermarketDistrict } from './world/SupermarketDistrict'
import { CityLife } from './world/CityLife'
import { BOULEVARD_START, CITY_LIMITS, CITY_BORDER } from './world/cityLayout'
import { horizontalRoadPose, HORIZONTAL_ROAD_EXIT, WEST_TRAFFIC_SPAWN } from './world/roadGeometry'
import { trafficSpeedLimit, safeVehicleStep, vehicleSpawnClear, boundedTrafficStep, type VehicleRegistry } from './world/vehicleTraffic'
import { UrbanRoadNetwork } from './world/RoadNetwork'
import { Planter, StreetLamp, Tree } from './world/StreetFurniture'
import {
  RealisticCarModel,
  VEHICLE_MODELS,
  VEHICLE_VARIANTS,
  type VehicleVariant,
} from './world/VehicleModel'

type FlowId = 'eastbound' | 'westbound' | 'northbound' | 'southbound'


type CarData = {
  id: number
  kind: VehicleKind
  variant: VehicleVariant
  color: string
  flow: FlowId
  progress: number
  speed: number
  desiredSpeed: number
  length: number
  braking: boolean
  clearedStopLine: boolean
}

type WorldEnvironment = {
  hour: number
  autoTime: boolean
  timeSpeed: number
  rain: number
  wind: number
  windDirection: number
}

type TrafficSimulation3DProps = {
  signals: IntersectionTrafficState
  running: boolean
  quality: 'low' | 'medium' | 'high'
  targetFps: number
  environment: WorldEnvironment
}

const COLORS = ['#2b6cb0', '#718096', '#dfe7eb', '#8b2f3c', '#263746', '#165a72']
const KINDS: VehicleKind[] = ['sedan']

function SignalHead({ traffic }: { traffic: TrafficState }) {
  const lamps = [
    { key: 'red', y: 0.29, color: '#ff332f', active: traffic.red },
    { key: 'yellow', y: 0, color: '#ffca3a', active: traffic.yellow },
    { key: 'green', y: -0.29, color: '#35e879', active: traffic.green },
  ] as const

  return (
    <group>
      <mesh>
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
          <sphereGeometry args={[0.09, 10, 8]} />
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
      <mesh position={[0, TRAFFIC_WORLD.signalPoleHeight / 2, 0]}>
        <cylinderGeometry args={[0.055, 0.072, TRAFFIC_WORLD.signalPoleHeight, 8]} />
        <meshStandardMaterial color="#59666d" metalness={0.7} roughness={0.34} />
      </mesh>

      <group position={[0, TRAFFIC_WORLD.signalPoleHeight - 0.18, 0]}>
        <SignalHead traffic={traffic} />
      </group>

      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.13, 0.17, 0.14, 8]} />
        <meshStandardMaterial color="#323d43" metalness={0.42} roughness={0.52} />
      </mesh>
    </group>
  )
}

function RoadMark({
  position,
  size,
  color = '#eceeea',
  rotationY = 0,
}: {
  position: [number, number, number]
  size: [number, number]
  color?: string
  rotationY?: number
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={size} />
        <meshBasicMaterial color={color} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
    </group>
  )
}

function ZebraCrossing({
  axis,
  center,
}: {
  axis: 'x' | 'z'
  center: number
}) {
  const stripeCount = 9
  const stripeGap = 0.18
  const stripeWidth = (TRAFFIC_WORLD.crosswalkWidth - stripeGap * (stripeCount - 1)) / stripeCount

  return (
    <>
      {Array.from({ length: stripeCount }).map((_, i) => {
        const offset =
          -TRAFFIC_WORLD.crosswalkWidth / 2 +
          stripeWidth / 2 +
          i * (stripeWidth + stripeGap)

        return axis === 'x' ? (
          <RoadMark
            key={i}
            position={[center + offset, 0.045, 0]}
            size={[stripeWidth, TRAFFIC_WORLD.roadWidth - 0.7]}
          />
        ) : (
          <RoadMark
            key={i}
            position={[0, 0.045, center + offset]}
            size={[TRAFFIC_WORLD.roadWidth - 0.7, stripeWidth]}
          />
        )
      })}
    </>
  )
}

function ArrowMark({
  position,
  rotationY,
}: {
  position: [number, number, number]
  rotationY: number
}) {
  const material = <meshBasicMaterial color="#eceeea" toneMapped={false} />
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.038, 0]}>
        <boxGeometry args={[1.65, 0.025, 0.18]} />
        {material}
      </mesh>
      <mesh position={[0.72, 0.04, 0.27]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.82, 0.025, 0.18]} />
        {material}
      </mesh>
      <mesh position={[0.72, 0.04, -0.27]} rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[0.82, 0.025, 0.18]} />
        {material}
      </mesh>
    </group>
  )
}

function UrbanProps({
  dense = false,
  nightFactor = 0,
}: {
  dense?: boolean
  nightFactor?: number
}) {
  const trees: Array<[number, number, number]> = [
    [-14, 0.04, 10.8], [14, 0.04, 11], [-44, 0.04, -43],
    [38, 0.04, 23], [-38, 0.04, 34], [18, 0.04, -46],
  ]
  const lamps: Array<[number, number, number]> = [
    [-12.4, 0.04, -8.8], [12.6, 0.04, -8.8], [-12.5, 0.04, 8.9], [12.5, 0.04, 8.9],
    [-27, 0.04, -7.75], [-24, 0.04, 8.9], [-36, 0.04, 8.9],
  ]

  return (
    <>
      {trees.slice(0, dense ? trees.length : 8).map((position, index) => (
        <Tree key={`tree-${index}`} position={position} scale={0.78 + (index % 4) * 0.08} />
      ))}

      {[-10.5, 10.8].map((x, index) => (
        <Planter key={`planter-n-${x}`} position={[x, 0.18, -10.6 + index * 0.2]} />
      ))}
      {[-10.7, 10.5].map((x, index) => (
        <Planter key={`planter-s-${x}`} position={[x, 0.18, 10.4 + index * 0.1]} />
      ))}

      {lamps.slice(0, dense ? lamps.length : 8).map((position, index) => (
        <StreetLamp key={`lamp-${index}`} position={position} nightFactor={nightFactor} />
      ))}

      {dense && (
        <>
          <mesh position={[-31, 0.34, 14]}>
            <boxGeometry args={[8, 0.32, 3.2]} />
            <meshStandardMaterial color="#253c32" roughness={1} />
          </mesh>
          <mesh position={[18, 0.34, -44]}>
            <boxGeometry args={[8, 0.32, 3.2]} />
            <meshStandardMaterial color="#253c32" roughness={1} />
          </mesh>
        </>
      )}
    </>
  )
}

function RoadScene({
  quality,
  rain,
  nightFactor,
}: {
  quality: 'low' | 'medium' | 'high'
  rain: number
  nightFactor: number
}) {
  const halfRoad = TRAFFIC_WORLD.roadWidth / 2

  return (
    <>
      {/* World base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[CITY_LIMITS.width + CITY_BORDER * 2, CITY_LIMITS.depth + CITY_BORDER * 2]} />
        <meshStandardMaterial color="#68755d" roughness={0.99} />
      </mesh>

      {/* Asphalt roads crossing at 90 degrees */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(BOULEVARD_START - (CITY_LIMITS.width / 2 + CITY_BORDER)) / 2, ASPHALT_HEIGHT, 0]}>
        <planeGeometry args={[CITY_LIMITS.width / 2 + CITY_BORDER + BOULEVARD_START, TRAFFIC_WORLD.roadWidth]} />
        <meshStandardMaterial {...asphaltMaterial(rain)} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ASPHALT_HEIGHT, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadWidth, CITY_LIMITS.depth + CITY_BORDER * 2]} />
        <meshStandardMaterial {...asphaltMaterial(rain)} />
      </mesh>

      {/* Stop bars on the approach side of each crosswalk */}
      <RoadMark
        position={[TRAFFIC_GEOMETRY.westStopLineX, 0.052, halfRoad / 2]}
        size={[0.24, halfRoad - 0.45]}
      />
      <RoadMark
        position={[TRAFFIC_GEOMETRY.eastStopLineX, 0.052, -halfRoad / 2]}
        size={[0.24, halfRoad - 0.45]}
      />
      <RoadMark
        position={[-halfRoad / 2, 0.053, TRAFFIC_GEOMETRY.southStopLineZ]}
        size={[halfRoad - 0.45, 0.24]}
      />
      <RoadMark
        position={[halfRoad / 2, 0.053, TRAFFIC_GEOMETRY.northStopLineZ]}
        size={[halfRoad - 0.45, 0.24]}
      />

      {/* Four zebra crossings */}
      <ZebraCrossing axis="x" center={TRAFFIC_GEOMETRY.westCrosswalkCenterX} />
      <ZebraCrossing axis="x" center={TRAFFIC_GEOMETRY.eastCrosswalkCenterX} />
      <ZebraCrossing axis="z" center={TRAFFIC_GEOMETRY.southCrosswalkCenterZ} />
      <ZebraCrossing axis="z" center={TRAFFIC_GEOMETRY.northCrosswalkCenterZ} />

      {/* Through arrows before each stop line */}
      <ArrowMark position={[TRAFFIC_GEOMETRY.westStopLineX - 4.0, 0, TRAFFIC_WORLD.eastboundLaneZ]} rotationY={0} />
      <ArrowMark position={[TRAFFIC_GEOMETRY.eastStopLineX + 4.0, 0, TRAFFIC_WORLD.westboundLaneZ]} rotationY={Math.PI} />
      <ArrowMark position={[-TRAFFIC_WORLD.eastboundLaneZ, 0, TRAFFIC_GEOMETRY.southStopLineZ - 4.0]} rotationY={-Math.PI / 2} />
      <ArrowMark position={[TRAFFIC_WORLD.eastboundLaneZ, 0, TRAFFIC_GEOMETRY.northStopLineZ + 4.0]} rotationY={Math.PI / 2} />

      <SupermarketDistrict quality={quality} rain={rain} nightFactor={nightFactor} />
      <RoundaboutDistrict rain={rain} nightFactor={nightFactor} />
      <UrbanRoadNetwork quality={quality} rain={rain} nightFactor={nightFactor} />
      {quality !== 'low' && (
        <>
          <UrbanProps dense={quality === 'high'} nightFactor={nightFactor} />
          <CityDistricts quality={quality} rain={rain} nightFactor={nightFactor} />
        </>
      )}
    </>
  )
}

type FlowDefinition = {
  id: FlowId
  spawn: number
  exit: number
  stopProgress: number
  rotationY: number
  signalId: SignalId
  toWorld: (progress: number) => [number, number, number]
}

const VERTICAL_SPAWN = -(CITY_LIMITS.depth / 2 + 4)
const VERTICAL_EXIT = CITY_LIMITS.depth / 2 + 4

const FLOW_DEFINITIONS: Record<FlowId, FlowDefinition> = {
  eastbound: {
    id: 'eastbound',
    spawn: -(CITY_LIMITS.width / 2 + 4),
    exit: HORIZONTAL_ROAD_EXIT,
    stopProgress: TRAFFIC_GEOMETRY.westStopLineX,
    rotationY: 0,
    signalId: 'west',
    toWorld: (progress) => horizontalRoadPose(progress, TRAFFIC_WORLD.eastboundLaneZ).position,
  },
  westbound: {
    id: 'westbound',
    spawn: WEST_TRAFFIC_SPAWN,
    exit: CITY_LIMITS.width / 2 + 4,
    stopProgress: -TRAFFIC_GEOMETRY.eastStopLineX,
    rotationY: Math.PI,
    signalId: 'east',
    toWorld: (progress) => horizontalRoadPose(progress, Math.abs(TRAFFIC_WORLD.westboundLaneZ), true).position,
  },
  northbound: {
    id: 'northbound',
    spawn: VERTICAL_SPAWN,
    exit: VERTICAL_EXIT,
    stopProgress: -TRAFFIC_GEOMETRY.northStopLineZ,
    rotationY: Math.PI / 2,
    signalId: 'north',
    toWorld: (progress) => [TRAFFIC_WORLD.eastboundLaneZ, 0.04, -progress],
  },
  southbound: {
    id: 'southbound',
    spawn: VERTICAL_SPAWN,
    exit: VERTICAL_EXIT,
    stopProgress: TRAFFIC_GEOMETRY.southStopLineZ,
    rotationY: -Math.PI / 2,
    signalId: 'south',
    toWorld: (progress) => [-TRAFFIC_WORLD.eastboundLaneZ, 0.04, progress],
  },
}

const FLOW_ORDER: FlowId[] = ['eastbound', 'westbound', 'northbound', 'southbound']

function applyWorldPosition(group: THREE.Group, flowId: FlowId, progress: number) {
  switch (flowId) {
    case 'eastbound': {
      const pose = horizontalRoadPose(progress, TRAFFIC_WORLD.eastboundLaneZ)
      group.position.set(...pose.position)
      group.rotation.y = pose.rotationY
      break
    }
    case 'westbound': {
      const pose = horizontalRoadPose(progress, Math.abs(TRAFFIC_WORLD.westboundLaneZ), true)
      group.position.set(...pose.position)
      group.rotation.y = pose.rotationY
      break
    }
    case 'northbound':
      group.position.set(TRAFFIC_WORLD.eastboundLaneZ, 0.04, -progress)
      break
    case 'southbound':
      group.position.set(-TRAFFIC_WORLD.eastboundLaneZ, 0.04, progress)
      break
  }
}

function TrafficCars({
  signals,
  running,
  maxCarsPerFlow,
  actors,
}: {
  signals: IntersectionTrafficState
  running: boolean
  maxCarsPerFlow: number
  actors: VehicleRegistry
}) {
  const [cars, setCars] = useState<CarData[]>([])
  const carsRef = useRef<CarData[]>([])
  const refs = useRef(new Map<number, THREE.Group>())
  const flowBuckets = useRef<Record<FlowId, CarData[]>>({
    eastbound: [],
    westbound: [],
    northbound: [],
    southbound: [],
  })
  const idRef = useRef(1)
  const spawnClocks = useRef<Record<FlowId, number>>({
    eastbound: 0,
    westbound: 0.65,
    northbound: 1.15,
    southbound: 1.7,
  })

  useFrame((_state, deltaRaw) => {
    const delta = Math.min(deltaRaw, 0.05)
    if (!running) return

    let workingCars = carsRef.current
    let spawned = false

    for (const flowId of FLOW_ORDER) {
      flowBuckets.current[flowId].length = 0
    }
    for (const car of workingCars) {
      flowBuckets.current[car.flow].push(car)
    }
    for (const flowId of FLOW_ORDER) {
      flowBuckets.current[flowId].sort((a, b) => b.progress - a.progress)
    }

    for (const flowId of FLOW_ORDER) {
      const def = FLOW_DEFINITIONS[flowId]
      spawnClocks.current[flowId] += delta

      const flowCars = flowBuckets.current[flowId]

      const tail = flowCars.length ? flowCars[flowCars.length - 1] : null
      const spawnClear = !tail || tail.progress > def.spawn + 10.5
      const interval = flowId === 'eastbound' || flowId === 'westbound' ? 3.8 : 4.2
      const belowFlowLimit = flowCars.length < maxCarsPerFlow

      const spawnPose = flowId === 'eastbound' || flowId === 'westbound'
        ? horizontalRoadPose(def.spawn, 1.75, flowId === 'westbound')
        : { position: def.toWorld(def.spawn), rotationY: def.rotationY }
      if (spawnClocks.current[flowId] >= interval && spawnClear && belowFlowLimit && vehicleSpawnClear(actors, spawnPose, 4.82, 1.9)) {
        spawnClocks.current[flowId] = 0
        const id = idRef.current++
        const kind = KINDS[id % KINDS.length]
        const variant = VEHICLE_VARIANTS[id % VEHICLE_VARIANTS.length]
        const model = VEHICLE_MODELS[variant]

        const spawnedCar: CarData = {
          id,
          kind,
          variant,
          color: COLORS[id % COLORS.length],
          flow: flowId,
          progress: def.spawn,
          speed: 0,
          desiredSpeed: 5.6 + (id % 4) * 0.42,
          length: model.length,
          braking: false,
          clearedStopLine: false,
        }
        workingCars = [...workingCars, spawnedCar]
        flowBuckets.current[flowId].push(spawnedCar)
        flowBuckets.current[flowId].sort((a, b) => b.progress - a.progress)
        spawned = true
      }
    }

    for (const flowId of FLOW_ORDER) {
      const def = FLOW_DEFINITIONS[flowId]
      const signal = signals[def.signalId]
      const flowCars = flowBuckets.current[flowId]

      flowCars.forEach((car, index) => {
        const ahead = index > 0 ? flowCars[index - 1] : null
        const front = car.progress + car.length / 2
        if (front > def.stopProgress + 0.01) car.clearedStopLine = true
        const hasEnteredIntersection = car.clearedStopLine || front > -TRAFFIC_WORLD.intersectionHalf
        const distanceToStopLine = def.stopProgress - front
        const comfortableStoppingDistance =
          (car.speed * car.speed) / (2 * 3.8) + 0.9

        // Red and invalid/all-off states always demand a stop. On yellow, use a
        // dilemma zone: cars that can stop comfortably do so; cars already too
        // close continue through instead of emergency-braking on the crosswalk.
        const yellowCanStop =
          signal.yellow &&
          !signal.green &&
          distanceToStopLine > comfortableStoppingDistance
        const signalDemandsStop =
          signal.red ||
          (!signal.green && !signal.yellow) ||
          yellowCanStop
        const mustStopForSignal = signalDemandsStop && !hasEnteredIntersection

        let targetFront = Number.POSITIVE_INFINITY

        if (mustStopForSignal) {
          targetFront = def.stopProgress - 0.2
        }

        if (ahead) {
          // Maintain a small standstill gap plus a speed-dependent time headway.
          // This avoids the accordion effect when several cars queue at a red light.
          const safeGap = 2.35 + Math.min(3.6, car.speed * 0.65)
          const aheadRear = ahead.progress - ahead.length / 2
          targetFront = Math.min(targetFront, aheadRear - safeGap)
        }

        const distance = targetFront - front
        let targetSpeed = car.desiredSpeed

        if (Number.isFinite(targetFront)) {
          if (distance <= 0.1) {
            targetSpeed = 0
          } else if (distance < 12) {
            // Physical stopping-speed profile: begin easing off early instead of
            // repeatedly snapping between cruise speed and zero.
            const stoppingSpeed = Math.sqrt(
              2 * 2.0 * Math.max(0, distance - 0.12),
            )
            targetSpeed = Math.min(targetSpeed, stoppingSpeed)
          }
        }

        const actorId = `plc-${car.id}`
        const poseAtDistance = (distance: number) => flowId === 'eastbound' || flowId === 'westbound'
          ? horizontalRoadPose(car.progress + distance, 1.75, flowId === 'westbound')
          : { position: def.toWorld(car.progress + distance), rotationY: def.rotationY }
        targetSpeed = trafficSpeedLimit(actors, actorId, poseAtDistance, targetSpeed)
        car.braking = targetSpeed < car.speed - 0.12

        const accel = targetSpeed > car.speed ? 2.0 : 5.4
        car.speed = Math.max(
          0,
          car.speed +
            THREE.MathUtils.clamp(targetSpeed - car.speed, -accel * delta, accel * delta),
        )
        const requestedStep = boundedTrafficStep(car.progress, car.length, car.speed, delta, targetFront)
        const step = safeVehicleStep(actors, actorId, requestedStep, poseAtDistance)
        if (step < car.speed * delta - 0.00001) {
          car.braking = true
          car.speed = delta > 0 ? step / delta : 0
        }
        car.progress += step

        const group = refs.current.get(car.id)
        if (group) {
          applyWorldPosition(group, flowId, car.progress)
          updateVehicleVisuals(group, car.speed, delta, car.braking)
        }
      })
    }

    const alive = workingCars.filter(
      (car) => car.progress < FLOW_DEFINITIONS[car.flow].exit,
    )
    const removed = alive.length !== workingCars.length

    carsRef.current = alive

    if (spawned || removed) {
      setCars(alive.map((car) => ({ ...car })))
    }
  })

  return (
    <>
      {cars.map((car) => {
        const def = FLOW_DEFINITIONS[car.flow]
        return (
          <group
            key={car.id}
            ref={(node) => {
              if (node) {
                node.userData.trafficActive = true
                refs.current.set(car.id, node)
                actors.current.set(`plc-${car.id}`, { group: node, length: car.length, width: 1.9, order: car.id })
              } else {
                refs.current.delete(car.id)
                actors.current.delete(`plc-${car.id}`)
              }
            }}
            position={def.toWorld(car.progress)}
            rotation={[
              0,
              car.flow === 'eastbound'
                ? horizontalRoadPose(car.progress, TRAFFIC_WORLD.eastboundLaneZ).rotationY
                : car.flow === 'westbound'
                  ? horizontalRoadPose(car.progress, Math.abs(TRAFFIC_WORLD.westboundLaneZ), true).rotationY
                  : def.rotationY,
              0,
            ]}
          >
            <Suspense fallback={null}>
              <RealisticCarModel variant={car.variant} color={car.color} />
            </Suspense>
          </group>
        )
      })}
    </>
  )
}

function environmentPalette(hour: number, rain: number) {
  const normalized = ((hour % 24) + 24) % 24
  const daylight = THREE.MathUtils.clamp(
    Math.sin(((normalized - 6) / 12) * Math.PI),
    0,
    1,
  )
  const dawn = Math.max(0, 1 - Math.abs(normalized - 6) / 1.5)
  const dusk = Math.max(0, 1 - Math.abs(normalized - 18) / 1.8)
  const twilight = Math.max(dawn, dusk)

  const night = new THREE.Color('#020712')
  const day = new THREE.Color('#73b8e8')
  const sunset = new THREE.Color('#d88255')
  const sky = night.clone().lerp(day, daylight)
  sky.lerp(sunset, twilight * 0.34)
  sky.lerp(new THREE.Color('#26343d'), rain * 0.5)

  const fog = sky.clone().lerp(new THREE.Color('#1c252b'), 0.28 + rain * 0.35)

  return {
    daylight,
    twilight,
    sky,
    fog,
    ambient: 0.16 + daylight * 0.66,
    hemi: 0.14 + daylight * 0.48,
    sun: 0.08 + daylight * 1.35,
  }
}

function RainSystem({
  intensity,
  wind,
  windDirection,
  quality,
}: {
  intensity: number
  wind: number
  windDirection: number
  quality: 'low' | 'medium' | 'high'
}) {
  const ref = useRef<THREE.Points>(null)
  const count = quality === 'low' ? 240 : quality === 'medium' ? 650 : 1200
  const positions = useMemo(() => {
    const data = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      data[i * 3] = (Math.random() - 0.5) * CITY_LIMITS.width
      data[i * 3 + 1] = Math.random() * 34 + 2
      data[i * 3 + 2] = (Math.random() - 0.5) * CITY_LIMITS.depth
    }
    return data
  }, [count])

  useFrame((_state, deltaRaw) => {
    if (!ref.current || intensity <= 0.01) return
    const delta = Math.min(deltaRaw, 0.05)
    const geometry = ref.current.geometry
    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
    const angle = THREE.MathUtils.degToRad(windDirection)
    const driftX = Math.cos(angle) * wind * 8
    const driftZ = Math.sin(angle) * wind * 8
    const fall = 15 + intensity * 25

    for (let i = 0; i < count; i++) {
      const index = i * 3
      positions[index] += driftX * delta
      positions[index + 1] -= fall * delta
      positions[index + 2] += driftZ * delta

      if (positions[index + 1] < 0) {
        positions[index] = (Math.random() - 0.5) * CITY_LIMITS.width
        positions[index + 1] = 30 + Math.random() * 8
        positions[index + 2] = (Math.random() - 0.5) * CITY_LIMITS.depth
      }
      const halfWidth = CITY_LIMITS.width / 2
      const halfDepth = CITY_LIMITS.depth / 2
      if (positions[index] > halfWidth) positions[index] = -halfWidth
      if (positions[index] < -halfWidth) positions[index] = halfWidth
      if (positions[index + 2] > halfDepth) positions[index + 2] = -halfDepth
      if (positions[index + 2] < -halfDepth) positions[index + 2] = halfDepth
    }
    attribute.needsUpdate = true
  })

  if (intensity <= 0.01) return null

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#b8d7e8"
        size={quality === 'high' ? 0.11 : 0.09}
        transparent
        opacity={0.25 + intensity * 0.62}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
}

function WindParticles({
  strength,
  direction,
  quality,
}: {
  strength: number
  direction: number
  quality: 'low' | 'medium' | 'high'
}) {
  const ref = useRef<THREE.Points>(null)
  const count = quality === 'low' ? 24 : quality === 'medium' ? 55 : 90
  const positions = useMemo(() => {
    const data = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      data[i * 3] = (Math.random() - 0.5) * CITY_LIMITS.width
      data[i * 3 + 1] = 0.5 + Math.random() * 5
      data[i * 3 + 2] = (Math.random() - 0.5) * CITY_LIMITS.depth
    }
    return data
  }, [count])

  useFrame((_state, deltaRaw) => {
    if (!ref.current || strength <= 0.05) return
    const delta = Math.min(deltaRaw, 0.05)
    const attribute = ref.current.geometry.getAttribute('position') as THREE.BufferAttribute
    const angle = THREE.MathUtils.degToRad(direction)
    const vx = Math.cos(angle) * (2 + strength * 10)
    const vz = Math.sin(angle) * (2 + strength * 10)

    for (let i = 0; i < count; i++) {
      const index = i * 3
      positions[index] += vx * delta
      positions[index + 2] += vz * delta
      positions[index + 1] += Math.sin((i + performance.now() * 0.001) * 0.8) * 0.001

      const halfWidth = CITY_LIMITS.width / 2
      const halfDepth = CITY_LIMITS.depth / 2
      if (positions[index] > halfWidth) positions[index] = -halfWidth
      if (positions[index] < -halfWidth) positions[index] = halfWidth
      if (positions[index + 2] > halfDepth) positions[index + 2] = -halfDepth
      if (positions[index + 2] < -halfDepth) positions[index + 2] = halfDepth
    }
    attribute.needsUpdate = true
  })

  if (strength <= 0.05) return null

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#a8b98a"
        size={0.12}
        transparent
        opacity={0.12 + strength * 0.3}
        depthWrite={false}
      />
    </points>
  )
}

function RenderLimiter({ active, targetFps }: { active: boolean; targetFps: number }) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    if (!active) return

    let timer = 0

    const start = () => {
      if (document.hidden || timer) return
      const frameMs = Math.max(16, Math.round(1000 / Math.max(1, targetFps)))
      timer = window.setInterval(() => invalidate(), frameMs)
    }

    const stop = () => {
      if (!timer) return
      window.clearInterval(timer)
      timer = 0
    }

    const onVisibilityChange = () => {
      if (document.hidden) stop()
      else start()
    }

    start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [active, invalidate, targetFps])

  return null
}

function Scene({
  signals,
  running,
  quality,
  environment,
}: {
  signals: IntersectionTrafficState
  running: boolean
  quality: 'low' | 'medium' | 'high'
  environment: WorldEnvironment
}) {
  const actors = useRef<VehicleRegistry['current']>(new Map())
  const halfRoad = TRAFFIC_WORLD.roadWidth / 2
  const sidewalkSignalOffset = halfRoad + 0.9
  const palette = environmentPalette(environment.hour, environment.rain)
  const sunAngle = ((environment.hour - 6) / 24) * Math.PI * 2
  const sunPosition: [number, number, number] = [
    Math.cos(sunAngle) * 34,
    Math.max(4, Math.sin(sunAngle) * 42),
    18,
  ]

  const westSignal: [number, number, number] = [
    TRAFFIC_GEOMETRY.westStopLineX - 0.35,
    0,
    sidewalkSignalOffset,
  ]
  const eastSignal: [number, number, number] = [
    TRAFFIC_GEOMETRY.eastStopLineX + 0.35,
    0,
    -sidewalkSignalOffset,
  ]
  const southSignal: [number, number, number] = [
    -sidewalkSignalOffset,
    0,
    TRAFFIC_GEOMETRY.southStopLineZ - 0.35,
  ]
  const northSignal: [number, number, number] = [
    sidewalkSignalOffset,
    0,
    TRAFFIC_GEOMETRY.northStopLineZ + 0.35,
  ]

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.fog, CITY_LIMITS.width, Math.hypot(CITY_LIMITS.width, CITY_LIMITS.depth) * (1.7 - environment.rain * 0.2)]} />

      <ambientLight intensity={palette.ambient} />
      <hemisphereLight
        args={[
          palette.daylight > 0.2 ? '#9ad7ff' : '#243a63',
          '#111820',
          palette.hemi,
        ]}
      />
      <directionalLight
        position={sunPosition}
        intensity={palette.sun}
        color={palette.twilight > 0.2 ? '#ffb57b' : palette.daylight > 0.15 ? '#e7f5ff' : '#8aa3d8'}
      />

      <RoadScene
        quality={quality}
        rain={environment.rain}
        nightFactor={1 - palette.daylight}
      />
      <RainSystem
        intensity={environment.rain}
        wind={environment.wind}
        windDirection={environment.windDirection}
        quality={quality}
      />
      <WindParticles
        strength={environment.wind}
        direction={environment.windDirection}
        quality={quality}
      />

      {/* Four correctly placed approach signals */}
      <TrafficLight3D traffic={signals.west} position={westSignal} rotationY={Math.PI / 2} />
      <TrafficLight3D traffic={signals.east} position={eastSignal} rotationY={-Math.PI / 2} />
      <TrafficLight3D traffic={signals.south} position={southSignal} rotationY={0} />
      <TrafficLight3D traffic={signals.north} position={northSignal} rotationY={Math.PI} />

      <TrafficCars actors={actors} signals={signals} running={running} maxCarsPerFlow={quality === 'low' ? 1 : quality === 'medium' ? 2 : 3} />
      <UrbanNeighborhoods quality={quality} nightFactor={1 - palette.daylight} />
      <CityLife running={running} quality={quality} actors={actors} />

      <OrbitControls
        makeDefault
        target={[0, 0.9, -4]}
        enablePan
        enableRotate
        enableZoom
        minDistance={12}
        maxDistance={Math.hypot(CITY_LIMITS.width, CITY_LIMITS.depth)}
        maxPolarAngle={Math.PI / 2 - 0.08}
        panSpeed={0.9}
        rotateSpeed={0.65}
        zoomSpeed={0.9}
      />
    </>
  )
}

export function TrafficSimulation3D({
  signals,
  running,
  quality,
  targetFps,
  environment,
}: TrafficSimulation3DProps) {
  return (
    <div className="traffic-3d-root">
      <Canvas
        key={quality}
        frameloop="demand"
        dpr={quality === 'low' ? 0.8 : quality === 'medium' ? 1 : 1.25}
        camera={{ position: [65, 85, 100], fov: 50, near: 3, far: 400 }}
        gl={{
          antialias: quality === 'high',
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
      >
        <RenderLimiter active={running || environment.autoTime || environment.rain > 0.01 || environment.wind > 0.05} targetFps={targetFps} />
        <Scene
          signals={signals}
          running={running}
          quality={quality}
          environment={environment}
        />
      </Canvas>

      <div className="traffic-3d-label">
        <span>TRÁFEGO 3D</span>
        <strong>
          {String(Math.floor(environment.hour)).padStart(2, '0')}:{String(Math.floor((environment.hour % 1) * 60)).padStart(2, '0')}
          {' • '}{environment.rain > .65 ? 'chuva forte' : environment.rain > .15 ? 'chuva' : 'tempo seco'}
          {' • '}vento {Math.round(environment.wind * 100)}%
        </strong>
      </div>

      <div className="traffic-3d-help">
        <span>Arraste: girar</span>
        <span>Botão direito: mover</span>
        <span>Scroll: zoom</span>
      </div>
    </div>
  )
}
