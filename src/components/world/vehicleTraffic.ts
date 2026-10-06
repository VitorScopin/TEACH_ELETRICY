import type { MutableRefObject } from 'react'
import type { Group } from 'three'
import { ROUNDABOUT } from './cityLayout'

export type VehiclePose = { position: [number, number, number]; rotationY: number }
export type VehicleActor = { group: Group; length: number; width: number; order: number }
export type VehicleRegistry = MutableRefObject<Map<string, VehicleActor>>

export function vehicleBodiesOverlap(a: VehiclePose, length: number, width: number, b: VehiclePose, otherLength: number, otherWidth: number, margin = 0.25) {
  const ax = Math.cos(a.rotationY), az = -Math.sin(a.rotationY)
  const bx = Math.cos(b.rotationY), bz = -Math.sin(b.rotationY)
  const dx = b.position[0] - a.position[0], dz = b.position[2] - a.position[2]
  if (Math.hypot(dx, dz) > (length + otherLength) / 2 + width + otherWidth) return false
  for (const [x, z] of [[ax, az], [-az, ax], [bx, bz], [-bz, bx]]) {
    const radiusA = length / 2 * Math.abs(x * ax + z * az) + width / 2 * Math.abs(-x * az + z * ax)
    const radiusB = otherLength / 2 * Math.abs(x * bx + z * bz) + otherWidth / 2 * Math.abs(-x * bz + z * bx)
    if (Math.abs(dx * x + dz * z) >= radiusA + radiusB + margin) return false
  }
  return true
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
    radialDot,
    tangentialDot,
    circulating:
      radius > ROUNDABOUT.islandRadius + 0.7 &&
      radius < ROUNDABOUT.roadOuterRadius + 0.45 &&
      tangentialDot > 0.58,
    approaching:
      radius >= ROUNDABOUT.roadOuterRadius - 0.2 &&
      radius < ROUNDABOUT.roadOuterRadius + 13 &&
      radialDot < -0.18,
    clearance: Math.max(0, radius - ROUNDABOUT.roadOuterRadius - 1.15),
  }
}

function roundaboutYieldSpeed(clearance: number) {
  if (clearance <= 0.15) return 0
  // Comfortable deceleration before the give-way line instead of a last-moment stop.
  return Math.sqrt(2 * 3.2 * Math.max(0, clearance))
}

export function trafficSpeedLimit(registry: VehicleRegistry, id: string, poseAtDistance: (distance: number) => VehiclePose, desiredSpeed: number) {
  const self = registry.current.get(id)
  if (!self) return desiredSpeed

  const now = poseAtDistance(0)
  const selfRoundabout = roundaboutState(now)
  let limit = desiredSpeed

  // Urban speed profile: approach calmly and circulate at a stable speed.
  if (selfRoundabout.circulating) {
    limit = Math.min(limit, 3.8)
  } else if (selfRoundabout.approaching) {
    const approachCap = 2.6 + Math.min(1.8, selfRoundabout.clearance * 0.22)
    limit = Math.min(limit, approachCap)
  }

  for (const [otherId, other] of registry.current) {
    if (otherId === id || !actorActive(other)) continue

    const pose = actorPose(other)
    const dx = pose.position[0] - now.position[0]
    const dz = pose.position[2] - now.position[2]
    const separation = Math.hypot(dx, dz)
    const otherRoundabout = roundaboutState(pose)

    // Give way BEFORE entering the circle. The old logic only reacted when
    // footprints were nearly intersecting, which caused abrupt stops/collisions.
    if (selfRoundabout.approaching) {
      if (otherRoundabout.circulating) {
        limit = Math.min(limit, roundaboutYieldSpeed(selfRoundabout.clearance))
      } else if (
        otherRoundabout.approaching &&
        other.order < self.order &&
        separation < 22
      ) {
        limit = Math.min(limit, roundaboutYieldSpeed(selfRoundabout.clearance))
      }
    }

    if (separation > 22) continue

    const forward =
      dx * Math.cos(now.rotationY) -
      dz * Math.sin(now.rotationY)
    const following =
      forward > 0 &&
      Math.cos(now.rotationY - pose.rotationY) > 0.35

    const yieldToOther =
      following ||
      (otherRoundabout.circulating && !selfRoundabout.circulating) ||
      (selfRoundabout.circulating && otherRoundabout.circulating && forward > 0) ||
      (
        !selfRoundabout.circulating &&
        !otherRoundabout.circulating &&
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
  const clear = (distance: number) => {
    const pose = poseAtDistance(distance)
    for (const [otherId, other] of registry.current) {
      if (otherId !== id && actorActive(other) && vehicleBodiesOverlap(pose, self.length, self.width, actorPose(other), other.length, other.width)) return false
    }
    return true
  }
  if (clear(requested)) return requested
  if (!clear(0)) return 0
  let low = 0, high = requested
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2
    if (clear(mid)) low = mid
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
