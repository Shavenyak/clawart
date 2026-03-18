import { mapImagesToWalls } from './layout'
import type {
  GalleryImage,
  GallerySlotAssignments,
  GalleryTile,
  GalleryTilePlacement,
  GalleryTilePlacements,
  GalleryWall,
  GalleryWallTemplate,
} from '../types'

interface GalleryTileItem extends GalleryTile {
  wallId: string
}

export function createDefaultTilePlacements(
  templates: GalleryWallTemplate[],
): GalleryTilePlacements {
  const placements: GalleryTilePlacements = {}

  for (const template of templates) {
    for (const tile of template.tiles) {
      placements[tile.id] = {
        wallId: template.wallId,
        x: tile.x,
        y: tile.y,
      }
    }
  }

  return placements
}

export function buildGalleryWalls(
  templates: GalleryWallTemplate[],
  images: GalleryImage[],
  tilePlacements: GalleryTilePlacements = createDefaultTilePlacements(templates),
): GalleryWall[] {
  const assignedWalls = mapImagesToWalls(templates, images)
  const placements = normalizeTilePlacements(templates, tilePlacements)
  const items = assignedWalls.flatMap((wall) =>
    wall.tiles.map((tile) => ({
      ...tile,
      wallId: wall.wallId,
    })),
  )
  const groupedByWall = new Map<string, GalleryTile[]>()

  for (const template of templates) {
    groupedByWall.set(template.wallId, [])
  }

  for (const item of items) {
    const placement = placements[item.id]
    const wallTiles = groupedByWall.get(placement.wallId)

    if (!wallTiles) {
      continue
    }

    wallTiles.push({
      ...item,
      wallId: placement.wallId,
      x: placement.x,
      y: placement.y,
    })
  }

  return templates.map((template) => ({
    ...template,
    tiles: [...(groupedByWall.get(template.wallId) ?? [])].sort(compareTilesForRender),
  }))
}

export function normalizeTilePlacements(
  templates: GalleryWallTemplate[],
  tilePlacements: GalleryTilePlacements | undefined,
): GalleryTilePlacements {
  const defaults = createDefaultTilePlacements(templates)
  const validWallIds = new Set(templates.map((template) => template.wallId))
  const normalized: GalleryTilePlacements = {}

  for (const [itemId, defaultPlacement] of Object.entries(defaults)) {
    const candidate = tilePlacements?.[itemId]
    normalized[itemId] = isValidPlacement(candidate, validWallIds) ? candidate : defaultPlacement
  }

  return normalized
}

export function migrateSlotAssignmentsToTilePlacements(
  templates: GalleryWallTemplate[],
  images: GalleryImage[],
  slotAssignments: GallerySlotAssignments | undefined,
): GalleryTilePlacements {
  const defaults = createDefaultTilePlacements(templates)

  if (!slotAssignments) {
    return defaults
  }

  const assignedWalls = mapImagesToWalls(templates, images)
  const tileById = new Map<string, GalleryTileItem>()

  for (const wall of assignedWalls) {
    for (const tile of wall.tiles) {
      tileById.set(tile.id, {
        ...tile,
        wallId: wall.wallId,
      })
    }
  }

  const migrated = { ...defaults }

  for (const template of templates) {
    for (const slot of template.tiles) {
      const itemId = slotAssignments[slot.id] ?? slot.id
      const tile = tileById.get(itemId)

      if (!tile) {
        continue
      }

      migrated[tile.id] = {
        wallId: template.wallId,
        x: slot.x,
        y: slot.y,
      }
    }
  }

  return migrated
}

function isValidPlacement(
  candidate: GalleryTilePlacement | undefined,
  validWallIds: Set<string>,
): candidate is GalleryTilePlacement {
  return Boolean(
    candidate &&
      validWallIds.has(candidate.wallId) &&
      Number.isFinite(candidate.x) &&
      Number.isFinite(candidate.y),
  )
}

function compareTilesForRender(left: GalleryTile, right: GalleryTile): number {
  if (left.y !== right.y) {
    return right.y - left.y
  }

  return left.x - right.x
}
