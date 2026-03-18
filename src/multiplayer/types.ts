import type { GalleryImage, GalleryTilePlacements } from '../types'

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
  pose: PlayerPoseState
}

export interface RoomSnapshot {
  uploadedImages: GalleryImage[]
  tilePlacements: GalleryTilePlacements
  players: RemotePlayerState[]
}

export interface JoinPayload {
  roomId: string
  name: string
  pose: PlayerPoseState
  uploadedImages: GalleryImage[]
  tilePlacements: GalleryTilePlacements
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
      payload: GalleryImage[]
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
        uploadedImages: GalleryImage[]
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
