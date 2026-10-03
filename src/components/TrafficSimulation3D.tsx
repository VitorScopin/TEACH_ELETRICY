import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  TRAFFIC_GEOMETRY,
  TRAFFIC_WORLD,
  VEHICLE_DIMENSIONS,
  type VehicleKind,
} from '../simulation/trafficWorld'
import type { TrafficState } from '../types'

type VehicleModelSource = 'kenney' | 'mit'

type CarData = {
  id: number
  kind: VehicleKind
  modelSource: VehicleModelSource
  color: string
  x: number
  speed: number
  desiredSpeed: number
  length: number
  braking: boolean
}

type TrafficSimulation3DProps = {
  traffic: TrafficState
  running: boolean
}

const COLORS = ['#2b6cb0', '#718096', '#dfe7eb', '#8b2f3c', '#263746', '#165a72']
const KINDS: VehicleKind[] = ['sedan', 'suv', 'hatch']

function Wheel({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0.38, z]} rotation={[Math.PI / 2, 0, 0]} userData={{ wheel: true }}>
      <mesh castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.24, 20]} />
        <meshStandardMaterial color="#0b0f12" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.125, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.25, 16]} />
        <meshStandardMaterial color="#65727a" metalness={0.65} roughness={0.32} />
      </mesh>
    </group>
  )
}

function CarModel({
  kind,
  color,
  braking,
}: {
  kind: VehicleKind
  color: string
  braking: boolean
}) {
  const dims = VEHICLE_DIMENSIONS[kind]
  const wheelX = dims.length * 0.31
  const wheelZ = dims.width * 0.47
  const bodyY = 0.68
  const cabinY = bodyY + dims.bodyH * 0.72

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, bodyY, 0]}>
        <boxGeometry args={[dims.length, dims.bodyH, dims.width]} />
        <meshStandardMaterial color={color} metalness={0.42} roughness={0.34} />
      </mesh>

      <mesh castShadow position={[-0.16, cabinY, 0]}>
        <boxGeometry args={[dims.cabinL, dims.cabinH, dims.width * 0.86]} />
        <meshStandardMaterial color={color} metalness={0.32} roughness={0.28} />
      </mesh>

      <mesh position={[0.02, cabinY + 0.02, dims.width * 0.435]}>
        <boxGeometry args={[dims.cabinL * 0.68, dims.cabinH * 0.48, 0.025]} />
        <meshStandardMaterial color="#18313f" transparent opacity={0.84} roughness={0.1} />
      </mesh>
      <mesh position={[0.02, cabinY + 0.02, -dims.width * 0.435]}>
        <boxGeometry args={[dims.cabinL * 0.68, dims.cabinH * 0.48, 0.025]} />
        <meshStandardMaterial color="#18313f" transparent opacity={0.84} roughness={0.1} />
      </mesh>

      {[-0.31, 0.31].map((z) => (
        <mesh key={`head-${z}`} position={[dims.length * 0.505, bodyY, dims.width * z]}>
          <boxGeometry args={[0.045, 0.17, 0.24]} />
          <meshStandardMaterial color="#fff3bd" emissive="#ffe49a" emissiveIntensity={1.9} />
        </mesh>
      ))}

      {[-0.31, 0.31].map((z) => (
        <mesh key={`tail-${z}`} position={[-dims.length * 0.505, bodyY, dims.width * z]}>
          <boxGeometry args={[0.045, 0.17, 0.24]} />
          <meshStandardMaterial
            color="#ff3838"
            emissive="#ff2020"
            emissiveIntensity={braking ? 4.2 : 1.1}
          />
        </mesh>
      ))}

      <Wheel x={wheelX} z={wheelZ} />
      <Wheel x={wheelX} z={-wheelZ} />
      <Wheel x={-wheelX} z={wheelZ} />
      <Wheel x={-wheelX} z={-wheelZ} />
    </group>
  )
}


const VEHICLE_MODEL_PATHS: Record<VehicleModelSource, string> = {
  kenney: './models/vehicles/kenney-sedan.glb',
  mit: './models/vehicles/mit-car.glb',
}

function ImportedCarModel({
  source,
  kind,
  braking,
}: {
  source: VehicleModelSource
  kind: VehicleKind
  braking: boolean
}) {
  const { scene } = useGLTF(VEHICLE_MODEL_PATHS[source])

  const normalized = useMemo(() => {
    const model = scene.clone(true)
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => material.clone())
        } else if (child.material) {
          child.material = child.material.clone()
        }
      }
    })

    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const rawLength = Math.max(size.x, size.z, 0.001)
    const scale = VEHICLE_DIMENSIONS[kind].length / rawLength
    const rotationY = size.z >= size.x ? Math.PI / 2 : 0

    return {
      model,
      scale,
      rotationY,
      offset: new THREE.Vector3(-center.x, -bounds.min.y, -center.z),
    }
  }, [scene, kind])

  const dims = VEHICLE_DIMENSIONS[kind]

  return (
    <group>
      <group rotation={[0, normalized.rotationY, 0]} scale={normalized.scale}>
        <primitive object={normalized.model} position={normalized.offset} />
      </group>

      {/* Generic brake lights guarantee visible traffic feedback even when the source GLB has no emissive lamps. */}
      {[-0.31, 0.31].map((z) => (
        <mesh key={z} position={[-dims.length * 0.505, 0.7, dims.width * z]}>
          <boxGeometry args={[0.035, 0.12, 0.2]} />
          <meshStandardMaterial
            color="#ff3434"
            emissive="#ff2020"
            emissiveIntensity={braking ? 4.5 : 0.8}
          />
        </mesh>
      ))}
    </group>
  )
}

useGLTF.preload(VEHICLE_MODEL_PATHS.kenney)
useGLTF.preload(VEHICLE_MODEL_PATHS.mit)

function SignalHead({ traffic }: { traffic: TrafficState }) {
  const lamps = [
    { key: 'red', y: 0.29, color: '#ff332f', active: traffic.red },
    { key: 'yellow', y: 0, color: '#ffca3a', active: traffic.yellow },
    { key: 'green', y: -0.29, color: '#35e879', active: traffic.green },
  ] as const

  return (
    <group>
      <mesh castShadow>
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
          <sphereGeometry args={[0.09, 18, 18]} />
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
      <mesh castShadow position={[0, TRAFFIC_WORLD.signalPoleHeight / 2, 0]}>
        <cylinderGeometry args={[0.055, 0.072, TRAFFIC_WORLD.signalPoleHeight, 14]} />
        <meshStandardMaterial color="#59666d" metalness={0.7} roughness={0.34} />
      </mesh>

      <group position={[0, TRAFFIC_WORLD.signalPoleHeight - 0.18, 0]}>
        <SignalHead traffic={traffic} />
      </group>

      <mesh castShadow position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.13, 0.17, 0.14, 14]} />
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
    <mesh position={position} receiveShadow castShadow>
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
      <mesh receiveShadow castShadow position={[centerX, TRAFFIC_WORLD.sidewalkHeight / 2, centerZ]}>
        <boxGeometry args={[sx, TRAFFIC_WORLD.sidewalkHeight, sz]} />
        <meshStandardMaterial color="#73797a" roughness={0.94} />
      </mesh>

      {/* curb edges along both road faces */}
      <mesh
        castShadow
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
        castShadow
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
      castShadow
    >
      <torusGeometry args={[1.15, 0.14, 8, 24, Math.PI / 2]} />
      <meshStandardMaterial color="#a5a7a5" roughness={0.9} />
    </mesh>
  )
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.12, 0.17, 2, 10]} />
        <meshStandardMaterial color="#4c3322" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 2.35, 0]}>
        <sphereGeometry args={[1.0, 12, 10]} />
        <meshStandardMaterial color="#173e2b" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0.55, 2.3, 0.15]}>
        <sphereGeometry args={[0.65, 10, 8]} />
        <meshStandardMaterial color="#205038" roughness={0.95} />
      </mesh>
    </group>
  )
}

function Planter({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh receiveShadow castShadow position={[0, 0.24, 0]}>
        <boxGeometry args={[1.45, 0.48, 1.45]} />
        <meshStandardMaterial color="#4d5557" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.15, 0.14, 1.15]} />
        <meshStandardMaterial color="#243126" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.62, 10, 8]} />
        <meshStandardMaterial color="#21492f" roughness={0.95} />
      </mesh>
    </group>
  )
}

function StreetLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.045, 0.065, 3.5, 10]} />
        <meshStandardMaterial color="#252d32" metalness={0.72} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[0, 3.48, 0]}>
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshStandardMaterial color="#fff1c2" emissive="#ffd78a" emissiveIntensity={2.8} />
      </mesh>
      <pointLight position={[0, 3.35, 0]} intensity={5} distance={8} color="#ffd990" />
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

function RoadScene() {
  const halfRoad = TRAFFIC_WORLD.roadWidth / 2
  const lane = TRAFFIC_WORLD.laneWidth
  const dashX = [-29, -25, -21, -17, -13, 13, 17, 21, 25, 29]
  const dashZ = [-20, -16, -12, 12, 16, 20]

  return (
    <>
      {/* World base */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.07, 0]}>
        <planeGeometry args={[70, TRAFFIC_WORLD.worldDepth]} />
        <meshStandardMaterial color="#10191e" roughness={0.99} />
      </mesh>

      {/* Asphalt roads crossing at 90 degrees */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadLength, TRAFFIC_WORLD.roadWidth]} />
        <meshStandardMaterial color="#252b2e" roughness={0.86} metalness={0.035} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
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
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[TRAFFIC_WORLD.roadWidth, TRAFFIC_WORLD.roadWidth]} />
        <meshStandardMaterial color="#242a2d" roughness={0.88} metalness={0.02} />
      </mesh>

      <UrbanProps />
      <CityBlocks />
    </>
  )
}

function TrafficCars({
  traffic,
  running,
}: {
  traffic: TrafficState
  running: boolean
}) {
  const [cars, setCars] = useState<CarData[]>([])
  const carsRef = useRef<CarData[]>([])
  const refs = useRef(new Map<number, THREE.Group>())
  const idRef = useRef(1)
  const spawnClock = useRef(0)

  useFrame((_state, deltaRaw) => {
    const delta = Math.min(deltaRaw, 0.05)
    if (!running) return

    spawnClock.current += delta

    const ordered = [...carsRef.current].sort((a, b) => b.x - a.x)
    const lastCar = ordered.length ? ordered[ordered.length - 1] : null
    const spawnClear = !lastCar || lastCar.x > TRAFFIC_WORLD.spawnX + 8

    if (spawnClock.current > 2.1 && spawnClear) {
      spawnClock.current = 0
      const id = idRef.current++
      const kind = KINDS[id % KINDS.length]
      const dims = VEHICLE_DIMENSIONS[kind]

      const car: CarData = {
        id,
        kind,
        modelSource: id % 2 === 0 ? 'kenney' : 'mit',
        color: COLORS[id % COLORS.length],
        x: TRAFFIC_WORLD.spawnX,
        speed: 0,
        desiredSpeed: 6.2 + (id % 3) * 0.45,
        length: dims.length,
        braking: false,
      }

      carsRef.current = [...carsRef.current, car]
      setCars([...carsRef.current])
    }

    const nextCars = [...carsRef.current].sort((a, b) => b.x - a.x)

    nextCars.forEach((car, index) => {
      const ahead = index > 0 ? nextCars[index - 1] : null
      const carFront = car.x + car.length / 2
      const hasEnteredIntersection = carFront > TRAFFIC_GEOMETRY.westCrosswalkCenterX + TRAFFIC_WORLD.crosswalkWidth / 2
      const mustStopForSignal = !traffic.green && !hasEnteredIntersection

      let targetFrontX = Number.POSITIVE_INFINITY

      if (mustStopForSignal) {
        targetFrontX = TRAFFIC_GEOMETRY.westStopLineX - 0.18
      }

      if (ahead) {
        const safeGap = Math.max(2.0, car.speed * 0.48)
        const aheadRear = ahead.x - ahead.length / 2
        targetFrontX = Math.min(targetFrontX, aheadRear - safeGap)
      }

      const distance = targetFrontX - carFront
      let targetSpeed = car.desiredSpeed

      if (Number.isFinite(targetFrontX)) {
        if (distance <= 0.08) targetSpeed = 0
        else if (distance < 8) targetSpeed = Math.min(targetSpeed, Math.max(0, distance * 0.78))
      }

      car.braking = targetSpeed < car.speed - 0.15
      const accel = targetSpeed > car.speed ? 2.1 : 5.2
      car.speed = Math.max(
        0,
        car.speed + THREE.MathUtils.clamp(targetSpeed - car.speed, -accel * delta, accel * delta),
      )
      car.x += car.speed * delta

      const group = refs.current.get(car.id)
      if (group) {
        group.position.x = car.x
        const wheelSpin = car.speed * delta / 0.34
        group.traverse((child) => {
          if (child.userData.wheel) child.rotation.z -= wheelSpin
        })
      }
    })

    const alive = nextCars.filter((car) => car.x < TRAFFIC_WORLD.exitX)
    carsRef.current = alive

    if (alive.length !== cars.length || alive.some((car, i) => cars[i]?.braking !== car.braking)) {
      setCars(alive.map((car) => ({ ...car })))
    }
  })

  return (
    <>
      {cars.map((car) => (
        <group
          key={car.id}
          ref={(node) => {
            if (node) refs.current.set(car.id, node)
            else refs.current.delete(car.id)
          }}
          position={[car.x, 0.02, TRAFFIC_WORLD.eastboundLaneZ]}
        >
          <Suspense fallback={<CarModel kind={car.kind} color={car.color} braking={car.braking} />}>
            <ImportedCarModel source={car.modelSource} kind={car.kind} braking={car.braking} />
          </Suspense>
        </group>
      ))}
    </>
  )
}

function Scene({
  traffic,
  running,
}: {
  traffic: TrafficState
  running: boolean
}) {
  const halfRoad = TRAFFIC_WORLD.roadWidth / 2
  const sidewalkSignalOffset = halfRoad + 0.9

  // The north/south pair is visually interlocked with the PLC-controlled east/west pair.
  // This keeps the crossing readable while the learning exercise still exposes only one 3-light PLC sequence.
  const crossTraffic: TrafficState = traffic.green
    ? { red: true, yellow: false, green: false }
    : traffic.yellow
      ? { red: true, yellow: false, green: false }
      : { red: false, yellow: false, green: true }

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

      <ambientLight intensity={0.58} />
      <hemisphereLight args={['#8ec8e8', '#172025', 0.72]} />
      <directionalLight
        castShadow
        position={[15, 24, 12]}
        intensity={1.55}
        color="#e0f2ff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-10, 8, 11]} intensity={12} distance={24} color="#78cfff" />
      <pointLight position={[11, 6, -10]} intensity={8} distance={22} color="#ffd28a" />

      <RoadScene />

      {/* Four correctly placed approach signals */}
      <TrafficLight3D traffic={traffic} position={westSignal} rotationY={Math.PI / 2} />
      <TrafficLight3D traffic={traffic} position={eastSignal} rotationY={-Math.PI / 2} />
      <TrafficLight3D traffic={crossTraffic} position={southSignal} rotationY={0} />
      <TrafficLight3D traffic={crossTraffic} position={northSignal} rotationY={Math.PI} />

      <TrafficCars traffic={traffic} running={running} />

      <OrbitControls
        makeDefault
        target={[0, 0.9, 0]}
        enableDamping
        dampingFactor={0.075}
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

export function TrafficSimulation3D({ traffic, running }: TrafficSimulation3DProps) {
  return (
    <div className="traffic-3d-root">
      <Canvas
        shadows
        dpr={[1, 1.6]}
        camera={{ position: [20, 19, 25], fov: 48 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <Scene traffic={traffic} running={running} />
      </Canvas>

      <div className="traffic-3d-label">
        <span>TRÁFEGO 3D</span>
        <strong>Escala métrica • fila dinâmica • semáforo ligado ao PLC</strong>
      </div>

      <div className="traffic-3d-help">
        <span>Arraste: girar</span>
        <span>Botão direito: mover</span>
        <span>Scroll: zoom</span>
      </div>
    </div>
  )
}
