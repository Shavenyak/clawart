import { describe, expect, it } from 'vitest'
import { mapImagesToWalls } from '../gallery/layout'
import type { GalleryImage, GalleryWallTemplate } from '../types'

const images: GalleryImage[] = [
  { id: 'one', label: 'One', source: 'placeholder', textureUrl: 'data:one' },
  { id: 'two', label: 'Two', source: 'placeholder', textureUrl: 'data:two' },
]

const templates: GalleryWallTemplate[] = [
  {
    id: 'wall-a',
    title: 'A',
    wallId: 'north',
    anchor: {
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
    },
    tiles: [
      { id: 'tile-a', width: 1, height: 1, x: 0, y: 0, frameStyle: 'oak' },
      { id: 'tile-b', width: 1, height: 1, x: 0, y: 0, frameStyle: 'oak' },
      { id: 'tile-c', width: 1, height: 1, x: 0, y: 0, frameStyle: 'oak' },
    ],
  },
  {
    id: 'wall-b',
    title: 'B',
    wallId: 'south',
    anchor: {
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
    },
    tiles: [
      { id: 'tile-d', width: 1, height: 1, x: 0, y: 0, frameStyle: 'white' },
      { id: 'tile-e', width: 1, height: 1, x: 0, y: 0, frameStyle: 'white' },
    ],
  },
]

describe('mapImagesToWalls', () => {
  it('rotates through available images and wraps when the template has more tiles than images', () => {
    const walls = mapImagesToWalls(templates, images)
    expect(walls[0].tiles.map((tile) => tile.imageId)).toEqual(['one', 'two', 'one'])
  })

  it('starts each wall from a different offset so walls do not all repeat the same first image', () => {
    const moreImages: GalleryImage[] = [
      { id: 'one', label: 'One', source: 'placeholder', textureUrl: 'data:one' },
      { id: 'two', label: 'Two', source: 'placeholder', textureUrl: 'data:two' },
      { id: 'three', label: 'Three', source: 'placeholder', textureUrl: 'data:three' },
      { id: 'four', label: 'Four', source: 'placeholder', textureUrl: 'data:four' },
      { id: 'five', label: 'Five', source: 'placeholder', textureUrl: 'data:five' },
    ]

    const walls = mapImagesToWalls(templates, moreImages)
    expect(walls[0].tiles[0].imageId).toBe('one')
    expect(walls[1].tiles[0].imageId).toBe('five')
  })

  it('prefers portrait, landscape, and square image pools that match each frame shape', () => {
    const orientedImages: GalleryImage[] = [
      { id: 'landscape', label: 'Landscape', source: 'placeholder', textureUrl: 'data:landscape', orientation: 'landscape' },
      { id: 'portrait', label: 'Portrait', source: 'placeholder', textureUrl: 'data:portrait', orientation: 'portrait' },
      { id: 'square', label: 'Square', source: 'placeholder', textureUrl: 'data:square', orientation: 'square' },
    ]
    const orientedTemplates: GalleryWallTemplate[] = [
      {
        id: 'wall-c',
        title: 'C',
        wallId: 'east',
        anchor: {
          position: { x: 0, y: 0, z: 0 },
          rotationY: 0,
        },
        tiles: [
          { id: 'tile-f', width: 0.7, height: 1, x: 0, y: 0, frameStyle: 'black' },
          { id: 'tile-g', width: 1.2, height: 0.8, x: 0, y: 0, frameStyle: 'black' },
          { id: 'tile-h', width: 0.8, height: 0.8, x: 0, y: 0, frameStyle: 'black' },
        ],
      },
    ]

    const walls = mapImagesToWalls(orientedTemplates, orientedImages)
    expect(walls[0].tiles.map((tile) => tile.imageId)).toEqual(['portrait', 'landscape', 'square'])
  })

  it('leaves image ids empty when there are no images', () => {
    const walls = mapImagesToWalls(templates, [])
    expect(walls[0].tiles.map((tile) => tile.imageId)).toEqual(['', '', ''])
  })
})
