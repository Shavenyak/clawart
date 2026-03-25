import * as THREE from 'three'
import { getMusicStation } from './audio/musicStations'
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
import type {
  ConnectionState,
  PlayerPoseState,
  RemotePlayerState,
  RoomSnapshot,
} from './multiplayer/types'
import { createPlayerAvatar, type PlayerAvatar } from './player/createPlayerAvatar'
import {
  buildMuseumRoom,
  type InteractiveWallPlane,
  type MuseumHotspot,
  type MuseumRoom,
} from './room/buildMuseumRoom'
import {
  clampBrushSize,
  createStudioArtworkDataUrl,
  STUDIO_BRUSH_COLORS,
  STUDIO_CANVAS_SIZE,
} from './studio/artwork'
import {
  createDefaultCanvasTargets,
  createDefaultMovementAnchors,
  formatChatAuthor,
  summarizeRoomPresence,
  trimChatMessages,
} from './studio/collaboration'
import type {
  CanvasTarget,
  GalleryImage,
  GalleryState,
  GalleryTileImageAssignments,
  GalleryTilePlacement,
  GalleryTilePlacements,
  MovementAnchor,
  RoomChatMessage,
  StudioCanvasArtworks,
  TruthBoardState,
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
  player: RemotePlayerState
  pose: PlayerPoseState
  targetPose: PlayerPoseState
}

interface StudioPaintState {
  pointerId: number
  lastX: number
  lastY: number
}

type StudioBrushTool = 'brush' | 'marker' | 'spray' | 'eraser'

const STUDIO_BRUSH_TOOLS: { id: StudioBrushTool; label: string }[] = [
  { id: 'brush', label: 'Brush' },
  { id: 'marker', label: 'Marker' },
  { id: 'spray', label: 'Spray' },
  { id: 'eraser', label: 'Eraser' },
]

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
  private readonly statusStation: HTMLParagraphElement
  private readonly statusTruth: HTMLParagraphElement
  private readonly botSummary: HTMLParagraphElement
  private readonly botAnchorList: HTMLDivElement
  private readonly botCanvasList: HTMLDivElement
  private readonly chatLog: HTMLUListElement
  private readonly chatForm: HTMLFormElement
  private readonly chatInput: HTMLInputElement
  private readonly objectiveInput: HTMLInputElement
  private readonly uploadInput: HTMLInputElement
  private readonly frameUploadInput: HTMLInputElement
  private readonly studioDialog: HTMLDialogElement
  private readonly studioCanvas: HTMLCanvasElement
  private readonly studioBrushInput: HTMLInputElement
  private readonly studioBrushValue: HTMLSpanElement
  private readonly studioColorButtons: HTMLButtonElement[]
  private readonly studioToolButtons: HTMLButtonElement[]
  private readonly studioSourceLabel: HTMLParagraphElement
  private readonly helpDialog: HTMLDialogElement
  private readonly dragGhost: HTMLDivElement
  private readonly dragGhostLabel: HTMLSpanElement
  private readonly reticle: HTMLDivElement
  private readonly toolbarEnterButton: HTMLButtonElement
  private readonly runToggleButton: HTMLButtonElement
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
  private readonly interactiveMusicByHitArea = new Map<
    string,
    MuseumRoom['interactiveMusicControls'][number]
  >()
  private readonly interactiveStudioCanvasByHitArea = new Map<
    string,
    MuseumRoom['interactiveStudioCanvases'][number]
  >()
  private readonly remotePlayers = new Map<string, RemotePlayerRuntime>()
  private readonly roomId = resolveRoomId()
  private readonly multiplayerUrl = resolveMultiplayerUrl()
  private readonly audio: HTMLAudioElement

  private activeImages: GalleryImage[] = []
  private uploadedImages: GalleryImage[] = []
  private tileImageAssignments: GalleryTileImageAssignments = {}
  private studioCanvasArtworks: StudioCanvasArtworks = {}
  private truthBoard: TruthBoardState = createDefaultTruthBoard()
  private movementAnchors: MovementAnchor[] = createDefaultMovementAnchors()
  private canvasTargets: CanvasTarget[] = createDefaultCanvasTargets()
  private chatMessages: RoomChatMessage[] = []
  private room: MuseumRoom | null = null
  private multiplayerClient: MuseumMultiplayerClient | null = null
  private multiplayerSelfId: string | null = null
  private playerName = ''
  private agentObjective = createDefaultTruthBoard().objective
  private tilePlacements = createDefaultTilePlacements(WALL_TEMPLATES)
  private entered = false
  private connectionState: ConnectionState = 'offline'
  private pointerLocked = false
  private pointerState: PointerState = null
  private carriedFrame: CarriedFrameState | null = null
  private hoveredItemId: string | null = null
  private hoveredWallId: string | null = null
  private hoveredStationId: string | null = null
  private hoveredStudioCanvasId: string | null = null
  private activeStationId: string | null = null
  private pendingFrameUploadItemId: string | null = null
  private cameraYaw = 0
  private cameraPitch = -0.05
  private lastPresenceSyncAt = 0
  private selectedStudioCanvasId: string | null = null
  private selectedStudioCanvasLabel: string | null = null
  private activeBrushColor: string = STUDIO_BRUSH_COLORS[0]
  private activeBrushTool: StudioBrushTool = 'brush'
  private brushSize = 18
  private studioPaintState: StudioPaintState | null = null
  private studioOpen = false

  constructor(root: HTMLDivElement) {
    this.root = root
    this.restoreState()
    this.root.innerHTML = createShellMarkup({
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
    this.statusStation = getRequiredElement(root, '[data-status-station]')
    this.statusTruth = getRequiredElement(root, '[data-status-truth]')
    this.botSummary = getRequiredElement(root, '[data-bot-summary]')
    this.botAnchorList = getRequiredElement(root, '[data-bot-anchors]')
    this.botCanvasList = getRequiredElement(root, '[data-bot-canvases]')
    this.chatLog = getRequiredElement(root, '[data-chat-log]')
    this.chatForm = getRequiredElement(root, '[data-chat-form]')
    this.chatInput = getRequiredElement(root, '[data-chat-input]')
    this.objectiveInput = getRequiredElement(root, '[data-objective-input]')
    this.uploadInput = getRequiredElement(root, '[data-upload]')
    this.frameUploadInput = getRequiredElement(root, '[data-upload-frame]')
    // Legacy "Upload Photos" support stays wired for compatibility with older room data/tests.
    this.studioDialog = getRequiredElement(root, '[data-studio]')
    this.studioCanvas = getRequiredElement(root, '[data-studio-canvas]')
    this.studioBrushInput = getRequiredElement(root, '[data-studio-brush]')
    this.studioBrushValue = getRequiredElement(root, '[data-studio-brush-value]')
    this.studioColorButtons = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[data-studio-color]'),
    )
    this.studioToolButtons = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[data-studio-tool]'),
    )
    this.studioSourceLabel = getRequiredElement(root, '[data-studio-source]')
    this.helpDialog = getRequiredElement(root, '[data-help]')
    this.dragGhost = getRequiredElement(root, '[data-drag-ghost]')
    this.dragGhostLabel = getRequiredElement(root, '[data-drag-ghost-label]')
    this.reticle = getRequiredElement(root, '[data-reticle]')
    this.toolbarEnterButton = getRequiredElement(root, '[data-enter-toolbar]')
    this.runToggleButton = getRequiredElement(root, '[data-upload-open]')
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

    this.audio = document.createElement('audio')
    this.audio.preload = 'none'
    this.audio.volume = 0.58
    this.audio.crossOrigin = 'anonymous'
    this.audio.setAttribute('playsinline', 'true')
    this.audio.setAttribute('webkit-playsinline', 'true')
    this.audio.addEventListener('playing', this.handleAudioPlaying)
    this.audio.addEventListener('waiting', this.handleAudioWaiting)
    this.audio.addEventListener('stalled', this.handleAudioWaiting)
    this.audio.addEventListener('error', this.handleAudioError)

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
    this.setupStudioEditor()
    this.updateVisitorLabel()
    this.updateSyncLabel()
    this.updateStationLabel()
    this.updateTruthLabel()
    this.updateBotDock()
    this.updateRunButton()
    this.updateShellState()
    this.bindEvents()
    this.resize()
    this.renderer.setAnimationLoop(this.animate)
    this.setLoading(false)
    this.setStatus(
      'Canvas studio prepared',
      'Choose your visitor name, enter the room, and click any blank canvas to open a bigger shared painting sheet.',
    )
  }

  private restoreState(): void {
    const restored = restoreGalleryState(this.roomId)
    this.uploadedImages = restored?.uploadedImages ?? []
    this.playerName = sanitizeName(restored?.playerName ?? '') ?? ''
    this.activeStationId = getMusicStation(restored?.activeStationId)?.id ?? null
    this.tileImageAssignments = restored?.tileImageAssignments ?? {}
    this.studioCanvasArtworks = restored?.studioCanvasArtworks ?? {}
    this.agentObjective = restored?.agentObjective ?? this.agentObjective
    this.truthBoard = createDefaultTruthBoard(this.agentObjective)
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

  private setupStudioEditor(): void {
    this.studioCanvas.width = STUDIO_CANVAS_SIZE.width
    this.studioCanvas.height = STUDIO_CANVAS_SIZE.height
    this.objectiveInput.value = this.agentObjective
    this.studioBrushInput.value = String(this.brushSize)
    this.updateStudioBrushLabel()
    this.updateStudioColorButtons()
    this.updateStudioToolButtons()
    this.studioSourceLabel.textContent = 'Hero Canvas'
    void this.renderStudioCanvasFromArtwork(createStudioArtworkDataUrl('blank'))
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
    this.chatForm.addEventListener('submit', this.handleChatSubmit)
    this.uploadInput.addEventListener('change', this.handleUploadInput)
    this.frameUploadInput.addEventListener('change', this.handleFrameUploadInput)
    this.studioBrushInput.addEventListener('input', this.handleStudioBrushInput)
    this.studioColorButtons.forEach((button) =>
      button.addEventListener('click', this.handleStudioColorClick),
    )
    this.studioToolButtons.forEach((button) =>
      button.addEventListener('click', this.handleStudioToolClick),
    )
    getRequiredElement<HTMLButtonElement>(this.root, '[data-studio-save]').addEventListener(
      'click',
      this.handleStudioSave,
    )
    getRequiredElement<HTMLButtonElement>(this.root, '[data-studio-clear]').addEventListener(
      'click',
      this.handleStudioClear,
    )
    Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-studio-close]')).forEach(
      (button) => button.addEventListener('click', this.handleStudioClose),
    )
    this.studioCanvas.addEventListener('pointerdown', this.handleStudioPointerDown)
    this.studioCanvas.addEventListener('pointermove', this.handleStudioPointerMove)
    this.studioCanvas.addEventListener('pointerup', this.handleStudioPointerUp)
    this.studioCanvas.addEventListener('pointercancel', this.handleStudioPointerUp)
    this.studioCanvas.addEventListener('pointerleave', this.handleStudioPointerUp)
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
    this.canvas.addEventListener('contextmenu', this.handleCanvasContextMenu)
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
    this.reticle.hidden = !this.entered || this.isTouchDevice || this.studioOpen
    this.reticle.classList.toggle(
      'is-active',
      Boolean(this.hoveredItemId || this.hoveredStationId || this.hoveredStudioCanvasId),
    )
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
    if (
      !this.room ||
      !this.entered ||
      this.studioOpen ||
      (this.isTouchDevice && this.carriedFrame !== null)
    ) {
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
      this.interactiveMusicByHitArea.clear()
      this.interactiveStudioCanvasByHitArea.clear()
    }

    this.room = buildMuseumRoom(
      this.activeImages,
      this.isTouchDevice,
      this.tilePlacements,
      this.tileImageAssignments,
      this.studioCanvasArtworks,
      this.truthBoard,
    )
    this.scene.add(this.room.group)
    this.canvasTargets = this.room.interactiveStudioCanvases.map((canvas) => ({
      id: canvas.id,
      label: canvas.label,
    }))

    for (const tile of this.room.interactiveTiles) {
      this.interactiveTileByHitArea.set(tile.hitArea.uuid, tile)
    }

    for (const wall of this.room.interactiveWalls) {
      this.interactiveWallByMesh.set(wall.mesh.uuid, wall)
    }

    for (const control of this.room.interactiveMusicControls) {
      this.interactiveMusicByHitArea.set(control.hitArea.uuid, control)
    }

    for (const studioCanvas of this.room.interactiveStudioCanvases) {
      this.interactiveStudioCanvasByHitArea.set(studioCanvas.hitArea.uuid, studioCanvas)
    }

    if (!this.entered) {
      const start = this.room.intro.start
      this.playerPosition.set(start.position.x, 0, start.position.z)
      this.cameraYaw = start.yaw
      this.cameraPitch = start.pitch
    }

    this.updateBotDock()
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
      this.setStatus('Add your name first', 'Pick a visitor name before entering the studio.')
      return
    }

    this.playerName = nextName
    this.localAvatar.setName(nextName)
    this.updateVisitorLabel()
    this.updateTruthLabel()
    this.updateRunButton()
    this.persistState()

    if (!this.room) {
      return
    }

    this.entered = true
    this.heroPanel.classList.add('is-hidden')
    this.toolbarEnterButton.textContent = 'Re-center'
    this.heroEnterButton.textContent = 'Enter Studio'
    this.playerVelocity.set(0, 0)
    this.updateShellState()

    const start = this.room.defaultPose
    this.playerPosition.set(start.position.x, 0, start.position.z)
    this.cameraYaw = start.yaw
    this.cameraPitch = start.pitch
    this.lastPresenceSyncAt = 0

    this.setStatus(
      `Welcome, ${nextName}`,
      this.isTouchDevice
        ? 'Touch mode is live. Drag to look, tap the floor markers to jump viewpoints, and tap any wall canvas to open a bigger painting sheet.'
        : 'First-person mode is live. Mouse look starts automatically, use W A S D to walk, and click any wall canvas to open a bigger painting sheet.',
    )

    this.requestDesktopPointerLock()
    this.connectMultiplayer()

    if (this.activeStationId) {
      void this.activateStation(this.activeStationId, {
        sync: false,
        announce: false,
      })
    }
  }

  private readonly handleUploadOpen = (): void => {
    if (!this.entered) {
      this.setStatus(
        'Enter the room first',
        'Choose your name and step into the studio before resetting all of the shared canvases.',
      )
      return
    }

    this.selectedStudioCanvasId = null
    this.selectedStudioCanvasLabel = null
    this.studioCanvasArtworks = {}
    this.rebuildRoom()
    this.persistState()
    this.multiplayerClient?.resetCanvases()
    void this.renderStudioCanvasFromArtwork(createStudioArtworkDataUrl('blank'))
    this.updateTruthLabel()
    this.setStatus(
      'All canvases cleared',
      'Every shared canvas is blank again, so anyone in the room can start painting from scratch.',
    )
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
      this.syncGalleryImages()
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

  private readonly handleFrameUploadInput = async (): Promise<void> => {
    const files = this.frameUploadInput.files
    const targetItemId = this.pendingFrameUploadItemId

    if (!files || files.length === 0 || !targetItemId) {
      this.frameUploadInput.value = ''
      this.pendingFrameUploadItemId = null
      return
    }

    this.setLoading(true)
    this.setStatus('Updating frame', 'Cropping and fitting your photo into that exact frame.')

    try {
      const [uploadedImage] = await loadUserImages([files[0]])

      if (!uploadedImage) {
        throw new Error('No image could be prepared for that frame.')
      }

      this.tileImageAssignments = {
        ...this.tileImageAssignments,
        [targetItemId]: uploadedImage,
      }
      this.persistState()
      this.rebuildRoom()
      this.syncGalleryImages()
      this.setStatus(
        'Frame updated',
        `That frame now shows "${uploadedImage.label}".`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update that frame.'
      this.setStatus('Frame upload failed', message)
    } finally {
      this.frameUploadInput.value = ''
      this.pendingFrameUploadItemId = null
      this.setLoading(false)
    }
  }

  private readonly handleReset = (): void => {
    if (!this.entered) {
      this.setStatus(
        'Enter the room first',
        'Choose your visitor name and step into the studio before opening the hero canvas sheet.',
      )
      return
    }

    this.openStudioEditor('canvas-north-hero', 'Hero Canvas')
  }

  private readonly handleChatSubmit = (event: SubmitEvent): void => {
    event.preventDefault()

    if (!this.entered) {
      this.setStatus(
        'Enter the room first',
        'Choose your visitor name and step into the studio before sending live room chat.',
      )
      return
    }

    const message = this.chatInput.value.trim().replace(/\s+/g, ' ')

    if (!message) {
      return
    }

    this.multiplayerClient?.sendChatMessage(message)
    this.chatInput.value = ''
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
      this.hoveredStationId = null
      this.hoveredStudioCanvasId = null

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

  private readonly handleCanvasContextMenu = (event: MouseEvent): void => {
    if (!this.entered || this.isTouchDevice || this.studioOpen || !this.room?.interactiveTiles.length) {
      return
    }

    event.preventDefault()

    if (!this.pointerLocked) {
      return
    }

    const interactiveTile = this.pickCenteredInteractiveTile()

    if (!interactiveTile) {
      this.setStatus(
        'Aim at a frame',
        'Right-click while the center reticle is directly on a frame to upload a photo into that exact spot.',
      )
      return
    }

    this.openFrameUploadForItem(interactiveTile.itemId)
  }

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked || !this.entered || this.studioOpen) {
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
    if (!this.entered || this.isTouchDevice || this.studioOpen) {
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

    const musicControl = this.pickCenteredMusicControl()

    if (musicControl) {
      void this.activateStation(musicControl.stationId, {
        sync: true,
        announce: true,
      })
      return
    }

    const studioCanvas = this.pickCenteredStudioCanvas()

    if (studioCanvas) {
      this.openStudioEditor(studioCanvas.id, studioCanvas.label)
      return
    }

    const interactiveTile = this.pickCenteredInteractiveTile()

    if (!interactiveTile) {
      return
    }

    this.startCarryingFrame(interactiveTile.itemId)
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.studioOpen && event.code === 'Escape') {
      event.preventDefault()
      this.closeStudioEditor()
      return
    }

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
    if (!this.room || !this.entered || this.studioOpen) {
      return
    }

    if (!this.isTouchDevice) {
      if (event.button === 2) {
        event.preventDefault()

        if (!this.pointerLocked) {
          return
        }

        const interactiveTile = this.pickCenteredInteractiveTile()

        if (!interactiveTile) {
          this.setStatus(
            'Aim at a frame',
            'Right-click while the center reticle is directly on a frame to upload a photo into that exact spot.',
          )
          return
        }

        this.openFrameUploadForItem(interactiveTile.itemId)
      }

      return
    }

    const musicControl = this.pickInteractiveMusicControl(event)

    if (musicControl) {
      void this.activateStation(musicControl.stationId, {
        sync: true,
        announce: true,
      })
      return
    }

    const studioCanvas = this.pickInteractiveStudioCanvas(event)

    if (studioCanvas) {
      this.openStudioEditor(studioCanvas.id, studioCanvas.label)
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
    if (!this.room || !this.entered || this.studioOpen) {
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
      this.hoveredStationId = null
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
    this.hoveredStationId = null
    this.hoveredStudioCanvasId = null
    this.refreshInteractionHighlights()
  }

  private readonly handlePointerLeave = (): void => {
    if (!this.pointerState) {
      this.hoveredItemId = null
      this.hoveredWallId = null
      this.hoveredStationId = null
      this.hoveredStudioCanvasId = null
      this.refreshInteractionHighlights()
    }
  }

  private updateDesktopAim(): void {
    if (!this.room || !this.entered || this.isTouchDevice || this.studioOpen) {
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
      const hoveredMusicControl = this.pickCenteredMusicControl()

      if (hoveredMusicControl) {
        this.hoveredItemId = null
        this.hoveredWallId = null
        this.hoveredStationId = hoveredMusicControl.stationId
        this.hoveredStudioCanvasId = null
        this.refreshInteractionHighlights()
        return
      }

      const hoveredStudioCanvas = this.pickCenteredStudioCanvas()

      if (hoveredStudioCanvas) {
        this.hoveredItemId = null
        this.hoveredWallId = null
        this.hoveredStationId = null
        this.hoveredStudioCanvasId = hoveredStudioCanvas.id
        this.refreshInteractionHighlights()
        return
      }

      const hoveredTile = this.pickCenteredInteractiveTile()
      this.hoveredItemId = hoveredTile?.itemId ?? null
      this.hoveredWallId = null
      this.hoveredStationId = null
      this.hoveredStudioCanvasId = null
      this.refreshInteractionHighlights()
      return
    }

    if (this.hoveredItemId || this.hoveredWallId || this.hoveredStationId || this.hoveredStudioCanvasId) {
      this.hoveredItemId = null
      this.hoveredWallId = null
      this.hoveredStationId = null
      this.hoveredStudioCanvasId = null
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
    this.hoveredStationId = null
    this.hoveredStudioCanvasId = null

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
    this.hoveredStationId = null
    this.hoveredStudioCanvasId = null
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
        onGallerySync: (uploadedImages, tileImageAssignments, studioCanvasArtworks, changedBy) => {
          if (changedBy !== this.multiplayerSelfId) {
            this.applyRemoteGalleryImages(
              uploadedImages,
              tileImageAssignments,
              studioCanvasArtworks,
            )
          }
        },
        onCanvasSync: (canvasId, artwork, changedBy) => {
          if (changedBy !== this.multiplayerSelfId) {
            this.applyRemoteCanvasSync(canvasId, artwork)
          }
        },
        onRoomReset: (target, changedBy) => {
          if (changedBy !== this.multiplayerSelfId && target === 'canvases') {
            this.applyRemoteCanvasReset()
          }
        },
        onChatSync: (chatMessages) => {
          this.chatMessages = trimChatMessages(chatMessages)
          this.updateBotDock()
        },
        onChatMessage: (chatMessage) => {
          this.chatMessages = trimChatMessages([...this.chatMessages, chatMessage])
          this.updateBotDock()
        },
        onStationSync: (activeStationId, changedBy) => {
          if (changedBy !== this.multiplayerSelfId) {
            void this.activateStation(activeStationId, {
              sync: false,
              announce: false,
            })
          }
        },
        onBoardSync: (truthBoard, changedBy) => {
          this.truthBoard = truthBoard
          this.agentObjective = truthBoard.objective
          this.objectiveInput.value = truthBoard.objective
          this.persistState()
          this.updateTruthLabel()
          this.updateRunButton()
          this.rebuildRoom()

          if (changedBy !== this.multiplayerSelfId && changedBy === 'system') {
            this.setStatus(
              'Studio sync updated',
              'The shared room state changed in the background and your studio just refreshed.',
            )
          }
        },
        onError: (message) => {
          console.warn(message)
          this.setStatus('Live room warning', message)
        },
      })
    }

    this.multiplayerClient.connect({
      roomId: this.roomId,
      name: this.playerName,
      kind: 'human',
      pose: this.getCurrentPose(0),
      uploadedImages: this.uploadedImages,
      tilePlacements: this.tilePlacements,
      tileImageAssignments: this.tileImageAssignments,
      activeStationId: this.activeStationId,
      studioCanvasArtworks: this.studioCanvasArtworks,
      objective: this.agentObjective,
    })
  }

  private applySnapshot(snapshot: RoomSnapshot): void {
    this.uploadedImages = snapshot.uploadedImages
    this.activeImages = mergeGalleryImages(this.placeholders, this.uploadedImages)
    this.tilePlacements = normalizeTilePlacements(WALL_TEMPLATES, snapshot.tilePlacements)
    this.tileImageAssignments = snapshot.tileImageAssignments
    this.studioCanvasArtworks = snapshot.studioCanvasArtworks
    this.truthBoard = snapshot.truthBoard
    this.movementAnchors = snapshot.movementAnchors
    this.canvasTargets = snapshot.canvasTargets
    this.chatMessages = trimChatMessages(snapshot.chatMessages)
    this.agentObjective = snapshot.truthBoard.objective
    this.objectiveInput.value = this.agentObjective
    this.selectedStudioCanvasId = null
    this.selectedStudioCanvasLabel = null
    void this.renderStudioCanvasFromArtwork(createStudioArtworkDataUrl('blank'))
    this.persistState()
    this.rebuildRoom()
    this.updateTruthLabel()
    this.updateRunButton()
    this.syncRemotePlayers(snapshot.players)
    this.updateBotDock()
    void this.activateStation(snapshot.activeStationId, {
      sync: false,
      announce: false,
    })
  }

  private applyRemoteTilePlacements(tilePlacements: GalleryTilePlacements): void {
    this.carriedFrame = null
    this.hoveredItemId = null
    this.hoveredWallId = null
    this.hoveredStationId = null
    this.hoveredStudioCanvasId = null
    this.hideDragGhost()
    this.tilePlacements = normalizeTilePlacements(WALL_TEMPLATES, tilePlacements)
    this.persistState()
    this.rebuildRoom()
  }

  private applyRemoteGalleryImages(
    uploadedImages: GalleryImage[],
    tileImageAssignments: GalleryTileImageAssignments,
    studioCanvasArtworks: StudioCanvasArtworks,
  ): void {
    this.uploadedImages = uploadedImages
    this.activeImages = mergeGalleryImages(this.placeholders, this.uploadedImages)
    this.tileImageAssignments = tileImageAssignments
    this.studioCanvasArtworks = studioCanvasArtworks
    if (this.studioOpen && this.selectedStudioCanvasId) {
      const selectedArtwork = this.studioCanvasArtworks[this.selectedStudioCanvasId]
      void this.renderStudioCanvasFromArtwork(selectedArtwork ?? createStudioArtworkDataUrl('blank'))
    }
    this.persistState()
    this.rebuildRoom()
    this.updateTruthLabel()
  }

  private applyRemoteCanvasSync(canvasId: string, artwork: string | null): void {
    if (artwork) {
      this.studioCanvasArtworks = {
        ...this.studioCanvasArtworks,
        [canvasId]: artwork,
      }
    } else {
      const nextArtworks = { ...this.studioCanvasArtworks }
      delete nextArtworks[canvasId]
      this.studioCanvasArtworks = nextArtworks
    }

    if (this.studioOpen && this.selectedStudioCanvasId === canvasId) {
      void this.renderStudioCanvasFromArtwork(artwork ?? createStudioArtworkDataUrl('blank'))
    }

    this.persistState()
    this.rebuildRoom()
    this.updateTruthLabel()
  }

  private applyRemoteCanvasReset(): void {
    this.studioCanvasArtworks = {}

    if (this.studioOpen && this.selectedStudioCanvasId) {
      void this.renderStudioCanvasFromArtwork(createStudioArtworkDataUrl('blank'))
    }

    this.persistState()
    this.rebuildRoom()
    this.updateTruthLabel()
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
    const displayName = player.kind === 'agent' && player.title
      ? `${player.name} · ${player.title}`
      : player.name

    if (existing) {
      existing.avatar.setName(displayName)
      existing.player = player
      existing.targetPose = player.pose
      this.updateBotDock()
      return
    }

    const avatar = createPlayerAvatar(displayName, {
      accentColor: player.accentColor,
    })
    avatar.setFirstPersonMode(false)
    avatar.group.position.set(player.pose.x, 0, player.pose.z)
    avatar.setFacing(player.pose.yaw + Math.PI)
    this.scene.add(avatar.group)
    this.remotePlayers.set(player.id, {
      avatar,
      player,
      pose: { ...player.pose },
      targetPose: { ...player.pose },
    })
    this.updateBotDock()
  }

  private removeRemotePlayer(playerId: string): void {
    const runtime = this.remotePlayers.get(playerId)

    if (!runtime) {
      return
    }

    this.scene.remove(runtime.avatar.group)
    disposeObject(runtime.avatar.group)
    this.remotePlayers.delete(playerId)
    this.updateBotDock()
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

  private readonly handleAudioPlaying = (): void => {
    const station = getMusicStation(this.activeStationId)
    if (!station) {
      return
    }

    this.statusStation.textContent = `Now playing: ${station.label} | ${station.genre}`
    this.statusStation.classList.add('is-live')
  }

  private readonly handleAudioWaiting = (): void => {
    const station = getMusicStation(this.activeStationId)
    if (!station) {
      return
    }

    this.statusStation.textContent = `Tuning: ${station.label}`
    this.statusStation.classList.remove('is-live')
  }

  private readonly handleAudioError = (): void => {
    const station = getMusicStation(this.activeStationId)
    const stationLabel = station?.label ?? 'live radio'
    this.statusStation.textContent = `Radio unavailable: ${stationLabel}`
    this.statusStation.classList.remove('is-live')
  }

  private async activateStation(
    stationId: string | null,
    options: {
      sync: boolean
      announce: boolean
    },
  ): Promise<void> {
    const station = getMusicStation(stationId)

    if (!station) {
      this.audio.pause()
      this.audio.removeAttribute('src')
      this.audio.load()
      this.activeStationId = null
      this.persistState()
      this.updateStationLabel('Radio stopped. Choose another station at the listening corner.')
      this.refreshInteractionHighlights()

      if (options.sync) {
        this.multiplayerClient?.updateActiveStationId(null)
      }

      if (options.announce) {
        this.setStatus(
          'Music stopped',
          'The listening corner is quiet now. Pick any station button whenever you want to start it again.',
        )
      }

      return
    }

    const previousStationId = this.activeStationId
    const previousSrc = this.audio.src
    this.activeStationId = station.id
    this.persistState()
    this.updateStationLabel(`Tuning: ${station.label}`)
    this.refreshInteractionHighlights()

    const shouldReplaceSource =
      previousStationId !== station.id || !previousSrc.includes(station.streamUrl)

    if (shouldReplaceSource) {
      this.audio.pause()
      this.audio.src = station.streamUrl
      this.audio.load()
    }

    try {
      await this.audio.play()
    } catch {
      this.statusStation.textContent = `Ready: ${station.label} | click the station again if audio is blocked`
      this.statusStation.classList.remove('is-live')
    }

    if (options.sync) {
      this.multiplayerClient?.updateActiveStationId(station.id)
    }

    if (options.announce) {
      this.setStatus(
        'Station changed',
        `${station.label} is selected at the listening corner. Everyone in this room will hear the same station once playback starts on their device.`,
      )
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

  private pickInteractiveMusicControl(
    event: PointerEvent,
  ): MuseumRoom['interactiveMusicControls'][number] | null {
    if (!this.room) {
      return null
    }

    this.updatePointerFromEvent(event)
    return this.pickInteractiveMusicControlFromCurrentPointer()
  }

  private pickCenteredMusicControl(): MuseumRoom['interactiveMusicControls'][number] | null {
    if (!this.room) {
      return null
    }

    this.pointer.set(0, 0)
    return this.pickInteractiveMusicControlFromCurrentPointer()
  }

  private pickInteractiveMusicControlFromCurrentPointer():
    | MuseumRoom['interactiveMusicControls'][number]
    | null {
    if (!this.room) {
      return null
    }

    this.raycaster.setFromCamera(this.pointer, this.camera)

    const intersections = this.raycaster.intersectObjects(
      this.room.interactiveMusicControls.map((control) => control.hitArea),
      false,
    )

    for (const intersection of intersections) {
      const control = this.interactiveMusicByHitArea.get(intersection.object.uuid)
      if (control) {
        return control
      }
    }

    return null
  }

  private pickInteractiveStudioCanvas(
    event: PointerEvent,
  ): MuseumRoom['interactiveStudioCanvases'][number] | null {
    if (!this.room) {
      return null
    }

    this.updatePointerFromEvent(event)
    return this.pickInteractiveStudioCanvasFromCurrentPointer()
  }

  private pickCenteredStudioCanvas(): MuseumRoom['interactiveStudioCanvases'][number] | null {
    if (!this.room) {
      return null
    }

    this.pointer.set(0, 0)
    return this.pickInteractiveStudioCanvasFromCurrentPointer()
  }

  private pickInteractiveStudioCanvasFromCurrentPointer():
    | MuseumRoom['interactiveStudioCanvases'][number]
    | null {
    if (!this.room) {
      return null
    }

    this.raycaster.setFromCamera(this.pointer, this.camera)

    const intersections = this.raycaster.intersectObjects(
      this.room.interactiveStudioCanvases.map((canvas) => canvas.hitArea),
      false,
    )

    for (const intersection of intersections) {
      const studioCanvas = this.interactiveStudioCanvasByHitArea.get(intersection.object.uuid)
      if (studioCanvas) {
        return studioCanvas
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

    for (const control of this.room.interactiveMusicControls) {
      const isActive =
        control.action === 'station' && control.stationId === this.activeStationId
      const isHovered = control.stationId === this.hoveredStationId
      control.halo.visible = isActive || isHovered
      control.haloMaterial.opacity = isActive ? 0.3 : 0.16
      control.buttonMaterial.color.set(isActive ? '#fffaf4' : isHovered ? '#f6ede4' : '#efe2d4')
      control.buttonMaterial.emissive.set(isActive || isHovered ? control.accentColor : '#170d10')
      control.buttonMaterial.emissiveIntensity = isActive ? 0.92 : isHovered ? 0.48 : 0.14
    }

    for (const studioCanvas of this.room.interactiveStudioCanvases) {
      const isHovered = studioCanvas.id === this.hoveredStudioCanvasId
      studioCanvas.halo.visible = isHovered
      studioCanvas.haloMaterial.opacity = isHovered ? 0.22 : 0.12
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
    this.audio.pause()
    this.multiplayerClient?.disconnect()
  }

  private updateVisitorLabel(): void {
    this.statusVisitor.textContent = `Visitor: ${this.playerName || 'Guest'}`
  }

  private updateSyncLabel(): void {
    this.statusSync.textContent = summarizeRoomPresence(
      this.roomId,
      this.connectionState,
      this.entered,
      Array.from(this.remotePlayers.values()).map((runtime) => runtime.player),
    )
    this.updateBotDock()
  }

  private updateTruthLabel(): void {
    const paintedCount = Object.keys(this.studioCanvasArtworks).length
    const totalCanvases = Math.max(this.canvasTargets.length, 1)
    const editingLabel = this.selectedStudioCanvasLabel

    this.statusTruth.textContent = editingLabel
      ? `Canvas: editing ${editingLabel}`
      : `Canvas: ${paintedCount}/${totalCanvases} painted`
  }

  private updateRunButton(): void {
    this.runToggleButton.textContent = 'Blank All Canvases'
  }

  private updateBotDock(): void {
    const remotePlayers = Array.from(this.remotePlayers.values()).map((runtime) => runtime.player)
    const botCount = remotePlayers.filter((player) => player.kind === 'agent').length
    const humanCount = remotePlayers.length - botCount + (this.entered ? 1 : 0)
    const guideUrl = `/api/rooms/${this.roomId}/guide`
    this.botSummary.textContent = botCount > 0
      ? `${botCount} bot${botCount === 1 ? '' : 's'} live with ${humanCount} human${humanCount === 1 ? '' : 's'}. Guide: ${guideUrl}`
      : `No bots live yet. Bots can join by WebSocket or POST ${guideUrl}`

    this.renderChipList(
      this.botAnchorList,
      this.movementAnchors.map((anchor) => `${anchor.id}`),
      'No movement anchors yet.',
    )
    this.renderChipList(
      this.botCanvasList,
      this.canvasTargets.map((canvas) => canvas.id),
      'No canvases registered yet.',
    )
    this.renderChatLog()
  }

  private renderChipList(target: HTMLElement, labels: string[], emptyText: string): void {
    target.innerHTML = ''

    if (labels.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'bot-empty'
      empty.textContent = emptyText
      target.append(empty)
      return
    }

    labels.forEach((label) => {
      const chip = document.createElement('span')
      chip.className = 'bot-chip'
      chip.textContent = label
      target.append(chip)
    })
  }

  private renderChatLog(): void {
    this.chatLog.innerHTML = ''

    if (this.chatMessages.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'chat-empty'
      empty.textContent = 'No shared chat yet.'
      this.chatLog.append(empty)
      return
    }

    trimChatMessages(this.chatMessages).forEach((message) => {
      const item = document.createElement('li')
      item.className = `chat-item${message.authorKind === 'agent' ? ' is-agent' : ''}`

      const author = document.createElement('span')
      author.className = 'chat-author'
      author.textContent = formatChatAuthor(message)
      if (message.accentColor) {
        author.style.color = message.accentColor
      }

      const body = document.createElement('span')
      body.className = 'chat-body'
      body.textContent = message.message

      item.append(author, body)
      this.chatLog.append(item)
    })

    this.chatLog.scrollTop = this.chatLog.scrollHeight
  }

  private updateStationLabel(overrideText?: string): void {
    if (overrideText) {
      this.statusStation.textContent = overrideText
      this.statusStation.classList.remove('is-live')
      return
    }

    const station = getMusicStation(this.activeStationId)

    if (!station) {
      this.statusStation.textContent = 'Radio: Walk to the listening corner and pick a live station'
      this.statusStation.classList.remove('is-live')
      return
    }

    this.statusStation.textContent = `Radio selected: ${station.label} | ${station.genre}`
    this.statusStation.classList.remove('is-live')
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
    const image =
      this.tileImageAssignments[tile.itemId] ??
      this.activeImages.find((entry) => entry.id === tile.imageId)
    return image?.label ?? 'Move frame'
  }

  private openStudioEditor(canvasId: string, sourceLabel: string): void {
    if (this.studioOpen) {
      return
    }

    this.studioOpen = true
    this.selectedStudioCanvasId = canvasId
    this.selectedStudioCanvasLabel = sourceLabel
    this.hoveredStudioCanvasId = null
    this.refreshInteractionHighlights()
    this.updateTruthLabel()
    this.updateStudioToolButtons()
    this.studioSourceLabel.textContent = sourceLabel
    this.updateShellState()

    if (this.pointerLocked) {
      document.exitPointerLock()
    }

    void this.renderStudioCanvasFromArtwork(
      this.studioCanvasArtworks[canvasId] ?? createStudioArtworkDataUrl('blank'),
    )

    if (typeof this.studioDialog.showModal === 'function') {
      this.studioDialog.showModal()
    } else {
      this.studioDialog.setAttribute('open', 'true')
    }

    this.setStatus(
      'Painting sheet open',
      `${sourceLabel} is ready. Paint on the sheet, then save to project the artwork back into the room.`,
    )
  }

  private closeStudioEditor(): void {
    this.studioOpen = false
    this.studioPaintState = null
    this.selectedStudioCanvasId = null
    this.selectedStudioCanvasLabel = null
    this.updateTruthLabel()
    this.updateShellState()

    if (typeof this.studioDialog.close === 'function' && this.studioDialog.open) {
      this.studioDialog.close()
    } else {
      this.studioDialog.removeAttribute('open')
    }

    if (this.entered) {
      this.requestDesktopPointerLock()
    }
  }

  private readonly handleStudioSave = (): void => {
    if (!this.selectedStudioCanvasId) {
      return
    }

    this.studioCanvasArtworks = {
      ...this.studioCanvasArtworks,
      [this.selectedStudioCanvasId]: this.studioCanvas.toDataURL('image/png'),
    }
    const nextArtwork = this.studioCanvasArtworks[this.selectedStudioCanvasId]
    this.persistState()
    this.rebuildRoom()
    this.multiplayerClient?.updateCanvasArtwork(this.selectedStudioCanvasId, nextArtwork)
    this.closeStudioEditor()
    this.setStatus(
      'Painting projected',
      'That canvas now shows your new artwork for everyone in the room.',
    )
  }

  private readonly handleStudioClose = (): void => {
    this.closeStudioEditor()
    this.setStatus(
      'Painting sheet closed',
      'The sheet is tucked away again. Click any wall canvas whenever you want to paint more.',
    )
  }

  private readonly handleStudioClear = (): void => {
    void this.renderStudioCanvasFromArtwork(createStudioArtworkDataUrl('blank'))
    this.setStatus(
      'Fresh canvas',
      'The drawing sheet is back to a blank surface. Save when you want to project it into the room.',
    )
  }

  private readonly handleStudioBrushInput = (): void => {
    this.brushSize = clampBrushSize(Number(this.studioBrushInput.value))
    this.studioBrushInput.value = String(this.brushSize)
    this.updateStudioBrushLabel()
  }

  private readonly handleStudioColorClick = (event: MouseEvent): void => {
    const button = event.currentTarget

    if (!(button instanceof HTMLButtonElement)) {
      return
    }

    const color = button.dataset.studioColor

    if (!color) {
      return
    }

    this.activeBrushColor = color
    this.updateStudioColorButtons()
  }

  private readonly handleStudioToolClick = (event: MouseEvent): void => {
    const button = event.currentTarget

    if (!(button instanceof HTMLButtonElement)) {
      return
    }

    const nextTool = button.dataset.studioTool as StudioBrushTool | undefined

    if (!nextTool) {
      return
    }

    this.activeBrushTool = nextTool
    this.updateStudioToolButtons()
    this.setStatus(
      'Brush updated',
      `${button.textContent?.trim() ?? 'That'} tool is active on the current sheet.`,
    )
  }

  private readonly handleStudioPointerDown = (event: PointerEvent): void => {
    if (!this.studioOpen || event.button !== 0) {
      return
    }

    event.preventDefault()
    const point = this.getStudioCanvasPoint(event)
    this.studioPaintState = {
      pointerId: event.pointerId,
      lastX: point.x,
      lastY: point.y,
    }
    this.studioCanvas.setPointerCapture(event.pointerId)
    this.drawStudioStroke(point.x, point.y)
  }

  private readonly handleStudioPointerMove = (event: PointerEvent): void => {
    if (!this.studioPaintState || this.studioPaintState.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    const nextPoint = this.getStudioCanvasPoint(event)
    this.drawStudioStroke(
      this.studioPaintState.lastX,
      this.studioPaintState.lastY,
      nextPoint.x,
      nextPoint.y,
    )
    this.studioPaintState.lastX = nextPoint.x
    this.studioPaintState.lastY = nextPoint.y
  }

  private readonly handleStudioPointerUp = (event: PointerEvent): void => {
    if (!this.studioPaintState || this.studioPaintState.pointerId !== event.pointerId) {
      return
    }

    if (this.studioCanvas.hasPointerCapture(event.pointerId)) {
      this.studioCanvas.releasePointerCapture(event.pointerId)
    }

    this.studioPaintState = null
  }

  private getStudioCanvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.studioCanvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.studioCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.studioCanvas.height,
    }
  }

  private drawStudioStroke(fromX: number, fromY: number, toX?: number, toY?: number): void {
    const context = this.getStudioContext()
    context.save()
    context.lineCap = 'round'
    context.lineJoin = 'round'
    const hasLineTarget = typeof toX === 'number' && typeof toY === 'number'

    if (this.activeBrushTool === 'spray') {
      const distance = hasLineTarget ? Math.hypot(toX - fromX, toY - fromY) : 0
      const steps = Math.max(1, Math.ceil(distance / 12))

      for (let index = 0; index < steps; index += 1) {
        const progress = steps === 1 ? 0 : index / (steps - 1)
        const targetX = hasLineTarget ? THREE.MathUtils.lerp(fromX, toX, progress) : fromX
        const targetY = hasLineTarget ? THREE.MathUtils.lerp(fromY, toY, progress) : fromY
        this.drawStudioSprayBurst(context, targetX, targetY)
      }

      context.restore()
      return
    }

    if (this.activeBrushTool === 'eraser') {
      context.globalCompositeOperation = 'destination-out'
      context.strokeStyle = '#000000'
      context.fillStyle = '#000000'
      context.lineWidth = this.brushSize * 1.2
    } else if (this.activeBrushTool === 'marker') {
      context.strokeStyle = withAlpha(this.activeBrushColor, 0.42)
      context.fillStyle = withAlpha(this.activeBrushColor, 0.42)
      context.lineWidth = this.brushSize * 1.55
    } else {
      context.strokeStyle = this.activeBrushColor
      context.fillStyle = this.activeBrushColor
      context.lineWidth = this.brushSize
    }

    if (hasLineTarget) {
      context.beginPath()
      context.moveTo(fromX, fromY)
      context.lineTo(toX, toY)
      context.stroke()
    } else {
      context.beginPath()
      context.arc(fromX, fromY, context.lineWidth / 2, 0, Math.PI * 2)
      context.fill()
    }

    context.restore()
  }

  private drawStudioSprayBurst(
    context: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
  ): void {
    const radius = this.brushSize * 0.72
    const dots = Math.max(14, Math.round(this.brushSize * 1.6))
    context.fillStyle =
      this.activeBrushTool === 'eraser' ? '#000000' : withAlpha(this.activeBrushColor, 0.28)

    for (let index = 0; index < dots; index += 1) {
      const angle = Math.random() * Math.PI * 2
      const distance = Math.random() * radius
      const x = centerX + Math.cos(angle) * distance
      const y = centerY + Math.sin(angle) * distance
      const size = 0.8 + Math.random() * (this.brushSize * 0.08)
      context.beginPath()
      context.arc(x, y, size, 0, Math.PI * 2)
      context.fill()
    }
  }

  private async renderStudioCanvasFromArtwork(artwork: string): Promise<void> {
    const context = this.getStudioContext()
    context.clearRect(0, 0, this.studioCanvas.width, this.studioCanvas.height)

    try {
      const image = await loadImageSource(artwork)
      context.drawImage(image, 0, 0, this.studioCanvas.width, this.studioCanvas.height)
    } catch {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, this.studioCanvas.width, this.studioCanvas.height)
    }
  }

  private getStudioContext(): CanvasRenderingContext2D {
    const context = this.studioCanvas.getContext('2d')

    if (!context) {
      throw new Error('Studio painting canvas requires a 2D context.')
    }

    return context
  }

  private updateStudioBrushLabel(): void {
    this.studioBrushValue.textContent = `${this.brushSize}px`
  }

  private updateStudioColorButtons(): void {
    this.studioColorButtons.forEach((button) => {
      const isActive = button.dataset.studioColor === this.activeBrushColor
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    })
  }

  private updateStudioToolButtons(): void {
    this.studioToolButtons.forEach((button) => {
      const isActive = button.dataset.studioTool === this.activeBrushTool
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    })
  }

  private openFrameUploadForItem(itemId: string): void {
    this.pendingFrameUploadItemId = itemId

    if (this.pointerLocked) {
      document.exitPointerLock()
    }

    this.frameUploadInput.click()
    this.setStatus(
      'Choose a photo',
      'Pick one image and I will fit it directly into the frame you targeted.',
    )
  }

  private syncGalleryImages(): void {
    this.multiplayerClient?.updateGalleryImages(
      this.uploadedImages,
      this.tileImageAssignments,
      this.studioCanvasArtworks,
    )
  }

  private persistState(): void {
    const state: GalleryState = {
      uploadedImages: this.uploadedImages,
      playerName: this.playerName || undefined,
      tilePlacements: this.tilePlacements,
      tileImageAssignments: this.tileImageAssignments,
      activeStationId: this.activeStationId ?? undefined,
      studioCanvasArtworks:
        Object.keys(this.studioCanvasArtworks).length > 0 ? this.studioCanvasArtworks : undefined,
      agentObjective: this.agentObjective,
    }

    if (
      state.uploadedImages.length === 0 &&
      !state.playerName &&
      isDefaultTilePlacements(this.tilePlacements) &&
      Object.keys(this.tileImageAssignments).length === 0 &&
      !state.activeStationId &&
      !state.studioCanvasArtworks &&
      state.agentObjective === createDefaultTruthBoard().objective
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

  private updateShellState(): void {
    const shell = this.root.querySelector<HTMLDivElement>('.museum-app')

    if (!shell) {
      return
    }

    shell.classList.toggle('is-entered', this.entered)
    shell.classList.toggle('is-studio-open', this.studioOpen)
  }

  private setStatus(title: string, copy: string): void {
    this.statusTitle.textContent = title
    this.statusCopy.textContent = copy
  }
}

function createShellMarkup({
  playerName,
  roomId,
  isTouchDevice,
}: {
  playerName: string
  roomId: string
  isTouchDevice: boolean
}): string {
  const safeName = escapeHtml(playerName)
  const brushSwatches = STUDIO_BRUSH_COLORS.map(
    (color) => `
      <button
        type="button"
        class="studio-swatch${color === STUDIO_BRUSH_COLORS[0] ? ' is-active' : ''}"
        style="--swatch:${color}"
        data-studio-color="${color}"
        aria-pressed="${color === STUDIO_BRUSH_COLORS[0] ? 'true' : 'false'}"
        aria-label="Brush color ${color}"
      ></button>
    `,
  ).join('')
  const toolButtons = STUDIO_BRUSH_TOOLS.map(
    (tool) => `
      <button type="button" class="studio-chip${tool.id === 'brush' ? ' is-active' : ''}" data-studio-tool="${tool.id}" aria-pressed="${tool.id === 'brush' ? 'true' : 'false'}">
        ${escapeHtml(tool.label)}
      </button>
    `,
  ).join('')

  return `
    <div class="museum-app">
      <div class="loading-screen is-visible" data-loading>
        <div class="loading-card">
          <div class="loading-lockup">
            <div class="loading-logo" aria-label="ClawArt logo">ClawArt</div>
            <span class="loading-mark">ClawArt</span>
          </div>
          <h2 class="loading-title">Preparing your canvas studio.</h2>
          <p class="loading-copy">Warming the lights, laying out the blank canvases, and getting the shared painting room ready.</p>
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
            <div class="brand-logo" aria-label="ClawArt logo">ClawArt</div>
          </div>
          <div class="brand-copy">
            <p class="brand-kicker">ClawArt</p>
            <h1 class="brand-title">ClawArt Shared Studio</h1>
            <p class="brand-sub">Walk, paint, chat, and let bots explore the room with you.</p>
          </div>
        </div>

        <div class="button-row">
          <button type="button" class="toolbar-button primary" data-enter-toolbar>Enter Studio</button>
          <button type="button" class="toolbar-button" data-upload-open>Blank All Canvases</button>
          <button type="button" class="toolbar-button" data-reset>Open Hero Canvas</button>
          <button type="button" class="toolbar-button" data-help-open>Help</button>
        </div>
      </div>

      <section class="hero-panel" data-hero>
        <p class="eyebrow">Shared Painting Room</p>
        <h2 class="hero-title">Choose your name, enter in first person, and paint on any wall canvas.</h2>
        <p class="hero-copy">Each canvas opens into a larger plain white sheet where you can paint with colors and brush tools, save it back to the wall, clear it, and keep making art together with other players in the same room.</p>

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

          <input data-objective-input type="hidden" value="Create art together on every canvas in the room." />

          <p class="hero-note">
            ${
              isTouchDevice
                ? 'Touch: drag to look, tap floor markers to jump around the room, and tap any wall canvas to open its big painting sheet.'
                : 'Desktop: entering the studio starts mouse look automatically, use W A S D to walk, and click any wall canvas to open its big painting sheet.'
            }
          </p>

          <div class="hero-actions">
            <button type="submit" class="hero-button primary" data-enter-hero>Enter Studio</button>
            <button type="button" class="hero-button secondary" data-help-open>How it works</button>
          </div>
        </form>
      </section>

      <aside class="status-card">
        <p class="status-kicker">Room HUD</p>
        <p class="status-title" data-status-title>Canvas studio prepared</p>
        <p class="status-copy" data-status-copy>Choose your visitor name, enter the room, and click any canvas to start painting.</p>
        <p class="status-visitor" data-status-visitor>Visitor: Guest</p>
        <p class="status-sync" data-status-sync>Room: ${escapeHtml(roomId)} · Solo mode</p>
        <p class="status-truth" data-status-truth>Canvas: 0/1 painted</p>
        <p class="status-station" data-status-station>Radio: Walk to the listening corner and pick a live station</p>
      </aside>

      <aside class="bot-card">
        <p class="status-kicker">Room Chat</p>
        <p class="status-title">Talk with everyone here</p>
        <p class="status-copy" data-bot-summary>No bots live yet. Bots can join this room and reuse the saved canvases.</p>

        <div class="bot-section">
          <ul class="chat-log" data-chat-log>
            <li class="chat-empty">No shared chat yet.</li>
          </ul>
          <form class="chat-form" data-chat-form>
            <input
              class="chat-input"
              data-chat-input
              type="text"
              maxlength="220"
              placeholder="Say something to the room..."
              autocomplete="off"
              spellcheck="false"
            />
            <button type="submit" class="chat-send">Send</button>
          </form>
        </div>

        <details class="bot-details">
          <summary>Bot tools and room ids</summary>
          <div class="bot-details-grid">
            <div class="bot-section">
              <p class="bot-section-label">Movement Anchors</p>
              <div class="bot-chip-list" data-bot-anchors></div>
            </div>

            <div class="bot-section">
              <p class="bot-section-label">Canvas Targets</p>
              <div class="bot-chip-list" data-bot-canvases></div>
            </div>
          </div>
        </details>
      </aside>

      <input class="upload-input" data-upload type="file" accept="image/*" multiple />
      <input class="upload-input" data-upload-frame type="file" accept="image/*" />

      <div class="drag-ghost" data-drag-ghost hidden>
        <span class="drag-ghost-label" data-drag-ghost-label>Move frame</span>
      </div>

      <dialog class="studio-dialog" data-studio>
        <div class="studio-shell">
          <div class="studio-header">
            <div>
              <p class="studio-kicker">Canvas Studio</p>
              <h2 class="studio-title">Paint on a shared blank sheet.</h2>
              <p class="studio-copy" data-studio-source>Hero Canvas</p>
            </div>
            <button type="button" class="dialog-close studio-close-top" data-studio-close>Close</button>
          </div>

          <p class="studio-copy">Paint with brushes, marker, spray, or eraser, then save to project the artwork back onto that exact wall canvas for everyone in the room.</p>

          <div class="studio-board">
            <canvas class="studio-canvas" data-studio-canvas></canvas>
          </div>

          <div class="studio-toolbar">
            <div class="studio-section">
              <span class="studio-section-label">Brush</span>
              <label class="studio-range">
                <input type="range" min="4" max="42" step="1" value="18" data-studio-brush />
                <span class="studio-range-value" data-studio-brush-value>18px</span>
              </label>
            </div>

            <div class="studio-section">
              <span class="studio-section-label">Colors</span>
              <div class="studio-swatches">${brushSwatches}</div>
            </div>

            <div class="studio-section">
              <span class="studio-section-label">Tools</span>
              <div class="studio-chips">${toolButtons}</div>
            </div>
          </div>

          <div class="studio-actions">
            <button type="button" class="hero-button secondary" data-studio-clear>Clear Sheet</button>
            <button type="button" class="hero-button secondary" data-studio-close>Close</button>
            <button type="button" class="hero-button primary" data-studio-save>Save to Canvas</button>
          </div>
        </div>
      </dialog>

      <dialog class="help-dialog" data-help>
        <div class="help-shell">
          <h2>How the room works</h2>
          <p>The room stays in first person the whole time. Every visitor in the same room sees the same canvases and the same saved artwork updates together.</p>
          <ul class="help-list">
            <li>Enter the room with your visitor name, then walk right up to any blank canvas you want to paint.</li>
            <li>Desktop walk mode: entering the studio locks mouse look automatically, and pressing Esc frees the cursor again.</li>
            <li>Touch walk mode: drag to look and tap the glowing floor markers to jump viewpoints around the studio.</li>
            <li>Click any wall canvas to open a bigger plain white sheet, then paint with brush, marker, spray, or eraser.</li>
            <li>Save projects the artwork back to that exact canvas in the room for everyone else in the same multiplayer room.</li>
            <li>Blank All Canvases clears every shared painting surface so the room can restart from scratch.</li>
            <li>Listening corner: walk to the retro console in the corner and click any station button to switch the shared room music, or hit Stop Music to silence it for the whole room.</li>
            <li>Open the same room link on multiple browsers or devices and everyone will see the same canvases and saved painting updates.</li>
            <li>Bots can use the room guide at <code>/api/rooms/${escapeHtml(roomId)}/guide</code> to find movement anchors, canvas ids, and command examples.</li>
            <li>The server now keeps the room state live on disk, so new joiners inherit the latest saved drawings and recent room chat.</li>
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

function withAlpha(hexColor: string, alpha: number): string {
  const color = new THREE.Color(hexColor)
  const red = Math.round(color.r * 255)
  const green = Math.round(color.g * 255)
  const blue = Math.round(color.b * 255)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
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

function loadImageSource(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load the studio artwork.'))
    image.src = source
  })
}

function createDefaultTruthBoard(
  objective: string = 'Create art together on every canvas in the room.',
): TruthBoardState {
  const normalizedObjective =
    sanitizeObjective(objective) ?? 'Create art together on every canvas in the room.'

  return {
    objective: normalizedObjective,
    phase: 'Studio',
    leadAgentName: 'Canvas',
    notes: [
      `The room is ready for shared art around "${normalizedObjective}".`,
      'Pick any wall canvas to open a bigger blank sheet.',
      'Saved paintings reflect straight back into the room for everyone.',
    ],
    conclusion: 'The canvas room is ready for the next brush stroke.',
    cycle: 0,
    status: 'running',
  }
}

function sanitizeObjective(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')

  if (!normalized) {
    return null
  }

  return normalized.slice(0, 120)
}
