import { updateVehicleVisuals } from './vehicleVisuals'
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  RealisticCarModel,
  type VehicleVariant,
} from './VehicleModel'
import {
  SUPERMARKET_PARKING_SPOTS,
  PEDESTRIAN_PATHS,
  type ParkingSpotDefinition,
} from './cityLayout'

import { parkingApproachCurve, parkingAlignCurve, parkingExitCurve, supermarketPedestrianHeight, parkRoadRoute, roundaboutRoute } from './roadGeometry'

import { trafficSpeedLimit, safeVehicleStep, vehicleSpawnClear, type VehicleRegistry } from './vehicleTraffic'
import { marketVehicleMustYield, marketPedestrianMustWait } from './parkingTraffic'

type Quality = 'low' | 'medium' | 'high'

export type ParkingCarState =
  | 'driving'
  | 'entering-parking'
  | 'searching-space'
  | 'aligning'
  | 'parking'
  | 'parked'
  | 'leaving-space'
  | 'leaving-parking'

type OccupancyTable = Map<string, string>
type Actors = React.MutableRefObject<Map<string, THREE.Group>>

const STATIC_CARS = [
  { spotId: 'A02', variant: 'concept' as VehicleVariant, color: '#d9e1e5' },
  { spotId: 'A04', variant: 'lc80' as VehicleVariant, color: '#6d7f89' },
  { spotId: 'B01', variant: 'sport' as VehicleVariant, color: '#8b2f3c' },
  { spotId: 'B04', variant: 'ferrari' as VehicleVariant, color: '#203f68' },
  { spotId: 'B05', variant: 'concept' as VehicleVariant, color: '#d9d1c6' },
]

function spotById(id: string) {
  return SUPERMARKET_PARKING_SPOTS.find((spot) => spot.id === id)
}

function applyCurveTransform(
  group: THREE.Group,
  curve: THREE.CatmullRomCurve3,
  t: number,
  y = 0.06,
) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1)
  const point = curve.getPointAt(clamped)
  const tangent = curve.getTangentAt(Math.min(0.999, clamped))
  group.position.set(point.x, y, point.z)
  group.rotation.y = -Math.atan2(tangent.z, tangent.x)
}

function StaticParkedCars({ quality }: { quality: Exclude<Quality, 'low'> }) {
  const visible = STATIC_CARS
  const scale = quality === 'high' ? 0.93 : 0.9

  return (
    <>
      {visible.map((car) => {
        const spot = spotById(car.spotId)
        if (!spot) return null
        return (
          <group
            key={car.spotId}
            position={spot.position}
            rotation={[0, spot.rotationY, 0]}
            scale={scale}
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

function ParkingCarAgent({
  id,
  running,
  occupancy,
  variant,
  color,
  delay,
  dwellSeconds,
  trafficOrder,
  vehicleActors,
  pedestrianActors,
  actors,
}: {
  id: string
  running: boolean
  occupancy: React.MutableRefObject<OccupancyTable>
  variant: VehicleVariant
  color: string
  delay: number
  dwellSeconds: number
  trafficOrder: number
  vehicleActors: Actors
  pedestrianActors: Actors
  actors: VehicleRegistry
}) {
  const ref = useRef<THREE.Group>(null)
  const state = useRef<ParkingCarState>('driving')
  const stateProgress = useRef(0)
  const parkedTimer = useRef(0)
  const motionSpeed = useRef(0)
  const elapsed = useRef(0)
  const spotRef = useRef<ParkingSpotDefinition | null>(null)
  const parkingVisit = useRef(0)
  const approachRef = useRef<THREE.CatmullRomCurve3 | null>(null)
  const alignRef = useRef<THREE.CatmullRomCurve3 | null>(null)
  const exitRef = useRef<THREE.CatmullRomCurve3 | null>(null)

  const reserveSpot = () => {
    const free = SUPERMARKET_PARKING_SPOTS.filter(
      (spot) => !spot.accessible && !occupancy.current.has(spot.id),
    )
    if (!free.length) return null

    const idSeed = Array.from(id).reduce(
      (sum, char) => sum + char.charCodeAt(0),
      0,
    )
    const freeIndex = (idSeed + parkingVisit.current * 3) % free.length
    const selected = free[freeIndex]
    parkingVisit.current += 1

    occupancy.current.set(selected.id, id)
    spotRef.current = selected
    approachRef.current = parkingApproachCurve(selected)
    alignRef.current = parkingAlignCurve(selected)
    exitRef.current = parkingExitCurve(selected)
    return selected
  }

  const resetAgent = () => {
    const spot = spotRef.current
    if (spot && occupancy.current.get(spot.id) === id) {
      occupancy.current.delete(spot.id)
    }
    state.current = 'driving'
    stateProgress.current = 0
    parkedTimer.current = 0
    motionSpeed.current = 0
    elapsed.current = 0
    spotRef.current = null
    approachRef.current = null
    alignRef.current = null
    exitRef.current = null
    if (ref.current) { ref.current.visible = false; ref.current.userData.trafficActive = false }
  }

  useEffect(() => {
    if (ref.current) {
      vehicleActors.current.set(id, ref.current)
      ref.current.userData.trafficActive = false
      actors.current.set(id, { group: ref.current, length: 4.82, width: 1.9, order: trafficOrder })
    }
    return () => {
      const spot = spotRef.current
      if (spot && occupancy.current.get(spot.id) === id) occupancy.current.delete(spot.id)
      vehicleActors.current.delete(id)
      actors.current.delete(id)
    }
  }, [id, occupancy, vehicleActors, actors, trafficOrder])

  useFrame((_frame, deltaRaw) => {
    const group = ref.current
    if (!running || !group) return

    const delta = Math.min(deltaRaw, 0.05)
    elapsed.current += delta

    if (elapsed.current < delay) {
      group.visible = false
      group.userData.trafficActive = false
      return
    }

    if (!spotRef.current) {
      if (!reserveSpot()) {
        group.visible = false
        group.userData.trafficActive = false
        return
      }
    }

    group.visible = true
    group.userData.trafficActive = true
    const spot = spotRef.current
    if (!spot) return

    group.userData.parkingMoving = state.current !== 'parked'
    updateVehicleVisuals(group, 0, delta, false)
    if (state.current !== 'parked' && state.current !== 'driving' &&
        marketVehicleMustYield(group.position, pedestrianActors.current.values())) {
      motionSpeed.current = 0
      updateVehicleVisuals(group, 0, delta, true)
      return
    }
    const advance = (curve: THREE.CatmullRomCurve3, speed: number, backing = false) => {
      const length = curve.getLength()
      const poseAtDistance = (distance: number) => {
        const t = THREE.MathUtils.clamp(backing ? 1 - stateProgress.current - distance / length : stateProgress.current + distance / length, 0, 1)
        const point = curve.getPointAt(t), tangent = curve.getTangentAt(t)
        return { position: [point.x, 0.06, point.z] as [number, number, number], rotationY: -Math.atan2(tangent.z, tangent.x) }
      }
      const remaining = Math.max(0, (1 - stateProgress.current) * length)
      const target = Math.min(speed, Math.sqrt(4 * remaining))
      const allowed = trafficSpeedLimit(actors, id, poseAtDistance, target)
      motionSpeed.current += THREE.MathUtils.clamp(allowed - motionSpeed.current, -3 * delta, 1.5 * delta)
      const distance = safeVehicleStep(actors, id, Math.min(remaining, motionSpeed.current * delta), poseAtDistance)
      motionSpeed.current = delta > 0 ? distance / delta : 0
      stateProgress.current += distance / length
      if (remaining - distance < 0.001) stateProgress.current = 1
      applyCurveTransform(group, curve, backing ? 1 - stateProgress.current : stateProgress.current)
      updateVehicleVisuals(group, (backing ? -1 : 1) * motionSpeed.current, delta, allowed < speed)
    }
    switch (state.current) {
      case 'driving':
        if (approachRef.current) applyCurveTransform(group, approachRef.current, 0)
        if (!vehicleSpawnClear(actors, { position: [group.position.x, group.position.y, group.position.z], rotationY: group.rotation.y }, 4.82, 1.9, id)) {
          group.visible = false
          group.userData.trafficActive = false
          return
        }
        state.current = 'entering-parking'
        stateProgress.current = 0
        break

      case 'entering-parking': {
        const curve = approachRef.current
        if (!curve) return
        advance(curve, 3)
        if (stateProgress.current >= 1) {
          state.current = 'searching-space'
          stateProgress.current = 0
        }
        break
      }

      case 'searching-space':
        motionSpeed.current = 0
        stateProgress.current += delta / 0.7
        if (stateProgress.current >= 1) {
          state.current = 'aligning'
          stateProgress.current = 0
        }
        break

      case 'aligning': {
        const curve = alignRef.current
        if (!curve) return
        advance(curve, 1.25)
        if (stateProgress.current >= 0.64) state.current = 'parking'
        break
      }

      case 'parking': {
        const curve = alignRef.current
        if (!curve) return
        advance(curve, 0.75)
        if (stateProgress.current >= 1) {
          group.position.set(spot.position[0], 0.04, spot.position[2])
          group.rotation.y = spot.rotationY
          state.current = 'parked'
          parkedTimer.current = 0
        }
        break
      }

      case 'parked':
        motionSpeed.current = 0
        parkedTimer.current += delta
        group.position.set(spot.position[0], 0.04, spot.position[2])
        group.rotation.y = spot.rotationY
        if (parkedTimer.current >= dwellSeconds) {
          state.current = 'leaving-space'
          stateProgress.current = 0
        }
        break

      case 'leaving-space': {
        const curve = alignRef.current
        if (!curve) return
        advance(curve, 1, true)
        if (stateProgress.current >= 1) {
          state.current = 'leaving-parking'
          stateProgress.current = 0
        }
        break
      }

      case 'leaving-parking': {
        const curve = exitRef.current
        if (!curve) return
        advance(curve, 3)
        if (stateProgress.current >= 1) resetAgent()
        break
      }
    }
  })

  return (
    <group ref={ref} visible={false}>
      <Suspense fallback={null}>
        <RealisticCarModel variant={variant} color={color} />
      </Suspense>
    </group>
  )
}

function RouteCar({ id, running, delay, curve, variant, color, actors, order }: {
  id: string; running: boolean; delay: number; curve: THREE.CatmullRomCurve3; variant: VehicleVariant; color: string; actors: VehicleRegistry; order: number
}) {
  const ref = useRef<THREE.Group>(null)
  const elapsed = useRef(0), progress = useRef(0), speed = useRef(0)
  const cycle = useRef(0)
  const delayTarget = useRef(delay)
  const length = useMemo(() => curve.getLength(), [curve])
  const poseAt = (distance: number) => {
    const t = THREE.MathUtils.clamp((progress.current + distance) / length, 0, 1)
    const point = curve.getPointAt(t), tangent = curve.getTangentAt(t)
    return { position: [point.x, 0.06, point.z] as [number, number, number], rotationY: -Math.atan2(tangent.z, tangent.x) }
  }
  useEffect(() => {
    if (ref.current) { ref.current.userData.trafficActive = false; actors.current.set(id, { group: ref.current, length: 4.82, width: 1.9, order }) }
    return () => { actors.current.delete(id) }
  }, [id, actors, order])
  useFrame((_frame, deltaRaw) => {
    const group = ref.current
    if (!running || !group) return
    const delta = Math.min(deltaRaw, 0.05)
    elapsed.current += delta
    if (elapsed.current < delayTarget.current) { group.visible = false; group.userData.trafficActive = false; return }
    if (!group.userData.trafficActive) {
      const pose = poseAt(0)
      group.position.set(...pose.position); group.rotation.y = pose.rotationY
      if (!vehicleSpawnClear(actors, pose, 4.82, 1.9, id)) return
      group.visible = true
      group.userData.trafficActive = true
    }
    const target = trafficSpeedLimit(actors, id, poseAt, 4.5)
    speed.current += THREE.MathUtils.clamp(target - speed.current, -4 * delta, 1.8 * delta)
    const distance = safeVehicleStep(actors, id, speed.current * delta, poseAt)
    if (distance < speed.current * delta) speed.current = delta ? distance / delta : 0
    progress.current += distance
    applyCurveTransform(group, curve, progress.current / length)
    updateVehicleVisuals(group, speed.current, delta, target < speed.current - 0.1)
    if (progress.current >= length) {
      progress.current = 0
      elapsed.current = 0
      speed.current = 0
      cycle.current += 1
      delayTarget.current =
        delay * (0.76 + ((order + cycle.current * 3) % 6) * 0.09)
      group.visible = false
      group.userData.trafficActive = false
    }
  })
  return <group ref={ref} visible={false}><Suspense fallback={null}><RealisticCarModel variant={variant} color={color} /></Suspense></group>
}

function RoundaboutTraffic({ running, quality, actors }: { running: boolean; quality: Exclude<Quality, 'low'>; actors: VehicleRegistry }) {
  // PLC cars now traverse west/east legs themselves. Ambient cars start at map edges.
  const routes = useMemo(() => [
    roundaboutRoute('north', 'east'), roundaboutRoute('east', 'south'), roundaboutRoute('south', 'north'),
    parkRoadRoute(false), parkRoadRoute(true),
  ], [])
  const variants: VehicleVariant[] = ['concept', 'sport', 'lc80', 'sport', 'concept']
  return <>{routes.map((curve, i) => quality === 'medium' && [1, 2, 4].includes(i) ? null :
    <RouteCar key={i} id={`city-${i}`} running={running} delay={i * 5.5} curve={curve} variant={variants[i]} color={i % 2 ? '#2f5f9a' : '#d7d4ca'} actors={actors} order={100 + i} />
  )}</>
}

function PedestrianFigure({ shirt }: { shirt: string }) {
  return (
    <group>
      <mesh position={[0, 0.86, 0]}>
        <capsuleGeometry args={[0.16, 0.6, 4, 6]} />
        <meshStandardMaterial color={shirt} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.43, 0]}>
        <sphereGeometry args={[0.18, 8, 6]} />
        <meshStandardMaterial color="#d2a57f" roughness={0.95} />
      </mesh>
      <mesh position={[-0.1, 0.32, 0]}>
        <capsuleGeometry args={[0.07, 0.42, 3, 5]} />
        <meshStandardMaterial color="#252d35" roughness={0.95} />
      </mesh>
      <mesh position={[0.1, 0.32, 0]}>
        <capsuleGeometry args={[0.07, 0.42, 3, 5]} />
        <meshStandardMaterial color="#252d35" roughness={0.95} />
      </mesh>
    </group>
  )
}

function PedestrianAgent({
  id,
  running,
  points,
  speed,
  offset,
  shirt,
  elevation,
  market,
  vehicleActors,
  pedestrianActors,
}: {
  id: string
  running: boolean
  points: Array<[number, number]>
  speed: number
  offset: number
  shirt: string
  elevation: number
  market: boolean
  vehicleActors: Actors
  pedestrianActors: Actors
}) {
  const ref = useRef<THREE.Group>(null)
  const segment = useRef(0)
  const progress = useRef(offset % 1)
  const initial = useMemo(() => {
    const x = THREE.MathUtils.lerp(points[0][0], points[1][0], offset % 1)
    const z = THREE.MathUtils.lerp(points[0][1], points[1][1], offset % 1)
    return [x, market ? supermarketPedestrianHeight(z) : elevation, z] as [number, number, number]
  }, [points, offset, market, elevation])
  useEffect(() => {
    if (ref.current) pedestrianActors.current.set(id, ref.current)
    return () => { pedestrianActors.current.delete(id) }
  }, [id, pedestrianActors])

  useFrame((_state, deltaRaw) => {
    if (!running || !ref.current) return
    const delta = Math.min(deltaRaw, 0.05)
    const from = points[segment.current]
    const nextIndex = (segment.current + 1) % points.length
    const to = points[nextIndex]
    const dx = to[0] - from[0]
    const dz = to[1] - from[1]
    const distance = Math.max(0.001, Math.hypot(dx, dz))
    if (market && marketPedestrianMustWait(ref.current.position, to[1], vehicleActors.current.values())) return
    progress.current += (speed * delta) / distance
    const t = Math.min(progress.current, 1)

    ref.current.position.set(
      THREE.MathUtils.lerp(from[0], to[0], t),
      market ? supermarketPedestrianHeight(THREE.MathUtils.lerp(from[1], to[1], t)) : elevation,
      THREE.MathUtils.lerp(from[1], to[1], t),
    )
    ref.current.rotation.y = -Math.atan2(dz, dx)

    if (progress.current >= 1) {
      segment.current = nextIndex
      progress.current = 0
    }
  })

  return (
    <group ref={ref} position={initial}>
      <PedestrianFigure shirt={shirt} />
    </group>
  )
}

function PedestrianSystem({
  running,
  quality,
  vehicleActors,
  pedestrianActors,
}: {
  running: boolean
  quality: Exclude<Quality, 'low'>
  vehicleActors: Actors
  pedestrianActors: Actors
}) {
  const loops = PEDESTRIAN_PATHS
  const shirts = ['#346aa3', '#9e4d58', '#d2a43a', '#3d8068', '#725a9a', '#b2673c']
  const count = quality === 'high' ? 14 : 7

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <PedestrianAgent
          key={index}
          id={`pedestrian-${index}`}
          vehicleActors={vehicleActors}
          pedestrianActors={pedestrianActors}
          market={index % loops.length === 0 || index % loops.length === 3}
          running={running}
          points={loops[index % loops.length]}
          elevation={index % loops.length === 2 ? 0.26 : index % loops.length === 1 ? 0.18 : 0.04}
          speed={0.72 + (index % 4) * 0.08}
          offset={(index * 0.23) % 1}
          shirt={shirts[index % shirts.length]}
        />
      ))}
    </>
  )
}

export function CityLife({
  running,
  quality,
  actors,
}: {
  running: boolean
  quality: Quality
  actors: VehicleRegistry
}) {
  const occupancy = useRef<OccupancyTable>(new Map())
  const vehicleActors = useRef<Map<string, THREE.Group>>(new Map())
  const pedestrianActors = useRef<Map<string, THREE.Group>>(new Map())

  if (!occupancy.current.size) {
    for (const spot of SUPERMARKET_PARKING_SPOTS) {
      if (spot.staticOccupied) occupancy.current.set(spot.id, 'static')
    }
  }

  if (quality === 'low') return null

  return (
    <>
      <StaticParkedCars quality={quality} />
      <ParkingCarAgent
        id="parking-agent-1"
        running={running}
        actors={actors}
        occupancy={occupancy}
        vehicleActors={vehicleActors}
        pedestrianActors={pedestrianActors}
        variant="concept"
        color="#4f7087"
        delay={1}
        dwellSeconds={7}
        trafficOrder={220}
      />
      {quality === 'high' && (
        <ParkingCarAgent
          id="parking-agent-2"
          running={running}
          actors={actors}
          occupancy={occupancy}
          vehicleActors={vehicleActors}
          pedestrianActors={pedestrianActors}
          variant="sport"
          color="#8a343c"
          delay={5}
          dwellSeconds={10}
          trafficOrder={221}
        />
      )}
      <RoundaboutTraffic running={running} quality={quality} actors={actors} />
      <PedestrianSystem running={running} quality={quality} vehicleActors={vehicleActors} pedestrianActors={pedestrianActors} />
    </>
  )
}
