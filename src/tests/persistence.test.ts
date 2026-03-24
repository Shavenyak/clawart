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
      tileImageAssignments: {
        'slot-a': {
          id: 'upload-frame-1',
          label: 'Targeted Frame',
          source: 'upload',
          textureUrl: 'data:image/jpeg;base64,frame',
          orientation: 'square',
        },
      },
      activeStationId: 'radio-rock',
      studioArtwork: 'data:image/png;base64,studio',
      studioCanvasArtworks: {
        'canvas-north-hero': 'data:image/png;base64,studio',
        'canvas-east-top': 'data:image/png;base64,secondary',
      },
      agentObjective: 'Find the shared truth',
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
      tileImageAssignments: {
        'slot-a': {
          id: 'upload-frame-1',
          label: 'Targeted Frame',
          source: 'upload',
          textureUrl: 'data:image/jpeg;base64,frame',
          orientation: 'square',
        },
      },
      activeStationId: 'radio-rock',
      studioArtwork: 'data:image/png;base64,studio',
      studioCanvasArtworks: {
        'canvas-north-hero': 'data:image/png;base64,studio',
        'canvas-east-top': 'data:image/png;base64,secondary',
      },
      agentObjective: 'Find the shared truth',
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
