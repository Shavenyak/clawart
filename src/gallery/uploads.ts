import type { GalleryImage } from '../types'

export interface SquareCrop {
  sx: number
  sy: number
  sw: number
  sh: number
}

export function computeSquareCrop(width: number, height: number): SquareCrop {
  const size = Math.min(width, height)

  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    sw: size,
    sh: size,
  }
}

export function pickTextureSize(width: number, height: number, maxSize = 1024): number {
  return Math.min(maxSize, Math.min(width, height))
}

export async function loadUserImages(
  files: Iterable<File>,
  maxSize = 1024,
): Promise<GalleryImage[]> {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'))

  return Promise.all(
    imageFiles.map(async (file, index) => ({
      id: createUploadId(file, index),
      label: stripExtension(file.name),
      source: 'upload' as const,
      textureUrl: await normalizeImageFile(file, maxSize),
      orientation: 'square' as const,
    })),
  )
}

async function normalizeImageFile(file: File, maxSize: number): Promise<string> {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is not available.')
  }

  const crop = computeSquareCrop(image.width, image.height)
  const outputSize = pickTextureSize(image.width, image.height, maxSize)
  canvas.width = outputSize
  canvas.height = outputSize

  context.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    outputSize,
    outputSize,
  )

  return canvas.toDataURL('image/jpeg', 0.86)
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Unable to load image "${file.name}".`))
    }

    image.src = objectUrl
  })
}

function createUploadId(file: File, index: number): string {
  const base = stripExtension(file.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const uniqueSuffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now()}-${index}`

  return `upload-${base}-${uniqueSuffix}`
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}
