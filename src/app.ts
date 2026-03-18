import * as THREE from 'three'
import { resolveMovement } from './controls/movement'
import { WALL_TEMPLATES } from './data/layouts'
import {
  createDefaultTilePlacements,
  migrateSlotAssignmentsToTilePlacements,
  normalizeTilePlacements,
} from './gallery/arrangement'
import { createPlaceholderGalleryImages, mergeGalleryImages } from './gallery/images'
import { clearGalleryState, restoreGalleryState, saveGalleryState } from './gallery/persistence'
import { loadUserImages } from './gallery/uploads'
import { MuseumMultiplayerClient } from './multiplayer/client'
import { resolveMultiplayerUrl, resolveRoomId } from './multiplayer/config'
import type { ConnectionState, PlayerPoseState, RemotePlayerState } from './multiplayer/types'
import { createPlayerAvatar, type PlayerAvatar } from './player/createPlayerAvatar'
import {
  buildMuseumRoom,
  type InteractiveWallPlane,
  type MuseumHotspot,
  type MuseumRoom,
} from './room/buildMuseumRoom'
import type {
  GalleryImage,
  GalleryState,
  GalleryTilePlacement,
  GalleryTilePlacements,
} from './types'

const CAMERA_EYE_HEIGHT = 1.66
const PLAYER_RADIUS = 0.38
const WALK_SPEED = 3.1
const MOUSE_LOOK_YAW = 0.0022
const MOUSE_LOOK_PITCH = 0.0018
const TOUCH_LOOK_YAW = 0.0054
const TOUCH_LOOK_PITCH = 0.0038
const MIN_CAMERA_PITCH = -0.48
const MAX_CAMERA_PITCH = 0.34
const DROP_MARGIN = 0.18

const mixtilesLogoUrl = new URL('./assets/brand/mixtiles-logo.svg', import.meta.url).href

interface TouchLookState {
  kind: 'look'
  pointerId: number
  lastX: number
  lastY: number
  moved: number
  hotspotId: string | null
}

interface FrameDragState {
  kind: 'frame'
  pointerId: number
  itemId: string
}

type PointerState = TouchLookState | FrameDragState | null

interface CarriedFrameState {
  itemId: string
  dropPlacement: GalleryTilePlacement | null
}

interface RemotePlayerRuntime {
  avatar: PlayerAvatar
  pose: PlayerPoseState
  targetPose: PlayerPoseState
}

export function bootstrapMuseumApp(root: HTMLDivElement): void {
  new MuseumApp(root)
}

class MuseumApp {
  private readonly root: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly loadingScreen: HTMLDivElement
  private readonly heroPanel: HTMLElement
  private readonly nameForm: HTMLFormElement
  private readonly nameInput: HTMLInputElement
  private readonly statusTitle: HTMLParagraphElement
  private readonly statusCopy: HTMLParagraphElement
  private readonly statusVisitor: HTMLParagraphElement
  private readonly statusSync: HTMLParagraphElement
  private readonly uploadInput: HTMLInputElement
  private readonly helpDialog: HTMLDialogElement
  private readonly dragGhost: HTMLDivElement
  private readonly dragGhostLabel: HTMLSpanElement
  private readonly reticle: HTMLDivElement
  private readonly toolbarEnterButton: HTMLButtonElement
  private readonly heroEnterButton: HTMLButtonElement
  private readonly openHelpButtons: HTMLButtonElement[]
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 80)
  private readonly clock = new THREE.Clock()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly placeholders = createPlaceholderGalleryImages()
  private readonly isTouchDevice =
    window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  private readonly keyboardState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  }
  private readonly playerVelocity = new THREE.Vector2()
  private readonly playerPosition = new THREE.Vector3()
  private readonly localAvatar = createPlayerAvatar('Guest')
  private readonly placementMarker = createPlacementMarker()
  private readonly interactiveTileByHitArea = new Map<string, MuseumRoom['interactiveTiles'][number]>()
  private readonly interactiveWallByMesh = new Map<string, InteractiveWallPlane>()
  private readonly remotePlayers = new Map<string, RemotePlayerRuntime>()
  private readonly roomId = resolveRoomId()
  private readonly multiplayerUrl = resolveMultiplayerUrl()

  private activeImages: GalleryImage[] = []
  private uploadedImages: GalleryImage[] = []
  private room: MuseumRoom | null = null
  private multiplayerClient: MuseumMultiplayerClient | null = null
  private multiplayerSelfId: string | null = null
  private playerName = ''
  private tilePlacements = createDefaultTilePlacements(WALL_TEMPLATES)
  private entered = false
  private connectionState: ConnectionState = 'offline'
  private pointerLocked = false
  private pointerState: PointerState = null
  private carriedFrame: CarriedFrameState | null = null
  private hoveredItemId: string | null = null
  private hoveredWallId: string | null = null
  private cameraYaw = 0
  private cameraPitch = -0.05
  private lastPresenceSyncAt = 0

  constructor(root: HTMLDivElement) {
    this.root = root
    this.restoreState()
    this.root.innerHTML = createShellMarkup({
      logoUrl: mixtilesLogoUrl,
      playerName: this.playerName,
      roomId: this.roomId,
      isTouchDevice: this.isTouchDevice,
    })

    this.canvas = getRequiredElement(root, '[data-canvas]')
    this.loadingScreen = getRequiredElement(root, '[data-loading]')
    this.heroPanel = getRequiredElement(root, '[data-hero]')
    this.nameForm = getRequiredElement(root, '[data-name-form]')
    this.nameInput = getRequiredElement(root, '[data-name-input]')
    this.statusTitle = getRequiredElement(root, '[data-status-title]')
    this.statusCopy = getRequiredElement(root, '[data-status-copy]')
    this.statusVisitor = getRequiredElement(root, '[data-status-visitor]')
    this.statusSync = getRequiredElement(root, '[data-status-sync]')
    this.uploadInput = getRequiredElement(root, '[data-upload]')
    this.helpDialog = getRequiredElement(root, '[data-help]')
    this.dragGhost = getRequiredElement(root, '[data-drag-ghost]')
    this.dragGhostLabel = getRequiredElement(root, '[data-drag-ghost-label]')
    this.reticle = getRequiredElement(root, '[data-reticle]')
    this.toolbarEnterButton = getRequiredElement(root, '[data-enter-toolbar]')
    this.heroEnterButton = getRequiredElement(root, '[data-enter-hero]')
    this.openHelpButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-help-open]'))

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene.background = new THREE.Color('#f5eee4')
    this.scene.fog = new THREE.Fog('#fbf6ef', 12, 28)
    this.camera.rotation.order = 'YXZ'

    this.localAvatar.setFirstPersonMode(true)
    this.scene.add(this.localAvatar.group)
    this.scene.add(this.placementMarker)

    if (typeof document.fonts?.ready?.then === 'function') {
      void document.fonts.ready.then(() => {
        if (this.playerName) {
          this.localAvatar.setName(this.playerName)
        }
      })
    }

    this.rebuildRoom()
    this.updateVisitorLabel()
    this.updateSyncLabel()
    this.bindEvents()
    this.resize()
    this.renderer.setAnimationLoop(this.animate)
    this.setLoading(false)
    this.setStatus(
      'Room prepared',
      'Choose your visitor name, enter in first person, and aim directly at any frame whenever you want to pick it up and move it.',
    )
  }

  private restoreState(): void {
    const restored = restoreGalleryState(this.roomId)
    this.uploadedImages = restored?.uploadedImages ?? []
    this.playerName = sanitizeName(restored?.playerName ?? '') ?? ''
    this.activeImages = mergeGalleryImages(this.placeholders, this.uploadedImages)
    this.tilePlacements = normalizeTilePlacements(
      WALL_TEMPLATES,
      restored?.tilePlacements ??
        migrateSlotAssignmentsToTilePlacements(
          WALL_TEMPLATES,
          this.activeImages,
          restored?.slotAssignments,
        ),
    )
  }

  private bindEvents(): void {
    this.toolbarEnterButton.addEventListener('click', this.handleEnter)
    this.nameForm.addEventListener('submit', this.handleNameSubmit)
    getRequiredElement<HTMLButtonElement>(this.root, '[data-upload-open]').addEventListener(
      'click',
      this.handleUploadOpen,
    )
    getRequiredElement<HTMLButtonElement>(this.root, '[data-reset]').addEventListener(
      'click',
      this.handleReset,
    )
    this.uploadInput.addEventListener('change', this.handleUploadInput)
    this.openHelpButtons.forEach((button) => button.addEventListener('click', this.handleOpenHelp))
    getRequiredElement<HTMLButtonElement>(this.root, '[data-help-close]').addEventListener(
      'click',
      this.handleCloseHelp,
    )

    document.addEventListener('pointerlockchange', this.handlePointerLockChange)
    document.addEventListener('mousemove', this.handleMouseMove)
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleWindowBlur)
    window.addEventListener('beforeunload', this.handleBeforeUnload)

    this.canvas.addEventListener('click', this.handleCanvasClick)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave)
  }

  private readonly animate = (): void => {
    const delta = Math.min(this.clock.getDelta(), 0.05)
    const now = performance.now()
    const speed = this.updateMovement(delta)

    this.updateDesktopAim()
    this.updatePlacementMarker()
    this.updateRemotePlayers(delta)
    this.syncPresence(now, speed)

    this.localAvatar.setFacing(this.cameraYaw + Math.PI)
    this.localAvatar.update(delta, speed)
    this.localAvatar.group.position.set(this.playerPosition.x, 0, this.playerPosition.z)
    this.localAvatar.group.visible = this.entered
    this.reticle.hidden = !this.entered || this.isTouchDevice
    this.reticle.classList.toggle('is-active', Boolean(this.hoveredItemId))
    this.reticle.classList.toggle('is-carrying', Boolean(this.carriedFrame))

    this.camera.position.set(this.playerPosition.x, CAMERA_EYE_HEIGHT, this.playerPosition.z)
    this.camera.rotation.x = this.cameraPitch
    this.camera.rotation.y = this.cameraYaw
    this.camera.rotation.z = 0

    if (this.room && this.isTouchDevice && this.entered && !this.carriedFrame) {
      this.updateTouchHotspots(performance.now())
    }

    this.renderer.render(this.scene, this.camera)
  }

  private updateMovement(delta: number): number {
    if (!this.room || !this.entered || (this.isTouchDevice && this.carriedFrame !== null)) {
      this.playerVelocity.lerp(new THREE.Vector2(), Math.min(delta * 10, 1))
      return this.playerVelocity.length()
    }

    const inputVector = new THREE.Vector2(
      Number(this.keyboardState.right) - Number(this.keyboardState.left),
      Number(this.keyboardState.forward) - Number(this.keyboardState.backward),
    )

    if (inputVector.lengthSq() > 1) {
      inputVector.normalize()
    }

    const forwardX = -Math.sin(this.cameraYaw)
    const forwardZ = -Math.cos(this.cameraYaw)
    const rightX = Math.cos(this.cameraYaw)
    const rightZ = -Math.sin(this.cameraYaw)

    const targetVelocity = new THREE.Vector2(
      (rightX * inputVector.x + forwardX * inputVector.y) * WALK_SPEED,
      (rightZ * inputVector.x + forwardZ * inputVector.y) * WALK_SPEED,
    )

    this.playerVelocity.lerp(targetVelocity, Math.min(delta * 8, 1))

    const resolved = resolveMovement(
      {
        x: this.playerPosition.x + this.playerVelocity.x * delta,
        z: this.playerPosition.z + this.playerVelocity.y * delta,
      },
      PLAYER_RADIUS,
      this.room.bounds,
      this.room.obstacles,
    )

    this.playerPosition.set(resolved.x, 0, resolved.z)
    return this.playerVelocity.length()
  }

  private rebuildRoom(): void {
    if (this.room) {
      this.scene.remove(this.room.group)
      disposeObject(this.room.group)
      this.interactiveTileByHitArea.clear()
      this.interactiveWallByMesh.clear()
    }

    this.room = buildMuseumRoom(this.activeImages, this.isTouchDevice, this.tilePlacements)
    this.scene.add(this.room.group)

    for (const tile of this.room.interactiveTiles) {
      this.interactiveTileByHitArea.set(tile.hitArea.uuid, tile)
    }

    for (const wall of this.room.interactiveWalls) {
      this.interactiveWallByMesh.set(wall.mesh.uuid, wall)
    }

    if (!this.entered) {
      const start = this.room.intro.start
      this.playerPosition.set(start.position.x, 0, start.position.z)
      this.cameraYaw = start.yaw
      this.cameraPitch = start.pitch
    }

    this.refreshInteractionHighlights()
  }

  private updatePlacementMarker(): void {
    if (!this.room || !this.carriedFrame?.dropPlacement) {
      this.placementMarker.visible = false
      return
    }

    const carriedTile = this.room.interactiveTiles.find(
      (tile) => tile.itemId === this.carriedFrame?.itemId,
    )
    const targetWall = this.room.interactiveWalls.find(
      (wall) => wall.wallId === this.carriedFrame?.dropPlacement?.wallId,
    )

    if (!carriedTile || !targetWall) {
      this.placementMarker.visible = false
      return
    }

    const placement = this.carriedFrame.dropPlacement
    const worldPosition = targetWall.mesh.localToWorld(new THREE.Vector3(placement.x, placement.y, 0.014))
    const worldQuaternion = targetWall.mesh.getWorldQuaternion(new THREE.Quaternion())

    this.placementMarker.visible = true
    this.placementMarker.position.copy(worldPosition)
    this.placementMarker.quaternion.copy(worldQuaternion)
    this.placementMarker.scale.set(
      carriedTile.width + 0.08,
      carriedTile.height + 0.08,
      1,
    )
  }

  private readonly handleEnter = (): void => {
    this.enterWithCurrentName()
  }

  private readonly handleNameSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    this.enterWithCurrentName()
  }

  private enterWithCurrentName(): void {
    const nextName = sanitizeName(this.nameInput.value)

    if (!nextName) {
      this.nameInput.focus()
      this.setStatus('Add your name first', 'Pick a visitor name before entering the gallery.')
      return
    }

    this.playerName = nextName
    this.localAvatar.setName(nextName)
    this.updateVisitorLabel()
    this.persistState()

    if (!this.room) {
      return
    }

    this.entered = true
    this.heroPanel.classList.add('is-hidden')
    this.toolbarEnterButton.textContent = 'Re-center'
    this.heroEnterButton.textContent = 'Enter Gallery'
    this.playerVelocity.set(0, 0)

    const start = this.room.defaultPose
    this.playerPosition.set(start.position.x, 0, start.position.z)
    this.cameraYaw = start.yaw
    this.cameraPitch = start.pitch
    this.lastPresenceSyncAt = 0

    this.setStatus(
      `Welcome, ${nextName}`,
      this.isTouchDevice
        ? 'Touch mode is live. Tap and drag a frame whenever you want to reposition it on a wall.'
        : 'First-person mode is live. Mouse look starts automatically, use W A S D to walk, click a frame at the center reticle to pick it up, then click a wall to place it.',
    )

    this.requestDesktopPointerLock()
    this.connectMultiplayer()
  }

  private readonly handleUploadOpen = (): void => {
    this.uploadInput.click()
  }

  private readonly handleUploadInput = async (): Promise<void> => {
    const files = this.uploadInput.files

    if (!files || files.length === 0) {
      this.setStatus('No photos selected', 'Pick a few images and I will fit them into the gallery.')
      return
    }

    this.setLoading(true)
    this.setStatus('Framing photos', 'Cropping and fitting your uploads into the museum frames.')

    try {
      this.uploadedImages = await loadUserImages(
        Array.from(files).slice(0, this.placeholders.length),
      )
      this.activeImages = mergeGalleryImages(this.placeholders, this.uploadedImages)
      this.tilePlacements = normalizeTilePlacements(WALL_TEMPLATES, this.tilePlacements)
      this.persistState()
      this.rebuildRoom()
      this.multiplayerClient?.updateGalleryImages(this.uploadedImages)
      this.setStatus(
        'Photos updated',
        `${this.uploadedImages.length} image${this.uploadedImages.length === 1 ? '' : 's'} placed into the room.`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to process the selected images.'
      this.setStatus('Upload failed', message)
    } finally {
      this.uploadInput.value = ''
      this.setLoading(false)
    }
  }

  private readonly handleReset = (): void => {
    this.uploadedImages = []
    this.activeImages = [...this.placeholders]
    this.tilePlacements = createDefaultTilePlacements(WALL_TEMPLATES)
    this.persistState()
    this.rebuildRoom()
    this.multiplayerClient?.updateGalleryImages([])
    this.multiplayerClient?.updateTilePlacements(this.tilePlacements)
    this.setStatus(
      'Gallery reset',
      'All uploads and custom frame positions are reset to the curated default room.',
    )
  }

  private readonly handleOpenHelp = (): void => {
    if (typeof this.helpDialog.showModal === 'function') {
      this.helpDialog.showModal()
      return
    }

    this.helpDialog.setAttribute('open', 'true')
  }

  private readonly handleCloseHelp = (): void => {
    if (typeof this.helpDialog.close === 'function') {
      this.helpDialog.close()
      return
    }

    this.helpDialog.removeAttribute('open')
  }

  private readonly handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas

    if (!this.pointerLocked && !this.isTouchDevice) {
      this.hoveredItemId = null
      this.hoveredWallId = null

      if (this.carriedFrame) {
        this.carriedFrame = null
        this.hideDragGhost()
        this.setStatus(
          'Look mode restored',
          'Aim at a frame and click once to pick it up, then click again on a wall to place it.',
        )
      }

      this.refreshInteractionHighlights()
    }
  }

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked || !this.entered) {
      return
    }

    this.cameraYaw -= event.movementX * MOUSE_LOOK_YAW
    this.cameraPitch = clamp(
      this.cameraPitch - event.movementY * MOUSE_LOOK_PITCH,
      MIN_CAMERA_PITCH,
      MAX_CAMERA_PITCH,
    )
  }

  private readonly handleCanvasClick = (): void => {
    if (!this.entered || this.isTouchDevice) {
      return
    }

    if (!this.pointerLocked) {
      this.requestDesktopPointerLock()
      return
    }

    if (this.carriedFrame) {
      this.tryPlaceCarriedFrame()
      return
    }

    const interactiveTile = this.pickCenteredInteractiveTile()

    if (!interactiveTile) {
      return
    }

    this.startCarryingFrame(interactiveTile.itemId)
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(document.activeElement)) {
      return
    }

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keyboardState.forward = true
        break
      case 'KeyS':
      case 'ArrowDown':
        this.keyboardState.backward = true
        break
      case 'KeyA':
      case 'ArrowLeft':
        this.keyboardState.left = true
        break
      case 'KeyD':
      case 'ArrowRight':
        this.keyboardState.right = true
        break
      default:
        break
    }
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keyboardState.forward = false
        break
      case 'KeyS':
      case 'ArrowDown':
        this.keyboardState.backward = false
        break
      case 'KeyA':
      case 'ArrowLeft':
        this.keyboardState.left = false
        break
      case 'KeyD':
      case 'ArrowRight':
        this.keyboardState.right = false
        break
      default:
        break
    }
  }

  private readonly handleWindowBlur = (): void => {
    this.keyboardState.forward = false
    this.keyboardState.backward = false
    this.keyboardState.left = false
    this.keyboardState.right = false
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.room || !this.entered) {
      return
    }

    if (!this.isTouchDevice) {
      return
    }

    const interactiveTile = this.pickInteractiveTile(event)

    if (interactiveTile) {
      this.pointerState = {
        kind: 'frame',
        pointerId: event.pointerId,
        itemId: interactiveTile.itemId,
      }
      this.canvas.setPointerCapture(event.pointerId)
      this.startCarryingFrame(interactiveTile.itemId, event.clientX, event.clientY)
      return
    }

    const hotspot = this.pickHotspot(event, this.room.hotspots)
    this.pointerState = {
      kind: 'look',
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: 0,
      hotspotId: hotspot?.id ?? null,
    }
    this.canvas.setPointerCapture(event.pointerId)
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.room || !this.entered) {
      return
    }

    if (
      this.isTouchDevice &&
      this.pointerState?.kind === 'frame' &&
      this.pointerState.pointerId === event.pointerId
    ) {
      const draggedItemId = this.pointerState.itemId
      this.showDragGhost(
        this.dragGhostLabel.textContent ?? 'Move frame',
        event.clientX,
        event.clientY,
      )

      const interactiveTile = this.room.interactiveTiles.find((tile) => tile.itemId === draggedItemId)
      const dropPlacement = interactiveTile ? this.pickWallPlacement(event, interactiveTile) : null

      if (this.carriedFrame?.itemId === draggedItemId) {
        this.carriedFrame.dropPlacement = dropPlacement
      }

      this.hoveredItemId = draggedItemId
      this.hoveredWallId = dropPlacement?.wallId ?? null
      this.refreshInteractionHighlights()
      return
    }

    if (
      !this.isTouchDevice ||
      this.pointerState?.kind !== 'look' ||
      this.pointerState.pointerId !== event.pointerId
    ) {
      return
    }

    const deltaX = event.clientX - this.pointerState.lastX
    const deltaY = event.clientY - this.pointerState.lastY
    this.pointerState.lastX = event.clientX
    this.pointerState.lastY = event.clientY
    this.pointerState.moved += Math.abs(deltaX) + Math.abs(deltaY)

    this.cameraYaw -= deltaX * TOUCH_LOOK_YAW
    this.cameraPitch = clamp(
      this.cameraPitch - deltaY * TOUCH_LOOK_PITCH,
      MIN_CAMERA_PITCH,
      MAX_CAMERA_PITCH,
    )
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointerState || this.pointerState.pointerId !== event.pointerId) {
      return
    }

    if (this.pointerState.kind === 'frame') {
      const { itemId } = this.pointerState
      const dropPlacement =
        this.carriedFrame?.itemId === itemId ? this.carriedFrame.dropPlacement : null
      this.releasePointer()
      this.hideDragGhost()
      this.hoveredItemId = null
      this.hoveredWallId = null
      this.carriedFrame = null

      if (dropPlacement) {
        this.applyTilePlacement(itemId, dropPlacement)
        this.setStatus(
          'Frame placed',
          'That piece is now mounted at the exact spot you dropped it on the wall.',
        )
      } else {
        this.refreshInteractionHighlights()
        this.setStatus(
          'Drop on a wall',
          'Keep your finger on the frame, drag over any wall surface, and release to mount it there.',
        )
      }
      return
    }

    const hotspotId = this.pointerState.hotspotId
    const moved = this.pointerState.moved
    this.releasePointer()

    if (this.isTouchDevice && moved < 14 && hotspotId && this.room) {
      const hotspot = this.room.hotspots.find((entry) => entry.id === hotspotId)
      if (hotspot) {
        this.jumpToHotspot(hotspot)
      }
    }
  }

  private readonly handlePointerCancel = (): void => {
    this.releasePointer()
    this.hideDragGhost()
    this.carriedFrame = null
    this.hoveredItemId = null
    this.hoveredWallId = null
    this.refreshInteractionHighlights()
  }

  private readonly handlePointerLeave = (): void => {
    if (!this.pointerState) {
      this.hoveredItemId = null
      this.hoveredWallId = null
      this.refreshInteractionHighlights()
    }
  }

  private updateDesktopAim(): void {
    if (!this.room || !this.entered || this.isTouchDevice) {
      return
    }

    if (this.carriedFrame) {
      const carriedTile = this.room.interactiveTiles.find(
        (tile) => tile.itemId === this.carriedFrame?.itemId,
      )
      const dropPlacement = carriedTile ? this.pickCenteredWallPlacement(carriedTile) : null
      this.carriedFrame.dropPlacement = dropPlacement
      this.hoveredItemId = this.carriedFrame.itemId
      this.hoveredWallId = dropPlacement?.wallId ?? null
      this.refreshInteractionHighlights()
      return
    }

    if (this.pointerLocked) {
      const hoveredTile = this.pickCenteredInteractiveTile()
      this.hoveredItemId = hoveredTile?.itemId ?? null
      this.hoveredWallId = null
      this.refreshInteractionHighlights()
      return
    }

    if (this.hoveredItemId || this.hoveredWallId) {
      this.hoveredItemId = null
      this.hoveredWallId = null
      this.refreshInteractionHighlights()
    }
  }

  private startCarryingFrame(itemId: string, clientX?: number, clientY?: number): void {
    const interactiveTile = this.room?.interactiveTiles.find((tile) => tile.itemId === itemId)

    if (!interactiveTile) {
      return
    }

    this.carriedFrame = {
      itemId,
      dropPlacement: this.tilePlacements[itemId] ?? null,
    }
    this.hoveredItemId = itemId
    this.hoveredWallId = this.carriedFrame.dropPlacement?.wallId ?? null

    if (typeof clientX === 'number' && typeof clientY === 'number') {
      this.showDragGhost(this.getTileDragLabel(interactiveTile), clientX, clientY)
    }

    this.refreshInteractionHighlights()
    this.setStatus(
      'Frame selected',
      this.isTouchDevice
        ? 'Drag over any wall and release at the exact spot where you want the frame to land.'
        : 'The frame is marked. Aim the reticle at the exact wall spot you want, then click again to place it.',
    )
  }

  private tryPlaceCarriedFrame(): void {
    if (!this.carriedFrame) {
      return
    }

    if (!this.carriedFrame.dropPlacement) {
      this.setStatus(
        'Aim at a wall',
        'Keep looking at a wall surface, then click again to place the frame there.',
      )
      return
    }

    const { itemId, dropPlacement } = this.carriedFrame
    this.carriedFrame = null
    this.hoveredItemId = null
    this.hoveredWallId = null
    this.applyTilePlacement(itemId, dropPlacement)
    this.setStatus('Frame placed', 'That frame is now mounted exactly where you aimed it.')
  }

  private applyTilePlacement(itemId: string, placement: GalleryTilePlacement): void {
    this.tilePlacements = {
      ...this.tilePlacements,
      [itemId]: placement,
    }
    this.persistState()
    this.rebuildRoom()
    this.multiplayerClient?.updateTilePlacements(this.tilePlacements)
  }

  private requestDesktopPointerLock(): void {
    if (this.isTouchDevice || !this.entered || this.pointerLocked) {
      return
    }

    void this.canvas.requestPointerLock()
  }

  private connectMultiplayer(): void {
    if (!this.entered || !this.playerName) {
      return
    }

    if (!this.multiplayerClient) {
      this.multiplayerClient = new MuseumMultiplayerClient(this.multiplayerUrl, {
        onConnectionChange: (state) => {
          this.connectionState = state

          if (state === 'offline') {
            this.multiplayerSelfId = null
            this.clearRemotePlayers()
          }

          this.updateSyncLabel()
        },
        onWelcome: (selfId, snapshot) => {
          this.multiplayerSelfId = selfId
          this.applySnapshot(snapshot)
          this.updateSyncLabel()
        },
        onPlayerJoined: (player) => {
          this.upsertRemotePlayer(player)
          this.updateSyncLabel()
        },
        onPlayerPresence: (player) => {
          this.upsertRemotePlayer(player)
        },
        onPlayerLeft: (playerId) => {
          this.removeRemotePlayer(playerId)
          this.updateSyncLabel()
        },
        onTileSync: (tilePlacements, changedBy) => {
          if (changedBy !== this.multiplayerSelfId) {
            this.applyRemoteTilePlacements(tilePlacements)
          }
        },
        onGallerySync: (uploadedImages, changedBy) => {
          if (changedBy !== this.multiplayerSelfId) {
            this.applyRemoteUploadedImages(uploadedImages)
          }
        },
        onError: (message) => {
          console.warn(message)
        },
      })
    }

    this.multiplayerClient.connect({
      roomId: this.roomId,
      name: this.playerName,
      pose: this.getCurrentPose(0),
      uploadedImages: this.uploadedImages,
      tilePlacements: this.tilePlacements,
    })
  }

  private applySnapshot(snapshot: {
    uploadedImages: GalleryImage[]
    tilePlacements: GalleryTilePlacements
    players: RemotePlayerState[]
  }): void {
    this.uploadedImages = snapshot.uploadedImages
    this.activeImages = mergeGalleryImages(this.placeholders, this.uploadedImages)
    this.tilePlacements = normalizeTilePlacements(WALL_TEMPLATES, snapshot.tilePlacements)
    this.persistState()
    this.rebuildRoom()
    this.syncRemotePlayers(snapshot.players)
  }

  private applyRemoteTilePlacements(tilePlacements: GalleryTilePlacements): void {
    this.carriedFrame = null
    this.hoveredItemId = null
    this.hoveredWallId = null
    this.hideDragGhost()
    this.tilePlacements = normalizeTilePlacements(WALL_TEMPLATES, tilePlacements)
    this.persistState()
    this.rebuildRoom()
  }

  private applyRemoteUploadedImages(uploadedImages: GalleryImage[]): void {
    this.uploadedImages = uploadedImages
    this.activeImages = mergeGalleryImages(this.placeholders, this.uploadedImages)
    this.persistState()
    this.rebuildRoom()
  }

  private syncRemotePlayers(players: RemotePlayerState[]): void {
    const playerIds = new Set<string>()

    for (const player of players) {
      if (player.id === this.multiplayerSelfId) {
        continue
      }

      playerIds.add(player.id)
      this.upsertRemotePlayer(player)
    }

    for (const playerId of this.remotePlayers.keys()) {
      if (!playerIds.has(playerId)) {
        this.removeRemotePlayer(playerId)
      }
    }
  }

  private upsertRemotePlayer(player: RemotePlayerState): void {
    if (player.id === this.multiplayerSelfId) {
      return
    }

    const existing = this.remotePlayers.get(player.id)

    if (existing) {
      existing.avatar.setName(player.name)
      existing.targetPose = player.pose
      return
    }

    const avatar = createPlayerAvatar(player.name)
    avatar.setFirstPersonMode(false)
    avatar.group.position.set(player.pose.x, 0, player.pose.z)
    avatar.setFacing(player.pose.yaw + Math.PI)
    this.scene.add(avatar.group)
    this.remotePlayers.set(player.id, {
      avatar,
      pose: { ...player.pose },
      targetPose: { ...player.pose },
    })
  }

  private removeRemotePlayer(playerId: string): void {
    const runtime = this.remotePlayers.get(playerId)

    if (!runtime) {
      return
    }

    this.scene.remove(runtime.avatar.group)
    disposeObject(runtime.avatar.group)
    this.remotePlayers.delete(playerId)
  }

  private clearRemotePlayers(): void {
    for (const playerId of [...this.remotePlayers.keys()]) {
      this.removeRemotePlayer(playerId)
    }
  }

  private updateRemotePlayers(delta: number): void {
    for (const runtime of this.remotePlayers.values()) {
      runtime.pose.x = THREE.MathUtils.lerp(runtime.pose.x, runtime.targetPose.x, Math.min(delta * 8, 1))
      runtime.pose.z = THREE.MathUtils.lerp(runtime.pose.z, runtime.targetPose.z, Math.min(delta * 8, 1))
      runtime.pose.yaw = lerpAngle(
        runtime.pose.yaw,
        runtime.targetPose.yaw,
        Math.min(delta * 8, 1),
      )
      runtime.pose.pitch = THREE.MathUtils.lerp(
        runtime.pose.pitch,
        runtime.targetPose.pitch,
        Math.min(delta * 8, 1),
      )
      runtime.pose.speed = THREE.MathUtils.lerp(
        runtime.pose.speed,
        runtime.targetPose.speed,
        Math.min(delta * 10, 1),
      )
      runtime.avatar.group.position.set(runtime.pose.x, 0, runtime.pose.z)
      runtime.avatar.setFacing(runtime.pose.yaw + Math.PI)
      runtime.avatar.update(delta, runtime.pose.speed)
    }
  }

  private syncPresence(now: number, speed: number): void {
    if (!this.entered || !this.multiplayerClient || this.connectionState !== 'connected') {
      return
    }

    if (now - this.lastPresenceSyncAt < 90) {
      return
    }

    this.lastPresenceSyncAt = now
    this.multiplayerClient.updatePresence(this.getCurrentPose(speed))
  }

  private getCurrentPose(speed: number): PlayerPoseState {
    return {
      x: this.playerPosition.x,
      z: this.playerPosition.z,
      yaw: this.cameraYaw,
      pitch: this.cameraPitch,
      speed,
    }
  }

  private jumpToHotspot(hotspot: MuseumHotspot): void {
    this.playerPosition.set(hotspot.pose.position.x, 0, hotspot.pose.position.z)
    this.cameraYaw = hotspot.pose.yaw
    this.cameraPitch = hotspot.pose.pitch
    this.setStatus('Viewpoint changed', `Moved to ${hotspot.label}.`)
  }

  private releasePointer(): void {
    if (this.pointerState && this.canvas.hasPointerCapture(this.pointerState.pointerId)) {
      this.canvas.releasePointerCapture(this.pointerState.pointerId)
    }

    this.pointerState = null
  }

  private pickInteractiveTile(event: PointerEvent): MuseumRoom['interactiveTiles'][number] | null {
    if (!this.room) {
      return null
    }

    this.updatePointerFromEvent(event)
    return this.pickInteractiveTileFromCurrentPointer()
  }

  private pickCenteredInteractiveTile(): MuseumRoom['interactiveTiles'][number] | null {
    if (!this.room) {
      return null
    }

    this.pointer.set(0, 0)
    return this.pickInteractiveTileFromCurrentPointer()
  }

  private pickInteractiveTileFromCurrentPointer(): MuseumRoom['interactiveTiles'][number] | null {
    if (!this.room) {
      return null
    }

    this.raycaster.setFromCamera(this.pointer, this.camera)

    const intersections = this.raycaster.intersectObjects(
      this.room.interactiveTiles.map((tile) => tile.hitArea),
      false,
    )

    for (const intersection of intersections) {
      const tile = this.interactiveTileByHitArea.get(intersection.object.uuid)
      if (tile) {
        return tile
      }
    }

    return null
  }

  private pickWallPlacement(
    event: PointerEvent,
    tile: MuseumRoom['interactiveTiles'][number],
  ): GalleryTilePlacement | null {
    if (!this.room) {
      return null
    }

    this.updatePointerFromEvent(event)
    return this.pickWallPlacementFromCurrentPointer(tile)
  }

  private pickCenteredWallPlacement(
    tile: MuseumRoom['interactiveTiles'][number],
  ): GalleryTilePlacement | null {
    if (!this.room) {
      return null
    }

    this.pointer.set(0, 0)
    return this.pickWallPlacementFromCurrentPointer(tile)
  }

  private pickWallPlacementFromCurrentPointer(
    tile: MuseumRoom['interactiveTiles'][number],
  ): GalleryTilePlacement | null {
    if (!this.room) {
      return null
    }

    this.raycaster.setFromCamera(this.pointer, this.camera)
    const intersections = this.raycaster.intersectObjects(
      this.room.interactiveWalls.map((wall) => wall.mesh),
      false,
    )

    for (const intersection of intersections) {
      const wall = this.interactiveWallByMesh.get(intersection.object.uuid)
      if (!wall) {
        continue
      }

      const localPoint = wall.mesh.worldToLocal(intersection.point.clone())

      return {
        wallId: wall.wallId,
        x: clamp(
          localPoint.x,
          -wall.width / 2 + tile.width / 2 + DROP_MARGIN,
          wall.width / 2 - tile.width / 2 - DROP_MARGIN,
        ),
        y: clamp(
          localPoint.y,
          -wall.height / 2 + tile.height / 2 + DROP_MARGIN,
          wall.height / 2 - tile.height / 2 - DROP_MARGIN,
        ),
      }
    }

    return null
  }

  private pickHotspot(event: PointerEvent, hotspots: MuseumHotspot[]): MuseumHotspot | null {
    this.updatePointerFromEvent(event)
    this.raycaster.setFromCamera(this.pointer, this.camera)

    const intersections = this.raycaster.intersectObjects(
      hotspots.map((hotspot) => hotspot.object),
      true,
    )

    for (const intersection of intersections) {
      const hotspotId = findHotspotId(intersection.object)
      if (!hotspotId) {
        continue
      }

      const hotspot = hotspots.find((entry) => entry.id === hotspotId)
      if (hotspot) {
        return hotspot
      }
    }

    return null
  }

  private updatePointerFromEvent(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  }

  private refreshInteractionHighlights(): void {
    if (!this.room) {
      return
    }

    for (const tile of this.room.interactiveTiles) {
      const highlightMaterial = tile.highlight.material as THREE.MeshBasicMaterial
      const isSelected = tile.itemId === this.carriedFrame?.itemId
      const isHovered = tile.itemId === this.hoveredItemId
      tile.highlight.visible = isSelected || isHovered
      highlightMaterial.opacity = isSelected ? 0.28 : 0.14
    }

    for (const wall of this.room.interactiveWalls) {
      const material = wall.mesh.material as THREE.MeshBasicMaterial
      material.opacity = !this.carriedFrame ? 0 : wall.wallId === this.hoveredWallId ? 0.1 : 0.02
    }
  }

  private updateTouchHotspots(now: number): void {
    if (!this.room) {
      return
    }

    for (const hotspot of this.room.hotspots) {
      const pulse = 1 + Math.sin(now / 320 + hotspot.object.position.x * 0.28) * 0.08
      hotspot.object.scale.setScalar(pulse)
    }
  }

  private readonly handleBeforeUnload = (): void => {
    this.multiplayerClient?.disconnect()
  }

  private updateVisitorLabel(): void {
    this.statusVisitor.textContent = `Visitor: ${this.playerName || 'Guest'}`
  }

  private updateSyncLabel(): void {
    const onlineCount = (this.entered ? 1 : 0) + this.remotePlayers.size

    switch (this.connectionState) {
      case 'connected':
        this.statusSync.textContent = `Room: ${this.roomId} · ${onlineCount} online`
        break
      case 'connecting':
        this.statusSync.textContent = `Room: ${this.roomId} · Connecting live sync...`
        break
      default:
        this.statusSync.textContent = `Room: ${this.roomId} · Solo mode`
        break
    }
  }

  private showDragGhost(label: string, clientX: number, clientY: number): void {
    this.dragGhost.hidden = false
    this.dragGhost.classList.add('is-visible')
    this.dragGhostLabel.textContent = label
    this.dragGhost.style.transform = `translate3d(${clientX + 18}px, ${clientY + 18}px, 0)`
  }

  private hideDragGhost(): void {
    this.dragGhost.hidden = true
    this.dragGhost.classList.remove('is-visible')
  }

  private getTileDragLabel(tile: MuseumRoom['interactiveTiles'][number]): string {
    const image = this.activeImages.find((entry) => entry.id === tile.imageId)
    return image?.label ?? 'Move frame'
  }

  private persistState(): void {
    const state: GalleryState = {
      uploadedImages: this.uploadedImages,
      playerName: this.playerName || undefined,
      tilePlacements: this.tilePlacements,
    }

    if (
      state.uploadedImages.length === 0 &&
      !state.playerName &&
      isDefaultTilePlacements(this.tilePlacements)
    ) {
      clearGalleryState(this.roomId)
      return
    }

    saveGalleryState(state, this.roomId)
  }

  private readonly resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth
    const height = this.canvas.clientHeight || window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setSize(width, height, false)
  }

  private setLoading(isLoading: boolean): void {
    this.loadingScreen.classList.toggle('is-visible', isLoading)
  }

  private setStatus(title: string, copy: string): void {
    this.statusTitle.textContent = title
    this.statusCopy.textContent = copy
  }
}

function createShellMarkup({
  logoUrl,
  playerName,
  roomId,
  isTouchDevice,
}: {
  logoUrl: string
  playerName: string
  roomId: string
  isTouchDevice: boolean
}): string {
  const safeName = escapeHtml(playerName)

  return `
    <div class="museum-app">
      <div class="loading-screen is-visible" data-loading>
        <div class="loading-card">
          <div class="loading-lockup">
            <img class="loading-logo" src="${logoUrl}" alt="Mixtiles logo" />
            <span class="loading-mark">Mixtiles.com</span>
          </div>
          <h2 class="loading-title">Preparing your gallery room.</h2>
          <p class="loading-copy">Warming the lights, mounting the walls, and getting the first-person room ready.</p>
          <div class="loading-bar" aria-hidden="true"></div>
        </div>
      </div>

      <div class="canvas-frame">
        <canvas class="museum-canvas" data-canvas></canvas>
      </div>

      <div class="reticle" data-reticle aria-hidden="true">
        <span class="reticle-dot"></span>
      </div>

      <div class="control-bar">
        <div class="brand-banner">
          <div class="brand-logo-shell">
            <img class="brand-logo" src="${logoUrl}" alt="Mixtiles logo" />
          </div>
          <div class="brand-copy">
            <p class="brand-kicker">Mixtiles.com</p>
            <h1 class="brand-title">Welcome to Mixtiles Gallery!</h1>
            <p class="brand-sub">Enter the room and drop straight into first-person control. Select a frame, then use the pink wall target to place it exactly where you want.</p>
          </div>
        </div>

        <div class="button-row">
          <button type="button" class="toolbar-button primary" data-enter-toolbar>Enter Gallery</button>
          <button type="button" class="toolbar-button" data-upload-open>Upload Photos</button>
          <button type="button" class="toolbar-button" data-reset>Reset Layout</button>
          <button type="button" class="toolbar-button" data-help-open>Help</button>
        </div>
      </div>

      <section class="hero-panel" data-hero>
        <p class="eyebrow">Interactive Room</p>
        <h2 class="hero-title">Choose your name, then walk the museum in first person.</h2>
        <p class="hero-copy">You stay in the room like a Doom-style first-person visitor. Select a frame, mark the exact wall point you want, and place it there.</p>

        <form class="hero-form" data-name-form>
          <label class="field-stack">
            <span class="field-label">Visitor name</span>
            <input
              class="hero-input"
              data-name-input
              type="text"
              maxlength="24"
              placeholder="Oded"
              value="${safeName}"
              autocomplete="off"
              spellcheck="false"
            />
          </label>

          <p class="hero-note">
            ${
              isTouchDevice
                ? 'Touch: drag to look, tap floor markers to jump viewpoints, and drag any frame directly to a new wall position whenever you want.'
                : 'Desktop: entering the gallery starts mouse look automatically, use W A S D to walk, click a frame to mark it, then use the pink wall target and click again to place it.'
            }
          </p>

          <div class="hero-actions">
            <button type="submit" class="hero-button primary" data-enter-hero>Enter Gallery</button>
            <button type="button" class="hero-button secondary" data-help-open>How it works</button>
          </div>
        </form>
      </section>

      <aside class="status-card">
        <p class="status-kicker">Live Gallery Builder</p>
        <p class="status-title" data-status-title>Room prepared</p>
        <p class="status-copy" data-status-copy>Choose your visitor name, then enter the museum.</p>
        <p class="status-visitor" data-status-visitor>Visitor: Guest</p>
        <p class="status-sync" data-status-sync>Room: ${escapeHtml(roomId)} · Solo mode</p>
      </aside>

      <input class="upload-input" data-upload type="file" accept="image/*" multiple />

      <div class="drag-ghost" data-drag-ghost hidden>
        <span class="drag-ghost-label" data-drag-ghost-label>Move frame</span>
      </div>

      <dialog class="help-dialog" data-help>
        <div class="help-shell">
          <h2>How the room works</h2>
          <p>The room stays in first person the whole time. Frame rearranging is always available, so you never need to switch modes.</p>
          <ul class="help-list">
            <li>Enter the room with your visitor name. That name is ready for future shared sessions when more players join.</li>
            <li>Desktop walk mode: entering the gallery locks mouse look automatically, and pressing Esc frees the cursor again.</li>
            <li>Touch walk mode: drag to look and tap the glowing floor markers to jump viewpoints.</li>
            <li>Desktop frame move: aim the center reticle at a frame, click once to mark it, then click again while the pink target sits on the wall point where you want it.</li>
            <li>Touch frame move: press directly on a frame, drag it over any wall surface, and release to mount it at that exact spot.</li>
            <li>Upload Photos swaps in your own images while keeping your current wall arrangement.</li>
          </ul>
          <button type="button" class="dialog-close" data-help-close>Close</button>
        </div>
      </dialog>
    </div>
  `
}

function getRequiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Missing required element: ${selector}`)
  }

  return element
}

function createPlacementMarker(): THREE.Group {
  const marker = new THREE.Group()
  marker.visible = false

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: '#eb2371',
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  marker.add(fill)

  const dot = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 28),
    new THREE.MeshBasicMaterial({
      color: '#fff7fb',
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  dot.position.z = 0.001
  marker.add(dot)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.165, 36),
    new THREE.MeshBasicMaterial({
      color: '#eb2371',
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  ring.position.z = 0.002
  marker.add(ring)

  return marker
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh

    if (mesh.geometry) {
      mesh.geometry.dispose()
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials
      .filter((material): material is THREE.Material => Boolean(material))
      .forEach((material) => {
        const map = (material as THREE.MeshStandardMaterial).map
        map?.dispose()
        material.dispose()
      })
  })
}

function findHotspotId(object: THREE.Object3D | null): string | null {
  let current: THREE.Object3D | null = object

  while (current) {
    const hotspotId = current.userData.hotspotId
    if (typeof hotspotId === 'string') {
      return hotspotId
    }
    current = current.parent
  }

  return null
}

function sanitizeName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')

  if (!normalized) {
    return null
  }

  return normalized.slice(0, 24)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function lerpAngle(start: number, end: number, alpha: number): number {
  return start + shortestAngleDistance(start, end) * alpha
}

function shortestAngleDistance(start: number, end: number): number {
  const difference = (end - start + Math.PI) % (Math.PI * 2)
  return difference < 0 ? difference + Math.PI * 2 - Math.PI : difference - Math.PI
}

function isTypingTarget(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable
}

function isDefaultTilePlacements(tilePlacements: GalleryTilePlacements): boolean {
  const defaults = createDefaultTilePlacements(WALL_TEMPLATES)

  return Object.entries(defaults).every(([itemId, placement]) => {
    const candidate = tilePlacements[itemId]
    return (
      candidate?.wallId === placement.wallId &&
      candidate?.x === placement.x &&
      candidate?.y === placement.y
    )
  })
}
