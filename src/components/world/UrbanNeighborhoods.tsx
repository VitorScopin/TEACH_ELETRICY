import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { URBAN_LOTS, AVENUE_FURNITURE } from './urbanLayout'
import { Tree, StreetLamp } from './StreetFurniture'

function Residence({ lot, nightFactor, detail }: { lot: typeof URBAN_LOTS[number]; nightFactor: number; detail: boolean }) {
  const windows = useRef<THREE.InstancedMesh>(null)
  const frames = useMemo(() => {
    const transforms: THREE.Matrix4[] = []
    const dummy = new THREE.Object3D()
    for (let y = 1.7; y < lot.height - 0.5; y += 1.8) {
      for (const x of [-1.9, 0, 1.9]) {
        for (const side of [-1, 1]) {
          dummy.position.set(x, y, side * 3.51)
          dummy.rotation.set(0, side === 1 ? 0 : Math.PI, 0)
          dummy.updateMatrix(); transforms.push(dummy.matrix.clone())
        }
      }
    }
    return transforms
  }, [lot.height])
  useLayoutEffect(() => {
    if (!windows.current) return
    frames.forEach((matrix, index) => windows.current!.setMatrixAt(index, matrix))
    windows.current.instanceMatrix.needsUpdate = true
  }, [frames])
  return <group position={[lot.x, 0, lot.z]}>
    <mesh position={[0, 0.065, 0]}><boxGeometry args={[8, 0.13, 9]} /><meshStandardMaterial color="#a7aaa0" roughness={1} /></mesh>
    <mesh position={[0, lot.height / 2 + 0.14, 0]}><boxGeometry args={[6.5, lot.height, 7]} /><meshStandardMaterial color={lot.color} roughness={0.88} /></mesh>
    <mesh position={[0, lot.height + 0.26, 0]}><boxGeometry args={[6.8, 0.25, 7.3]} /><meshStandardMaterial color="#5d6666" roughness={0.9} /></mesh>
    <instancedMesh ref={windows} args={[undefined, undefined, frames.length]}>
      <planeGeometry args={[0.95, 1.05]} />
      <meshStandardMaterial color="#507780" emissive="#ffc978" emissiveIntensity={nightFactor * 0.85} roughness={0.4} />
    </instancedMesh>
    <mesh position={[0, 0.95, 3.53]}><boxGeometry args={[0.85, 1.6, 0.08]} /><meshStandardMaterial color="#39484b" /></mesh>
    {detail && <>
      <mesh position={[1.4, lot.height + 0.7, -1]}><boxGeometry args={[1.3, 0.8, 1.8]} /><meshStandardMaterial color="#b8bab4" /></mesh>
      <Tree position={[-3.55, 0.14, 3.7]} scale={0.65} />
    </>}
  </group>
}

export function UrbanNeighborhoods({ quality, nightFactor }: { quality: 'low' | 'medium' | 'high'; nightFactor: number }) {
  return <group>
    {URBAN_LOTS.map((lot, i) => <Residence key={i} lot={lot} nightFactor={nightFactor} detail={quality === 'high'} />)}
    {quality !== 'low' && AVENUE_FURNITURE.map((p, i) => i % 2
      ? <StreetLamp key={`lamp-${i}`} position={[p.x, 0.06, p.z]} nightFactor={nightFactor} />
      : <Tree key={`tree-${i}`} position={[p.x, 0.06, p.z]} scale={0.8} />)}
  </group>
}
