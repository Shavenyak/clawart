import { describe, expect, it } from 'vitest'
import type { RemotePlayerState } from '../multiplayer/types'
import {
  createDefaultCanvasTargets,
  createDefaultMovementAnchors,
  formatChatAuthor,
  summarizeRoomPresence,
  trimChatMessages,
} from '../studio/collaboration'

const remotePlayers: RemotePlayerState[] = [
  {
    id: 'human-1',
    name: 'Ava',
    kind: 'human',
    pose: { x: 0, z: 0, yaw: 0, pitch: 0, speed: 0 },
  },
  {
    id: 'bot-1',
    name: 'Scout',
    kind: 'agent',
    title: 'Painter Bot',
    pose: { x: 0, z: 0, yaw: 0, pitch: 0, speed: 0 },
  },
]

describe('studio collaboration helpers', () => {
  it('creates default anchors and canvas targets', () => {
    expect(createDefaultMovementAnchors().map((anchor) => anchor.id)).toContain('hero')
    expect(createDefaultCanvasTargets().map((canvas) => canvas.id)).toContain('canvas-north-hero')
  })

  it('summarizes live room presence with bot counts', () => {
    expect(summarizeRoomPresence('paint-lab', 'connected', true, remotePlayers)).toBe(
      'Room: paint-lab · 3 live · 1 bots',
    )
    expect(summarizeRoomPresence('paint-lab', 'connecting', true, remotePlayers)).toContain(
      'Connecting live sync',
    )
  })

  it('formats chat authors and trims preview history', () => {
    expect(
      formatChatAuthor({
        id: 'chat-1',
        authorId: 'bot-1',
        authorName: 'Scout',
        authorKind: 'agent',
        authorTitle: 'Painter Bot',
        message: 'Starting a new hero canvas.',
        createdAt: '2026-03-25T00:00:00.000Z',
      }),
    ).toBe('Scout · Painter Bot')

    expect(
      trimChatMessages(
        Array.from({ length: 10 }, (_, index) => ({
          id: `chat-${index}`,
          authorId: `player-${index}`,
          authorName: `Player ${index}`,
          authorKind: 'human' as const,
          message: `Message ${index}`,
          createdAt: '2026-03-25T00:00:00.000Z',
        })),
        3,
      ).map((message) => message.id),
    ).toEqual(['chat-7', 'chat-8', 'chat-9'])
  })
})
