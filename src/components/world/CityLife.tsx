import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  RealisticCarModel,
  type VehicleVariant,
} from './VehicleModel'
import {
  CITY_ROADS,
  ROUNDABOUT,
  SUPERMARKET_PARKING_SPOTS,
  type ParkingSpotDefinition,
} from './cityLayout'

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
  y = 0.24,
) {
  const clamped = THREE.MathUtils.clamp(t, 0, 1)
  const point = curve.getPointAt(clamped)
  const tangent = curve.getTangentAt(Math.min(0.999, clamped))
  group.position.set(point.x, y, point.z)
  group.rotation.y = -Math.atan2(tangent.z, tangent.x)
}

function parkingApproachCurve(spot: ParkingSpotDefinition) {
  const [sx, , sz] = spot.position
  const aisleZ = sz > -12 ? -8.25 : -15.1
  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-38, 0, -1.75),
      new THREE.Vector3(-33.0, 0, -1.75),
      new THREE.Vector3(-30.8, 0, -4.2),
      new THREE.Vector3(-30.8, 0, aisleZ),
      new THREE.Vector3(sx - 5.0, 0, aisleZ),
      new THREE.Vector3(sx - 2.8, 0, aisleZ),
    ],
    false,
    'catmullrom',
    0.35,
  )
}

function parkingAlignCurve(spot: ParkingSpotDefinition) {
  const [sx, , sz] = spot.position
  const aisleZ = sz > -12 ? -8.25 : -15.1
  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(sx - 2.8, 0, aisleZ),
      new THREE.Vector3(sx - 1.2, 0, aisleZ),
      new THREE.Vector3(sx - 0.45, 0, THREE.MathUtils.lerp(aisleZ, sz, 0.58)),
      new THREE.Vector3(sx, 0, sz),
    ],
    false,
    'catmullrom',
    0.32,
  )
}

function parkingExitCurve(spot: ParkingSpotDefinition) {
  const [sx, , sz] = spot.position
  const aisleZ = sz > -12 ? -8.25 : -15.1
  return new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(sx, 0, sz),
      new THREE.Vector3(sx - 0.7, 0, THREE.MathUtils.lerp(sz, aisleZ, 0.52)),
      new THREE.Vector3(sx - 2.8, 0, aisleZ),
      new THREE.Vector3(-30.7, 0, aisleZ),
      new THREE.Vector3(-30.7, 0, 1.75),
      new THREE.Vector3(-19, 0, 1.75),
      new THREE.Vector3(2, 0, 1.75),
      new THREE.Vector3(38, 0, 1.75),
    ],
    false,
    'catmullrom',
    0.35,
  )
}

function StaticParkedCars({ quality }: { quality: Exclude<Quality, 'low'> }) {
  const visible = quality === 'high' ? STATIC_CARS : STATIC_CARS.slice(0, 3)

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
            scale={0.93}
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
          group.position.set(spot.position[0], 0.24, spot.position[2])
          group.rotation.y = spot.rotationY
          state.current = 'parked'
          parkedTimer.current = 0
        }
        break
      }

      case 'parked':
        parkedTimer.current += delta
        group.position.set(spot.position[0], 0.24, spot.position[2])
        group.rotation.y = spot.rotationY
        if (parkedTimer.current >= dwellSeconds) {
          state.current = 'leaving-space'
          stateProgress.current = 0
        }
        break

      case 'leaving-space': {
        const curve = exitRef.current
        if (!curve) return
        stateProgress.current += delta / 2.6
        applyCurveTransform(group, curve, Math.min(stateProgress.current * 0.28, 0.28))
        if (stateProgress.current >= 1) {
          state.current = 'leaving-parking'
          stateProgress.current = 0.28
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

type RoundaboutLeg = 'west' | 'north' | 'east' | 'south'

const ROUNDABOUT_ANGLES: Record<RoundaboutLeg, number> = {
  east: 0,
  south: Math.PI / 2,
  west: Math.PI,
  north: Math.PI * 1.5,
}

function approachRoadPoints(leg: RoundaboutLeg): Array<[number, number]> {
  if (leg === 'west') {
    return CITY_ROADS.eastBoulevard.points.slice(-4)
  }

  const road =
    leg === 'north'
      ? CITY_ROADS.roundaboutNorth
      : leg === 'east'
        ? CITY_ROADS.roundaboutEast
        : CITY_ROADS.roundaboutSouth

  return [...road.points].reverse()
}

function exitRoadPoints(leg: RoundaboutLeg): Array<[number, number]> {
  if (leg === 'west') {
    return [...CITY_ROADS.eastBoulevard.points.slice(-4)].reverse()
  }

  return leg === 'north'
    ? CITY_ROADS.roundaboutNorth.points
    : leg === 'east'
      ? CITY_ROADS.roundaboutEast.points
      : CITY_ROADS.roundaboutSouth.points
}

function roundaboutRoute(entry: RoundaboutLeg, exit: RoundaboutLeg) {
  const [cx, cz] = ROUNDABOUT.center
  const radius = ROUNDABOUT.laneRadius
  const start = ROUNDABOUT_ANGLES[entry]
  let finish = ROUNDABOUT_ANGLES[exit]

  // Clockwise circulation in screen/world orientation. Never loop indefinitely.
  while (finish <= start + 0.3) finish += Math.PI * 2

  const points: THREE.Vector3[] = approachRoadPoints(entry).map(
    ([x, z]) => new THREE.Vector3(x, 0, z),
  )

  points.push(
    new THREE.Vector3(
      cx + Math.cos(start) * radius,
      0,
      cz + Math.sin(start) * radius,
    ),
  )

  const arc = finish - start
  const steps = Math.max(5, Math.ceil((arc / (Math.PI * 2)) * 28))
  for (let i = 1; i <= steps; i++) {
    const angle = THREE.MathUtils.lerp(start, finish, i / steps)
    points.push(
      new THREE.Vector3(
        cx + Math.cos(angle) * radius,
        0,
        cz + Math.sin(angle) * radius,
      ),
    )
  }

  for (const [x, z] of exitRoadPoints(exit)) {
    points.push(new THREE.Vector3(x, 0, z))
  }

  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.14)
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
    progress.current += delta / 8.5
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
}: {
  running: boolean
  points: Array<[number, number]>
  speed: number
  offset: number
  shirt: string
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
      0.22,
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
  const loops: Array<Array<[number, number]>> = [
    // Supermarket perimeter and entrance sidewalk.
    [[-30.0, -7.4], [-13.0, -7.4], [-13.0, -21.5], [-30.0, -21.5]],
    // Commercial strip sidewalk.
    [[8.5, 10.2], [31.0, 10.2], [31.0, 21.5], [8.5, 21.5]],
    // Civic garden block, intentionally kept off the curved road surface.
    [[-35.5, 15.8], [-14.0, 15.8], [-14.0, 22.0], [-35.5, 22.0]],
    // Supermarket entrance / cart shelter route.
    [[-29.5, -7.2], [-21.5, -7.2], [-21.5, -16.0], [-21.5, -20.9]],
  ]
  const shirts = ['#346aa3', '#9e4d58', '#d2a43a', '#3d8068', '#725a9a', '#b2673c']
  const count = quality === 'high' ? 14 : 7

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <PedestrianAgent
          key={index}
          running={running}
          points={loops[index % loops.length]}
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
