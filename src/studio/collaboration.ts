import { VIEWPOINTS } from '../data/layouts'
import type { ConnectionState, RemotePlayerState } from '../multiplayer/types'
import { CANVAS_SPECS } from '../room/createCanvasStudioRoom'
import type { CanvasTarget, MovementAnchor, RoomChatMessage } from '../types'

export const MAX_CHAT_PREVIEW_MESSAGES = 8

export function createDefaultMovementAnchors(): MovementAnchor[] {
  return VIEWPOINTS.map((viewpoint) => ({
    id: viewpoint.id,
    label: viewpoint.label,
    pose: viewpoint.pose,
  }))
}

export function createDefaultCanvasTargets(): CanvasTarget[] {
  return CANVAS_SPECS.map((canvas) => ({
    id: canvas.id,
    label: canvas.label,
  }))
}

export function summarizeRoomPresence(
  roomId: string,
  connectionState: ConnectionState,
  entered: boolean,
  remotePlayers: RemotePlayerState[],
): string {
  const liveCount = (entered ? 1 : 0) + remotePlayers.length
  const botCount = remotePlayers.filter((player) => player.kind === 'agent').length

  switch (connectionState) {
    case 'connected':
      return botCount > 0
        ? `Room: ${roomId} · ${liveCount} live · ${botCount} bots`
        : `Room: ${roomId} · ${liveCount} live`
    case 'connecting':
      return `Room: ${roomId} · Connecting live sync...`
    default:
      return `Room: ${roomId} · Solo mode`
  }
}

export function trimChatMessages(
  messages: RoomChatMessage[],
  limit: number = MAX_CHAT_PREVIEW_MESSAGES,
): RoomChatMessage[] {
  return messages.slice(-Math.max(1, limit))
}

export function formatChatAuthor(message: RoomChatMessage): string {
  if (message.authorTitle) {
    return `${message.authorName} · ${message.authorTitle}`
  }

  return message.authorName
}
