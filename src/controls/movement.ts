export interface RectBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface RectObstacle {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface FlatPosition {
  x: number
  z: number
}

export function clampPositionToBounds(
  position: FlatPosition,
  radius: number,
  bounds: RectBounds,
): FlatPosition {
  return {
    x: clamp(position.x, bounds.minX + radius, bounds.maxX - radius),
    z: clamp(position.z, bounds.minZ + radius, bounds.maxZ - radius),
  }
}

export function resolveMovement(
  candidate: FlatPosition,
  radius: number,
  bounds: RectBounds,
  obstacles: RectObstacle[],
): FlatPosition {
  let next = clampPositionToBounds(candidate, radius, bounds)

  for (const obstacle of obstacles) {
    if (!intersectsObstacle(next, radius, obstacle)) {
      continue
    }

    const leftOverlap = Math.abs(next.x + radius - obstacle.minX)
    const rightOverlap = Math.abs(obstacle.maxX - (next.x - radius))
    const topOverlap = Math.abs(next.z + radius - obstacle.minZ)
    const bottomOverlap = Math.abs(obstacle.maxZ - (next.z - radius))
    const minimumOverlap = Math.min(leftOverlap, rightOverlap, topOverlap, bottomOverlap)

    if (minimumOverlap === leftOverlap) {
      next = { ...next, x: obstacle.minX - radius }
      continue
    }

    if (minimumOverlap === rightOverlap) {
      next = { ...next, x: obstacle.maxX + radius }
      continue
    }

    if (minimumOverlap === topOverlap) {
      next = { ...next, z: obstacle.minZ - radius }
      continue
    }

    next = { ...next, z: obstacle.maxZ + radius }
  }

  return clampPositionToBounds(next, radius, bounds)
}

function intersectsObstacle(
  position: FlatPosition,
  radius: number,
  obstacle: RectObstacle,
): boolean {
  return (
    position.x + radius > obstacle.minX &&
    position.x - radius < obstacle.maxX &&
    position.z + radius > obstacle.minZ &&
    position.z - radius < obstacle.maxZ
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
