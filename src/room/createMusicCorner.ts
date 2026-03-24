import * as THREE from 'three'
import { ROOM_DIMENSIONS } from '../data/layouts'
import type { RectObstacle } from '../controls/movement'
import type { MusicStation } from '../types'

const cornerPosition = new THREE.Vector3(
  ROOM_DIMENSIONS.width / 2 - 1.18,
  0,
  ROOM_DIMENSIONS.depth / 2 - 1.42,
)
const cornerRotationY = -Math.PI * 0.75

export interface InteractiveMusicControl {
  action: 'station' | 'stop'
  stationId: string | null
  label: string
  accentColor: string
  hitArea: THREE.Mesh
  button: THREE.Mesh
  buttonMaterial: THREE.MeshStandardMaterial
  halo: THREE.Mesh
  haloMaterial: THREE.MeshBasicMaterial
}

export interface MusicCornerRuntime {
  group: THREE.Group
  obstacle: RectObstacle
  controls: InteractiveMusicControl[]
}

export function createMusicCorner(stations: MusicStation[]): MusicCornerRuntime {
  const group = new THREE.Group()
  group.name = 'music-corner'
  group.position.copy(cornerPosition)
  group.rotation.y = cornerRotationY

  group.add(createCabinetBody())
  group.add(createFloorPad())
  group.add(createDisplayPanel(stations))
  group.add(createSpeakerArray(-0.48))
  group.add(createSpeakerArray(0.48))
  group.add(createMarquee())

  const controls = createStationControls(stations)
  controls.forEach((control) => group.add(control.halo, control.button, control.hitArea))

  return {
    group,
    controls,
    obstacle: {
      minX: cornerPosition.x - 0.92,
      maxX: cornerPosition.x + 0.92,
      minZ: cornerPosition.z - 0.92,
      maxZ: cornerPosition.z + 0.92,
    },
  }
}

function createCabinetBody(): THREE.Group {
  const group = new THREE.Group()

  const woodMaterial = new THREE.MeshStandardMaterial({
    color: '#7f5138',
    roughness: 0.62,
  })
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: '#f7efe5',
    roughness: 0.48,
    metalness: 0.02,
  })
  const brassMaterial = new THREE.MeshStandardMaterial({
    color: '#d3a869',
    roughness: 0.35,
    metalness: 0.08,
  })
  const screenFrameMaterial = new THREE.MeshStandardMaterial({
    color: '#24181d',
    roughness: 0.55,
  })
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: '#121016',
    emissive: '#6de6bb',
    emissiveIntensity: 0.18,
    roughness: 0.18,
    metalness: 0.04,
  })

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.22, 0.74), woodMaterial)
  base.position.set(0, 0.12, 0)
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.48, 1.02, 0.64), woodMaterial)
  cabinet.position.set(0, 0.72, -0.02)
  cabinet.castShadow = true
  cabinet.receiveShadow = true
  group.add(cabinet)

  const frontFace = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.86, 0.04), trimMaterial)
  frontFace.position.set(0, 0.76, 0.31)
  frontFace.castShadow = true
  frontFace.receiveShadow = true
  group.add(frontFace)

  const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.06), screenFrameMaterial)
  screenFrame.position.set(0, 1.0, 0.33)
  screenFrame.castShadow = true
  screenFrame.receiveShadow = true
  group.add(screenFrame)

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.3), screenMaterial)
  screen.position.set(0, 1.0, 0.365)
  group.add(screen)

  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 24), brassMaterial)
  dial.rotation.x = Math.PI / 2
  dial.position.set(0, 0.46, 0.35)
  dial.castShadow = true
  group.add(dial)

  for (const x of [-0.54, 0.54]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), trimMaterial)
    foot.position.set(x, 0.04, 0.18)
    foot.castShadow = true
    foot.receiveShadow = true
    group.add(foot)
  }

  return group
}

function createFloorPad(): THREE.Mesh {
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(1.02, 40),
    new THREE.MeshStandardMaterial({
      color: '#e8d1bf',
      roughness: 0.94,
    }),
  )
  rug.rotation.x = -Math.PI / 2
  rug.position.y = 0.01
  rug.receiveShadow = true
  return rug
}

function createDisplayPanel(stations: MusicStation[]): THREE.Mesh {
  const texture = createLabelTexture(stations)
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.5),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
    }),
  )
  panel.position.set(0, 0.78, 0.352)
  return panel
}

function createMarquee(): THREE.Group {
  const marquee = new THREE.Group()
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: '#fff7ee',
    roughness: 0.52,
  })
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: '#ff9fb6',
    emissive: '#ff4c86',
    emissiveIntensity: 0.4,
    roughness: 0.2,
  })

  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.18, 0.1), shellMaterial)
  shell.position.set(0, 1.45, 0.18)
  shell.castShadow = true
  shell.receiveShadow = true
  marquee.add(shell)

  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.1, 0.06), glowMaterial)
  glow.position.set(0, 1.45, 0.24)
  marquee.add(glow)

  return marquee
}

function createSpeakerArray(x: number): THREE.Group {
  const group = new THREE.Group()
  const grillMaterial = new THREE.MeshStandardMaterial({
    color: '#2b2126',
    roughness: 0.9,
  })
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: '#f5efe8',
    roughness: 0.5,
  })

  for (const y of [0.96, 0.62]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.024, 30), ringMaterial)
    ring.rotation.x = Math.PI / 2
    ring.position.set(x, y, 0.34)
    ring.castShadow = true
    group.add(ring)

    const grill = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 30), grillMaterial)
    grill.rotation.x = Math.PI / 2
    grill.position.set(x, y, 0.352)
    group.add(grill)
  }

  return group
}

function createStationControls(stations: MusicStation[]): InteractiveMusicControl[] {
  const stationControls = stations.map((station, index) => {
    const x = -0.42 + index * 0.28
    const buttonMaterial = new THREE.MeshStandardMaterial({
      color: '#efe2d4',
      emissive: '#170d10',
      emissiveIntensity: 0.14,
      roughness: 0.3,
      metalness: 0.03,
    })

    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.04, 22), buttonMaterial)
    button.rotation.x = Math.PI / 2
    button.position.set(x, 0.42, 0.368)
    button.castShadow = true

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: station.accentColor,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.14, 28), haloMaterial)
    halo.position.set(x, 0.42, 0.352)
    halo.visible = false

    const hitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.24),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    hitArea.position.set(x, 0.42, 0.39)
    hitArea.userData.stationId = station.id

    return {
      action: 'station' as const,
      stationId: station.id,
      label: station.label,
      accentColor: station.accentColor,
      hitArea,
      button,
      buttonMaterial,
      halo,
      haloMaterial,
    }
  })

  const stopMaterial = new THREE.MeshStandardMaterial({
    color: '#f3e6df',
    emissive: '#170d10',
    emissiveIntensity: 0.14,
    roughness: 0.34,
    metalness: 0.02,
  })
  const stopButton = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.044, 24), stopMaterial)
  stopButton.rotation.x = Math.PI / 2
  stopButton.position.set(0, 0.17, 0.37)
  stopButton.castShadow = true

  const stopHaloMaterial = new THREE.MeshBasicMaterial({
    color: '#eb2371',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const stopHalo = new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), stopHaloMaterial)
  stopHalo.position.set(0, 0.17, 0.352)
  stopHalo.visible = false

  const stopHitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.24),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  stopHitArea.position.set(0, 0.17, 0.39)

  return [
    ...stationControls,
    {
      action: 'stop',
      stationId: '__stop__',
      label: 'Stop Music',
      accentColor: '#eb2371',
      hitArea: stopHitArea,
      button: stopButton,
      buttonMaterial: stopMaterial,
      halo: stopHalo,
      haloMaterial: stopHaloMaterial,
    },
  ]
}

function createLabelTexture(stations: MusicStation[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')

  if (!context) {
    const fallback = new THREE.CanvasTexture(canvas)
    fallback.colorSpace = THREE.SRGBColorSpace
    return fallback
  }

  context.fillStyle = '#fcf4ea'
  roundRect(context, 24, 24, canvas.width - 48, canvas.height - 48, 36, true)
  context.fillStyle = '#eb2371'
  context.font = '700 54px "Mixtiles Sans", "Trebuchet MS", sans-serif'
  context.textAlign = 'center'
  context.fillText('ClawArt Listening Corner', canvas.width / 2, 110)

  context.fillStyle = '#5a3f35'
  context.font = '500 30px "Mixtiles Sans", "Trebuchet MS", sans-serif'
  context.fillText('Tap a lit button for a live station', canvas.width / 2, 162)

  stations.forEach((station, index) => {
    const x = 62 + index * 226
    context.fillStyle = station.accentColor
    roundRect(context, x, 236, 190, 92, 30, true)
    context.fillStyle = '#fffaf6'
    context.font = '700 22px "Mixtiles Sans", "Trebuchet MS", sans-serif'
    context.fillText(`${index + 1}`, x + 34, 292)
    context.textAlign = 'left'
    context.font = '700 26px "Mixtiles Sans", "Trebuchet MS", sans-serif'
    context.fillText(station.label, x + 58, 284)
    context.font = '500 20px "Mixtiles Sans", "Trebuchet MS", sans-serif'
    context.fillText(station.genre, x + 58, 314)
    context.textAlign = 'center'
  })

  context.fillStyle = '#eb2371'
  roundRect(context, 328, 368, 368, 82, 28, true)
  context.fillStyle = '#fff8f4'
  context.font = '700 28px "Mixtiles Sans", "Trebuchet MS", sans-serif'
  context.fillText('Stop Music', canvas.width / 2, 417)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: boolean,
): void {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()

  if (fill) {
    context.fill()
  }
}
