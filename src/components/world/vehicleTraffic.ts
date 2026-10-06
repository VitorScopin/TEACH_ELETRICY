import type { MutableRefObject } from 'react'
import type { Group } from 'three'
import { ROUNDABOUT } from './cityLayout'

export type VehiclePose = { position: [number, number, number]; rotationY: number }
export type VehicleActor = {
  group: Group
  length: number
  width: number
  order: number
  priority?: number
}
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

function actorSpeed(actor: VehicleActor) {
  const value = actor.group.userData.trafficSpeed
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function otherHasPriority(self: VehicleActor, other: VehicleActor) {
  const selfPriority = self.priority ?? 1
  const otherPriority = other.priority ?? 1
  return otherPriority === selfPriority
    ? other.order < self.order
    : otherPriority < selfPriority
}

export function desiredFollowingGap(speed: number) {
  return 2.35 + Math.max(0, speed) * 0.55
}

function circulating(pose: VehiclePose) {
  const dx = pose.position[0] - ROUNDABOUT.center[0], dz = pose.position[2] - ROUNDABOUT.center[1]
  const radius = Math.hypot(dx, dz)
  return radius > ROUNDABOUT.islandRadius + 0.7 && radius < ROUNDABOUT.roadOuterRadius + 0.2 &&
    Math.abs((dx * Math.cos(pose.rotationY) - dz * Math.sin(pose.rotationY)) / radius) < 0.65
}

export function trafficSpeedLimit(registry: VehicleRegistry, id: string, poseAtDistance: (distance: number) => VehiclePose, desiredSpeed: number) {
  const self = registry.current.get(id)
  if (!self) return desiredSpeed
  const now = poseAtDistance(0)
  let limit = desiredSpeed
  for (const [otherId, other] of registry.current) {
    if (otherId === id || !actorActive(other)) continue
    const pose = actorPose(other)
    const dx = pose.position[0] - now.position[0]
    const dz = pose.position[2] - now.position[2]
    if (Math.hypot(dx, dz) > 16) continue

    const forwardX = Math.cos(now.rotationY)
    const forwardZ = -Math.sin(now.rotationY)
    const forward = dx * forwardX + dz * forwardZ
    const lateral = Math.abs(dx * (-forwardZ) + dz * forwardX)
    const headingAlignment = Math.cos(now.rotationY - pose.rotationY)
    const following = forward > 0 && lateral < 2.35 && headingAlignment > 0.62

    if (following) {
      const bumperGap = forward - (self.length + other.length) / 2
      const wantedGap = desiredFollowingGap(actorSpeed(self) || desiredSpeed)
      if (bumperGap <= 0.4) {
        limit = 0
      } else if (bumperGap < wantedGap + 3) {
        const leaderSpeed = actorSpeed(other)
        const correction = Math.max(-leaderSpeed, Math.min(1.8, (bumperGap - wantedGap) * 0.9))
        limit = Math.min(limit, Math.max(0, leaderSpeed + correction))
      }
    }

    const selfCircle = circulating(now), otherCircle = circulating(pose)
    const yieldToOther = following || (otherCircle && !selfCircle) ||
      (selfCircle && otherCircle && forward > 0) ||
      (!selfCircle && !otherCircle && otherHasPriority(self, other))
    if (!yieldToOther) continue
    for (const distance of [1.5, 3, 6]) {
      if (vehicleBodiesOverlap(poseAtDistance(distance), self.length, self.width, pose, other.length, other.width, 0.6)) {
        limit = Math.min(limit, Math.sqrt(2 * 4 * Math.max(0, distance - 1.3)))
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
