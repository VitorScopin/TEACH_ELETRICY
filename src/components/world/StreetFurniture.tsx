export function Tree({
  position,
  scale = 1,
}: {
  position: [number, number, number]
  scale?: number
}) {
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

export function Planter({ position }: { position: [number, number, number] }) {
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

export function StreetLamp({
  position,
  nightFactor = 0,
}: {
  position: [number, number, number]
  nightFactor?: number
}) {
  const lit = Math.max(0.08, nightFactor)
  return (
    <group position={position}>
      <mesh position={[0, 1.75, 0]}>
        <cylinderGeometry args={[0.045, 0.065, 3.5, 7]} />
        <meshStandardMaterial color="#252d32" metalness={0.72} roughness={0.35} />
      </mesh>
      <mesh position={[0, 3.48, 0]}>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshStandardMaterial
          color={nightFactor > 0.15 ? '#fff2c4' : '#859096'}
          emissive="#ffd78a"
          emissiveIntensity={0.18 + lit * 4.2}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function Bench({
  position,
  rotationY = 0,
}: {
  position: [number, number, number]
  rotationY?: number
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[1.8, 0.12, 0.48]} />
        <meshStandardMaterial color="#6b4b32" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.76, 0.2]} rotation={[0.14, 0, 0]}>
        <boxGeometry args={[1.8, 0.65, 0.10]} />
        <meshStandardMaterial color="#6b4b32" roughness={0.92} />
      </mesh>
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]}>
          <boxGeometry args={[0.08, 0.44, 0.42]} />
          <meshStandardMaterial color="#3b4144" metalness={0.5} roughness={0.48} />
        </mesh>
      ))}
    </group>
  )
}

export function TrashBin({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.22, 0.25, 0.84, 10]} />
        <meshStandardMaterial color="#37454a" roughness={0.72} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.87, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.08, 10]} />
        <meshStandardMaterial color="#20282c" roughness={0.7} />
      </mesh>
    </group>
  )
}

export function BusStop({
  position,
  rotationY = 0,
  nightFactor = 0,
}: {
  position: [number, number, number]
  rotationY?: number
  nightFactor?: number
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 1.25, 0.42]}>
        <boxGeometry args={[3.2, 2.5, 0.12]} />
        <meshStandardMaterial color="#7fb3c4" transparent opacity={0.34} roughness={0.2} />
      </mesh>
      <mesh position={[0, 2.55, 0]}>
        <boxGeometry args={[3.4, 0.12, 1.25]} />
        <meshStandardMaterial color="#2e373c" metalness={0.38} roughness={0.45} />
      </mesh>
      {[-1.52, 1.52].map((x) => (
        <mesh key={x} position={[x, 1.28, 0]}>
          <boxGeometry args={[0.09, 2.55, 0.09]} />
          <meshStandardMaterial color="#414d53" metalness={0.55} roughness={0.38} />
        </mesh>
      ))}
      <mesh position={[0, 1.35, 0.35]}>
        <planeGeometry args={[1.55, 1.6]} />
        <meshStandardMaterial
          color="#2e8194"
          emissive="#35a9bf"
          emissiveIntensity={nightFactor * 0.7}
          roughness={0.42}
        />
      </mesh>
    </group>
  )
}
