import type {
  GalleryImage,
  StudioCanvasArtworks,
  GalleryTileImageAssignments,
  GalleryTilePlacements,
  TruthBoardState,
} from '../types'

export interface SharedGalleryState {
  uploadedImages: GalleryImage[]
  tileImageAssignments: GalleryTileImageAssignments
  studioCanvasArtworks: StudioCanvasArtworks
}

export interface PlayerPoseState {
  x: number
  z: number
  yaw: number
  pitch: number
  speed: number
}

export interface RemotePlayerState {
  id: string
  name: string
  kind: 'human' | 'agent'
  title?: string
  accentColor?: string
  pose: PlayerPoseState
}

export interface RoomSnapshot {
  uploadedImages: GalleryImage[]
  tilePlacements: GalleryTilePlacements
  tileImageAssignments: GalleryTileImageAssignments
  activeStationId: string | null
  studioCanvasArtworks: StudioCanvasArtworks
  truthBoard: TruthBoardState
  players: RemotePlayerState[]
}

export interface JoinPayload {
  roomId: string
  name: string
  pose: PlayerPoseState
  uploadedImages: GalleryImage[]
  tilePlacements: GalleryTilePlacements
  tileImageAssignments: GalleryTileImageAssignments
  activeStationId: string | null
  studioCanvasArtworks: StudioCanvasArtworks
  objective: string
}

export type ClientToServerMessage =
  | {
      type: 'join'
      payload: JoinPayload
    }
  | {
      type: 'presence'
      payload: PlayerPoseState
    }
  | {
      type: 'tile_sync'
      payload: GalleryTilePlacements
    }
  | {
      type: 'gallery_sync'
      payload: SharedGalleryState
    }
  | {
      type: 'station_sync'
      payload: {
        activeStationId: string | null
      }
    }
  | {
      type: 'run_control'
      payload: {
        action: 'pause' | 'resume' | 'restart'
        objective?: string
      }
    }

export type ServerToClientMessage =
  | {
      type: 'welcome'
      payload: {
        selfId: string
        roomId: string
        snapshot: RoomSnapshot
      }
    }
  | {
      type: 'player_joined'
      payload: RemotePlayerState
    }
  | {
      type: 'player_presence'
      payload: RemotePlayerState
    }
  | {
      type: 'player_left'
      payload: {
        playerId: string
      }
    }
  | {
      type: 'tile_sync'
      payload: {
        tilePlacements: GalleryTilePlacements
        changedBy: string
      }
    }
  | {
      type: 'gallery_sync'
      payload: {
        gallery: SharedGalleryState
        changedBy: string
      }
    }
  | {
      type: 'station_sync'
      payload: {
        activeStationId: string | null
        changedBy: string
      }
    }
  | {
      type: 'board_sync'
      payload: {
        truthBoard: TruthBoardState
        changedBy: string
      }
    }
  | {
      type: 'error'
      payload: {
        message: string
      }
    }

export type ConnectionState = 'offline' | 'connecting' | 'connected'
