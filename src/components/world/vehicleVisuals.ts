import * as THREE from 'three'
import { CITY_LIMITS } from './cityLayout'

// Models load asynchronously, so rebuild the cache when their hierarchy changes.
export function updateVehicleVisuals(group: THREE.Group, signedSpeed: number, delta: number, braking: boolean) {
  let count = 0
  group.traverse(() => count++)
  if (group.userData.visualCount !== count) {
    const wheels: THREE.Object3D[] = [], lamps: THREE.Mesh[] = []
    const materials = new Set<THREE.Material>()
    group.traverse(child => {
      if (child.userData.wheelRoot) wheels.push(child)
      if (child instanceof THREE.Mesh) {
        if (child.userData.brakeLamp) lamps.push(child)
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          if (!material.userData.trafficBase) material.userData.trafficBase = { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite }
          materials.add(material)
        }
      }
    })
    group.userData.visualCount = count
    group.userData.vehicleVisuals = { wheels, lamps, materials }
  }
  const cache = group.userData.vehicleVisuals as { wheels: THREE.Object3D[]; lamps: THREE.Mesh[]; materials: Set<THREE.Material> }
  const opacity = THREE.MathUtils.clamp(Math.min(CITY_LIMITS.width / 2 - Math.abs(group.position.x), CITY_LIMITS.depth / 2 - Math.abs(group.position.z)) / 4, 0, 1)
  group.visible = opacity > 0
  for (const material of cache.materials) {
    const base = material.userData.trafficBase
    const transparent = base.transparent || opacity < 1
    if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true }
    material.opacity = base.opacity * opacity
    material.depthWrite = base.depthWrite && opacity === 1
  }
  for (const wheel of cache.wheels) wheel.rotateX(signedSpeed * delta / 0.34)
  for (const lamp of cache.lamps) {
    if (lamp.material instanceof THREE.MeshBasicMaterial) lamp.material.color.set(braking ? '#ff2b30' : '#5a1114')
  }
}
