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

type TrafficSimulation3DProps = {
  signals: IntersectionTrafficState
  running: boolean
  quality: 'low' | 'medium' | 'high'
  targetFps: number
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

function Building({
  position,
  size,
  index,
}: {
  position: [number, number, number]
  size: [number, number, number]
  index: number
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={index % 2 ? '#102936' : '#0d2330'} roughness={0.82} />
    </mesh>
  )
}

function CityBlocks() {
  const blocks = useMemo(
    () => [
      { position: [-18, 3.4, -16] as [number, number, number], size: [6.2, 6.8, 5.4] as [number, number, number] },
      { position: [-11, 4.6, -16.5] as [number, number, number], size: [4.2, 9.2, 4.8] as [number, number, number] },
      { position: [11.5, 4.1, -16.5] as [number, number, number], size: [5.2, 8.2, 4.8] as [number, number, number] },
      { position: [18, 3.2, -15.5] as [number, number, number], size: [5.8, 6.4, 5.4] as [number, number, number] },
      { position: [-18, 3.0, 16] as [number, number, number], size: [5.5, 6, 5.2] as [number, number, number] },
      { position: [17, 4.0, 16] as [number, number, number], size: [6.4, 8, 5.2] as [number, number, number] },
    ],
    [],
  )

  return (
    <>
      {blocks.map((block, index) => (
        <Building key={index} {...block} index={index} />
      ))}
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

function UrbanProps() {
  return (
    <>
      <Tree position={[-14, 0.18, -10.8]} scale={0.95} />
      <Tree position={[14.5, 0.18, -10.5]} scale={0.9} />
      <Tree position={[-14.5, 0.18, 11.2]} scale={0.9} />
      <Tree position={[14, 0.18, 11]} scale={1.0} />

      <Planter position={[-10.5, 0.18, -10.6]} />
      <Planter position={[10.8, 0.18, -10.4]} />
      <Planter position={[-10.7, 0.18, 10.4]} />
      <Planter position={[10.5, 0.18, 10.5]} />

      <StreetLamp position={[-12.4, 0.18, -8.8]} />
      <StreetLamp position={[12.6, 0.18, -8.8]} />
      <StreetLamp position={[-12.5, 0.18, 8.9]} />
      <StreetLamp position={[12.5, 0.18, 8.9]} />
    </>
  )
}

function RoadScene({ quality }: { quality: 'low' | 'medium' | 'high' }) {
  const halfRoad = TRAFFIC_WORLD.roadWidth / 2
  const lane = TRAFFIC_WORLD.laneWidth
  const dashX = [-29, -25, -21, -17, -13, 13, 17, 21, 25, 29]
  const dashZ = [-20, -16, -12, 12, 16, 20]

  return (
    <>
      {/* World base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]}>
        <planeGeometry args={[70, TRAFFIC_WORLD.worldDepth]} />
        <meshStandardMaterial color="#10191e" roughness={0.99} />
      </mesh>

      {/* Asphalt roads crossing at 90 degrees */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadLength, TRAFFIC_WORLD.roadWidth]} />
        <meshStandardMaterial color="#252b2e" roughness={0.86} metalness={0.035} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadWidth, TRAFFIC_WORLD.worldDepth]} />
        <meshStandardMaterial color="#252b2e" roughness={0.86} metalness={0.035} />
      </mesh>

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

      {quality !== 'low' && <UrbanProps />}
      {quality === 'high' && <CityBlocks />}
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
}: {
  signals: IntersectionTrafficState
  running: boolean
  quality: 'low' | 'medium' | 'high'
}) {
  const halfRoad = TRAFFIC_WORLD.roadWidth / 2
  const sidewalkSignalOffset = halfRoad + 0.9

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
      <color attach="background" args={['#07141e']} />
      <fog attach="fog" args={['#07141e', 34, 70]} />

      <ambientLight intensity={0.76} />
      <hemisphereLight args={['#8ec8e8', '#172025', 0.56]} />
      <directionalLight
        position={[15, 24, 12]}
        intensity={1.22}
        color="#e0f2ff"
      />

      <RoadScene quality={quality} />

      {/* Four correctly placed approach signals */}
      <TrafficLight3D traffic={signals.west} position={westSignal} rotationY={Math.PI / 2} />
      <TrafficLight3D traffic={signals.east} position={eastSignal} rotationY={-Math.PI / 2} />
      <TrafficLight3D traffic={signals.south} position={southSignal} rotationY={0} />
      <TrafficLight3D traffic={signals.north} position={northSignal} rotationY={Math.PI} />

      <TrafficCars signals={signals} running={running} maxCarsPerFlow={quality === 'low' ? 1 : quality === 'medium' ? 2 : 3} />

      <OrbitControls
        makeDefault
        target={[0, 0.9, 0]}
        enablePan
        enableRotate
        enableZoom
        minDistance={12}
        maxDistance={52}
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
}: TrafficSimulation3DProps) {
  return (
    <div className="traffic-3d-root">
      <Canvas
        key={quality}
        frameloop="demand"
        dpr={quality === 'low' ? 0.8 : quality === 'medium' ? 1 : 1.25}
        camera={{ position: [20, 19, 25], fov: 48 }}
        gl={{
          antialias: quality === 'high',
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
      >
        <RenderLimiter active={running} targetFps={targetFps} />
        <Scene signals={signals} running={running} quality={quality} />
      </Canvas>

      <div className="traffic-3d-label">
        <span>TRÁFEGO 3D</span>
        <strong>4 fluxos ativos • render otimizado • semáforos intertravados</strong>
      </div>

      <div className="traffic-3d-help">
        <span>Arraste: girar</span>
        <span>Botão direito: mover</span>
        <span>Scroll: zoom</span>
      </div>
    </div>
  )
}
