import type {
  CameraPose,
  GalleryWallTemplate,
  ThemeConfig,
  Viewpoint,
} from '../types'
import type { RectBounds, RectObstacle } from '../controls/movement'

const roomWidth = 11.8
const roomDepth = 14.2
const halfWidth = roomWidth / 2
const halfDepth = roomDepth / 2

export const MUSEUM_THEME: ThemeConfig = {
  frameColor: '#efe4d4',
  frameAccent: '#d9c1a8',
  matColor: '#f8f2e8',
  wallShadowColor: '#7d5c46',
  plaqueColor: '#f4ede1',
  plaqueTextColor: '#5f4737',
  roomColors: {
    wall: '#fcf7ef',
    trim: '#ebe1d4',
    floorBase: '#d2b797',
    ceiling: '#fffdf8',
  },
}

export const ROOM_DIMENSIONS = {
  width: roomWidth,
  depth: roomDepth,
  height: 4.4,
}

export const ROOM_BOUNDS: RectBounds = {
  minX: -halfWidth + 0.72,
  maxX: halfWidth - 0.72,
  minZ: -halfDepth + 0.72,
  maxZ: halfDepth - 0.72,
}

export const ROOM_OBSTACLES: RectObstacle[] = [
  {
    minX: -1.55,
    maxX: 1.55,
    minZ: -0.62,
    maxZ: 0.62,
  },
]

export const INTRO_POSES = {
  start: {
    position: { x: 0, y: 1.66, z: 5.85 },
    yaw: 0,
    pitch: -0.04,
  } satisfies CameraPose,
  end: {
    position: { x: 2.8, y: 1.66, z: -4.1 },
    yaw: 0.72,
    pitch: -0.05,
  } satisfies CameraPose,
}

export const VIEWPOINTS: Viewpoint[] = [
  {
    id: 'hero',
    label: 'Oak Family Wall',
    pose: {
      position: { x: 2.8, y: 1.66, z: -4.1 },
      yaw: 0.72,
      pitch: -0.05,
    },
  },
  {
    id: 'east',
    label: 'Black Frame Wall',
    pose: {
      position: { x: 3.7, y: 1.66, z: 0.75 },
      yaw: Math.PI / 2,
      pitch: -0.04,
    },
  },
  {
    id: 'west',
    label: 'Photo Tile Grid',
    pose: {
      position: { x: -3.7, y: 1.66, z: 0.65 },
      yaw: -Math.PI / 2,
      pitch: -0.04,
    },
  },
  {
    id: 'south',
    label: 'White Centerpiece Wall',
    pose: {
      position: { x: 0, y: 1.66, z: -2.75 },
      yaw: Math.PI,
      pitch: -0.05,
    },
  },
  {
    id: 'radio',
    label: 'Listening Corner',
    pose: {
      position: { x: 2.95, y: 1.66, z: 3.45 },
      yaw: 2.38,
      pitch: -0.08,
    },
  },
]

export const WALL_TEMPLATES: GalleryWallTemplate[] = [
  {
    id: 'wall-north',
    title: 'Oak Family Wall',
    wallId: 'north',
    anchor: {
      position: { x: 0, y: 2.1, z: -halfDepth + 0.04 },
      rotationY: 0,
    },
    tiles: [
      { id: 'north-1', width: 1.24, height: 0.82, x: -1.3, y: 0.86, frameStyle: 'oak' },
      { id: 'north-2', width: 0.58, height: 0.86, x: 0.18, y: 0.78, frameStyle: 'oak' },
      { id: 'north-3', width: 0.78, height: 0.58, x: 1.46, y: 0.68, frameStyle: 'oak' },
      { id: 'north-4', width: 0.52, height: 0.52, x: -2.12, y: -0.38, frameStyle: 'oak' },
      { id: 'north-5', width: 0.82, height: 0.82, x: -0.82, y: -0.38, frameStyle: 'oak' },
      { id: 'north-6', width: 0.82, height: 1.08, x: 0.6, y: -0.42, frameStyle: 'oak' },
      { id: 'north-7', width: 0.52, height: 0.52, x: 1.86, y: -0.38, frameStyle: 'oak' },
    ],
  },
  {
    id: 'wall-east',
    title: 'Black Frame Wall',
    wallId: 'east',
    anchor: {
      position: { x: halfWidth - 0.04, y: 2.02, z: -0.5 },
      rotationY: -Math.PI / 2,
    },
    tiles: [
      { id: 'east-1', width: 0.42, height: 0.42, x: -0.78, y: 1.12, frameStyle: 'black' },
      { id: 'east-2', width: 0.62, height: 0.92, x: 0.54, y: 0.72, frameStyle: 'black' },
      { id: 'east-3', width: 0.76, height: 0.54, x: -0.62, y: 0.12, frameStyle: 'black' },
      { id: 'east-4', width: 0.5, height: 0.76, x: -0.74, y: -0.88, frameStyle: 'black' },
      { id: 'east-5', width: 0.76, height: 0.48, x: 0.62, y: -0.56, frameStyle: 'black' },
    ],
  },
  {
    id: 'wall-west',
    title: 'Photo Tile Grid',
    wallId: 'west',
    anchor: {
      position: { x: -halfWidth + 0.04, y: 2.08, z: -0.15 },
      rotationY: Math.PI / 2,
    },
    tiles: [
      { id: 'west-1', width: 0.48, height: 0.48, x: -1.05, y: 0.76, frameStyle: 'canvas' },
      { id: 'west-2', width: 0.48, height: 0.48, x: -0.35, y: 0.76, frameStyle: 'canvas' },
      { id: 'west-3', width: 0.48, height: 0.48, x: 0.35, y: 0.76, frameStyle: 'canvas' },
      { id: 'west-4', width: 0.48, height: 0.48, x: 1.05, y: 0.76, frameStyle: 'canvas' },
      { id: 'west-5', width: 0.48, height: 0.48, x: -1.05, y: 0, frameStyle: 'canvas' },
      { id: 'west-6', width: 0.48, height: 0.48, x: -0.35, y: 0, frameStyle: 'canvas' },
      { id: 'west-7', width: 0.48, height: 0.48, x: 0.35, y: 0, frameStyle: 'canvas' },
      { id: 'west-8', width: 0.48, height: 0.48, x: 1.05, y: 0, frameStyle: 'canvas' },
      { id: 'west-9', width: 0.48, height: 0.48, x: -1.05, y: -0.76, frameStyle: 'canvas' },
      { id: 'west-10', width: 0.48, height: 0.48, x: -0.35, y: -0.76, frameStyle: 'canvas' },
      { id: 'west-11', width: 0.48, height: 0.48, x: 0.35, y: -0.76, frameStyle: 'canvas' },
      { id: 'west-12', width: 0.48, height: 0.48, x: 1.05, y: -0.76, frameStyle: 'canvas' },
    ],
  },
  {
    id: 'wall-south',
    title: 'White Centerpiece Wall',
    wallId: 'south',
    anchor: {
      position: { x: 0, y: 2.02, z: halfDepth - 0.04 },
      rotationY: Math.PI,
    },
    tiles: [
      { id: 'south-1', width: 0.3, height: 0.3, x: -1.72, y: 1.24, frameStyle: 'white' },
      { id: 'south-2', width: 0.3, height: 0.3, x: -0.86, y: 1.24, frameStyle: 'white' },
      { id: 'south-3', width: 0.3, height: 0.3, x: 0, y: 1.24, frameStyle: 'white' },
      { id: 'south-4', width: 0.3, height: 0.3, x: 0.86, y: 1.24, frameStyle: 'white' },
      { id: 'south-5', width: 0.3, height: 0.3, x: 1.72, y: 1.24, frameStyle: 'white' },
      { id: 'south-6', width: 0.3, height: 0.3, x: -2.04, y: 0.46, frameStyle: 'white' },
      { id: 'south-7', width: 0.3, height: 0.3, x: -2.04, y: -0.46, frameStyle: 'white' },
      { id: 'south-8', width: 1.18, height: 0.76, x: 0, y: 0.06, frameStyle: 'white' },
      { id: 'south-9', width: 0.3, height: 0.3, x: 2.04, y: 0.46, frameStyle: 'white' },
      { id: 'south-10', width: 0.3, height: 0.3, x: 2.04, y: -0.46, frameStyle: 'white' },
      { id: 'south-11', width: 0.3, height: 0.3, x: -1.72, y: -1.1, frameStyle: 'white' },
      { id: 'south-12', width: 0.3, height: 0.3, x: -0.86, y: -1.1, frameStyle: 'white' },
      { id: 'south-13', width: 0.3, height: 0.3, x: 0, y: -1.1, frameStyle: 'white' },
      { id: 'south-14', width: 0.3, height: 0.3, x: 0.86, y: -1.1, frameStyle: 'white' },
      { id: 'south-15', width: 0.3, height: 0.3, x: 1.72, y: -1.1, frameStyle: 'white' },
    ],
  },
]
