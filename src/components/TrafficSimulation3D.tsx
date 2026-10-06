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

type FlowId = 'eastbound' | 'westbound' | 'northbound' | 'southbound'

type VehicleVariant = 'concept' | 'ferrari' | 'lc80' | 'sport'

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

const VEHICLE_MODELS: Record<
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

const VEHICLE_VARIANTS: VehicleVariant[] = ['concept', 'ferrari', 'lc80', 'sport']

function isWheelRoot(object: THREE.Object3D) {
  if (/^Wheel(?:Front|Rear)[LR]$/i.test(object.name)) return true
  if (/^wheel_(?:fl|fr|rl|rr)$/i.test(object.name)) return true
  if (/^(?:L|R)[FB]_WHEEL$/i.test(object.name)) return true

  const wheelName = /wheel|tire|tyre/i
  return !(object instanceof THREE.Mesh) && wheelName.test(object.name) && !wheelName.test(object.parent?.name ?? '')
}

function RealisticCarModel({
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
    const rotationY =
      definition.forwardYaw ?? (size.z > size.x ? Math.PI / 2 : 0)

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

type BuildingVariant = 'small' | 'medium' | 'large'

const BUILDING_MODELS: Record<BuildingVariant, string> = {
  small: 'https://raw.githubusercontent.com/anshaneja5/skyline-run/main/public/assets/models/b_small.glb',
  medium: 'https://raw.githubusercontent.com/anshaneja5/skyline-run/main/public/assets/models/b_medium.glb',
  large: 'https://raw.githubusercontent.com/anshaneja5/skyline-run/main/public/assets/models/b_large.glb',
}

for (const url of Object.values(BUILDING_MODELS)) useGLTF.preload(url)

function GlbBuilding({
  variant,
  position,
  rotationY = 0,
  scale = 1,
}: {
  variant: BuildingVariant
  position: [number, number, number]
  rotationY?: number
  scale?: number
}) {
  const { scene } = useGLTF(BUILDING_MODELS[variant])

  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = false
        child.receiveShadow = false
      }
      child.updateMatrix()
      if (child !== clone) child.matrixAutoUpdate = false
    })

    const bounds = new THREE.Box3().setFromObject(clone)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const targetWidth = variant === 'small' ? 7 : variant === 'medium' ? 9 : 12
    const normalizeScale = targetWidth / Math.max(size.x, size.z, 0.001)

    return {
      clone,
      normalizeScale,
      offset: new THREE.Vector3(-center.x, -bounds.min.y, -center.z),
    }
  }, [scene, variant])

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale * model.normalizeScale}>
      <primitive object={model.clone} position={model.offset} />
    </group>
  )
}

type CityBuilding = {
  variant: BuildingVariant
  position: [number, number, number]
  rotationY?: number
  scale?: number
}

const CITY_FRAME_BUILDINGS: CityBuilding[] = [
  { variant: 'medium', position: [-31.0, 0.18, 17.5], rotationY: Math.PI, scale: 0.82 },
  { variant: 'small', position: [-22.5, 0.18, 17.4], rotationY: Math.PI, scale: 0.84 },
  { variant: 'medium', position: [-13.8, 0.18, 17.2], rotationY: Math.PI, scale: 0.80 },


  { variant: 'medium', position: [-31.0, 0.18, -35.8], rotationY: Math.PI, scale: 0.84 },
  { variant: 'large', position: [-19.5, 0.18, -36.2], rotationY: Math.PI, scale: 0.88 },
  { variant: 'small', position: [-8.8, 0.18, -35.6], rotationY: Math.PI, scale: 0.86 },
  { variant: 'small', position: [10.0, 0.18, -35.8], rotationY: Math.PI, scale: 0.86 },
  { variant: 'medium', position: [20.0, 0.18, -36.0], rotationY: Math.PI, scale: 0.84 },
  { variant: 'large', position: [31.0, 0.18, -36.2], rotationY: Math.PI, scale: 0.88 },

  { variant: 'small', position: [-42.0, 0.18, -14.0], rotationY: Math.PI / 2, scale: 0.82 },
  { variant: 'medium', position: [-42.0, 0.18, 6.0], rotationY: Math.PI / 2, scale: 0.82 },
  { variant: 'small', position: [42.0, 0.18, -4.0], rotationY: -Math.PI / 2, scale: 0.84 },
  { variant: 'medium', position: [42.0, 0.18, 14.0], rotationY: -Math.PI / 2, scale: 0.82 },
]

function CityBlockPad({
  position,
  size,
  tone = '#62686a',
}: {
  position: [number, number, number]
  size: [number, number]
  tone?: string
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[size[0], 0.16, size[1]]} />
        <meshStandardMaterial color={tone} roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.165, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size[0] - 0.5, size[1] - 0.5]} />
        <meshBasicMaterial color="#858b8b" transparent opacity={0.14} />
      </mesh>
    </group>
  )
}

function useSignTexture(text: string, accent: string, width = 768, height = 180) {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#15222a'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = accent
    ctx.fillRect(0, height - 18, width, 18)
    ctx.font = '700 72px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, width / 2, height / 2 - 4)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }, [text, accent, width, height])
}

function SupermarketBuilding() {
  const sign = useSignTexture('SUPERMERCADO', '#ef3d36')

  return (
    <group position={[-21.5, 0.18, -18.2]}>
      <mesh position={[0, 2.25, 0]}>
        <boxGeometry args={[18.5, 4.5, 6.2]} />
        <meshStandardMaterial color="#d8d8d3" roughness={0.72} />
      </mesh>

      <mesh position={[0, 2.55, 3.13]}>
        <planeGeometry args={[12.8, 3.0]} />
        <meshStandardMaterial color="#8ec6d3" emissive="#2e6571" emissiveIntensity={0.28} roughness={0.22} metalness={0.08} />
      </mesh>

      <mesh position={[0, 4.25, 3.18]}>
        <planeGeometry args={[14.5, 2.2]} />
        <meshBasicMaterial map={sign ?? undefined} color={sign ? '#ffffff' : '#ef3d36'} toneMapped={false} />
      </mesh>

      <mesh position={[0, 4.62, 0]}>
        <boxGeometry args={[19.2, 0.3, 6.8]} />
        <meshStandardMaterial color="#30383d" roughness={0.82} />
      </mesh>

      {[-6.8, -2.2, 2.2, 6.8].map((x) => (
        <mesh key={x} position={[x, 4.95, -1.1]}>
          <boxGeometry args={[1.4, 0.42, 1.5]} />
          <meshStandardMaterial color="#555d61" roughness={0.8} />
        </mesh>
      ))}

      <mesh position={[-4.4, 1.35, 3.2]}>
        <boxGeometry args={[2.7, 2.25, 0.18]} />
        <meshStandardMaterial color="#bfe6f1" emissive="#58a7bd" emissiveIntensity={0.45} roughness={0.18} />
      </mesh>
      <mesh position={[0, 1.35, 3.2]}>
        <boxGeometry args={[2.7, 2.25, 0.18]} />
        <meshStandardMaterial color="#bfe6f1" emissive="#58a7bd" emissiveIntensity={0.45} roughness={0.18} />
      </mesh>
      <mesh position={[4.4, 1.35, 3.2]}>
        <boxGeometry args={[2.7, 2.25, 0.18]} />
        <meshStandardMaterial color="#bfe6f1" emissive="#58a7bd" emissiveIntensity={0.45} roughness={0.18} />
      </mesh>
    </group>
  )
}

const SUPERMARKET_PARKING_SPOTS: Array<{
  position: [number, number, number]
  rotationY: number
}> = [
  { position: [-28.0, 0.23, -10.6], rotationY: Math.PI / 2 },
  { position: [-24.8, 0.23, -10.6], rotationY: Math.PI / 2 },
  { position: [-21.6, 0.23, -10.6], rotationY: Math.PI / 2 },
  { position: [-18.4, 0.23, -10.6], rotationY: Math.PI / 2 },
  { position: [-15.2, 0.23, -10.6], rotationY: Math.PI / 2 },
  { position: [-28.0, 0.23, -13.6], rotationY: -Math.PI / 2 },
  { position: [-24.8, 0.23, -13.6], rotationY: -Math.PI / 2 },
  { position: [-21.6, 0.23, -13.6], rotationY: -Math.PI / 2 },
  { position: [-18.4, 0.23, -13.6], rotationY: -Math.PI / 2 },
  { position: [-15.2, 0.23, -13.6], rotationY: -Math.PI / 2 },
]

function ParkingSpace({
  position,
  rotationY,
  accessible = false,
}: {
  position: [number, number, number]
  rotationY: number
  accessible?: boolean
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.65, 5.0]} />
        <meshBasicMaterial color={accessible ? '#255e84' : '#32383b'} toneMapped={false} />
      </mesh>
      {[-1.28, 1.28].map((x) => (
        <mesh key={x} position={[x, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.06, 5.0]} />
          <meshBasicMaterial color="#e7e2c7" toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.014, -2.46]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 0.06]} />
        <meshBasicMaterial color="#e7e2c7" toneMapped={false} />
      </mesh>
    </group>
  )
}

function SupermarketParking() {
  return (
    <group>
      <mesh position={[-21.6, 0.175, -11.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[19.5, 8.2]} />
        <meshStandardMaterial color="#31383b" roughness={0.9} />
      </mesh>

      {SUPERMARKET_PARKING_SPOTS.map((spot, index) => (
        <ParkingSpace key={index} {...spot} accessible={index === 0} />
      ))}

      <mesh position={[-31.4, 0.18, -8.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2, 4.0]} />
        <meshStandardMaterial color="#31383b" roughness={0.9} />
      </mesh>

      <mesh position={[-31.4, 0.19, -6.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2, 1.4]} />
        <meshStandardMaterial color="#31383b" roughness={0.9} />
      </mesh>

      {[-29.6, -13.6].map((x) => (
        <group key={x} position={[x, 0.2, -8.0]}>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.55, 0.48, 5.8]} />
            <meshStandardMaterial color="#334d3c" roughness={1} />
          </mesh>
          <Tree position={[0, 0.25, -1.55]} scale={0.48} />
          <Tree position={[0, 0.25, 1.55]} scale={0.48} />
        </group>
      ))}

      <group position={[-21.5, 0.2, -8.35]}>
        <mesh position={[0, 1.4, 0]}>
          <boxGeometry args={[5.4, 0.12, 2.0]} />
          <meshStandardMaterial color="#667379" metalness={0.55} roughness={0.38} />
        </mesh>
        {[-2.3, 2.3].map((x) => (
          <mesh key={x} position={[x, 0.72, 0]}>
            <cylinderGeometry args={[0.06, 0.07, 1.45, 8]} />
            <meshStandardMaterial color="#4e5a60" metalness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function RoundaboutDistrict() {
  const centerX = 21.5
  const centerZ = -14.5
  const radius = 5.8

  return (
    <group>
      <mesh position={[11.2, 0.055, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9.4, 6.8]} />
        <meshStandardMaterial color="#242b2e" roughness={0.88} />
      </mesh>
      <mesh position={[centerX, 0.052, -23.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.8, 9.5]} />
        <meshStandardMaterial color="#242b2e" roughness={0.88} />
      </mesh>
      <mesh position={[30.6, 0.052, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.6, 6.8]} />
        <meshStandardMaterial color="#242b2e" roughness={0.88} />
      </mesh>

      <mesh position={[centerX, 0.055, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.05, radius + 1.8, 48]} />
        <meshStandardMaterial color="#242b2e" roughness={0.88} />
      </mesh>

      <mesh position={[centerX, 0.20, centerZ]}>
        <cylinderGeometry args={[3.8, 3.95, 0.38, 36]} />
        <meshStandardMaterial color="#2d4935" roughness={1} />
      </mesh>
      <mesh position={[centerX, 0.42, centerZ]}>
        <cylinderGeometry args={[3.15, 3.4, 0.2, 32]} />
        <meshStandardMaterial color="#355b3f" roughness={1} />
      </mesh>

      <Tree position={[centerX, 0.42, centerZ]} scale={1.1} />
      <Tree position={[centerX - 1.8, 0.42, centerZ + 0.8]} scale={0.55} />
      <Tree position={[centerX + 1.8, 0.42, centerZ - 0.8]} scale={0.55} />

      {Array.from({ length: 16 }).map((_, index) => {
        const angle = (index / 16) * Math.PI * 2
        return (
          <mesh
            key={index}
            position={[
              centerX + Math.cos(angle) * (radius + 0.6),
              0.09,
              centerZ + Math.sin(angle) * (radius + 0.6),
            ]}
            rotation={[-Math.PI / 2, 0, -angle]}
          >
            <planeGeometry args={[1.1, 0.08]} />
            <meshBasicMaterial color="#eeeeea" toneMapped={false} />
          </mesh>
        )
      })}
    </group>
  )
}

function ShopBuilding({
  x,
  label,
  accent,
  facade,
}: {
  x: number
  label: string
  accent: string
  facade: string
}) {
  const sign = useSignTexture(label, accent, 512, 150)

  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 1.85, 0]}>
        <boxGeometry args={[5.8, 3.7, 5.0]} />
        <meshStandardMaterial color={facade} roughness={0.76} />
      </mesh>
      <mesh position={[0, 1.45, -2.53]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[4.6, 2.2]} />
        <meshStandardMaterial color="#a9d9e7" emissive="#4b8898" emissiveIntensity={0.35} roughness={0.2} />
      </mesh>
      <mesh position={[0, 3.3, -2.58]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[4.8, 1.25]} />
        <meshBasicMaterial map={sign ?? undefined} color={sign ? '#ffffff' : accent} toneMapped={false} />
      </mesh>
    </group>
  )
}

function CommercialStrip() {
  const shops = [
    { x: 12.2, label: 'FARMACIA', accent: '#39b66f', facade: '#d8ded7' },
    { x: 19.0, label: 'CAFE', accent: '#d58a3a', facade: '#d7cec0' },
    { x: 25.8, label: 'PADARIA', accent: '#e3563e', facade: '#d7c7b5' },
  ]

  return (
    <group position={[0, 0, 17.2]}>
      {shops.map((shop) => (
        <ShopBuilding key={shop.label} {...shop} />
      ))}
    </group>
  )
}

function GasStation() {
  return (
    <group position={[33.0, 0.18, 8.8]}>
      <mesh position={[0, 3.2, 0]}>
        <boxGeometry args={[10.5, 0.45, 7.0]} />
        <meshStandardMaterial color="#f3f0dd" roughness={0.55} />
      </mesh>
      <mesh position={[0, 3.48, 0]}>
        <boxGeometry args={[10.8, 0.12, 7.3]} />
        <meshBasicMaterial color="#e44a3e" toneMapped={false} />
      </mesh>
      {[[-4.2, -2.7], [4.2, -2.7], [-4.2, 2.7], [4.2, 2.7]].map(([x, z], index) => (
        <mesh key={index} position={[x, 1.65, z]}>
          <cylinderGeometry args={[0.09, 0.11, 3.3, 8]} />
          <meshStandardMaterial color="#e9ece7" metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
      {[-2.4, 2.4].map((x) => (
        <group key={x} position={[x, 0.55, 0]}>
          <mesh>
            <boxGeometry args={[0.75, 1.1, 0.65]} />
            <meshStandardMaterial color="#d9dde0" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.15, -0.34]}>
            <planeGeometry args={[0.45, 0.45]} />
            <meshBasicMaterial color="#1d6777" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function CityBlocks({ quality }: { quality: 'medium' | 'high' }) {
  const buildings =
    quality === 'high'
      ? CITY_FRAME_BUILDINGS
      : CITY_FRAME_BUILDINGS.filter((_, index) => ![6, 7, 8, 9, 10, 11].includes(index))

  return (
    <>
      <CityBlockPad position={[-21.5, 0, -15.0]} size={[25.0, 16.0]} tone="#6a7070" />
      <CityBlockPad position={[21.0, 0, -15.0]} size={[25.0, 16.0]} tone="#666c6c" />
      <CityBlockPad position={[-21.5, 0, 15.0]} size={[25.0, 16.0]} tone="#626868" />
      <CityBlockPad position={[21.0, 0, 15.0]} size={[25.0, 16.0]} tone="#656b6b" />

      <SupermarketBuilding />
      <SupermarketParking />
      <RoundaboutDistrict />
      <CommercialStrip />
      {quality === 'high' && <GasStation />}

      <Suspense fallback={null}>
        {buildings.map((building, index) => (
          <GlbBuilding key={index} {...building} />
        ))}
      </Suspense>
    </>
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
        <meshBasicMaterial color={color} toneMapped={false} />
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

function SidewalkCorner({
  x,
  z,
}: {
  x: number
  z: number
}) {
  const sx = (TRAFFIC_WORLD.roadLength - TRAFFIC_WORLD.roadWidth) / 2
  const sz = (TRAFFIC_WORLD.worldDepth - TRAFFIC_WORLD.roadWidth) / 2
  const centerX = x * (TRAFFIC_WORLD.roadWidth / 2 + sx / 2)
  const centerZ = z * (TRAFFIC_WORLD.roadWidth / 2 + sz / 2)

  return (
    <group>
      <mesh position={[centerX, TRAFFIC_WORLD.sidewalkHeight / 2, centerZ]}>
        <boxGeometry args={[sx, TRAFFIC_WORLD.sidewalkHeight, sz]} />
        <meshStandardMaterial color="#73797a" roughness={0.94} />
      </mesh>

      {/* curb edges along both road faces */}
      <mesh
       
        position={[
          x * (TRAFFIC_WORLD.roadWidth / 2 + TRAFFIC_WORLD.curbWidth / 2),
          TRAFFIC_WORLD.curbHeight / 2,
          centerZ,
        ]}
      >
        <boxGeometry args={[TRAFFIC_WORLD.curbWidth, TRAFFIC_WORLD.curbHeight, sz]} />
        <meshStandardMaterial color="#9ca0a0" roughness={0.9} />
      </mesh>
      <mesh
       
        position={[
          centerX,
          TRAFFIC_WORLD.curbHeight / 2,
          z * (TRAFFIC_WORLD.roadWidth / 2 + TRAFFIC_WORLD.curbWidth / 2),
        ]}
      >
        <boxGeometry args={[sx, TRAFFIC_WORLD.curbHeight, TRAFFIC_WORLD.curbWidth]} />
        <meshStandardMaterial color="#9ca0a0" roughness={0.9} />
      </mesh>

      {/* subtle tile joints */}
      {[-2.4, 0, 2.4].map((offset) => (
        <mesh
          key={`x-${offset}`}
          position={[centerX, TRAFFIC_WORLD.sidewalkHeight + 0.006, centerZ + offset]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[sx - 0.5, 0.025]} />
          <meshBasicMaterial color="#555c5d" transparent opacity={0.38} />
        </mesh>
      ))}
      {[-3.4, 0, 3.4].map((offset) => (
        <mesh
          key={`z-${offset}`}
          position={[centerX + offset, TRAFFIC_WORLD.sidewalkHeight + 0.006, centerZ]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        >
          <planeGeometry args={[sz - 0.5, 0.025]} />
          <meshBasicMaterial color="#555c5d" transparent opacity={0.38} />
        </mesh>
      ))}
    </group>
  )
}

function CornerCurb({
  x,
  z,
  rotationY,
}: {
  x: number
  z: number
  rotationY: number
}) {
  return (
    <mesh
      position={[
        x * (TRAFFIC_WORLD.roadWidth / 2 + 1.15),
        TRAFFIC_WORLD.curbHeight / 2,
        z * (TRAFFIC_WORLD.roadWidth / 2 + 1.15),
      ]}
      rotation={[Math.PI / 2, rotationY, 0]}
     
    >
      <torusGeometry args={[1.15, 0.14, 8, 24, Math.PI / 2]} />
      <meshStandardMaterial color="#a5a7a5" roughness={0.9} />
    </mesh>
  )
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.12, 0.17, 2, 7]} />
        <meshStandardMaterial color="#4c3322" roughness={1} />
      </mesh>
      <mesh position={[0, 2.35, 0]}>
        <sphereGeometry args={[1.0, 8, 6]} />
        <meshStandardMaterial color="#173e2b" roughness={0.95} />
      </mesh>
      <mesh position={[0.55, 2.3, 0.15]}>
        <sphereGeometry args={[0.65, 8, 6]} />
        <meshStandardMaterial color="#205038" roughness={0.95} />
      </mesh>
    </group>
  )
}

function Planter({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.24, 0]}>
        <boxGeometry args={[1.45, 0.48, 1.45]} />
        <meshStandardMaterial color="#4d5557" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.15, 0.14, 1.15]} />
        <meshStandardMaterial color="#243126" roughness={1} />
      </mesh>
      <mesh position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.62, 8, 6]} />
        <meshStandardMaterial color="#21492f" roughness={0.95} />
      </mesh>
    </group>
  )
}

function StreetLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.045, 0.065, 3.5, 7]} />
        <meshStandardMaterial color="#252d32" metalness={0.72} roughness={0.35} />
      </mesh>
      <mesh position={[0, 3.48, 0]}>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshStandardMaterial color="#fff1c2" emissive="#ffd78a" emissiveIntensity={2.8} />
      </mesh>
    </group>
  )
}

function UrbanProps({ dense = false }: { dense?: boolean }) {
  const trees: Array<[number, number, number]> = [
    [-14, 0.18, -10.8], [14.5, 0.18, -10.5], [-14.5, 0.18, 11.2], [14, 0.18, 11],
    [-28, 0.18, -17], [-20, 0.18, -18], [20, 0.18, -18], [29, 0.18, -17],
    [-29, 0.18, 17], [-20, 0.18, 18], [20, 0.18, 18], [29, 0.18, 17],
    [-38, 0.18, -17], [38, 0.18, 17], [-38, 0.18, 17], [38, 0.18, -17],
  ]
  const lamps: Array<[number, number, number]> = [
    [-12.4, 0.18, -8.8], [12.6, 0.18, -8.8], [-12.5, 0.18, 8.9], [12.5, 0.18, 8.9],
    [-24, 0.18, -8.8], [24, 0.18, -8.8], [-24, 0.18, 8.9], [24, 0.18, 8.9],
    [-36, 0.18, -8.8], [36, 0.18, -8.8], [-36, 0.18, 8.9], [36, 0.18, 8.9],
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
        <StreetLamp key={`lamp-${index}`} position={position} />
      ))}

      {dense && (
        <>
          <mesh position={[-31, 0.34, 14]}>
            <boxGeometry args={[8, 0.32, 3.2]} />
            <meshStandardMaterial color="#253c32" roughness={1} />
          </mesh>
          <mesh position={[31, 0.34, -14]}>
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
}: {
  quality: 'low' | 'medium' | 'high'
  rain: number
}) {
  const halfRoad = TRAFFIC_WORLD.roadWidth / 2
  const lane = TRAFFIC_WORLD.laneWidth
  const dashX = [-29, -25, -21, -17, -13, 13, 17, 21, 25, 29]
  const dashZ = [-20, -16, -12, 12, 16, 20]

  return (
    <>
      {/* World base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]}>
        <planeGeometry args={[94, 86]} />
        <meshStandardMaterial color="#10191e" roughness={0.99} />
      </mesh>

      {/* Secondary city streets make the district feel larger without affecting PLC traffic logic */}
      {[-27, 27].map((z) => (
        <mesh key={`outer-road-z-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, z]}>
          <planeGeometry args={[110, 7.5]} />
          <meshStandardMaterial color="#1d2428" roughness={0.92} />
        </mesh>
      ))}
      {[-39, 39].map((x) => (
        <mesh key={`outer-road-x-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, -0.012, 0]}>
          <planeGeometry args={[7.5, 86]} />
          <meshStandardMaterial color="#1d2428" roughness={0.92} />
        </mesh>
      ))}

      {/* Asphalt roads crossing at 90 degrees */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadLength, TRAFFIC_WORLD.roadWidth]} />
        <meshStandardMaterial color="#252b2e" roughness={0.86} metalness={0.035} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadWidth, TRAFFIC_WORLD.worldDepth]} />
        <meshStandardMaterial color="#252b2e" roughness={0.86} metalness={0.035} />
      </mesh>

      {rain > 0.02 && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]}>
            <planeGeometry args={[TRAFFIC_WORLD.roadLength, TRAFFIC_WORLD.roadWidth]} />
            <meshStandardMaterial
              color="#172027"
              transparent
              opacity={Math.min(0.42, rain * 0.38)}
              roughness={Math.max(0.18, 0.55 - rain * 0.35)}
              metalness={Math.min(0.32, rain * 0.28)}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
            <planeGeometry args={[TRAFFIC_WORLD.roadWidth, TRAFFIC_WORLD.worldDepth]} />
            <meshStandardMaterial
              color="#172027"
              transparent
              opacity={Math.min(0.42, rain * 0.38)}
              roughness={Math.max(0.18, 0.55 - rain * 0.35)}
              metalness={Math.min(0.32, rain * 0.28)}
            />
          </mesh>
        </>
      )}

      {/* Four independent sidewalk quadrants */}
      <SidewalkCorner x={-1} z={-1} />
      <SidewalkCorner x={1} z={-1} />
      <SidewalkCorner x={-1} z={1} />
      <SidewalkCorner x={1} z={1} />

      <CornerCurb x={-1} z={-1} rotationY={0} />
      <CornerCurb x={1} z={-1} rotationY={Math.PI / 2} />
      <CornerCurb x={1} z={1} rotationY={Math.PI} />
      <CornerCurb x={-1} z={1} rotationY={Math.PI * 1.5} />

      {/* Double yellow center lines, interrupted before the crosswalk/intersection zone */}
      {[-0.13, 0.13].map((z) => (
        <group key={`hy-${z}`}>
          <RoadMark position={[-21.5, 0.036, z]} size={[21, 0.09]} color="#e4bf3d" />
          <RoadMark position={[21.5, 0.036, z]} size={[21, 0.09]} color="#e4bf3d" />
        </group>
      ))}
      {[-0.13, 0.13].map((x) => (
        <group key={`vy-${x}`}>
          <RoadMark position={[x, 0.037, -16.5]} size={[19, 0.09]} color="#e4bf3d" rotationY={Math.PI / 2} />
          <RoadMark position={[x, 0.037, 16.5]} size={[19, 0.09]} color="#e4bf3d" rotationY={Math.PI / 2} />
        </group>
      ))}

      {/* Dashed white lane dividers */}
      {[-lane, lane].map((z) =>
        dashX.map((x) => (
          <RoadMark key={`hd-${z}-${x}`} position={[x, 0.038, z]} size={[1.9, 0.08]} />
        )),
      )}
      {[-lane, lane].map((x) =>
        dashZ.map((z) => (
          <RoadMark
            key={`vd-${x}-${z}`}
            position={[x, 0.039, z]}
            size={[1.9, 0.08]}
            rotationY={Math.PI / 2}
          />
        )),
      )}

      {/* Solid road edge lines, interrupted at the intersection entrances */}
      {[halfRoad - 0.14, -halfRoad + 0.14].map((z) => (
        <group key={`edge-h-${z}`}>
          <RoadMark position={[-21, 0.037, z]} size={[22, 0.1]} />
          <RoadMark position={[21, 0.037, z]} size={[22, 0.1]} />
        </group>
      ))}
      {[halfRoad - 0.14, -halfRoad + 0.14].map((x) => (
        <group key={`edge-v-${x}`}>
          <RoadMark position={[x, 0.038, -16.5]} size={[13, 0.1]} rotationY={Math.PI / 2} />
          <RoadMark position={[x, 0.038, 16.5]} size={[13, 0.1]} rotationY={Math.PI / 2} />
        </group>
      ))}

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

      {/* Clean center asphalt patch over line fragments */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadWidth, TRAFFIC_WORLD.roadWidth]} />
        <meshStandardMaterial color="#242a2d" roughness={0.88} metalness={0.02} />
      </mesh>

      {quality !== 'low' && <UrbanProps dense={quality === 'high'} />}
      {quality !== 'low' && <CityBlocks quality={quality} />}
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

const VERTICAL_SPAWN = -(TRAFFIC_WORLD.worldDepth / 2 - 1)
const VERTICAL_EXIT = TRAFFIC_WORLD.worldDepth / 2 - 1

const FLOW_DEFINITIONS: Record<FlowId, FlowDefinition> = {
  eastbound: {
    id: 'eastbound',
    spawn: TRAFFIC_WORLD.spawnX,
    exit: TRAFFIC_WORLD.exitX,
    stopProgress: TRAFFIC_GEOMETRY.westStopLineX,
    rotationY: 0,
    signalId: 'west',
    toWorld: (progress) => [progress, 0.02, TRAFFIC_WORLD.eastboundLaneZ],
  },
  westbound: {
    id: 'westbound',
    spawn: TRAFFIC_WORLD.spawnX,
    exit: TRAFFIC_WORLD.exitX,
    stopProgress: -TRAFFIC_GEOMETRY.eastStopLineX,
    rotationY: Math.PI,
    signalId: 'east',
    toWorld: (progress) => [-progress, 0.02, TRAFFIC_WORLD.westboundLaneZ],
  },
  northbound: {
    id: 'northbound',
    spawn: VERTICAL_SPAWN,
    exit: VERTICAL_EXIT,
    stopProgress: -TRAFFIC_GEOMETRY.northStopLineZ,
    rotationY: Math.PI / 2,
    signalId: 'north',
    toWorld: (progress) => [TRAFFIC_WORLD.eastboundLaneZ, 0.02, -progress],
  },
  southbound: {
    id: 'southbound',
    spawn: VERTICAL_SPAWN,
    exit: VERTICAL_EXIT,
    stopProgress: TRAFFIC_GEOMETRY.southStopLineZ,
    rotationY: -Math.PI / 2,
    signalId: 'south',
    toWorld: (progress) => [-TRAFFIC_WORLD.eastboundLaneZ, 0.02, progress],
  },
}

const FLOW_ORDER: FlowId[] = ['eastbound', 'westbound', 'northbound', 'southbound']

function applyWorldPosition(group: THREE.Group, flowId: FlowId, progress: number) {
  switch (flowId) {
    case 'eastbound':
      group.position.set(progress, 0.02, TRAFFIC_WORLD.eastboundLaneZ)
      break
    case 'westbound':
      group.position.set(-progress, 0.02, TRAFFIC_WORLD.westboundLaneZ)
      break
    case 'northbound':
      group.position.set(TRAFFIC_WORLD.eastboundLaneZ, 0.02, -progress)
      break
    case 'southbound':
      group.position.set(-TRAFFIC_WORLD.eastboundLaneZ, 0.02, progress)
      break
  }
}

function TrafficCars({
  signals,
  running,
  maxCarsPerFlow,
}: {
  signals: IntersectionTrafficState
  running: boolean
  maxCarsPerFlow: number
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

      if (spawnClocks.current[flowId] >= interval && spawnClear && belowFlowLimit) {
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
        const hasEnteredIntersection = front > -TRAFFIC_WORLD.intersectionHalf
        const mustStopForSignal = !signal.green && !hasEnteredIntersection

        let targetFront = Number.POSITIVE_INFINITY

        if (mustStopForSignal) {
          targetFront = def.stopProgress - 0.2
        }

        if (ahead) {
          const safeGap = Math.max(2.15, car.speed * 0.52)
          const aheadRear = ahead.progress - ahead.length / 2
          targetFront = Math.min(targetFront, aheadRear - safeGap)
        }

        const distance = targetFront - front
        let targetSpeed = car.desiredSpeed

        if (Number.isFinite(targetFront)) {
          if (distance <= 0.08) {
            targetSpeed = 0
          } else if (distance < 9) {
            targetSpeed = Math.min(targetSpeed, Math.max(0, distance * 0.72))
          }
        }

        car.braking = targetSpeed < car.speed - 0.12

        const accel = targetSpeed > car.speed ? 2.0 : 5.4
        car.speed = Math.max(
          0,
          car.speed +
            THREE.MathUtils.clamp(targetSpeed - car.speed, -accel * delta, accel * delta),
        )
        car.progress += car.speed * delta

        const group = refs.current.get(car.id)
        if (group) {
          applyWorldPosition(group, flowId, car.progress)
          const wheelSpin = car.speed * delta / 0.34

          let wheels = group.userData.cachedWheels as THREE.Object3D[] | undefined
          let brakeLamps = group.userData.cachedBrakeLamps as THREE.Mesh[] | undefined

          if (!wheels || !brakeLamps) {
            wheels = []
            brakeLamps = []
            group.traverse((child) => {
              if (child.userData.wheelRoot) wheels?.push(child)
              if (child instanceof THREE.Mesh && child.userData.brakeLamp) {
                brakeLamps?.push(child)
              }
            })
            group.userData.cachedWheels = wheels
            group.userData.cachedBrakeLamps = brakeLamps
          }

          for (const wheel of wheels ?? []) wheel.rotateX(wheelSpin)

          const brakeColor = car.braking ? '#ff2b30' : '#5a1114'
          for (const lamp of brakeLamps ?? []) {
            const material = lamp.material
            if (material instanceof THREE.MeshBasicMaterial) {
              material.color.set(brakeColor)
            }
          }
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
              if (node) refs.current.set(car.id, node)
              else refs.current.delete(car.id)
            }}
            position={def.toWorld(car.progress)}
            rotation={[0, def.rotationY, 0]}
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

type RoutePoint = {
  x: number
  z: number
  wait?: number
}

function StaticParkedCars({ quality }: { quality: 'medium' | 'high' }) {
  const cars = [
    { spot: 1, variant: 'concept' as VehicleVariant, color: '#d9e1e5' },
    { spot: 3, variant: 'lc80' as VehicleVariant, color: '#6d7f89' },
    { spot: 5, variant: 'sport' as VehicleVariant, color: '#8b2f3c' },
    { spot: 8, variant: 'ferrari' as VehicleVariant, color: '#203f68' },
    { spot: 9, variant: 'concept' as VehicleVariant, color: '#d9d1c6' },
  ]
  const visible = quality === 'high' ? cars : cars.slice(0, 3)

  return (
    <>
      {visible.map((car, index) => {
        const spot = SUPERMARKET_PARKING_SPOTS[car.spot]
        return (
          <group
            key={index}
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
  running,
  variant,
  color,
  delay = 0,
  targetSpot = 2,
}: {
  running: boolean
  variant: VehicleVariant
  color: string
  delay?: number
  targetSpot?: number
}) {
  const ref = useRef<THREE.Group>(null)
  const segment = useRef(0)
  const progress = useRef(0)
  const waiting = useRef(0)
  const elapsed = useRef(0)
  const spot = SUPERMARKET_PARKING_SPOTS[targetSpot]

  const route = useMemo<RoutePoint[]>(() => {
    const sx = spot.position[0]
    const sz = spot.position[2]
    const approachZ = sz > -12 ? -8.2 : -15.0

    return [
      { x: -37, z: -1.75 },
      { x: -30.5, z: -1.75 },
      { x: -30.5, z: -7.2 },
      { x: -30.5, z: approachZ },
      { x: sx - 2.4, z: approachZ },
      { x: sx - 2.4, z: sz },
      { x: sx, z: sz, wait: 7 },
      { x: sx - 2.4, z: sz },
      { x: sx - 2.4, z: -8.2 },
      { x: -30.5, z: -8.2 },
      { x: -30.5, z: 1.75 },
      { x: 37, z: 1.75 },
    ]
  }, [spot.position])

  useFrame((_state, deltaRaw) => {
    if (!running || !ref.current) return
    const delta = Math.min(deltaRaw, 0.05)
    elapsed.current += delta

    if (elapsed.current < delay) {
      ref.current.visible = false
      return
    }
    ref.current.visible = true

    if (waiting.current > 0) {
      waiting.current = Math.max(0, waiting.current - delta)
      return
    }

    const from = route[segment.current]
    const nextIndex = (segment.current + 1) % route.length
    const to = route[nextIndex]
    const dx = to.x - from.x
    const dz = to.z - from.z
    const distance = Math.max(0.001, Math.hypot(dx, dz))
    const speed = 3.4
    progress.current += (speed * delta) / distance

    const t = Math.min(progress.current, 1)
    ref.current.position.set(
      THREE.MathUtils.lerp(from.x, to.x, t),
      0.24,
      THREE.MathUtils.lerp(from.z, to.z, t),
    )
    ref.current.rotation.y = -Math.atan2(dz, dx)

    if (progress.current >= 1) {
      segment.current = nextIndex
      progress.current = 0
      waiting.current = route[nextIndex].wait ?? 0

      if (segment.current === route.length - 1) {
        segment.current = 0
        elapsed.current = 0
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

function RoundaboutTraffic({
  running,
  quality,
}: {
  running: boolean
  quality: 'medium' | 'high'
}) {
  const configs = quality === 'high'
    ? [
        { phase: 0.2, variant: 'concept' as VehicleVariant, color: '#f0f2f3' },
        { phase: 2.35, variant: 'sport' as VehicleVariant, color: '#2f5f9a' },
        { phase: 4.6, variant: 'lc80' as VehicleVariant, color: '#8b2f3c' },
      ]
    : [
        { phase: 0.7, variant: 'concept' as VehicleVariant, color: '#f0f2f3' },
        { phase: 3.8, variant: 'sport' as VehicleVariant, color: '#2f5f9a' },
      ]

  return (
    <>
      {configs.map((config, index) => (
        <RoundaboutCar key={index} running={running} {...config} />
      ))}
    </>
  )
}

function RoundaboutCar({
  running,
  phase,
  variant,
  color,
}: {
  running: boolean
  phase: number
  variant: VehicleVariant
  color: string
}) {
  const ref = useRef<THREE.Group>(null)
  const angle = useRef(phase)

  useFrame((_state, deltaRaw) => {
    if (!running || !ref.current) return
    const delta = Math.min(deltaRaw, 0.05)
    angle.current += delta * 0.33
    const radius = 6.15
    const x = 21.5 + Math.cos(angle.current) * radius
    const z = -14.5 + Math.sin(angle.current) * radius

    ref.current.position.set(x, 0.23, z)
    ref.current.rotation.y = angle.current - Math.PI / 2
  })

  return (
    <group ref={ref}>
      <Suspense fallback={null}>
        <RealisticCarModel variant={variant} color={color} />
      </Suspense>
    </group>
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
  quality: 'medium' | 'high'
}) {
  const loops: Array<Array<[number, number]>> = [
    [[-30, -7.7], [-13, -7.7], [-13, -21.0], [-30, -21.0]],
    [[9, 8.0], [31, 8.0], [31, 21.0], [9, 21.0]],
    [[8.5, -7.8], [31, -7.8], [31, -22.0], [8.5, -22.0]],
  ]
  const shirts = ['#346aa3', '#9e4d58', '#d2a43a', '#3d8068', '#725a9a', '#b2673c']
  const count = quality === 'high' ? 12 : 6

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

function CityLife({
  running,
  quality,
}: {
  running: boolean
  quality: 'low' | 'medium' | 'high'
}) {
  if (quality === 'low') return null

  return (
    <>
      <StaticParkedCars quality={quality} />
      <ParkingCarAgent
        running={running}
        variant="concept"
        color="#4f7087"
        targetSpot={2}
        delay={1}
      />
      {quality === 'high' && (
        <ParkingCarAgent
          running={running}
          variant="sport"
          color="#8a343c"
          targetSpot={6}
          delay={8}
        />
      )}
      <RoundaboutTraffic running={running} quality={quality} />
      <PedestrianSystem running={running} quality={quality} />
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
      data[i * 3] = (Math.random() - 0.5) * 82
      data[i * 3 + 1] = Math.random() * 34 + 2
      data[i * 3 + 2] = (Math.random() - 0.5) * 66
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
        positions[index] = (Math.random() - 0.5) * 82
        positions[index + 1] = 30 + Math.random() * 8
        positions[index + 2] = (Math.random() - 0.5) * 66
      }
      if (positions[index] > 44) positions[index] = -44
      if (positions[index] < -44) positions[index] = 44
      if (positions[index + 2] > 36) positions[index + 2] = -36
      if (positions[index + 2] < -36) positions[index + 2] = 36
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
      data[i * 3] = (Math.random() - 0.5) * 88
      data[i * 3 + 1] = 0.5 + Math.random() * 5
      data[i * 3 + 2] = (Math.random() - 0.5) * 64
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

      if (positions[index] > 46) positions[index] = -46
      if (positions[index] < -46) positions[index] = 46
      if (positions[index + 2] > 34) positions[index + 2] = -34
      if (positions[index + 2] < -34) positions[index + 2] = 34
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
      <fog attach="fog" args={[palette.fog, 40 - environment.rain * 10, 118 - environment.rain * 38]} />

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

      <RoadScene quality={quality} rain={environment.rain} />
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

      <TrafficCars signals={signals} running={running} maxCarsPerFlow={quality === 'low' ? 1 : quality === 'medium' ? 2 : 3} />
      <CityLife running={running} quality={quality} />

      <OrbitControls
        makeDefault
        target={[0, 0.9, 0]}
        enablePan
        enableRotate
        enableZoom
        minDistance={12}
        maxDistance={86}
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
        camera={{ position: [27, 24, 34], fov: 50 }}
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
