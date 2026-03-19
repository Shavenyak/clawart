export type ImageSource = 'placeholder' | 'upload'
export type FrameStyle = 'oak' | 'black' | 'white' | 'canvas'
export type ImageOrientation = 'portrait' | 'landscape' | 'square'

export interface MusicStation {
  id: string
  label: string
  genre: string
  description: string
  streamUrl: string
  sourceUrl: string
  accentColor: string
}

export interface GalleryImage {
  id: string
  label: string
  source: ImageSource
  textureUrl: string
  orientation?: ImageOrientation
}

export interface GalleryTile {
  id: string
  slotId?: string
  wallId?: string
  imageId: string
  width: number
  height: number
  x: number
  y: number
  frameStyle: FrameStyle
}

export type GalleryTileTemplate = Omit<GalleryTile, 'imageId'>

export interface WallAnchor {
  position: {
    x: number
    y: number
    z: number
  }
  rotationY: number
}

export interface GalleryWall {
  id: string
  title: string
  wallId: string
  anchor: WallAnchor
  tiles: GalleryTile[]
}

export interface GalleryWallTemplate extends Omit<GalleryWall, 'tiles'> {
  tiles: GalleryTileTemplate[]
}

export interface ThemeConfig {
  frameColor: string
  frameAccent: string
  matColor: string
  wallShadowColor: string
  plaqueColor: string
  plaqueTextColor: string
  roomColors: {
    wall: string
    trim: string
    floorBase: string
    ceiling: string
  }
}

export interface CameraPose {
  position: {
    x: number
    y: number
    z: number
  }
  yaw: number
  pitch: number
}

export interface Viewpoint {
  id: string
  label: string
  pose: CameraPose
}

export type GallerySlotAssignments = Record<string, string>

export interface GalleryTilePlacement {
  wallId: string
  x: number
  y: number
}

export type GalleryTilePlacements = Record<string, GalleryTilePlacement>

export interface GalleryState {
  uploadedImages: GalleryImage[]
  playerName?: string
  slotAssignments?: GallerySlotAssignments
  tilePlacements?: GalleryTilePlacements
  activeStationId?: string
}
