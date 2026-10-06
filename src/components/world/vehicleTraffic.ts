import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import type { Group } from 'three'
import { ROUNDABOUT } from './cityLayout'

export type VehiclePose = { position: [number, number, number]; rotationY: number }
export type VehicleActor = { group: Group; length: number; width: number; order: number }
export type VehicleRegistry = MutableRefObject<Map<string, VehicleActor>>

export function vehicleBodiesOverlap(a: VehiclePose, length: number, width: number, b: VehiclePose, otherLength: number, otherWidth: number, margin = 0.25) {
  return vehicleOverlapDepth(a, length, width, b, otherLength, otherWidth, margin) > 0
}

function vehicleOverlapDepth(
  a: VehiclePose,
  length: number,
  width: number,
  b: VehiclePose,
  otherLength: number,
  otherWidth: number,
  margin = 0.25,
) {
  const ax = Math.cos(a.rotationY), az = -Math.sin(a.rotationY)
  const bx = Math.cos(b.rotationY), bz = -Math.sin(b.rotationY)
  const dx = b.position[0] - a.position[0], dz = b.position[2] - a.position[2]

  if (
    Math.hypot(dx, dz) >
    (length + otherLength) / 2 + width + otherWidth + margin
  ) {
    return 0
  }

  let minimumPenetration = Number.POSITIVE_INFINITY

  for (const [x, z] of [[ax, az], [-az, ax], [bx, bz], [-bz, bx]]) {
    const radiusA =
      length / 2 * Math.abs(x * ax + z * az) +
      width / 2 * Math.abs(-x * az + z * ax)
    const radiusB =
      otherLength / 2 * Math.abs(x * bx + z * bz) +
      otherWidth / 2 * Math.abs(-x * bz + z * bx)
    const penetration =
      radiusA + radiusB + margin - Math.abs(dx * x + dz * z)

    if (penetration <= 0) return 0
    minimumPenetration = Math.min(minimumPenetration, penetration)
  }

  return minimumPenetration
}

function actorActive(actor: VehicleActor) {
  return actor.group.userData.trafficActive ?? actor.group.visible
}

function actorPose(actor: VehicleActor): VehiclePose {
  return { position: [actor.group.position.x, actor.group.position.y, actor.group.position.z], rotationY: actor.group.rotation.y }
}

function roundaboutState(pose: VehiclePose) {
  const dx = pose.position[0] - ROUNDABOUT.center[0]
  const dz = pose.position[2] - ROUNDABOUT.center[1]
  const radius = Math.max(0.001, Math.hypot(dx, dz))
  const forwardX = Math.cos(pose.rotationY)
  const forwardZ = -Math.sin(pose.rotationY)
  const radialDot = (forwardX * dx + forwardZ * dz) / radius
  const tangentialDot = Math.abs((-dz / radius) * forwardX + (dx / radius) * forwardZ)

  return {
    radius,
    angle: Math.atan2(dz, dx),
    radialDot,
    tangentialDot,
    circulating:
      radius > ROUNDABOUT.islandRadius + 0.7 &&
      radius < ROUNDABOUT.roadOuterRadius + 0.45 &&
      tangentialDot > 0.58,
    // Once the center crosses inside this radius the driver has already passed
    // the give-way line. They must finish the merge instead of stopping halfway
    // through the entry arc.
    committed:
      radius > ROUNDABOUT.islandRadius + 0.7 &&
      radius < ROUNDABOUT.roadOuterRadius + 1.35,
    approaching:
      radius >= ROUNDABOUT.roadOuterRadius - 0.2 &&
      radius < ROUNDABOUT.roadOuterRadius + 13 &&
      radialDot < -0.18,
    // Keep the vehicle CENTER far enough back that its front bumper does
    // not protrude into the circulating lane while yielding. 2.85 m covers
    // half of the largest car plus a small safety margin.
    clearance: Math.max(0, radius - ROUNDABOUT.roadOuterRadius - 2.85),
  }
}

function roundaboutYieldSpeed(clearance: number) {
  if (clearance <= 0.15) return 0
  // Comfortable deceleration before the give-way line instead of a last-moment stop.
  return Math.sqrt(2 * 3.2 * Math.max(0, clearance))
}

function crossingConflictDistance(a: VehiclePose, b: VehiclePose) {
  const ax = Math.cos(a.rotationY)
  const az = -Math.sin(a.rotationY)
  const bx = Math.cos(b.rotationY)
  const bz = -Math.sin(b.rotationY)
  const cross = ax * bz - az * bx

  // Parallel / same-road traffic is handled by following and footprint checks.
  if (Math.abs(cross) < 0.38) return null

  const dx = b.position[0] - a.position[0]
  const dz = b.position[2] - a.position[2]
  const selfDistance = (dx * bz - dz * bx) / cross
  const otherDistance = (dx * az - dz * ax) / cross

  if (
    selfDistance <= 0 ||
    selfDistance > 16 ||
    otherDistance < -1.5 ||
    otherDistance > 16
  ) {
    return null
  }

  return selfDistance
}

function junctionYieldSpeed(distance: number) {
  const clearance = Math.max(0, distance - 3.1)
  if (clearance <= 0.12) return 0
  return Math.sqrt(2 * 3.1 * clearance)
}

function clockwiseAngleGap(from: number, to: number) {
  let gap = from - to
  while (gap < 0) gap += Math.PI * 2
  while (gap >= Math.PI * 2) gap -= Math.PI * 2
  return gap
}

function normalizeAngle(angle: number) {
  let value = angle
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

/**
 * Reduce cruise speed before tighter bends. This is intentionally based on
 * the vehicle's own future poses, so every route (boulevard, roundabout,
 * parking and local streets) gets the same behaviour without hardcoded zones.
 */
export function curvatureSpeedLimit(
  poseAtDistance: (distance: number) => VehiclePose,
  desiredSpeed: number,
) {
  const now = poseAtDistance(0)
  const near = poseAtDistance(4)
  const far = poseAtDistance(8)

  const nearTurn = Math.abs(normalizeAngle(near.rotationY - now.rotationY))
  const farTurn = Math.abs(normalizeAngle(far.rotationY - near.rotationY))
  const turn = Math.max(nearTurn, farTurn)

  if (turn < 0.08) return desiredSpeed

  const curveCap = THREE.MathUtils.clamp(
    6.2 - turn * 5.0,
    2.6,
    desiredSpeed,
  )
  return Math.min(desiredSpeed, curveCap)
}

export function shouldStopForSignal({
  red,
  yellow,
  green,
  speed,
  distanceToStopLine,
  hasEnteredIntersection,
}: {
  red: boolean
  yellow: boolean
  green: boolean
  speed: number
  distanceToStopLine: number
  hasEnteredIntersection: boolean
}) {
  if (hasEnteredIntersection) return false
  if (red) return true
  if (!green && !yellow) return true
  if (green) return false

  const comfortableStoppingDistance =
    (speed * speed) / (2 * 3.8) + 0.9

  return distanceToStopLine > comfortableStoppingDistance
}

export function trafficSpeedLimit(registry: VehicleRegistry, id: string, poseAtDistance: (distance: number) => VehiclePose, desiredSpeed: number) {
  const self = registry.current.get(id)
  if (!self) return desiredSpeed

  const now = poseAtDistance(0)
  const selfRoundabout = roundaboutState(now)
  let limit = curvatureSpeedLimit(poseAtDistance, desiredSpeed)

  for (const [otherId, other] of registry.current) {
    if (otherId === id || !actorActive(other)) continue

    const pose = actorPose(other)
    const dx = pose.position[0] - now.position[0]
    const dz = pose.position[2] - now.position[2]
    const separation = Math.hypot(dx, dz)
    const otherRoundabout = roundaboutState(pose)

    // Give way BEFORE entering the circle. The old logic only reacted when
    // footprints were nearly intersecting, which caused abrupt stops/collisions.
    if (selfRoundabout.approaching && !selfRoundabout.committed) {
      if (otherRoundabout.circulating) {
        // Yield only when the circulating car is actually approaching THIS
        // entry. A car that has already passed the entry must not block it
        // until it completes the entire circle.
        const arcToEntry =
          clockwiseAngleGap(otherRoundabout.angle, selfRoundabout.angle) *
          ROUNDABOUT.laneRadius
        if (arcToEntry < 13.5) {
          limit = Math.min(limit, roundaboutYieldSpeed(selfRoundabout.clearance))
        }
      } else if (otherRoundabout.committed && separation < 18) {
        // A vehicle that already crossed its give-way line owns the merge until
        // it reaches the circulating lane, regardless of static actor order.
        limit = Math.min(limit, roundaboutYieldSpeed(selfRoundabout.clearance))
      } else if (
        otherRoundabout.approaching &&
        !otherRoundabout.committed &&
        other.order < self.order &&
        separation < 22
      ) {
        limit = Math.min(limit, roundaboutYieldSpeed(selfRoundabout.clearance))
      }
    }

    if (separation > 22) continue

    // At ordinary junctions, calculate the intersection of the two local
    // heading rays. This lets the lower-priority vehicle brake before the
    // conflict point instead of relying on last-second body overlap.
    if (
      other.order < self.order &&
      !selfRoundabout.approaching &&
      !selfRoundabout.circulating &&
      !otherRoundabout.approaching &&
      !otherRoundabout.circulating
    ) {
      const conflictDistance = crossingConflictDistance(now, pose)
      if (conflictDistance !== null) {
        limit = Math.min(limit, junctionYieldSpeed(conflictDistance))
      }
    }

    const forwardX = Math.cos(now.rotationY)
    const forwardZ = -Math.sin(now.rotationY)
    const forward = dx * forwardX + dz * forwardZ
    const lateral = Math.abs(
      dx * (-forwardZ) + dz * forwardX,
    )
    const following =
      forward > 0 &&
      lateral < 2.65 &&
      Math.cos(now.rotationY - pose.rotationY) > 0.35

    const circleGap =
      selfRoundabout.circulating && otherRoundabout.circulating
        ? clockwiseAngleGap(selfRoundabout.angle, otherRoundabout.angle) *
          ROUNDABOUT.laneRadius
        : Number.POSITIVE_INFINITY

    const circleFollowing =
      selfRoundabout.circulating &&
      otherRoundabout.circulating &&
      circleGap > 0.25 &&
      circleGap < 14

    const circulatingApproachesThisEntry =
      selfRoundabout.approaching &&
      !selfRoundabout.committed &&
      otherRoundabout.circulating &&
      clockwiseAngleGap(otherRoundabout.angle, selfRoundabout.angle) *
        ROUNDABOUT.laneRadius <
        13.5

    const committedOwnsMerge =
      selfRoundabout.approaching &&
      !selfRoundabout.committed &&
      otherRoundabout.committed &&
      separation < 18

    const yieldToOther =
      following ||
      circulatingApproachesThisEntry ||
      committedOwnsMerge ||
      circleFollowing ||
      (
        !selfRoundabout.circulating &&
        !otherRoundabout.circulating &&
        !selfRoundabout.committed &&
        !otherRoundabout.committed &&
        other.order < self.order
      )

    if (!yieldToOther) continue

    // Longer look-ahead gives smoother queues on curves and parking approaches.
    for (const distance of [1.5, 3, 5, 7.5, 10.5]) {
      if (
        vehicleBodiesOverlap(
          poseAtDistance(distance),
          self.length,
          self.width,
          pose,
          other.length,
          other.width,
          0.65,
        )
      ) {
        limit = Math.min(
          limit,
          Math.sqrt(2 * 3.6 * Math.max(0, distance - 1.45)),
        )
        break
      }
    }
  }

  return limit
}

// Check the actual next footprint even when a higher-priority car has right of way.
// A stopped actor never moves backwards to resolve an already occupied space.
export function safeVehicleStep(registry: VehicleRegistry, id: string, requested: number, poseAtDistance: (distance: number) => VehiclePose) {
  const self = registry.current.get(id)
  if (!self || requested <= 0) return requested

  const blockersAt = (distance: number) => {
    const pose = poseAtDistance(distance)
    const blockers: Array<{ actor: VehicleActor; depth: number }> = []

    for (const [otherId, other] of registry.current) {
      if (otherId === id || !actorActive(other)) continue
      const depth = vehicleOverlapDepth(
        pose,
        self.length,
        self.width,
        actorPose(other),
        other.length,
        other.width,
      )
      if (depth > 0) blockers.push({ actor: other, depth })
    }

    return blockers
  }

  const requestedBlockers = blockersAt(requested)
  if (!requestedBlockers.length) return requested

  const currentBlockers = blockersAt(0)
  if (currentBlockers.length) {
    // Rare conflict recovery: only the deterministic priority vehicle may creep
    // forward, and only when that tiny motion reduces every existing overlap
    // without introducing a new one. This resolves gridlocks without letting a
    // car push deeper through another vehicle.
    const recoveryStep = Math.min(requested, 0.16)
    const recoveryBlockers = blockersAt(recoveryStep)
    const currentActors = new Set(currentBlockers.map(({ actor }) => actor))

    const introducesNewConflict = recoveryBlockers.some(
      ({ actor }) => !currentActors.has(actor),
    )
    const ownsPriority = currentBlockers.every(
      ({ actor }) => self.order < actor.order,
    )
    const reducesEveryConflict = currentBlockers.every(({ actor, depth }) => {
      const next = recoveryBlockers.find((item) => item.actor === actor)
      return !next || next.depth < depth - 0.002
    })

    if (ownsPriority && !introducesNewConflict && reducesEveryConflict) {
      return recoveryStep
    }

    return 0
  }

  let low = 0, high = requested
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2
    if (!blockersAt(mid).length) low = mid
    else high = mid
  }
  return low
}

export function boundedTrafficStep(progress: number, length: number, speed: number, delta: number, targetFront: number) {
  return Math.min(Math.max(0, speed * delta), Math.max(0, targetFront - (progress + length / 2)))
}

export function vehicleSpawnClear(registry: VehicleRegistry, pose: VehiclePose, length: number, width: number, ignoreId?: string) {
  for (const [id, actor] of registry.current) {
    if (id !== ignoreId && actorActive(actor) && vehicleBodiesOverlap(pose, length, width, actorPose(actor), actor.length, actor.width, 1)) return false
  }
  return true
}
