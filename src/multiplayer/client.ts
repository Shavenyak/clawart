import type {
  RoomChatMessage,
  GalleryImage,
  StudioCanvasArtworks,
  GalleryTileImageAssignments,
  GalleryTilePlacements,
  TruthBoardState,
} from '../types'
import type {
  ClientToServerMessage,
  ConnectionState,
  JoinPayload,
  PlayerPoseState,
  RemotePlayerState,
  RoomSnapshot,
  ServerToClientMessage,
} from './types'

interface MultiplayerClientCallbacks {
  onConnectionChange: (state: ConnectionState) => void
  onWelcome: (selfId: string, snapshot: RoomSnapshot) => void
  onPlayerJoined: (player: RemotePlayerState) => void
  onPlayerPresence: (player: RemotePlayerState) => void
  onPlayerLeft: (playerId: string) => void
  onTileSync: (tilePlacements: GalleryTilePlacements, changedBy: string) => void
  onGallerySync: (
    uploadedImages: GalleryImage[],
    tileImageAssignments: GalleryTileImageAssignments,
    studioCanvasArtworks: StudioCanvasArtworks,
    changedBy: string,
  ) => void
  onCanvasSync: (canvasId: string, artwork: string | null, changedBy: string) => void
  onRoomReset: (target: 'canvases', changedBy: string) => void
  onChatSync: (chatMessages: RoomChatMessage[]) => void
  onChatMessage: (chatMessage: RoomChatMessage) => void
  onStationSync: (activeStationId: string | null, changedBy: string) => void
  onBoardSync: (truthBoard: TruthBoardState, changedBy: string) => void
  onError: (message: string) => void
}

export class MuseumMultiplayerClient {
  private readonly callbacks: MultiplayerClientCallbacks
  private readonly socketUrl: string
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private joinPayload: JoinPayload | null = null
  private closedManually = false
  private state: ConnectionState = 'offline'

  constructor(socketUrl: string, callbacks: MultiplayerClientCallbacks) {
    this.socketUrl = socketUrl
    this.callbacks = callbacks
  }

  connect(joinPayload: JoinPayload): void {
    this.joinPayload = joinPayload
    this.closedManually = false

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.send({
        type: 'join',
        payload: joinPayload,
      })
      return
    }

    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      return
    }

    this.setConnectionState('connecting')
    this.socket = new WebSocket(this.socketUrl)
    this.socket.addEventListener('open', this.handleOpen)
    this.socket.addEventListener('close', this.handleClose)
    this.socket.addEventListener('message', this.handleMessage)
    this.socket.addEventListener('error', this.handleSocketError)
  }

  updatePresence(pose: PlayerPoseState): void {
    this.send({
      type: 'presence',
      payload: pose,
    })
  }

  updateTilePlacements(tilePlacements: GalleryTilePlacements): void {
    this.send({
      type: 'tile_sync',
      payload: tilePlacements,
    })
  }

  updateGalleryImages(
    uploadedImages: GalleryImage[],
    tileImageAssignments: GalleryTileImageAssignments,
    studioCanvasArtworks: StudioCanvasArtworks,
  ): void {
    this.send({
      type: 'gallery_sync',
      payload: {
        uploadedImages,
        tileImageAssignments,
        studioCanvasArtworks,
      },
    })
  }

  updateCanvasArtwork(canvasId: string, artwork: string | null): void {
    this.send({
      type: 'canvas_sync',
      payload: {
        canvasId,
        artwork,
      },
    })
  }

  resetCanvases(): void {
    this.send({
      type: 'room_reset',
      payload: {
        target: 'canvases',
      },
    })
  }

  sendChatMessage(message: string): void {
    this.send({
      type: 'chat_message',
      payload: {
        message,
      },
    })
  }

  updateActiveStationId(activeStationId: string | null): void {
    this.send({
      type: 'station_sync',
      payload: {
        activeStationId,
      },
    })
  }

  controlRun(action: 'pause' | 'resume' | 'restart', objective?: string): void {
    this.send({
      type: 'run_control',
      payload: {
        action,
        objective,
      },
    })
  }

  disconnect(): void {
    this.closedManually = true
    this.clearReconnectTimer()

    if (!this.socket) {
      this.setConnectionState('offline')
      return
    }

    this.socket.removeEventListener('open', this.handleOpen)
    this.socket.removeEventListener('close', this.handleClose)
    this.socket.removeEventListener('message', this.handleMessage)
    this.socket.removeEventListener('error', this.handleSocketError)
    this.socket.close()
    this.socket = null
    this.setConnectionState('offline')
  }

  private readonly handleOpen = (): void => {
    this.setConnectionState('connected')

    if (this.joinPayload) {
      this.send({
        type: 'join',
        payload: this.joinPayload,
      })
    }
  }

  private readonly handleClose = (): void => {
    this.socket = null
    this.setConnectionState('offline')

    if (this.closedManually) {
      return
    }

    this.clearReconnectTimer()
    this.reconnectTimer = window.setTimeout(() => {
      if (this.joinPayload) {
        this.connect(this.joinPayload)
      }
    }, 1800)
  }

  private readonly handleMessage = (event: MessageEvent<string>): void => {
    try {
      const message = JSON.parse(event.data) as ServerToClientMessage

      switch (message.type) {
        case 'welcome':
          this.callbacks.onWelcome(message.payload.selfId, message.payload.snapshot)
          break
        case 'player_joined':
          this.callbacks.onPlayerJoined(message.payload)
          break
        case 'player_presence':
          this.callbacks.onPlayerPresence(message.payload)
          break
        case 'player_left':
          this.callbacks.onPlayerLeft(message.payload.playerId)
          break
        case 'tile_sync':
          this.callbacks.onTileSync(message.payload.tilePlacements, message.payload.changedBy)
          break
        case 'gallery_sync':
          this.callbacks.onGallerySync(
            message.payload.gallery.uploadedImages,
            message.payload.gallery.tileImageAssignments,
            message.payload.gallery.studioCanvasArtworks,
            message.payload.changedBy,
          )
          break
        case 'canvas_sync':
          this.callbacks.onCanvasSync(
            message.payload.canvasId,
            message.payload.artwork,
            message.payload.changedBy,
          )
          break
        case 'room_reset':
          this.callbacks.onRoomReset(message.payload.target, message.payload.changedBy)
          break
        case 'chat_sync':
          this.callbacks.onChatSync(message.payload.chatMessages)
          break
        case 'chat_message':
          this.callbacks.onChatMessage(message.payload.chatMessage)
          break
        case 'station_sync':
          this.callbacks.onStationSync(message.payload.activeStationId, message.payload.changedBy)
          break
        case 'board_sync':
          this.callbacks.onBoardSync(message.payload.truthBoard, message.payload.changedBy)
          break
        case 'error':
          this.callbacks.onError(message.payload.message)
          break
        default:
          break
      }
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error ? error.message : 'Failed to read a multiplayer message.',
      )
    }
  }

  private readonly handleSocketError = (): void => {
    this.callbacks.onError('Multiplayer server unavailable. You are still in local solo mode.')
  }

  private send(message: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return
    }

    this.socket.send(JSON.stringify(message))
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.state === state) {
      return
    }

    this.state = state
    this.callbacks.onConnectionChange(state)
  }
}
