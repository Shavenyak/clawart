import { describe, expect, it } from 'vitest'
import {
  buildGalleryWalls,
  createDefaultTilePlacements,
  migrateSlotAssignmentsToTilePlacements,
  normalizeTilePlacements,
} from '../gallery/arrangement'
import type { GalleryImage, GalleryWallTemplate } from '../types'

const images: GalleryImage[] = [
  { id: 'landscape', label: 'Landscape', source: 'placeholder', textureUrl: 'data:1', orientation: 'landscape' },
  { id: 'portrait', label: 'Portrait', source: 'placeholder', textureUrl: 'data:2', orientation: 'portrait' },
  { id: 'square', label: 'Square', source: 'placeholder', textureUrl: 'data:3', orientation: 'square' },
]

const templates: GalleryWallTemplate[] = [
  {
    id: 'wall-a',
    title: 'North',
    wallId: 'north',
    anchor: {
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
    },
    tiles: [
      { id: 'slot-a', width: 1.2, height: 0.8, x: -1, y: 0.5, frameStyle: 'oak' },
      { id: 'slot-b', width: 0.7, height: 1, x: 1, y: 0.5, frameStyle: 'white' },
    ],
  },
  {
    id: 'wall-b',
    title: 'East',
    wallId: 'east',
    anchor: {
      position: { x: 4, y: 0, z: 0 },
      rotationY: Math.PI / 2,
    },
    tiles: [
      { id: 'slot-c', width: 0.8, height: 0.8, x: 0, y: 0, frameStyle: 'black' },
    ],
  },
]

describe('gallery arrangement helpers', () => {
  it('creates a default placement for each tile item', () => {
    expect(createDefaultTilePlacements(templates)).toEqual({
      'slot-a': { wallId: 'north', x: -1, y: 0.5 },
      'slot-b': { wallId: 'north', x: 1, y: 0.5 },
      'slot-c': { wallId: 'east', x: 0, y: 0 },
    })
  })

  it('renders tiles at their custom wall positions', () => {
    const walls = buildGalleryWalls(templates, images, {
      'slot-a': { wallId: 'east', x: 0.4, y: -0.2 },
      'slot-b': { wallId: 'north', x: -1.2, y: 0.9 },
      'slot-c': { wallId: 'north', x: 1.1, y: -0.3 },
    })

    expect(walls[0].tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'slot-b', wallId: 'north', x: -1.2, y: 0.9 }),
        expect.objectContaining({ id: 'slot-c', wallId: 'north', x: 1.1, y: -0.3 }),
      ]),
    )
    expect(walls[1].tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'slot-a', wallId: 'east', x: 0.4, y: -0.2 }),
      ]),
    )
  })

  it('lets specific tiles override their assigned image without disturbing the rest of the wall', () => {
    const walls = buildGalleryWalls(
      templates,
      images,
      createDefaultTilePlacements(templates),
      {
        'slot-b': {
          id: 'custom-upload',
          label: 'Custom Portrait',
          source: 'upload',
          textureUrl: 'data:custom',
          orientation: 'portrait',
        },
      },
    )

    expect(walls[0].tiles.find((tile) => tile.id === 'slot-b')?.imageId).toBe('custom-upload')
    expect(walls[0].tiles.find((tile) => tile.id === 'slot-a')?.imageId).toBe('landscape')
  })

  it('normalizes invalid placements back to defaults', () => {
    expect(
      normalizeTilePlacements(templates, {
        'slot-a': { wallId: 'east', x: 0.2, y: 0.1 },
        'slot-b': { wallId: 'missing', x: 4, y: 8 },
        'slot-c': { wallId: 'north', x: Number.NaN, y: 0 },
      }),
    ).toEqual({
      'slot-a': { wallId: 'east', x: 0.2, y: 0.1 },
      'slot-b': { wallId: 'north', x: 1, y: 0.5 },
      'slot-c': { wallId: 'east', x: 0, y: 0 },
    })
  })

  it('migrates old slot swaps into free placements', () => {
    expect(
      migrateSlotAssignmentsToTilePlacements(templates, images, {
        'slot-a': 'slot-c',
        'slot-b': 'slot-b',
        'slot-c': 'slot-a',
      }),
    ).toEqual({
      'slot-a': { wallId: 'east', x: 0, y: 0 },
      'slot-b': { wallId: 'north', x: 1, y: 0.5 },
      'slot-c': { wallId: 'north', x: -1, y: 0.5 },
    })
  })
})
