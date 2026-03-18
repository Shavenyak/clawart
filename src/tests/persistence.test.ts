import { beforeEach, describe, expect, it } from 'vitest'
import { clearGalleryState, restoreGalleryState, saveGalleryState } from '../gallery/persistence'

describe('gallery persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('restores uploaded images after saving', () => {
    saveGalleryState({
      uploadedImages: [
        {
          id: 'upload-1',
          label: 'Family',
          source: 'upload',
          textureUrl: 'data:image/jpeg;base64,abc',
        },
      ],
      playerName: 'Oded',
      tilePlacements: {
        'slot-a': {
          wallId: 'north',
          x: 1.4,
          y: -0.2,
        },
      },
    }, 'family-room')

    expect(restoreGalleryState('family-room')).toEqual({
      uploadedImages: [
        {
          id: 'upload-1',
          label: 'Family',
          source: 'upload',
          textureUrl: 'data:image/jpeg;base64,abc',
        },
      ],
      playerName: 'Oded',
      tilePlacements: {
        'slot-a': {
          wallId: 'north',
          x: 1.4,
          y: -0.2,
        },
      },
    })
  })

  it('clears saved gallery state', () => {
    saveGalleryState({
      uploadedImages: [
        {
          id: 'upload-1',
          label: 'Family',
          source: 'upload',
          textureUrl: 'data:image/jpeg;base64,abc',
        },
      ],
    }, 'family-room')
    clearGalleryState('family-room')

    expect(restoreGalleryState('family-room')).toBeNull()
  })
})
