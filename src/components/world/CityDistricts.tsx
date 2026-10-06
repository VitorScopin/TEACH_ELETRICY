import { useGLTF } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { ROUNDABOUT, SUPERMARKET_PARKING_SPOTS } from './cityLayout'
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

function GroundArrow({
  position,
  rotationY = 0,
  scale = 1,
}: {
  position: [number, number, number]
  rotationY?: number
  scale?: number
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.18, 1.7]} />
        <meshBasicMaterial color="#e8e7de" toneMapped={false} />
      </mesh>
      <mesh position={[-0.28, 0.012, 0.56]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[0.16, 0.78]} />
        <meshBasicMaterial color="#e8e7de" toneMapped={false} />
      </mesh>
      <mesh position={[0.28, 0.012, 0.56]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[0.16, 0.78]} />
        <meshBasicMaterial color="#e8e7de" toneMapped={false} />
      </mesh>
    </group>
  )
}

function YieldMark({
  position,
  rotationY = 0,
}: {
  position: [number, number, number]
  rotationY?: number
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 0.83, 3]} />
        <meshBasicMaterial color="#f1f0e8" toneMapped={false} />
      </mesh>
    </group>
  )
}

function WetOverlay({
  position,
  size,
  rain,
}: {
  position: [number, number, number]
  size: [number, number]
  rain: number
}) {
  if (rain <= 0.02) return null

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        color="#142027"
        transparent
        opacity={Math.min(0.38, rain * 0.34)}
        roughness={Math.max(0.16, 0.48 - rain * 0.3)}
        metalness={Math.min(0.28, rain * 0.24)}
      />
    </mesh>
  )
}

function SupermarketBuilding({ nightFactor }: { nightFactor: number }) {
  const sign = useSignTexture('SUPERMERCADO', '#ef3d36')

  return (
    <group position={[-21.5, 0.18, -18.2]}>
      <mesh position={[0, 2.25, 0]}>
        <boxGeometry args={[18.5, 4.5, 6.2]} />
        <meshStandardMaterial color="#d8d8d3" roughness={0.72} />
      </mesh>

      <mesh position={[0, 2.55, 3.13]}>
        <planeGeometry args={[12.8, 3.0]} />
        <meshStandardMaterial
          color="#8ec6d3"
          emissive="#3b9bb1"
          emissiveIntensity={0.18 + nightFactor * 1.1}
          roughness={0.22}
          metalness={0.08}
        />
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

      {[-4.4, 0, 4.4].map((x) => (
        <mesh key={x} position={[x, 1.35, 3.2]}>
          <boxGeometry args={[2.7, 2.25, 0.18]} />
          <meshStandardMaterial
            color="#bfe6f1"
            emissive="#58a7bd"
            emissiveIntensity={0.25 + nightFactor * 1.25}
            roughness={0.18}
          />
        </mesh>
      ))}

      <group position={[8.8, 0, 4.4]}>
        <mesh position={[0, 2.5, 0]}>
          <boxGeometry args={[0.18, 5.0, 0.18]} />
          <meshStandardMaterial color="#424c51" metalness={0.55} roughness={0.4} />
        </mesh>
        <mesh position={[0, 4.8, 0]}>
          <boxGeometry args={[3.0, 2.1, 0.22]} />
          <meshBasicMaterial map={sign ?? undefined} color="#ffffff" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

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

function SupermarketParking({
  rain,
  nightFactor,
}: {
  rain: number
  nightFactor: number
}) {
  return (
    <group>
      <mesh position={[-21.6, 0.175, -11.9]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[19.5, 8.2]} />
        <meshStandardMaterial color="#31383b" roughness={0.9} />
      </mesh>
      <WetOverlay position={[-21.6, 0.195, -11.9]} size={[19.5, 8.2]} rain={rain} />

      {SUPERMARKET_PARKING_SPOTS.map((spot) => (
        <ParkingSpace
          key={spot.id}
          position={spot.position}
          rotationY={spot.rotationY}
          accessible={spot.accessible}
        />
      ))}

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

      <GroundArrow position={[-27.6, 0.205, -8.25]} rotationY={Math.PI / 2} scale={0.75} />
      <GroundArrow position={[-18.8, 0.205, -15.05]} rotationY={-Math.PI / 2} scale={0.75} />
      <GroundArrow position={[-30.65, 0.205, -5.9]} rotationY={Math.PI} scale={0.72} />

      <StreetLamp position={[-30.4, 0.2, -10.1]} nightFactor={nightFactor} />
      <StreetLamp position={[-12.8, 0.2, -10.1]} nightFactor={nightFactor} />
      <TrashBin position={[-12.9, 0.2, -7.6]} />
    </group>
  )
}

function RoundaboutDistrict({
  rain,
  nightFactor,
}: {
  rain: number
  nightFactor: number
}) {
  const [centerX, centerZ] = ROUNDABOUT.center
  const islandRadius = ROUNDABOUT.islandRadius
  const laneRadius = ROUNDABOUT.laneRadius
  const outerRadius = ROUNDABOUT.roadOuterRadius

  return (
    <group>
      {/* The circle is now a real road node fed by RoadNetwork approaches. */}
      <mesh position={[centerX, 0.055, centerZ]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[islandRadius + 0.35, outerRadius, 64]} />
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

      {/* Circular lane markers. */}
      {Array.from({ length: 20 }).map((_, index) => {
        const angle = (index / 20) * Math.PI * 2
        return (
          <mesh
            key={index}
            position={[
              centerX + Math.cos(angle) * laneRadius,
              0.09,
              centerZ + Math.sin(angle) * laneRadius,
            ]}
            rotation={[-Math.PI / 2, 0, -angle]}
          >
            <planeGeometry args={[1.0, 0.08]} />
            <meshBasicMaterial color="#eeeeea" toneMapped={false} />
          </mesh>
        )
      })}

      <YieldMark
        position={[ROUNDABOUT.entryWest[0] - 0.75, 0.205, ROUNDABOUT.entryWest[1]]}
        rotationY={Math.PI / 2}
      />
      <YieldMark
        position={[ROUNDABOUT.entryNorth[0], 0.205, ROUNDABOUT.entryNorth[1] + 0.75]}
        rotationY={0}
      />
      <YieldMark
        position={[ROUNDABOUT.entryEast[0] + 0.75, 0.205, ROUNDABOUT.entryEast[1]]}
        rotationY={-Math.PI / 2}
      />
      <YieldMark
        position={[ROUNDABOUT.entrySouth[0], 0.205, ROUNDABOUT.entrySouth[1] - 0.75]}
        rotationY={Math.PI}
      />

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
    <group position={[0, 0, 17.2]}>
      {shops.map((shop) => (
        <ShopBuilding key={shop.label} {...shop} nightFactor={nightFactor} />
      ))}
      <Bench position={[14.5, 0.2, 13.9]} rotationY={Math.PI} />
      <Bench position={[23.5, 0.2, 13.9]} rotationY={Math.PI} />
      <TrashBin position={[28.9, 0.2, 14.0]} />
      <BusStop position={[5.5, 0.2, 10.0]} rotationY={Math.PI} nightFactor={nightFactor} />
    </group>
  )
}

function GasStation({ nightFactor }: { nightFactor: number }) {
  return (
    <group position={[33.0, 0.18, 8.8]}>
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

const CITY_FRAME_BUILDINGS: Array<{
  variant: BuildingVariant
  position: [number, number, number]
  rotationY?: number
  scale?: number
}> = [
  { variant: 'medium', position: [-31.0, 0.18, 17.5], rotationY: Math.PI, scale: 0.82 },
  { variant: 'small', position: [-22.5, 0.18, 17.4], rotationY: Math.PI, scale: 0.84 },
  { variant: 'medium', position: [-13.8, 0.18, 17.2], rotationY: Math.PI, scale: 0.80 },
  { variant: 'medium', position: [-31.0, 0.18, -35.8], rotationY: Math.PI, scale: 0.84 },
  { variant: 'large', position: [-19.5, 0.18, -36.2], rotationY: Math.PI, scale: 0.88 },
  { variant: 'small', position: [-8.8, 0.18, -35.6], rotationY: Math.PI, scale: 0.86 },
  { variant: 'small', position: [10.0, 0.18, -35.8], rotationY: Math.PI, scale: 0.86 },
  { variant: 'medium', position: [20.0, 0.18, -36.0], rotationY: Math.PI, scale: 0.84 },
  { variant: 'large', position: [27.0, 0.18, -45.0], rotationY: Math.PI, scale: 0.82 },
  { variant: 'small', position: [-42.0, 0.18, -14.0], rotationY: Math.PI / 2, scale: 0.82 },
  { variant: 'medium', position: [-42.0, 0.18, 6.0], rotationY: Math.PI / 2, scale: 0.82 },
  { variant: 'small', position: [42.0, 0.18, -4.0], rotationY: -Math.PI / 2, scale: 0.84 },
  { variant: 'medium', position: [42.0, 0.18, 14.0], rotationY: -Math.PI / 2, scale: 0.82 },
]

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
      <CityBlockPad position={[-21.5, 0, -15.0]} size={[25.0, 16.0]} tone="#6a7070" />
      <CityBlockPad position={[21.0, 0, -15.0]} size={[25.0, 16.0]} tone="#666c6c" />
      <CityBlockPad position={[-21.5, 0, 15.0]} size={[25.0, 16.0]} tone="#626868" />
      <CityBlockPad position={[21.0, 0, 15.0]} size={[25.0, 16.0]} tone="#656b6b" />

      <SupermarketBuilding nightFactor={nightFactor} />
      <SupermarketParking rain={rain} nightFactor={nightFactor} />
      <RoundaboutDistrict rain={rain} nightFactor={nightFactor} />
      <CommercialStrip nightFactor={nightFactor} />
      {quality === 'high' && <GasStation nightFactor={nightFactor} />}

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
