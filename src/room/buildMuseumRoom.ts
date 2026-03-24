import * as THREE from 'three'
import {
  INTRO_POSES,
  MUSEUM_THEME,
  ROOM_BOUNDS,
  ROOM_DIMENSIONS,
  ROOM_OBSTACLES,
  VIEWPOINTS,
} from '../data/layouts'
import type { InteractiveGalleryTile } from '../gallery/createGalleryWall'
import { MUSIC_STATIONS } from '../audio/musicStations'
import type {
  CameraPose,
  GalleryImage,
  GalleryTileImageAssignments,
  GalleryTilePlacements,
  GalleryWall,
  TruthBoardState,
  Viewpoint,
} from '../types'
import type { RectBounds, RectObstacle } from '../controls/movement'
import {
  createMusicCorner,
  type InteractiveMusicControl,
} from './createMusicCorner'
import {
  createCanvasStudioRoom,
  type InteractiveStudioCanvas,
} from './createCanvasStudioRoom'
import type { StudioCanvasArtworks } from '../types'

export interface MuseumHotspot {
  id: string
  label: string
  pose: CameraPose
  object: THREE.Group
}

export interface InteractiveWallPlane {
  wallId: string
  width: number
  height: number
  mesh: THREE.Mesh
}

export interface MuseumRoom {
  group: THREE.Group
  bounds: RectBounds
  obstacles: RectObstacle[]
  hotspots: MuseumHotspot[]
  viewpoints: Viewpoint[]
  intro: {
    start: CameraPose
    end: CameraPose
  }
  defaultPose: CameraPose
  galleryWalls: GalleryWall[]
  interactiveTiles: InteractiveGalleryTile[]
  interactiveWalls: InteractiveWallPlane[]
  interactiveMusicControls: InteractiveMusicControl[]
  interactiveStudioCanvases: InteractiveStudioCanvas[]
}

export function buildMuseumRoom(
  _images: GalleryImage[],
  isTouchDevice: boolean,
  _tilePlacements?: GalleryTilePlacements,
  _tileImageAssignments: GalleryTileImageAssignments = {},
  studioCanvasArtworks: StudioCanvasArtworks = {},
  truthBoard?: TruthBoardState,
): MuseumRoom {
  const group = new THREE.Group()
  group.name = 'museum-room'

  const galleryWalls: GalleryWall[] = []
  const interactiveTiles: InteractiveGalleryTile[] = []
  const interactiveWalls: InteractiveWallPlane[] = []
  const musicCorner = createMusicCorner(MUSIC_STATIONS)
  void truthBoard
  const canvasStudio = createCanvasStudioRoom(studioCanvasArtworks)
  group.add(createLights())
  group.add(createArchitecture())
  group.add(canvasStudio.group)
  group.add(musicCorner.group)

  const hotspots = VIEWPOINTS.map((viewpoint) => createHotspot(viewpoint, isTouchDevice))
  hotspots.forEach((hotspot) => group.add(hotspot.object))

  return {
    group,
    bounds: ROOM_BOUNDS,
    obstacles: [...ROOM_OBSTACLES, musicCorner.obstacle, ...canvasStudio.obstacles],
    hotspots,
    viewpoints: VIEWPOINTS,
    intro: INTRO_POSES,
    defaultPose: INTRO_POSES.end,
    galleryWalls,
    interactiveTiles,
    interactiveWalls,
    interactiveMusicControls: musicCorner.controls,
    interactiveStudioCanvases: canvasStudio.canvases,
  }
}

function createArchitecture(): THREE.Group {
  const architecture = new THREE.Group()
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: MUSEUM_THEME.roomColors.wall,
    roughness: 0.93,
  })
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: MUSEUM_THEME.roomColors.trim,
    roughness: 0.8,
  })
  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: MUSEUM_THEME.roomColors.ceiling,
    roughness: 0.92,
  })
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: createFloorTexture(),
    roughness: 0.86,
  })

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_DIMENSIONS.width, ROOM_DIMENSIONS.depth),
    floorMaterial,
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  architecture.add(floor)

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_DIMENSIONS.width, ROOM_DIMENSIONS.depth),
    ceilingMaterial,
  )
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.y = ROOM_DIMENSIONS.height
  architecture.add(ceiling)

  architecture.add(
    createWall(ROOM_DIMENSIONS.width, ROOM_DIMENSIONS.height, 0, ROOM_DIMENSIONS.height / 2, -ROOM_DIMENSIONS.depth / 2, 0, wallMaterial),
    createWall(ROOM_DIMENSIONS.width, ROOM_DIMENSIONS.height, 0, ROOM_DIMENSIONS.height / 2, ROOM_DIMENSIONS.depth / 2, Math.PI, wallMaterial),
    createWall(ROOM_DIMENSIONS.depth, ROOM_DIMENSIONS.height, ROOM_DIMENSIONS.width / 2, ROOM_DIMENSIONS.height / 2, 0, -Math.PI / 2, wallMaterial),
    createWall(ROOM_DIMENSIONS.depth, ROOM_DIMENSIONS.height, -ROOM_DIMENSIONS.width / 2, ROOM_DIMENSIONS.height / 2, 0, Math.PI / 2, wallMaterial),
  )

  architecture.add(
    createTrim(ROOM_DIMENSIONS.width, 0.14, 0.06, 0, 0.07, -ROOM_DIMENSIONS.depth / 2 + 0.03, trimMaterial),
    createTrim(ROOM_DIMENSIONS.width, 0.14, 0.06, 0, 0.07, ROOM_DIMENSIONS.depth / 2 - 0.03, trimMaterial),
    createTrim(0.06, 0.14, ROOM_DIMENSIONS.depth, ROOM_DIMENSIONS.width / 2 - 0.03, 0.07, 0, trimMaterial),
    createTrim(0.06, 0.14, ROOM_DIMENSIONS.depth, -ROOM_DIMENSIONS.width / 2 + 0.03, 0.07, 0, trimMaterial),
  )

  return architecture
}

function createWall(
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  material: THREE.Material,
): THREE.Mesh {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  wall.position.set(x, y, z)
  wall.rotation.y = rotationY
  wall.receiveShadow = true
  return wall
}

function createTrim(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
  trim.position.set(x, y, z)
  trim.receiveShadow = true
  return trim
}

function createLights(): THREE.Group {
  const lights = new THREE.Group()
  lights.add(new THREE.HemisphereLight('#fff8ef', '#c5ac90', 1.12))
  lights.add(new THREE.AmbientLight('#fff0db', 0.38))

  const heroSpot = createSpotLight('#ffe8c8', 3.6, { x: 0.2, y: 4.1, z: -2.6 }, { x: 0, y: 1.7, z: -5.6 })
  const eastSpot = createSpotLight('#ffedd4', 2.45, { x: 3.4, y: 4.0, z: -0.6 }, { x: 5.1, y: 1.8, z: -1.2 })
  const westSpot = createSpotLight('#ffe7c6', 2.25, { x: -3.4, y: 4.0, z: -0.1 }, { x: -5.1, y: 1.9, z: -0.3 })
  const southSpot = createSpotLight('#fff0d8', 2.75, { x: 0.1, y: 4.05, z: 2.9 }, { x: 0, y: 1.85, z: 5.9 })

  lights.add(
    heroSpot.light,
    heroSpot.target,
    eastSpot.light,
    eastSpot.target,
    westSpot.light,
    westSpot.target,
    southSpot.light,
    southSpot.target,
  )
  return lights
}

function createSpotLight(
  color: string,
  intensity: number,
  position: { x: number; y: number; z: number },
  targetPosition: { x: number; y: number; z: number },
): { light: THREE.SpotLight; target: THREE.Object3D } {
  const light = new THREE.SpotLight(color, intensity, 18, Math.PI / 8, 0.46, 1)
  light.position.set(position.x, position.y, position.z)
  light.castShadow = true
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.bias = -0.00012
  light.target.position.set(targetPosition.x, targetPosition.y, targetPosition.z)

  return {
    light,
    target: light.target,
  }
}

function createHotspot(viewpoint: Viewpoint, visible: boolean): MuseumHotspot {
  const root = new THREE.Group()
  root.visible = visible
  root.position.set(viewpoint.pose.position.x, 0.02, viewpoint.pose.position.z)
  root.userData.hotspotId = viewpoint.id

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.3, 40),
    new THREE.MeshBasicMaterial({
      color: '#eb2371',
      transparent: true,
      opacity: 0.84,
      side: THREE.DoubleSide,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.userData.hotspotId = viewpoint.id
  root.add(ring)

  const center = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 30),
    new THREE.MeshBasicMaterial({
      color: '#fffaf6',
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    }),
  )
  center.rotation.x = -Math.PI / 2
  center.position.y = 0.001
  center.userData.hotspotId = viewpoint.id
  root.add(center)

  return {
    id: viewpoint.id,
    label: viewpoint.label,
    pose: viewpoint.pose,
    object: root,
  }
}

function createFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is required to create floor textures.')
  }

  context.fillStyle = MUSEUM_THEME.roomColors.floorBase
  context.fillRect(0, 0, canvas.width, canvas.height)

  const plankWidth = 64
  for (let x = 0; x < canvas.width; x += plankWidth) {
    const shade = x % (plankWidth * 2) === 0 ? 0.07 : -0.02
    const color = lightenColor('#d1b28a', shade)
    context.fillStyle = color
    context.fillRect(x, 0, plankWidth, canvas.height)
    context.strokeStyle = 'rgba(101, 70, 46, 0.12)'
    context.lineWidth = 2
    context.strokeRect(x, 0, plankWidth, canvas.height)
  }

  for (let y = 24; y < canvas.height; y += 72) {
    context.strokeStyle = 'rgba(101, 70, 46, 0.1)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(canvas.width, y)
    context.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3.5, 5.1)
  return texture
}

function lightenColor(hexColor: string, amount: number): string {
  const hex = hexColor.replace('#', '')
  const integer = Number.parseInt(hex, 16)
  const red = clampChannel(((integer >> 16) & 0xff) * (1 + amount))
  const green = clampChannel(((integer >> 8) & 0xff) * (1 + amount))
  const blue = clampChannel((integer & 0xff) * (1 + amount))

  return `rgb(${red}, ${green}, ${blue})`
}

function clampChannel(channel: number): number {
  return Math.max(0, Math.min(255, Math.round(channel)))
}
