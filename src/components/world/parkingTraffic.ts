import { SUPERMARKET } from './cityLayout'

type Position = { x: number; z: number }
type Pedestrian = { position: Position }
type Vehicle = { position: Position; visible: boolean; userData: { parkingMoving?: boolean } }

export function marketVehicleMustYield(position: Position, pedestrians: Iterable<Pedestrian>) {
  const crossing = SUPERMARKET.crossing
  if (Math.hypot(position.x - crossing.x, position.z - SUPERMARKET.aisleZ) >= 6.5) return false
  for (const pedestrian of pedestrians) {
    if (Math.abs(pedestrian.position.x - crossing.x) < crossing.width / 2 + 0.2 &&
        Math.abs(pedestrian.position.z - SUPERMARKET.aisleZ) < SUPERMARKET.aisleWidth / 2 + 0.3) return true
  }
  return false
}

export function marketPedestrianMustWait(position: Position, destinationZ: number, vehicles: Iterable<Vehicle>) {
  if (Math.abs(position.x - SUPERMARKET.crossing.x) >= 1.4) return false
  const distance = Math.abs(position.z - SUPERMARKET.aisleZ)
  const halfAisle = SUPERMARKET.aisleWidth / 2
  const approaching = Math.abs(destinationZ - SUPERMARKET.aisleZ) < distance ||
    (position.z - SUPERMARKET.aisleZ) * (destinationZ - SUPERMARKET.aisleZ) < 0
  // Once in the aisle, keep walking: vehicles wait, avoiding a mutual standstill.
  if (!approaching || distance < halfAisle + 0.3 || distance >= halfAisle + 1.2) return false
  for (const vehicle of vehicles) {
    if (vehicle.visible && vehicle.userData.parkingMoving &&
        Math.hypot(vehicle.position.x - SUPERMARKET.crossing.x, vehicle.position.z - SUPERMARKET.aisleZ) < 8) return true
  }
  return false
}
