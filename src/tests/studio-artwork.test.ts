import { describe, expect, it } from 'vitest'
import { clampBrushSize } from '../studio/artwork'

describe('studio artwork helpers', () => {
  it('clamps brush sizes into the supported drawing range', () => {
    expect(clampBrushSize(2)).toBe(4)
    expect(clampBrushSize(19.4)).toBe(19)
    expect(clampBrushSize(100)).toBe(42)
  })
})
