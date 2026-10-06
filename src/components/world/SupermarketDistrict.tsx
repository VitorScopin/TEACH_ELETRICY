import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { CITY_ROADS, SUPERMARKET, SUPERMARKET_PARKING_SPOTS, type ParkingSpotDefinition } from './cityLayout'
import { Planter, StreetLamp, TrashBin } from './StreetFurniture'

type Quality = 'low' | 'medium' | 'high'
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1)
type Position = [number, number, number]

function Block({ position, size, color, emissive, intensity = 0 }: {
  position: Position; size: Position; color: string; emissive?: string; intensity?: number
}) {
  return <mesh position={position} scale={size}>
    <primitive object={UNIT_BOX} attach="geometry" />
    <meshStandardMaterial color={color} roughness={0.72} emissive={emissive} emissiveIntensity={intensity} />
  </mesh>
}

function usePanel(text: string) {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 768; canvas.height = 192
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#152b32'; ctx.fillRect(0, 0, 768, 192)
    ctx.fillStyle = '#e7543e'; ctx.fillRect(0, 172, 768, 20)
    ctx.font = 'bold 70px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#fff7e9'; ctx.fillText(text, 384, 88, 720)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [text])
}

function Sign({ text, position, size, rotationY = 0 }: { text: string; position: Position; size: [number, number]; rotationY?: number }) {
  const texture = usePanel(text)
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh position={position} rotation={[0, rotationY, 0]} scale={[...size, 1]}>
      <primitive object={UNIT_PLANE} attach="geometry" />
    <meshBasicMaterial map={texture} toneMapped={false} />
  </mesh>
}

function GroundArrow({ position, rotationY = 0 }: { position: Position; rotationY?: number }) {
  return <group position={position} rotation={[0, rotationY, 0]}>
    <Block position={[0, 0, 0]} size={[0.13, 0.006, 1.8]} color="#e8e5ce" />
    {[-1, 1].map(side => <group key={side} position={[side * 0.22, 0, 0.65]} rotation={[0, side * Math.PI / 4, 0]}>
      <Block position={[0, 0, 0]} size={[0.12, 0.006, 0.75]} color="#e8e5ce" />
    </group>)}
  </group>
}

function ParkingSpace({ spot }: { spot: ParkingSpotDefinition }) {
  const accessible = useMemo(() => {
    if (!spot.accessible) return null
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#256792'; ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 12
    ctx.beginPath(); ctx.arc(117, 159, 53, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath(); ctx.arc(115, 49, 15, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.moveTo(115, 77); ctx.lineTo(121, 133); ctx.lineTo(169, 133); ctx.lineTo(191, 183); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(121, 99); ctx.lineTo(164, 99); ctx.stroke()
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [spot.accessible])
  useEffect(() => () => accessible?.dispose(), [accessible])
  return <group position={spot.position} rotation={[0, spot.rotationY, 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[5, 2.65, 1]}>
      <primitive object={UNIT_PLANE} attach="geometry" />
      <meshBasicMaterial color={spot.accessible ? '#256792' : '#353e41'} />
    </mesh>
    {accessible && <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[2, 2, 1]}>
      <primitive object={UNIT_PLANE} attach="geometry" />
      <meshBasicMaterial map={accessible} toneMapped={false} />
    </mesh>}
    {[-1.3, 1.3].map(z => <Block key={z} position={[0, 0.009, z]} size={[5, 0.004, 0.075]} color="#e8e5ce" />)}
    <Block position={[2.46, 0.01, 0]} size={[0.075, 0.004, 2.65]} color="#e8e5ce" />
  </group>
}

function ShoppingCart({ x }: { x: number }) {
  return <group position={[x, 0, 0]}>
    <Block position={[0, 0.28, 0]} size={[0.6, 0.04, 0.82]} color="#adb9ba" />
    <Block position={[0, 0.68, 0]} size={[0.6, 0.04, 0.75]} color="#bbc6c6" />
    {[-0.27, 0.27].map(side => <Block key={side} position={[side, 0.49, 0]} size={[0.035, 0.42, 0.75]} color="#b8c3c5" />)}
    <Block position={[0, 0.49, -0.36]} size={[0.6, 0.42, 0.035]} color="#b8c3c5" />
    <Block position={[0, 0.82, 0.46]} size={[0.68, 0.045, 0.045]} color="#e7543e" />
    {[-0.23, 0.23].flatMap(side => [-0.29, 0.29].map(z => <mesh key={`${side}-${z}`} position={[side, 0.1, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.09, 0.09, 0.07, 6]} />
      <meshStandardMaterial color="#263137" />
    </mesh>))}
  </group>
}

function CartShelter({ quality }: { quality: Quality }) {
  return <group position={SUPERMARKET.cartShelter}>
    <Block position={[0, 2.15, 0]} size={[4.6, 0.14, 2.3]} color="#647b80" />
    {[-2.1, 2.1].map(x => <Block key={x} position={[x, 1.05, -0.8]} size={[0.1, 2.1, 0.1]} color="#466066" />)}
    <Sign text="CARRINHOS" position={[0, 1.75, 1.16]} size={[3.1, 0.55]} />
    {Array.from({ length: quality === 'high' ? 4 : 2 }, (_, i) => <ShoppingCart key={i} x={(i - (quality === 'high' ? 1.5 : 0.5)) * 0.82} />)}
  </group>
}

function SupermarketBuilding({ quality, nightFactor }: { quality: Quality; nightFactor: number }) {
  const [width, height, depth] = SUPERMARKET.buildingSize
  const entranceX = SUPERMARKET.entrance[0] - SUPERMARKET.position[0]
  return <group position={SUPERMARKET.position}>
    <Block position={[0, height / 2, -0.8]} size={[width, height, depth - 1.6]} color="#d9d9cd" />
    {[-1, 1].map(side => <group key={side}>
      <Block position={[side * 8.2, 2.5, 3.75]} size={[8.6, 5, 1.5]} color="#deddd1" />
      <Block position={[side * 8.2, 1.6, 4.52]} size={[7.2, 2.5, 0.09]} color="#88b8c0" emissive="#70b8c2" intensity={0.12 + nightFactor * 0.8} />
      {quality !== 'low' && [-2.4, 0, 2.4].map(x => <Block key={x} position={[side * 8.2 + x, 1.6, 4.59]} size={[0.09, 2.5, 0.08]} color="#425961" />)}
    </group>)}
    <Block position={[entranceX, 0.09, 3.9]} size={[5.9, 0.18, 3.4]} color="#9ba4a1" />
    <Block position={[entranceX, 1.55, 3.17]} size={[4.2, 2.8, 0.1]} color="#78aeb8" emissive="#6fa9b2" intensity={nightFactor * 0.8} />
    <Block position={[entranceX, 1.55, 3.25]} size={[0.09, 2.8, 0.08]} color="#354d54" />
    <Block position={[entranceX, 3.6, 4.2]} size={[6.4, 0.26, 3.0]} color="#35565b" />
    <Block position={[entranceX, 3.44, 4.5]} size={[4.8, 0.035, 1.9]} color="#e8e3c6" emissive="#ffe5a8" intensity={nightFactor * 1.5} />
    <Sign text="ENTRADA" position={[entranceX, 3.1, 3.28]} size={[3.2, 0.5]} />
    <Block position={[0, 4.55, 4.59]} size={[width + 0.5, 1.0, 0.25]} color="#e7543e" />
    <Sign text="SUPERMERCADO" position={[0, 4.65, 4.73]} size={[17, 0.95]} />
    <Block position={[0, height + 0.14, 0]} size={[width + 0.7, 0.28, depth + 0.4]} color="#52646a" />
    {quality !== 'low' && <>
      {[-6.5, 6.5].map(x => <Block key={x} position={[x, height + 0.65, -1.8]} size={[2.5, 0.75, 2.1]} color="#8a989a" />)}
      {[-2.5, 3.5].map(x => <Block key={x} position={[x, 1.75, 4.9]} size={[0.12, 3.5, 0.12]} color="#52646a" />)}
      <Block position={[width / 2 + 0.9, 1.6, -2.2]} size={[1.8, 3.2, 3]} color="#9caaa9" />
    </>}
  </group>
}

export function SupermarketDistrict({ quality, rain, nightFactor }: { quality: Quality; rain: number; nightFactor: number }) {
  const crossing = SUPERMARKET.crossing
  const walk = SUPERMARKET.frontWalk
  const transfer = SUPERMARKET.accessibleTransfer
  const streetArrow = CITY_ROADS.supermarketAccess.points[(SUPERMARKET.accessEntryIndex + SUPERMARKET.accessExitIndex) / 2]
  const ramp = useMemo(() => {
    const half = crossing.width / 2
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      crossing.x - half, 0.052, crossing.rampStartZ, crossing.x + half, 0.052, crossing.rampStartZ,
      crossing.x - half, 0.2, crossing.rampEndZ, crossing.x + half, 0.2, crossing.rampEndZ,
    ], 3))
    geometry.setIndex([0, 2, 1, 1, 2, 3]); geometry.computeVertexNormals()
    return geometry
  }, [crossing])
  useEffect(() => () => ramp.dispose(), [ramp])
  return <group>
    <mesh position={SUPERMARKET.parkingCenter} rotation={[-Math.PI / 2, 0, 0]} scale={[...SUPERMARKET.parkingSize, 1]}>
      <primitive object={UNIT_PLANE} attach="geometry" />
      <meshStandardMaterial color={rain > 0.1 ? '#293639' : '#384245'} roughness={0.9 - rain * 0.6} metalness={rain * 0.18} />
    </mesh>
    <SupermarketBuilding quality={quality} nightFactor={nightFactor} />
    {SUPERMARKET_PARKING_SPOTS.map(spot => <ParkingSpace key={spot.id} spot={spot} />)}
    <Block position={walk.center} size={walk.size} color="#a6afaa" />
    {/* Curbs stop at the flush pedestrian ramp. */}
    {[-1, 1].map(side => {
      const edge = walk.center[0] + side * walk.size[0] / 2
      const gap = crossing.x + side * crossing.width / 2
      return <Block key={side} position={[(edge + gap) / 2, 0.12, walk.center[2] + walk.size[2] / 2 - 0.05]} size={[Math.abs(edge - gap), 0.24, 0.12]} color="#bfc6bd" />
    })}
    <mesh geometry={ramp}>
      <meshStandardMaterial color="#a6afaa" roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
    <Block position={[crossing.x, 0.04, SUPERMARKET.rowZ.street]} size={[crossing.width, 0.025, 5]} color="#a6afaa" />
    <Block position={[crossing.x, 0.04, SUPERMARKET.rowZ.facade]} size={[crossing.width, 0.025, 5]} color="#a6afaa" />
    {/* Crossing the drive aisle is the only unprotected part of this walking route. */}
    {Array.from({ length: 8 }, (_, i) => <Block key={i} position={[crossing.x, 0.046, SUPERMARKET.aisleZ - SUPERMARKET.aisleWidth / 2 + (i + 0.5) * SUPERMARKET.aisleWidth / 8]} size={[crossing.width, 0.004, 0.4]} color="#f5f0dd" />)}
    <mesh position={transfer.center} rotation={[-Math.PI / 2, 0, 0]} scale={[...transfer.size, 1]}>
      <primitive object={UNIT_PLANE} attach="geometry" />
      <meshBasicMaterial color="#2c729b" />
    </mesh>
    {Array.from({ length: 9 }, (_, i) => <group key={i} position={[transfer.center[0], 0.05, transfer.center[2] - 2.2 + i * 0.55]} rotation={[0, -0.4, 0]}>
      <Block position={[0, 0, 0]} size={[0.9, 0.004, 0.055]} color="#e7e9da" />
    </group>)}
    <GroundArrow position={[streetArrow[0], 0.06, streetArrow[1] + 1.75]} rotationY={Math.PI / 2} />
    <GroundArrow position={[streetArrow[0], 0.06, streetArrow[1] - 1.75]} rotationY={-Math.PI / 2} />
    <GroundArrow position={[SUPERMARKET.entryX, 0.045, SUPERMARKET.parkingEntrance[1] - 1]} rotationY={Math.PI} />
    <GroundArrow position={[SUPERMARKET.exitX, 0.045, SUPERMARKET.parkingExit[1] - 2]} />
    {[-34, -17].map(x => <GroundArrow key={x} position={[x, 0.045, SUPERMARKET.aisleZ]} rotationY={Math.PI / 2} />)}
    <group position={SUPERMARKET.totem}>
      <Block position={[0, 2.3, 0]} size={[0.25, 4.6, 0.25]} color="#52646a" />
      <Block position={[0, 4.3, 0]} size={[5, 2.6, 0.2]} color="#35565b" />
      <Sign text="SUPERMERCADO" position={[0, 4.8, 0.12]} size={[4.8, 1]} />
      <Sign text="ABERTO" position={[0, 3.7, 0.12]} size={[3.6, 0.7]} />
    </group>
    {[{ text: 'ENTRADA', position: SUPERMARKET.entranceSign }, { text: 'SA?DA', position: SUPERMARKET.exitSign }].map(sign => <group key={sign.text} position={sign.position}>
      <Block position={[0, 0.8, 0]} size={[0.08, 1.6, 0.08]} color="#52646a" />
      <Sign text={sign.text} position={[0, 1.4, 0]} size={[2.5, 0.7]} />
    </group>)}
    {quality !== 'low' && <>
      <CartShelter quality={quality} />
      {SUPERMARKET.lamps.map((position, i) => <StreetLamp key={i} position={position} nightFactor={nightFactor} />)}
      <TrashBin position={SUPERMARKET.bins} />
      {quality === 'high' && SUPERMARKET.planters.map((position, i) => <Planter key={i} position={position} />)}
      {quality === 'high' && SUPERMARKET.bollards.map((position, i) => <Block key={i} position={position} size={[0.15, 0.8, 0.15]} color="#e7a142" />)}
    </>}
  </group>
}
