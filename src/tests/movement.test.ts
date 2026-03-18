import { describe, expect, it } from 'vitest'
import { clampPositionToBounds, resolveMovement } from '../controls/movement'

describe('museum movement bounds', () => {
  it('clamps the position to the room boundary', () => {
    expect(
      clampPositionToBounds(
        { x: 10, z: -10 },
        0.5,
        { minX: -4, maxX: 4, minZ: -3, maxZ: 3 },
      ),
    ).toEqual({ x: 3.5, z: -2.5 })
  })

  it('pushes the camera outside a rectangular obstacle', () => {
    expect(
      resolveMovement(
        { x: 0.2, z: 0.1 },
        0.4,
        { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
        [{ minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 }],
      ),
    ).toEqual({ x: 0.9, z: 0.1 })
  })
})
