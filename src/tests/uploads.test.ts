import { describe, expect, it } from 'vitest'
import { computeSquareCrop, pickTextureSize } from '../gallery/uploads'

describe('gallery upload helpers', () => {
  it('computes a centered square crop from landscape images', () => {
    expect(computeSquareCrop(2000, 1200)).toEqual({
      sx: 400,
      sy: 0,
      sw: 1200,
      sh: 1200,
    })
  })

  it('caps output textures at the requested maximum size', () => {
    expect(pickTextureSize(2200, 1400, 1024)).toBe(1024)
    expect(pickTextureSize(800, 900, 1024)).toBe(800)
  })
})
