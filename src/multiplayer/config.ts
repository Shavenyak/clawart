const DEFAULT_ROOM_ID = 'paint-lab'
const DEV_WEBSOCKET_PORT = '8787'

export function resolveRoomId(search: string = window.location.search): string {
  const roomId = new URLSearchParams(search).get('room')?.trim()

  if (!roomId) {
    return DEFAULT_ROOM_ID
  }

  return roomId.replace(/[^a-z0-9-_]/gi, '-').slice(0, 48) || DEFAULT_ROOM_ID
}

export function resolveMultiplayerUrl(
  location: Location = window.location,
  isDev: boolean = import.meta.env.DEV,
): string {
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_WS_URL?.trim()

  if (configuredUrl) {
    return configuredUrl
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = isDev
    ? `${location.hostname}:${DEV_WEBSOCKET_PORT}`
    : location.host

  return `${protocol}//${host}/ws`
}
