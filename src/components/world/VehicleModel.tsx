import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

export type VehicleVariant = 'concept' | 'ferrari' | 'lc80' | 'sport'

export const VEHICLE_MODELS: Record<
  VehicleVariant,
  { url: string; length: number; paintable: boolean; forwardYaw?: number }
> = {
  concept: {
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb',
    length: 4.55,
    paintable: true,
  },
  ferrari: {
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari.glb',
    length: 4.53,
    paintable: true,
    forwardYaw: -Math.PI / 2,
  },
  lc80: {
    url: './models/vehicles/lc80.glb',
    length: 4.82,
    paintable: false,
    forwardYaw: -Math.PI / 2,
  },
  sport: {
    url: './models/vehicles/red-car.glb',
    length: 4.38,
    paintable: false,
    forwardYaw: -Math.PI / 2,
  },
}

export const VEHICLE_VARIANTS: VehicleVariant[] = ['concept', 'ferrari', 'lc80', 'sport']

function isWheelRoot(object: THREE.Object3D) {
  if (/^Wheel(?:Front|Rear)[LR]$/i.test(object.name)) return true
  if (/^wheel_(?:fl|fr|rl|rr)$/i.test(object.name)) return true
  if (/^(?:L|R)[FB]_WHEEL$/i.test(object.name)) return true

  const wheelName = /wheel|tire|tyre/i
  return !(object instanceof THREE.Mesh) && wheelName.test(object.name) && !wheelName.test(object.parent?.name ?? '')
}

export function RealisticCarModel({
  variant,
  color,
}: {
  variant: VehicleVariant
  color: string
}) {
  const definition = VEHICLE_MODELS[variant]
  const { scene } = useGLTF(definition.url)

  const normalized = useMemo(() => {
    const model = scene.clone(true)

    model.traverse((child) => {
      const wheelRoot = isWheelRoot(child)
      if (wheelRoot) child.userData.wheelRoot = true

      if (child !== model && !wheelRoot) {
        child.updateMatrix()
        child.matrixAutoUpdate = false
      }

      if (!(child instanceof THREE.Mesh)) return

      child.castShadow = false
      child.receiveShadow = false

      const originalMaterials = Array.isArray(child.material) ? child.material : [child.material]
      const clonedMaterials = originalMaterials.map((material) => {
        const clone = material.clone()

        if (clone instanceof THREE.MeshStandardMaterial) {
          const materialName = clone.name ?? ''
          const meshName = child.name ?? ''
          const isPaint =
            definition.paintable &&
            (/^Paint\s/i.test(materialName) ||
              /^body$/i.test(meshName) ||
              /body.?paint|car.?paint/i.test(materialName))

          if (isPaint) {
            clone.color = new THREE.Color(color)
            clone.metalness = Math.max(clone.metalness, 0.4)
            clone.roughness = Math.max(0.24, Math.min(clone.roughness, 0.34))

            if (clone instanceof THREE.MeshPhysicalMaterial) {
              clone.clearcoat = Math.min(0.68, Math.max(clone.clearcoat, 0.55))
              clone.clearcoatRoughness = Math.max(0.2, clone.clearcoatRoughness)
            }
          }

          if (/headlight/i.test(materialName) || /headlight/i.test(meshName)) {
            clone.emissiveIntensity = Math.min(1.2, Math.max(clone.emissiveIntensity, 0.7))
          }
        }

        return clone
      })

      child.material = Array.isArray(child.material)
        ? clonedMaterials
        : (clonedMaterials[0] ?? child.material)
    })

    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const rawLength = Math.max(size.x, size.z, 0.001)
    const scale = definition.length / rawLength
    const rotationY = definition.forwardYaw ?? (size.z > size.x ? Math.PI / 2 : 0)

    return {
      model,
      scale,
      rotationY,
      offset: new THREE.Vector3(-center.x, -bounds.min.y, -center.z),
    }
  }, [scene, definition, color])

  return (
    <group>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[definition.length * 0.9, 1.72]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.2} depthWrite={false} />
      </mesh>

      <group rotation={[0, normalized.rotationY, 0]} scale={normalized.scale}>
        <primitive object={normalized.model} position={normalized.offset} />
      </group>

      <mesh userData={{ brakeLamp: true }} position={[-definition.length / 2 + 0.12, 0.55, 0.54]}>
        <boxGeometry args={[0.05, 0.08, 0.22]} />
        <meshBasicMaterial color="#5a1114" toneMapped={false} />
      </mesh>
      <mesh userData={{ brakeLamp: true }} position={[-definition.length / 2 + 0.12, 0.55, -0.54]}>
        <boxGeometry args={[0.05, 0.08, 0.22]} />
        <meshBasicMaterial color="#5a1114" toneMapped={false} />
      </mesh>
    </group>
  )
}

for (const definition of Object.values(VEHICLE_MODELS)) {
  useGLTF.preload(definition.url)
}
