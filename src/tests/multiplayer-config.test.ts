import { describe, expect, it } from 'vitest'
import { resolveMultiplayerUrl, resolveRoomId } from '../multiplayer/config'

describe('resolveRoomId', () => {
  it('uses the default room when none is provided', () => {
    expect(resolveRoomId('')).toBe('main-gallery')
  })

  it('sanitizes custom room ids', () => {
    expect(resolveRoomId('?room=Family Room 01!')).toBe('Family-Room-01-')
  })
})

describe('resolveMultiplayerUrl', () => {
  it('uses the dev websocket port in development', () => {
    const location = {
      protocol: 'http:',
      hostname: '127.0.0.1',
      host: '127.0.0.1:5173',
    } as Location

    expect(resolveMultiplayerUrl(location, true)).toBe('ws://127.0.0.1:8787/ws')
  })
})
