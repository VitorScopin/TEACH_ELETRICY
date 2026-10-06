import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import type { Group } from 'three'
import { ROUNDABOUT } from './cityLayout'

export type VehiclePose = { position: [number, number, number]; rotationY: number }
export type VehicleActor = {
  group: Group
  length: number
  width: number
  order: number
  priority?: number
  trafficClass?: 'plc' | 'city' | 'parking'
}
export type VehicleRegistry = MutableRefObject<Map<string, VehicleActor>>

const FOLLOWING_MIN_GAP = 2.4
const FOLLOWING_TIME_HEADWAY = 0.72
const FOLLOWING_LOOKAHEAD = 18

function actorSpeed(actor: VehicleActor) {
  const speed = actor.group.userData.trafficSpeed
  return typeof speed === 'number' && Number.isFinite(speed) ? Math.max(0, speed) : 0
}

function actorPriority(actor: VehicleActor) {
  // Lower number = stronger road priority.
  // Main PLC avenue > ordinary city roads > supermarket/parking access.
  return actor.priority ?? (
    actor.trafficClass === 'plc'
      ? 0
      : actor.trafficClass === 'city'
        ? 1
        : actor.trafficClass === 'parking'
          ? 2
          : 1
  )
}

function otherHasPriority(self: VehicleActor, other: VehicleActor) {
  const selfPriority = actorPriority(self)
  const otherPriority = actorPriority(other)
  if (otherPriority !== selfPriority) return otherPriority < selfPriority
  return other.order < self.order
}

export function desiredFollowingGap(speed: number) {
  return FOLLOWING_MIN_GAP + Math.max(0, speed) * FOLLOWING_TIME_HEADWAY
}

function followingSpeedLimit(
  self: VehicleActor,
  other: VehicleActor,
  forwardDistance: number,
  desiredSpeed: number,
) {
  const bumperGap =
    forwardDistance - (self.length + other.length) / 2

  if (bumperGap <= 0.35) return 0

  const selfSpeed = actorSpeed(self)
  const leaderSpeed = actorSpeed(other)
  const wantedGap = desiredFollowingGap(
    selfSpeed > 0.1 ? selfSpeed : desiredSpeed,
  )

  // Far enough away: no car-following restriction.
  if (bumperGap >= wantedGap + 2.2) return desiredSpeed

  // Match the leader before entering the comfort gap. The extra term allows
  // a gentle catch-up when the gap is healthy, while reducing speed early as
  // the follower approaches the desired headway.
  const gapError = bumperGap - wantedGap
  const catchUpAllowance = THREE.MathUtils.clamp(gapError * 0.85, -3.4, 2.0)
  const matchedSpeed = Math.max(0, leaderSpeed + catchUpAllowance)

  if (bumperGap < FOLLOWING_MIN_GAP) {
    const emergencyScale = THREE.MathUtils.clamp(
      (bumperGap - 0.35) / (FOLLOWING_MIN_GAP - 0.35),
      0,
      1,
    )
    return Math.min(matchedSpeed, desiredSpeed * emergencyScale)
  }

  return Math.min(desiredSpeed, matchedSpeed)
}

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

function predictedActorPose(actor: VehicleActor, seconds: number): VehiclePose {
  const pose = actorPose(actor)
  const speed = actorSpeed(actor)
  return {
    position: [
      pose.position[0] + Math.cos(pose.rotationY) * speed * seconds,
      pose.position[1],
      pose.position[2] - Math.sin(pose.rotationY) * speed * seconds,
    ],
    rotationY: pose.rotationY,
  }
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
        otherHasPriority(self, other) &&
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
      otherHasPriority(self, other) &&
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
    const headingAlignment = Math.cos(now.rotationY - pose.rotationY)
    const following =
      forward > 0 &&
      forward < FOLLOWING_LOOKAHEAD &&
      lateral < 2.45 &&
      headingAlignment > 0.58

    if (following) {
      limit = Math.min(
        limit,
        followingSpeedLimit(self, other, forward, desiredSpeed),
      )
    }

    // Predict crossing/turn conflicts before bodies touch. Only the vehicle
    // without right of way brakes here, avoiding the "both hit and freeze"
    // case at bends and supermarket junctions.
    if (
      !following &&
      otherHasPriority(self, other) &&
      !selfRoundabout.committed &&
      !otherRoundabout.committed &&
      separation < 20
    ) {
      const referenceSpeed = Math.max(1.2, actorSpeed(self), desiredSpeed * 0.65)
      for (const distance of [2, 3.5, 5, 7, 9]) {
        const seconds = distance / referenceSpeed
        if (
          vehicleBodiesOverlap(
            poseAtDistance(distance),
            self.length,
            self.width,
            predictedActorPose(other, seconds),
            other.length,
            other.width,
            0.8,
          )
        ) {
          limit = Math.min(
            limit,
            Math.sqrt(2 * 3.0 * Math.max(0, distance - 1.9)),
          )
          break
        }
      }
    }

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
        otherHasPriority(self, other)
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

  const blockersAt = (distance: number, margin = 0.5) => {
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
        margin,
      )
      if (depth > 0) blockers.push({ actor: other, depth })
    }

    return blockers
  }

  const requestedBlockers = blockersAt(requested)
  if (!requestedBlockers.length) {
    self.group.userData.trafficBlockedFrames = 0
    return requested
  }

  const currentEnvelopeBlockers = blockersAt(0)
  const currentPhysicalBlockers = blockersAt(0, 0.05)

  if (currentEnvelopeBlockers.length) {
    const blockedFrames =
      (self.group.userData.trafficBlockedFrames as number | undefined ?? 0) + 1
    self.group.userData.trafficBlockedFrames = blockedFrames

    // If the bodies have actually touched, choose exactly one vehicle to clear
    // the contact. Normally it may move only when penetration decreases.
    // After a short persistent jam, allow a tiny priority creep as long as it
    // does not create a new conflict or materially worsen the existing one.
    if (currentPhysicalBlockers.length) {
      const ownsPriority = currentPhysicalBlockers.every(
        ({ actor }) => !otherHasPriority(self, actor),
      )
      if (ownsPriority) {
        const recoveryStep = Math.min(requested, blockedFrames > 18 ? 0.11 : 0.06)
        const recoveryPhysical = blockersAt(recoveryStep, 0.05)
        const currentActors = new Set(currentPhysicalBlockers.map(({ actor }) => actor))
        const introducesNewConflict = recoveryPhysical.some(
          ({ actor }) => !currentActors.has(actor),
        )
        const improves = currentPhysicalBlockers.every(({ actor, depth }) => {
          const next = recoveryPhysical.find((item) => item.actor === actor)
          if (!next) return true
          return blockedFrames > 18
            ? next.depth <= depth + 0.025
            : next.depth < depth - 0.001
        })

        if (!introducesNewConflict && improves) return recoveryStep
      }
      return 0
    }

    // Inside the safety envelope but not physically touching: stay stopped.
    return 0
  }

  self.group.userData.trafficBlockedFrames = 0
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
