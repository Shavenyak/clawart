import * as THREE from 'three'
import { ROOM_DIMENSIONS } from '../data/layouts'
import type { RectObstacle } from '../controls/movement'
import { createTextureFromArtworkDataUrl } from '../studio/artwork'
import type { StudioCanvasArtworks } from '../types'

export interface InteractiveStudioCanvas {
  id: string
  label: string
  hitArea: THREE.Mesh
  halo: THREE.Mesh
  haloMaterial: THREE.MeshBasicMaterial
}

export interface CanvasStudioRuntime {
  group: THREE.Group
  obstacles: RectObstacle[]
  canvases: InteractiveStudioCanvas[]
}

export interface CanvasSpec {
  id: string
  label: string
  wall: 'north' | 'south' | 'east' | 'west'
  x: number
  y: number
  width: number
  height: number
}

export const CANVAS_SPECS: CanvasSpec[] = [
  { id: 'canvas-north-hero', label: 'Hero Canvas', wall: 'north', x: 0, y: 0.2, width: 2.45, height: 1.5 },
  { id: 'canvas-east-top', label: 'East Canvas One', wall: 'east', x: -1.18, y: 0.78, width: 1.1, height: 0.82 },
  { id: 'canvas-east-bottom', label: 'East Canvas Two', wall: 'east', x: 0.92, y: -0.2, width: 1.25, height: 0.96 },
  { id: 'canvas-west-top', label: 'West Canvas One', wall: 'west', x: -1.1, y: 0.74, width: 1.2, height: 0.9 },
  { id: 'canvas-west-bottom', label: 'West Canvas Two', wall: 'west', x: 0.94, y: -0.12, width: 1.18, height: 0.88 },
  { id: 'canvas-south-left', label: 'South Canvas One', wall: 'south', x: -1.78, y: 0.5, width: 0.92, height: 0.72 },
  { id: 'canvas-south-middle', label: 'South Canvas Two', wall: 'south', x: 0, y: 0.38, width: 1.28, height: 0.92 },
  { id: 'canvas-south-right', label: 'South Canvas Three', wall: 'south', x: 1.78, y: 0.5, width: 0.92, height: 0.72 },
]

export function createCanvasStudioRoom(
  studioCanvasArtworks: StudioCanvasArtworks,
): CanvasStudioRuntime {
  const group = new THREE.Group()
  group.name = 'canvas-studio-room'

  const canvases = CANVAS_SPECS.map((spec) => createWallCanvas(spec, studioCanvasArtworks[spec.id]))
  canvases.forEach((entry) => group.add(entry.object))

  group.add(createCenterBench())
  group.add(createSideTable(-2.7, 2.65))
  group.add(createSideTable(2.7, 2.65))

  return {
    group,
    canvases: canvases.map(({ interactiveCanvas }) => interactiveCanvas),
    obstacles: [
      { minX: -1.45, maxX: 1.45, minZ: -0.78, maxZ: 0.78 },
      { minX: -3.25, maxX: -2.1, minZ: 2.1, maxZ: 3.15 },
      { minX: 2.1, maxX: 3.25, minZ: 2.1, maxZ: 3.15 },
    ],
  }
}

function createWallCanvas(
  spec: CanvasSpec,
  artwork: string | undefined,
): { object: THREE.Group; interactiveCanvas: InteractiveStudioCanvas } {
  const group = new THREE.Group()
  const { position, rotationY } = resolveWallAnchor(spec.wall)
  group.position.set(position.x, position.y, position.z)
  group.rotation.y = rotationY

  const root = new THREE.Group()
  root.position.set(spec.x, spec.y, 0.016)
  group.add(root)

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.width + 0.14, spec.height + 0.14),
    new THREE.MeshBasicMaterial({
      color: '#8b715f',
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    }),
  )
  shadow.position.set(0.018, -0.018, -0.01)
  root.add(shadow)

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width + 0.18, spec.height + 0.18, 0.06),
    new THREE.MeshStandardMaterial({
      color: '#faf5ee',
      roughness: 0.76,
    }),
  )
  shell.castShadow = true
  shell.receiveShadow = true
  root.add(shell)

  const paperMaterial = new THREE.MeshBasicMaterial({
    color: '#fffdf9',
  })

  if (artwork) {
    createTextureFromArtworkDataUrl(
      artwork,
      (texture) => {
        paperMaterial.map = texture
        paperMaterial.needsUpdate = true
      },
      () => {
        paperMaterial.color.set('#fffdf9')
        paperMaterial.needsUpdate = true
      },
    )
  }

  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.width, spec.height),
    paperMaterial,
  )
  paper.position.z = 0.032
  root.add(paper)

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: '#eb2371',
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.width + 0.09, spec.height + 0.09),
    haloMaterial,
  )
  halo.position.z = 0.036
  halo.visible = false
  root.add(halo)

  const hitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.width + 0.14, spec.height + 0.14),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  hitArea.position.z = 0.04
  hitArea.userData.studioCanvasId = spec.id
  root.add(hitArea)

  return {
    object: group,
    interactiveCanvas: {
      id: spec.id,
      label: spec.label,
      hitArea,
      halo,
      haloMaterial,
    },
  }
}

function resolveWallAnchor(
  wall: CanvasSpec['wall'],
): {
  position: { x: number; y: number; z: number }
  rotationY: number
} {
  switch (wall) {
    case 'east':
      return {
        position: { x: ROOM_DIMENSIONS.width / 2 - 0.04, y: 2.08, z: -0.15 },
        rotationY: -Math.PI / 2,
      }
    case 'west':
      return {
        position: { x: -ROOM_DIMENSIONS.width / 2 + 0.04, y: 2.08, z: -0.15 },
        rotationY: Math.PI / 2,
      }
    case 'south':
      return {
        position: { x: 0, y: 2.08, z: ROOM_DIMENSIONS.depth / 2 - 0.04 },
        rotationY: Math.PI,
      }
    case 'north':
    default:
      return {
        position: { x: 0, y: 2.08, z: -ROOM_DIMENSIONS.depth / 2 + 0.04 },
        rotationY: 0,
      }
  }
}

function createCenterBench(): THREE.Group {
  const bench = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({
    color: '#8a6249',
    roughness: 0.62,
  })
  const fabric = new THREE.MeshStandardMaterial({
    color: '#efe6d9',
    roughness: 0.88,
  })

  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.92), fabric)
  seat.position.set(0, 0.52, 0.1)
  seat.castShadow = true
  seat.receiveShadow = true
  bench.add(seat)

  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 0.56), wood)
  frame.position.set(0, 0.3, 0.1)
  frame.castShadow = true
  frame.receiveShadow = true
  bench.add(frame)

  for (const x of [-0.84, 0.84]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.1), wood)
    leg.position.set(x, 0.22, 0.1)
    leg.castShadow = true
    bench.add(leg)
  }

  return bench
}

function createSideTable(x: number, z: number): THREE.Group {
  const table = new THREE.Group()
  table.position.set(x, 0, z)

  const wood = new THREE.MeshStandardMaterial({
    color: '#8a6249',
    roughness: 0.6,
  })
  const paper = new THREE.MeshStandardMaterial({
    color: '#fffaf1',
    roughness: 0.86,
  })

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.56), wood)
  top.position.y = 0.68
  top.castShadow = true
  top.receiveShadow = true
  table.add(top)

  for (const lx of [-0.28, 0.28]) {
    for (const lz of [-0.18, 0.18]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.66, 0.08), wood)
      leg.position.set(lx, 0.33, lz)
      leg.castShadow = true
      table.add(leg)
    }
  }

  const sketchbook = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.28), paper)
  sketchbook.position.set(0.08, 0.75, -0.04)
  sketchbook.rotation.y = 0.32
  sketchbook.castShadow = true
  table.add(sketchbook)

  return table
}
