import * as THREE from 'three'

export const STUDIO_CANVAS_SIZE = {
  width: 960,
  height: 640,
} as const

export const STUDIO_CANVAS_ASPECT = STUDIO_CANVAS_SIZE.width / STUDIO_CANVAS_SIZE.height

export const STUDIO_BRUSH_COLORS = [
  '#231822',
  '#eb2371',
  '#fb7a6b',
  '#efb93b',
  '#5aa777',
  '#3f74c8',
  '#efe8de',
] as const

export const STUDIO_BACKDROPS = [
  {
    id: 'blank',
    label: 'Blank Sheet',
  },
] as const

export type StudioBackdropId = (typeof STUDIO_BACKDROPS)[number]['id']

export function clampBrushSize(value: number): number {
  return Math.max(4, Math.min(42, Math.round(value)))
}

export function createStudioArtworkDataUrl(backdropId: StudioBackdropId = 'blank'): string {
  const canvas = document.createElement('canvas')
  canvas.width = STUDIO_CANVAS_SIZE.width
  canvas.height = STUDIO_CANVAS_SIZE.height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is required to create studio artwork.')
  }

  paintStudioBackdrop(context, backdropId, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export function paintStudioBackdrop(
  context: CanvasRenderingContext2D,
  backdropId: StudioBackdropId,
  width: number,
  height: number,
): void {
  void backdropId
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
}

export function createStudioPlaceholderTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = STUDIO_CANVAS_SIZE.width
  canvas.height = STUDIO_CANVAS_SIZE.height
  const context = canvas.getContext('2d')

  if (!context) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    return fallback
  }

  paintStudioBackdrop(context, 'blank', canvas.width, canvas.height)

  context.fillStyle = '#f4ecdf'
  context.fillRect(44, 44, canvas.width - 88, canvas.height - 88)

  context.strokeStyle = 'rgba(142, 113, 90, 0.18)'
  context.lineWidth = 4
  context.strokeRect(44, 44, canvas.width - 88, canvas.height - 88)

  context.fillStyle = '#6e584a'
  context.font = '700 44px "Mixtiles Sans", "Trebuchet MS", sans-serif'
  context.textAlign = 'center'
  context.fillText('Plain Studio Canvas', canvas.width / 2, 170)
  context.font = '500 28px "Mixtiles Sans", "Trebuchet MS", sans-serif'
  context.fillText('Click a wall canvas to open a fresh sheet.', canvas.width / 2, 220)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.anisotropy = 8
  return texture
}

export function createTextureFromArtworkDataUrl(
  artworkDataUrl: string,
  onLoad: (texture: THREE.Texture) => void,
  onError: () => void,
): void {
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => {
    const texture = new THREE.Texture(image)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.anisotropy = 8
    texture.needsUpdate = true
    onLoad(texture)
  }
  image.onerror = onError
  image.src = artworkDataUrl
}
