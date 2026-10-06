import { useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { ROUNDABOUT, DISTRICTS, CITY_FRAME_BUILDINGS } from './cityLayout'
import { Bench, BusStop, Planter, StreetLamp, TrashBin, Tree } from './StreetFurniture'

type Quality = 'low' | 'medium' | 'high'
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

export function RoundaboutDistrict({
  rain,
  nightFactor,
}: {
  rain: number
  nightFactor: number
}) {
  const [centerX, centerZ] = ROUNDABOUT.center
  const islandRadius = ROUNDABOUT.islandRadius
  const outerRadius = ROUNDABOUT.roadOuterRadius

  return (
    <group>
      {/* Lower than the approach asphalt, so every access cuts an open mouth. */}
      <mesh position={[centerX, 0.012, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[outerRadius, outerRadius + 2.1, 64]} />
        <meshStandardMaterial color="#9ca3a0" roughness={0.96} />
      </mesh>
      <mesh position={[centerX, 0.020, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[outerRadius, outerRadius + 0.38, 64]} />
        <meshStandardMaterial color="#c1c3be" roughness={0.93} />
      </mesh>
      {/* The circle is now a real road node fed by RoadNetwork approaches. */}
      <mesh position={[centerX, 0.055, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[islandRadius + 0.14, outerRadius, 64]} />
        <meshStandardMaterial
          color="#242b2e"
          roughness={Math.max(0.28, 0.88 - rain * 0.48)}
          metalness={Math.min(0.18, rain * 0.16)}
        />
      </mesh>

      <mesh position={[centerX, 0.18, centerZ]}>
        <cylinderGeometry args={[islandRadius, islandRadius + 0.14, 0.36, 48]} />
        <meshStandardMaterial color="#84908a" roughness={0.92} />
      </mesh>
      <mesh position={[centerX, 0.40, centerZ]}>
        <cylinderGeometry args={[islandRadius - 0.40, islandRadius - 0.28, 0.22, 48]} />
        <meshStandardMaterial color="#355b3f" roughness={1} />
      </mesh>

      <Tree position={[centerX, 0.42, centerZ]} scale={1.05} />
      <Tree position={[centerX - 1.7, 0.42, centerZ + 0.75]} scale={0.50} />
      <Tree position={[centerX + 1.7, 0.42, centerZ - 0.75]} scale={0.50} />

      {/* A single circulating lane has no dashed divider through its centre. */}
      <StreetLamp
        position={[centerX - outerRadius - 1.7, 0.2, centerZ - outerRadius + 0.8]}
        nightFactor={nightFactor}
      />
      <StreetLamp
        position={[centerX + outerRadius + 1.7, 0.2, centerZ - outerRadius + 0.8]}
        nightFactor={nightFactor}
      />
      <StreetLamp
        position={[centerX + outerRadius - 0.8, 0.2, centerZ + outerRadius + 1.7]}
        nightFactor={nightFactor}
      />
    </group>
  )
}

function ShopBuilding({
  x,
  label,
  accent,
  facade,
  nightFactor,
}: {
  x: number
  label: string
  accent: string
  facade: string
  nightFactor: number
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
        <meshStandardMaterial
          color="#a9d9e7"
          emissive="#4b8898"
          emissiveIntensity={0.18 + nightFactor * 1.15}
          roughness={0.2}
        />
      </mesh>
      <mesh position={[0, 3.3, -2.58]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[4.8, 1.25]} />
        <meshBasicMaterial map={sign ?? undefined} color={sign ? '#ffffff' : accent} toneMapped={false} />
      </mesh>
    </group>
  )
}

function CommercialStrip({ nightFactor }: { nightFactor: number }) {
  const shops = [
    { x: 12.2, label: 'FARMACIA', accent: '#39b66f', facade: '#d8ded7' },
    { x: 19.0, label: 'CAFE', accent: '#d58a3a', facade: '#d7cec0' },
    { x: 25.8, label: 'PADARIA', accent: '#e3563e', facade: '#d7c7b5' },
  ]

  return (
    <group position={[0, 0, DISTRICTS.commercialZ]}>
      {shops.map((shop) => (
        <ShopBuilding key={shop.label} {...shop} nightFactor={nightFactor} />
      ))}
      <Bench position={[14.5, 0.2, -3.3]} rotationY={Math.PI} />
      <Bench position={[23.5, 0.2, -3.3]} rotationY={Math.PI} />
      <TrashBin position={[28.9, 0.2, -3.2]} />
      <BusStop position={[5.5, 0.2, -7.2]} rotationY={Math.PI} nightFactor={nightFactor} />
    </group>
  )
}

function GasStation({ nightFactor }: { nightFactor: number }) {
  return (
    <group position={[33.0, 0.028, 8.8]}>
      <mesh position={[0, 3.2, 0]}>
        <boxGeometry args={[10.5, 0.45, 7.0]} />
        <meshStandardMaterial
          color="#f3f0dd"
          emissive="#fff2c8"
          emissiveIntensity={nightFactor * 0.25}
          roughness={0.55}
        />
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

export function CityDistricts({
  quality,
  rain,
  nightFactor,
}: {
  quality: Exclude<Quality, 'low'>
  rain: number
  nightFactor: number
}) {
  const buildings =
    quality === 'high'
      ? CITY_FRAME_BUILDINGS
      : CITY_FRAME_BUILDINGS.filter((_, index) => ![3, 4, 5, 6, 7, 8].includes(index))

  return (
    <>
      <CityBlockPad position={[21.0, 0, 15.0]} size={[25.0, 16.0]} tone="#656b6b" />

      <CommercialStrip nightFactor={nightFactor} />
      {quality === 'high' && <>
        <mesh position={[33, 0.028, 8.8]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[13, 9.8]} />
          <meshStandardMaterial color="#464d4f" roughness={0.9} />
        </mesh>
        <mesh position={[31, 0.035, 2.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4, 5]} />
          <meshStandardMaterial color="#464d4f" roughness={0.9} />
        </mesh>
        <GasStation nightFactor={nightFactor} />
      </>}

      <Planter position={[7.8, 0.2, 12.0]} />
      <Planter position={[29.8, 0.2, 12.0]} />

      <Suspense fallback={null}>
        {buildings.map((building, index) => (
          <GlbBuilding key={index} {...building} />
        ))}
      </Suspense>
    </>
  )
}
