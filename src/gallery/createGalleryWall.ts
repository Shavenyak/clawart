import * as THREE from 'three'
import type { GalleryImage, GalleryWall, GalleryTile, ThemeConfig } from '../types'

export interface InteractiveGalleryTile {
  wallId: string
  itemId: string
  imageId: string
  width: number
  height: number
  object: THREE.Group
  hitArea: THREE.Mesh
  highlight: THREE.Mesh
}

export function createGalleryWall(
  wall: GalleryWall,
  images: GalleryImage[],
  theme: ThemeConfig,
): { group: THREE.Group; interactiveTiles: InteractiveGalleryTile[] } {
  const wallGroup = new THREE.Group()
  wallGroup.name = `gallery-wall:${wall.id}`
  wallGroup.position.set(wall.anchor.position.x, wall.anchor.position.y, wall.anchor.position.z)
  wallGroup.rotation.y = wall.anchor.rotationY

  const imageById = new Map(images.map((image) => [image.id, image]))
  const interactiveTiles: InteractiveGalleryTile[] = []

  for (const tile of wall.tiles) {
    const image = imageById.get(tile.imageId) ?? images[0]
    const tileRuntime = createTile(wall.wallId, tile, image?.textureUrl ?? '', theme)
    wallGroup.add(tileRuntime.object)
    interactiveTiles.push({
      ...tileRuntime,
      imageId: tile.imageId,
    })
  }

  return {
    group: wallGroup,
    interactiveTiles,
  }
}

function createTile(
  wallId: string,
  tile: GalleryTile,
  textureUrl: string,
  theme: ThemeConfig,
): Omit<InteractiveGalleryTile, 'imageId'> {
  const tileGroup = new THREE.Group()
  tileGroup.position.set(tile.x, tile.y, 0)

  const profile = getFrameProfile(tile.frameStyle, theme)
  const frameThickness = profile.frameThickness
  const frameDepth = profile.frameDepth
  const matPadding = Math.min(profile.matPadding, Math.min(tile.width, tile.height) * 0.08)

  if (profile.shadowOpacity > 0.003) {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(
        tile.width + frameThickness * profile.shadowSpread,
        tile.height + frameThickness * profile.shadowSpread,
      ),
      new THREE.MeshBasicMaterial({
        color: profile.shadowColor,
        transparent: true,
        opacity: profile.shadowOpacity,
        depthWrite: false,
      }),
    )
    shadow.position.set(profile.shadowOffsetX, profile.shadowOffsetY, -0.004)
    tileGroup.add(shadow)
  }

  if (profile.frameVisible) {
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: profile.frameColor,
      roughness: profile.frameRoughness,
      metalness: profile.frameMetalness,
    })
    const frame = createFrameRails(
      tile.width + frameThickness * 2,
      tile.height + frameThickness * 2,
      frameThickness,
      frameDepth,
      frameMaterial,
    )
    tileGroup.add(frame)

    if (profile.accentVisible) {
      const accentMaterial = new THREE.MeshStandardMaterial({
        color: profile.accentColor,
        roughness: profile.accentRoughness,
        metalness: profile.accentMetalness,
      })
      const accent = createFrameRails(
        tile.width + frameThickness * 1.08,
        tile.height + frameThickness * 1.08,
        Math.max(frameThickness * 0.34, 0.012),
        frameDepth * 0.46,
        accentMaterial,
      )
      accent.position.z = frameDepth * 0.18
      tileGroup.add(accent)
    }
  }

  if (matPadding > 0) {
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(tile.width + matPadding, tile.height + matPadding),
      new THREE.MeshStandardMaterial({
        color: profile.matColor,
        roughness: 0.92,
      }),
    )
    mat.position.z = frameDepth * 0.84
    tileGroup.add(mat)
  }

  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff',
  })
  loadCoverTexture(
    textureUrl,
    tile.width / tile.height,
    (loadedTexture) => {
      material.map = loadedTexture
      material.needsUpdate = true
    },
    () => {
      material.color.set('#dbc9b7')
      material.needsUpdate = true
    },
  )

  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(tile.width, tile.height),
    material,
  )
  photo.position.z = frameDepth * 0.92
  photo.castShadow = false
  photo.receiveShadow = true
  tileGroup.add(photo)

  const highlight = new THREE.Mesh(
    new THREE.PlaneGeometry(tile.width + frameThickness * 1.5, tile.height + frameThickness * 1.5),
    new THREE.MeshBasicMaterial({
      color: '#eb2371',
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  highlight.position.z = frameDepth + 0.004
  highlight.visible = false
  tileGroup.add(highlight)

  const hitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(tile.width + frameThickness * 2.2, tile.height + frameThickness * 2.2),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  hitArea.position.z = frameDepth + 0.01
  hitArea.userData.galleryItemId = tile.id
  hitArea.userData.galleryWallId = wallId
  tileGroup.userData.galleryItemId = tile.id
  tileGroup.userData.galleryWallId = wallId
  tileGroup.add(hitArea)

  return {
    wallId,
    itemId: tile.id,
    width: tile.width,
    height: tile.height,
    object: tileGroup,
    hitArea,
    highlight,
  }
}

function createFrameRails(
  totalWidth: number,
  totalHeight: number,
  railThickness: number,
  depth: number,
  material: THREE.Material,
): THREE.Group {
  const group = new THREE.Group()
  const horizontalLength = totalWidth
  const verticalLength = Math.max(totalHeight - railThickness * 2, 0.001)

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(horizontalLength, railThickness, depth),
    material,
  )
  top.position.set(0, totalHeight / 2 - railThickness / 2, depth / 2)
  top.castShadow = false
  top.receiveShadow = true
  group.add(top)

  const bottom = top.clone()
  bottom.position.y = -top.position.y
  group.add(bottom)

  const left = new THREE.Mesh(
    new THREE.BoxGeometry(railThickness, verticalLength, depth),
    material,
  )
  left.position.set(-(totalWidth / 2 - railThickness / 2), 0, depth / 2)
  left.castShadow = false
  left.receiveShadow = true
  group.add(left)

  const right = left.clone()
  right.position.x = -left.position.x
  group.add(right)

  return group
}

function getFrameProfile(frameStyle: GalleryTile['frameStyle'], theme: ThemeConfig): {
  frameThickness: number
  frameDepth: number
  frameVisible: boolean
  accentVisible: boolean
  frameColor: string
  accentColor: string
  matColor: string
  matPadding: number
  frameRoughness: number
  frameMetalness: number
  accentRoughness: number
  accentMetalness: number
  shadowColor: string
  shadowOpacity: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowSpread: number
} {
  switch (frameStyle) {
    case 'oak':
      return {
        frameThickness: 0.065,
        frameDepth: 0.05,
        frameVisible: true,
        accentVisible: true,
        frameColor: '#c39058',
        accentColor: '#9f6b3d',
        matColor: '#fbf4e9',
        matPadding: 0.018,
        frameRoughness: 0.62,
        frameMetalness: 0.03,
        accentRoughness: 0.56,
        accentMetalness: 0.01,
        shadowColor: theme.wallShadowColor,
        shadowOpacity: 0.15,
        shadowOffsetX: 0.018,
        shadowOffsetY: -0.018,
        shadowSpread: 1.7,
      }
    case 'black':
      return {
        frameThickness: 0.058,
        frameDepth: 0.048,
        frameVisible: true,
        accentVisible: true,
        frameColor: '#1e1b1a',
        accentColor: '#2f2b29',
        matColor: '#f7f3ea',
        matPadding: 0.026,
        frameRoughness: 0.84,
        frameMetalness: 0.02,
        accentRoughness: 0.72,
        accentMetalness: 0.01,
        shadowColor: '#2e2118',
        shadowOpacity: 0.12,
        shadowOffsetX: 0.016,
        shadowOffsetY: -0.016,
        shadowSpread: 1.55,
      }
    case 'white':
      return {
        frameThickness: 0.028,
        frameDepth: 0.016,
        frameVisible: true,
        accentVisible: false,
        frameColor: '#fffdfb',
        accentColor: '#fffdfb',
        matColor: '#fffefc',
        matPadding: 0.012,
        frameRoughness: 0.76,
        frameMetalness: 0.01,
        accentRoughness: 0.76,
        accentMetalness: 0.01,
        shadowColor: theme.wallShadowColor,
        shadowOpacity: 0.012,
        shadowOffsetX: 0.002,
        shadowOffsetY: -0.002,
        shadowSpread: 0.22,
      }
    case 'canvas':
      return {
        frameThickness: 0.012,
        frameDepth: 0.012,
        frameVisible: true,
        accentVisible: false,
        frameColor: '#fffdf9',
        accentColor: '#fffdf9',
        matColor: '#fffefc',
        matPadding: 0,
        frameRoughness: 0.74,
        frameMetalness: 0,
        accentRoughness: 0.74,
        accentMetalness: 0,
        shadowColor: theme.wallShadowColor,
        shadowOpacity: 0.008,
        shadowOffsetX: 0.0015,
        shadowOffsetY: -0.0015,
        shadowSpread: 0.12,
      }
    default:
      return {
        frameThickness: 0.06,
        frameDepth: 0.05,
        frameVisible: true,
        accentVisible: true,
        frameColor: theme.frameColor,
        accentColor: theme.frameAccent,
        matColor: theme.matColor,
        matPadding: 0.032,
        frameRoughness: 0.7,
        frameMetalness: 0.08,
        accentRoughness: 0.52,
        accentMetalness: 0.02,
        shadowColor: theme.wallShadowColor,
        shadowOpacity: 0.15,
        shadowOffsetX: 0.016,
        shadowOffsetY: -0.016,
        shadowSpread: 1.6,
      }
  }
}

function loadCoverTexture(
  textureUrl: string,
  planeAspect: number,
  onLoad: (texture: THREE.Texture) => void,
  onError: () => void,
): void {
  // createContainedPhotoTexture used to letterbox images here; the loader now crops to cover instead.
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => onLoad(createCoverPhotoTexture(image, planeAspect))
  image.onerror = onError
  image.src = textureUrl
}

function createCoverPhotoTexture(
  image: CanvasImageSource & {
    naturalWidth?: number
    naturalHeight?: number
    width?: number
    height?: number
  },
  planeAspect: number,
): THREE.Texture {
  const sourceWidth = image.naturalWidth ?? image.width
  const sourceHeight = image.naturalHeight ?? image.height

  if (!sourceWidth || !sourceHeight) {
    const fallbackTexture = new THREE.Texture()
    fallbackTexture.colorSpace = THREE.SRGBColorSpace
    fallbackTexture.generateMipmaps = false
    fallbackTexture.minFilter = THREE.LinearFilter
    fallbackTexture.magFilter = THREE.LinearFilter
    fallbackTexture.anisotropy = 8
    return fallbackTexture
  }

  const canvas = document.createElement('canvas')
  const targetWidth = planeAspect >= 1 ? 1200 : Math.round(1200 * planeAspect)
  const targetHeight = planeAspect >= 1 ? Math.round(1200 / planeAspect) : 1200
  canvas.width = Math.max(targetWidth, 320)
  canvas.height = Math.max(targetHeight, 320)

  const context = canvas.getContext('2d')

  if (!context) {
    const fallbackTexture = new THREE.Texture()
    fallbackTexture.colorSpace = THREE.SRGBColorSpace
    fallbackTexture.generateMipmaps = false
    fallbackTexture.minFilter = THREE.LinearFilter
    fallbackTexture.magFilter = THREE.LinearFilter
    fallbackTexture.anisotropy = 8
    return fallbackTexture
  }

  const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  const offsetX = (canvas.width - drawWidth) / 2
  const offsetY = (canvas.height - drawHeight) / 2

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)

  const canvasTexture = new THREE.CanvasTexture(canvas)
  canvasTexture.colorSpace = THREE.SRGBColorSpace
  canvasTexture.generateMipmaps = false
  canvasTexture.minFilter = THREE.LinearFilter
  canvasTexture.magFilter = THREE.LinearFilter
  canvasTexture.anisotropy = 8

  return canvasTexture
}
