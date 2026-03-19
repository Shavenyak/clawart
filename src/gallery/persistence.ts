import type {
  GalleryImage,
  GalleryState,
  GalleryTileImageAssignments,
  GalleryTilePlacement,
} from '../types'

const STORAGE_KEY_PREFIX = 'mixtiles-3d-museum/gallery-state'

export function saveGalleryState(state: GalleryState, roomId: string = 'local'): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(getStorageKey(roomId), JSON.stringify(state))
}

export function restoreGalleryState(roomId: string = 'local'): GalleryState | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(getStorageKey(roomId))

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GalleryState>
    const uploadedImages = Array.isArray(parsed.uploadedImages)
      ? parsed.uploadedImages.filter(isGalleryImage)
      : []
    const playerName =
      typeof parsed.playerName === 'string' && parsed.playerName.trim().length > 0
        ? parsed.playerName.trim()
        : undefined
    const slotAssignments = isStringRecord(parsed.slotAssignments) ? parsed.slotAssignments : undefined
    const tilePlacements = isPlacementRecord(parsed.tilePlacements) ? parsed.tilePlacements : undefined
    const tileImageAssignments = isTileImageAssignmentRecord(parsed.tileImageAssignments)
      ? parsed.tileImageAssignments
      : undefined
    const activeStationId =
      typeof parsed.activeStationId === 'string' && parsed.activeStationId.trim().length > 0
        ? parsed.activeStationId.trim()
        : undefined

    return {
      uploadedImages,
      playerName,
      slotAssignments,
      tilePlacements,
      tileImageAssignments,
      activeStationId,
    }
  } catch {
    return null
  }
}

export function clearGalleryState(roomId: string = 'local'): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(getStorageKey(roomId))
}

function getStorageKey(roomId: string): string {
  return `${STORAGE_KEY_PREFIX}/${sanitizeStorageSegment(roomId)}`
}

function sanitizeStorageSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-z0-9-_]/gi, '-')
  return normalized || 'local'
}

function isGalleryImage(value: unknown): value is GalleryImage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GalleryImage>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    (candidate.source === 'placeholder' || candidate.source === 'upload') &&
    typeof candidate.textureUrl === 'string' &&
    (candidate.orientation === undefined ||
      candidate.orientation === 'portrait' ||
      candidate.orientation === 'landscape' ||
      candidate.orientation === 'square')
  )
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every((entry) => typeof entry === 'string')
}

function isPlacementRecord(value: unknown): value is Record<string, GalleryTilePlacement> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every(isPlacement)
}

function isPlacement(value: unknown): value is GalleryTilePlacement {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<GalleryTilePlacement>

  return (
    typeof candidate.wallId === 'string' &&
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y)
  )
}

function isTileImageAssignmentRecord(value: unknown): value is GalleryTileImageAssignments {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every(isGalleryImage)
}
