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

import { parkingApproachCurve, parkingAlignCurve, parkingExitCurve, roundaboutRoute, type RoundaboutLeg } from './roadGeometry'

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
}: {
  id: string
  running: boolean
  occupancy: React.MutableRefObject<OccupancyTable>
  variant: VehicleVariant
  color: string
  delay: number
  dwellSeconds: number
}) {
  const ref = useRef<THREE.Group>(null)
  const state = useRef<ParkingCarState>('driving')
  const stateProgress = useRef(0)
  const parkedTimer = useRef(0)
  const elapsed = useRef(0)
  const spotRef = useRef<ParkingSpotDefinition | null>(null)
  const approachRef = useRef<THREE.CatmullRomCurve3 | null>(null)
  const alignRef = useRef<THREE.CatmullRomCurve3 | null>(null)
  const exitRef = useRef<THREE.CatmullRomCurve3 | null>(null)

  const reserveSpot = () => {
    const free = SUPERMARKET_PARKING_SPOTS.find(
      (spot) => !spot.accessible && !occupancy.current.has(spot.id),
    )
    if (!free) return null
    occupancy.current.set(free.id, id)
    spotRef.current = free
    approachRef.current = parkingApproachCurve(free)
    alignRef.current = parkingAlignCurve(free)
    exitRef.current = parkingExitCurve(free)
    return free
  }

  const resetAgent = () => {
    const spot = spotRef.current
    if (spot && occupancy.current.get(spot.id) === id) {
      occupancy.current.delete(spot.id)
    }
    state.current = 'driving'
    stateProgress.current = 0
    parkedTimer.current = 0
    elapsed.current = 0
    spotRef.current = null
    approachRef.current = null
    alignRef.current = null
    exitRef.current = null
    if (ref.current) ref.current.visible = false
  }

  useEffect(() => () => {
    const spot = spotRef.current
    if (spot && occupancy.current.get(spot.id) === id) occupancy.current.delete(spot.id)
  }, [id, occupancy])

  useFrame((_frame, deltaRaw) => {
    const group = ref.current
    if (!running || !group) return

    const delta = Math.min(deltaRaw, 0.05)
    elapsed.current += delta

    if (elapsed.current < delay) {
      group.visible = false
      return
    }

    if (!spotRef.current) {
      if (!reserveSpot()) {
        group.visible = false
        return
      }
    }

    group.visible = true
    const spot = spotRef.current
    if (!spot) return

    switch (state.current) {
      case 'driving':
        if (approachRef.current) applyCurveTransform(group, approachRef.current, 0)
        state.current = 'entering-parking'
        stateProgress.current = 0
        break

      case 'entering-parking': {
        const curve = approachRef.current
        if (!curve) return
        stateProgress.current += delta / 7.5
        applyCurveTransform(group, curve, stateProgress.current)
        if (stateProgress.current >= 1) {
          state.current = 'searching-space'
          stateProgress.current = 0
        }
        break
      }

      case 'searching-space':
        stateProgress.current += delta / 0.7
        if (stateProgress.current >= 1) {
          state.current = 'aligning'
          stateProgress.current = 0
        }
        break

      case 'aligning': {
        const curve = alignRef.current
        if (!curve) return
        stateProgress.current += delta / 2.3
        applyCurveTransform(group, curve, stateProgress.current)
        if (stateProgress.current >= 0.64) state.current = 'parking'
        break
      }

      case 'parking': {
        const curve = alignRef.current
        if (!curve) return
        stateProgress.current += delta / 2.8
        applyCurveTransform(group, curve, stateProgress.current)
        if (stateProgress.current >= 1) {
          group.position.set(spot.position[0], 0.04, spot.position[2])
          group.rotation.y = spot.rotationY
          state.current = 'parked'
          parkedTimer.current = 0
        }
        break
      }

      case 'parked':
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
        stateProgress.current += delta / 2.6
        applyCurveTransform(group, curve, 1 - stateProgress.current)
        if (stateProgress.current >= 1) {
          state.current = 'leaving-parking'
          stateProgress.current = 0
        }
        break
      }

      case 'leaving-parking': {
        const curve = exitRef.current
        if (!curve) return
        stateProgress.current += delta / 8.0
        applyCurveTransform(group, curve, stateProgress.current)
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

function RoundaboutCar({
  running,
  delay,
  entry,
  exit,
  variant,
  color,
}: {
  running: boolean
  delay: number
  entry: RoundaboutLeg
  exit: RoundaboutLeg
  variant: VehicleVariant
  color: string
}) {
  const ref = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const progress = useRef(0)
  const curve = useMemo(() => roundaboutRoute(entry, exit), [entry, exit])

  useFrame((_frame, deltaRaw) => {
    if (!running || !ref.current) return
    const delta = Math.min(deltaRaw, 0.05)
    elapsed.current += delta

    if (elapsed.current < delay) {
      ref.current.visible = false
      return
    }

    ref.current.visible = true
    progress.current += delta * 4.5 / curve.getLength()
    applyCurveTransform(ref.current, curve, progress.current)

    if (progress.current >= 1) {
      progress.current = 0
      elapsed.current = 0
      ref.current.visible = false
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

function RoundaboutTraffic({
  running,
  quality,
}: {
  running: boolean
  quality: Exclude<Quality, 'low'>
}) {
  const routes = quality === 'high'
    ? [
        { delay: 0, entry: 'west' as const, exit: 'north' as const, variant: 'concept' as VehicleVariant, color: '#f0f2f3' },
        { delay: 3.8, entry: 'north' as const, exit: 'east' as const, variant: 'sport' as VehicleVariant, color: '#2f5f9a' },
        { delay: 7.5, entry: 'east' as const, exit: 'south' as const, variant: 'lc80' as VehicleVariant, color: '#8b2f3c' },
        { delay: 11.0, entry: 'south' as const, exit: 'west' as const, variant: 'ferrari' as VehicleVariant, color: '#d7d4ca' },
      ]
    : [
        { delay: 0, entry: 'west' as const, exit: 'east' as const, variant: 'concept' as VehicleVariant, color: '#f0f2f3' },
        { delay: 6, entry: 'north' as const, exit: 'west' as const, variant: 'sport' as VehicleVariant, color: '#2f5f9a' },
      ]

  return (
    <>
      {routes.map((route, index) => (
        <RoundaboutCar key={index} running={running} {...route} />
      ))}
    </>
  )
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
  running,
  points,
  speed,
  offset,
  shirt,
  elevation,
}: {
  running: boolean
  points: Array<[number, number]>
  speed: number
  offset: number
  shirt: string
  elevation: number
}) {
  const ref = useRef<THREE.Group>(null)
  const segment = useRef(0)
  const progress = useRef(offset % 1)

  useFrame((_state, deltaRaw) => {
    if (!running || !ref.current) return
    const delta = Math.min(deltaRaw, 0.05)
    const from = points[segment.current]
    const nextIndex = (segment.current + 1) % points.length
    const to = points[nextIndex]
    const dx = to[0] - from[0]
    const dz = to[1] - from[1]
    const distance = Math.max(0.001, Math.hypot(dx, dz))
    progress.current += (speed * delta) / distance
    const t = Math.min(progress.current, 1)

    ref.current.position.set(
      THREE.MathUtils.lerp(from[0], to[0], t),
      elevation,
      THREE.MathUtils.lerp(from[1], to[1], t),
    )
    ref.current.rotation.y = -Math.atan2(dz, dx)

    if (progress.current >= 1) {
      segment.current = nextIndex
      progress.current = 0
    }
  })

  return (
    <group ref={ref}>
      <PedestrianFigure shirt={shirt} />
    </group>
  )
}

function PedestrianSystem({
  running,
  quality,
}: {
  running: boolean
  quality: Exclude<Quality, 'low'>
}) {
  const loops = PEDESTRIAN_PATHS
  const shirts = ['#346aa3', '#9e4d58', '#d2a43a', '#3d8068', '#725a9a', '#b2673c']
  const count = quality === 'high' ? 14 : 7

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <PedestrianAgent
          key={index}
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
}: {
  running: boolean
  quality: Quality
}) {
  const occupancy = useRef<OccupancyTable>(new Map())

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
        occupancy={occupancy}
        variant="concept"
        color="#4f7087"
        delay={1}
        dwellSeconds={7}
      />
      {quality === 'high' && (
        <ParkingCarAgent
          id="parking-agent-2"
          running={running}
          occupancy={occupancy}
          variant="sport"
          color="#8a343c"
          delay={5}
          dwellSeconds={10}
        />
      )}
      <RoundaboutTraffic running={running} quality={quality} />
      <PedestrianSystem running={running} quality={quality} />
    </>
  )
}
