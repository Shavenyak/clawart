import type {
  GalleryImage,
  GalleryWall,
  GalleryWallTemplate,
  GalleryTileTemplate,
  ImageOrientation,
} from '../types'

export function mapImagesToWalls(
  templates: GalleryWallTemplate[],
  images: GalleryImage[],
): GalleryWall[] {
  if (images.length === 0) {
    return templates.map((template) => ({
      ...template,
      tiles: template.tiles.map((tile) => ({
        ...tile,
        imageId: '',
      })),
    }))
  }

  const steps = [5, 3, 7, 11]
  const offsets = [0, 4, 8, 12]
  const pools: Record<ImageOrientation, GalleryImage[]> = {
    portrait: images.filter((image) => getImageOrientation(image) === 'portrait'),
    landscape: images.filter((image) => getImageOrientation(image) === 'landscape'),
    square: images.filter((image) => getImageOrientation(image) === 'square'),
  }

  return templates.map((template, wallIndex) => ({
    ...template,
    tiles: template.tiles.map((tile, tileIndex) => {
      const preferredPool = pools[getTileOrientation(tile)]
      const pool = preferredPool.length > 0 ? preferredPool : images
      const offset = offsets[wallIndex % offsets.length] % pool.length
      const step = pickStride(pool.length, steps[wallIndex % steps.length])
      const image = pool[(offset + tileIndex * step) % pool.length]

      return {
        ...tile,
        imageId: image.id,
      }
    }),
  }))
}

function getImageOrientation(image: GalleryImage): ImageOrientation {
  return image.orientation ?? 'square'
}

function getTileOrientation(tile: GalleryTileTemplate): ImageOrientation {
  const aspect = tile.width / tile.height

  if (aspect > 1.08) {
    return 'landscape'
  }

  if (aspect < 0.92) {
    return 'portrait'
  }

  return 'square'
}

function pickStride(length: number, preferred: number): number {
  if (length <= 1) {
    return 1
  }

  const normalized = preferred % length

  if (normalized > 0 && greatestCommonDivisor(normalized, length) === 1) {
    return normalized
  }

  for (let candidate = 1; candidate < length; candidate += 1) {
    if (greatestCommonDivisor(candidate, length) === 1) {
      return candidate
    }
  }

  return 1
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a)
  let right = Math.abs(b)

  while (right !== 0) {
    const remainder = left % right
    left = right
    right = remainder
  }

  return left
}
