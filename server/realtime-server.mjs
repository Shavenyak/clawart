import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const distRoot = path.join(projectRoot, 'dist')
const port = Number.parseInt(process.env.PORT ?? '8787', 10)
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const rooms = new Map()

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (url.pathname === '/health') {
    writeJson(response, 200, {
      ok: true,
      rooms: rooms.size,
    })
    return
  }

  try {
    const filePath = await resolveStaticFile(url.pathname)
    const contents = await readFile(filePath)
    const extension = path.extname(filePath).toLowerCase()
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400',
    })
    response.end(contents)
  } catch {
    writeJson(response, 404, {
      ok: false,
      message:
        'Build output not found. Run "npm run build" for production or use Vite with "npm run dev:client" for local development.',
    })
  }
})

const wss = new WebSocketServer({
  noServer: true,
})

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (url.pathname !== '/ws') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (websocket) => {
    wss.emit('connection', websocket)
  })
})

wss.on('connection', (socket) => {
  const clientId = createId()
  socket.data = {
    clientId,
    roomId: null,
  }

  socket.on('message', (raw) => {
    let message

    try {
      message = JSON.parse(String(raw))
    } catch {
      send(socket, {
        type: 'error',
        payload: {
          message: 'Invalid multiplayer payload.',
        },
      })
      return
    }

    switch (message.type) {
      case 'join':
        handleJoin(socket, message.payload)
        break
      case 'presence':
        handlePresence(socket, message.payload)
        break
      case 'tile_sync':
        handleTileSync(socket, message.payload)
        break
      case 'gallery_sync':
        handleGallerySync(socket, message.payload)
        break
      case 'station_sync':
        handleStationSync(socket, message.payload)
        break
      case 'run_control':
        handleRunControl(socket, message.payload)
        break
      default:
        send(socket, {
          type: 'error',
          payload: {
            message: 'Unsupported multiplayer action.',
          },
        })
        break
    }
  })

  socket.on('close', () => {
    handleDisconnect(socket)
  })
})

server.listen(port, () => {
  console.log(`ClawArt realtime server listening on http://localhost:${port}`)
})

async function resolveStaticFile(requestPath) {
  const normalizedPath = requestPath === '/' ? '/index.html' : requestPath
  const candidatePath = path.join(distRoot, normalizedPath)
  const candidateStats = await stat(candidatePath).catch(() => null)

  if (candidateStats?.isFile()) {
    return candidatePath
  }

  const fallbackPath = path.join(distRoot, 'index.html')
  const fallbackStats = await stat(fallbackPath)

  if (fallbackStats.isFile()) {
    return fallbackPath
  }

  throw new Error('Static build output missing.')
}

function handleJoin(socket, payload) {
  const roomId = sanitizeRoomId(payload.roomId)
  const room = getOrCreateRoom(roomId)
  const existingPlayer = room.players.get(socket.data.clientId)
  const player = {
    id: socket.data.clientId,
    name: sanitizeName(payload.name),
    kind: 'human',
    pose: normalizePose(payload.pose),
  }

  socket.data.roomId = roomId
  room.players.set(player.id, player)

  if (!room.tilePlacements || Object.keys(room.tilePlacements).length === 0) {
    room.tilePlacements = payload.tilePlacements ?? {}
  }

  if (!room.uploadedImages || room.uploadedImages.length === 0) {
    room.uploadedImages = Array.isArray(payload.uploadedImages) ? payload.uploadedImages : []
  }

  if (!room.tileImageAssignments || Object.keys(room.tileImageAssignments).length === 0) {
    room.tileImageAssignments =
      payload.tileImageAssignments && typeof payload.tileImageAssignments === 'object'
        ? payload.tileImageAssignments
        : {}
  }

  if (
    !room.studioCanvasArtworks ||
    Object.keys(room.studioCanvasArtworks).length === 0
  ) {
    room.studioCanvasArtworks =
      payload.studioCanvasArtworks && typeof payload.studioCanvasArtworks === 'object'
        ? payload.studioCanvasArtworks
        : {}
  }

  if (typeof room.activeStationId === 'undefined') {
    room.activeStationId =
      typeof payload.activeStationId === 'string' && payload.activeStationId.trim().length > 0
        ? payload.activeStationId.trim()
        : null
  }

  if (!room.truthBoard) {
    room.objective = normalizeObjective(payload.objective)
    room.truthBoard = createInitialTruthBoard(room.objective)
  }

  send(socket, {
    type: 'welcome',
    payload: {
      selfId: player.id,
      roomId,
      snapshot: {
        uploadedImages: room.uploadedImages,
        tilePlacements: room.tilePlacements,
        tileImageAssignments: room.tileImageAssignments,
        activeStationId: room.activeStationId ?? null,
        studioCanvasArtworks: room.studioCanvasArtworks ?? {},
        truthBoard: room.truthBoard,
        players: Array.from(room.players.values()),
      },
    },
  })

  if (!existingPlayer) {
    broadcastToRoom(
      room,
      {
        type: 'player_joined',
        payload: player,
      },
      player.id,
    )
  }
}

function handlePresence(socket, posePayload) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  const player = room.players.get(socket.data.clientId)

  if (!player) {
    return
  }

  player.pose = normalizePose(posePayload)

  broadcastToRoom(
    room,
    {
      type: 'player_presence',
      payload: player,
    },
    player.id,
  )
}

function handleRunControl(socket, payload) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  const action = payload?.action

  if (action !== 'pause' && action !== 'resume' && action !== 'restart') {
    return
  }

  const truthBoard = action === 'restart'
    ? createInitialTruthBoard(normalizeObjective(payload?.objective))
    : {
        ...room.truthBoard,
        status: action === 'pause' ? 'paused' : 'running',
      }
  room.truthBoard = truthBoard

  broadcastToRoom(room, {
    type: 'board_sync',
    payload: {
      truthBoard,
      changedBy: socket.data.clientId,
    },
  })

}

function handleTileSync(socket, tilePlacements) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  room.tilePlacements = tilePlacements ?? room.tilePlacements

  broadcastToRoom(
    room,
    {
      type: 'tile_sync',
      payload: {
        tilePlacements: room.tilePlacements,
        changedBy: socket.data.clientId,
      },
    },
    socket.data.clientId,
  )
}

function handleGallerySync(socket, payload) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  room.uploadedImages = Array.isArray(payload?.uploadedImages) ? payload.uploadedImages : []
  room.tileImageAssignments =
    payload?.tileImageAssignments && typeof payload.tileImageAssignments === 'object'
      ? payload.tileImageAssignments
      : {}
  room.studioCanvasArtworks =
    payload?.studioCanvasArtworks && typeof payload.studioCanvasArtworks === 'object'
      ? payload.studioCanvasArtworks
      : {}

  broadcastToRoom(
    room,
    {
      type: 'gallery_sync',
      payload: {
        gallery: {
          uploadedImages: room.uploadedImages,
          tileImageAssignments: room.tileImageAssignments,
          studioCanvasArtworks: room.studioCanvasArtworks,
        },
        changedBy: socket.data.clientId,
      },
    },
    socket.data.clientId,
  )
}

function handleStationSync(socket, payload) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  room.activeStationId =
    typeof payload?.activeStationId === 'string' && payload.activeStationId.trim().length > 0
      ? payload.activeStationId.trim()
      : null

  broadcastToRoom(
    room,
    {
      type: 'station_sync',
      payload: {
        activeStationId: room.activeStationId,
        changedBy: socket.data.clientId,
      },
    },
    socket.data.clientId,
  )
}

function handleDisconnect(socket) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  room.players.delete(socket.data.clientId)
  broadcastToRoom(room, {
    type: 'player_left',
    payload: {
      playerId: socket.data.clientId,
    },
  })

  if (room.players.size === 0) {
    rooms.delete(socket.data.roomId)
  }
}

function getOrCreateRoom(roomId) {
  const existing = rooms.get(roomId)

  if (existing) {
    return existing
  }

  const room = {
    id: roomId,
    objective: normalizeObjective(),
    uploadedImages: [],
    tilePlacements: {},
    tileImageAssignments: {},
    activeStationId: null,
    truthBoard: createInitialTruthBoard(),
    studioCanvasArtworks: {},
    players: new Map(),
  }
  rooms.set(roomId, room)
  return room
}

function getRoomForSocket(socket) {
  const roomId = socket.data.roomId

  if (!roomId) {
    return null
  }

  return rooms.get(roomId) ?? null
}

function broadcastToRoom(room, message, excludeClientId = null) {
  for (const client of wss.clients) {
    if (client.readyState !== WebSocket.OPEN) {
      continue
    }

    if (client.data.roomId !== room.id) {
      continue
    }

    if (excludeClientId && client.data.clientId === excludeClientId) {
      continue
    }

    send(client, message)
  }
}

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) {
    return
  }

  socket.send(JSON.stringify(message))
}

function sanitizeRoomId(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'main-gallery'
  }

  return value.replace(/[^a-z0-9-_]/gi, '-').slice(0, 48) || 'main-gallery'
}

function sanitizeName(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Guest'
  }

  return value.trim().slice(0, 24)
}

function normalizePose(value) {
  return {
    x: toFiniteNumber(value?.x),
    z: toFiniteNumber(value?.z),
    yaw: toFiniteNumber(value?.yaw),
    pitch: toFiniteNumber(value?.pitch),
    speed: Math.max(0, toFiniteNumber(value?.speed)),
  }
}

function toFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function createId() {
  return Math.random().toString(36).slice(2, 10)
}

function normalizeObjective(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Create art together on every canvas in the room.'
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, 120)
}

function createInitialTruthBoard(objective = normalizeObjective()) {
  return {
    objective,
    phase: 'Studio',
    leadAgentName: 'Canvas',
    notes: ['Shared painting room ready.'],
    conclusion: 'The room is waiting for the next brush stroke.',
    cycle: 0,
    status: 'running',
  }
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}
