import { createServer } from 'node:http'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import {
  CANVAS_TARGETS,
  createBotGuide,
  getMovementAnchor,
  isKnownCanvasTarget,
  MOVEMENT_ANCHORS,
} from './studio-blueprint.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const distRoot = path.join(projectRoot, 'dist')
const roomDataRoot = path.join(projectRoot, 'server', 'data', 'rooms')
const port = Number.parseInt(process.env.PORT ?? '8787', 10)
const MAX_CHAT_MESSAGES = 60
const MAX_CHAT_MESSAGE_LENGTH = 220
const BOT_IDLE_MS = 1000 * 60 * 5
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

await mkdir(roomDataRoot, { recursive: true })
const rooms = await loadPersistedRooms()

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  if (url.pathname === '/health') {
    writeJson(response, 200, {
      ok: true,
      rooms: rooms.size,
    })
    return
  }

  if (url.pathname.startsWith('/api/rooms/')) {
    await handleApiRequest(request, response, url)
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
      case 'canvas_sync':
        handleCanvasSync(socket, message.payload)
        break
      case 'room_reset':
        handleRoomReset(socket, message.payload)
        break
      case 'station_sync':
        handleStationSync(socket, message.payload)
        break
      case 'run_control':
        handleRunControl(socket, message.payload)
        break
      case 'chat_message':
        handleChatMessage(socket, message.payload)
        break
      case 'waypoint_move':
        handleWaypointMove(socket, message.payload)
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

const cleanupTimer = setInterval(() => {
  purgeIdleBots()
}, 30_000)
cleanupTimer.unref?.()

server.listen(port, () => {
  console.log(`ClawArt realtime server listening on http://localhost:${port}`)
})

async function handleApiRequest(request, response, url) {
  const segments = url.pathname.split('/').filter(Boolean)
  const roomId = sanitizeRoomId(segments[2] ?? '')

  if (!roomId) {
    writeJson(response, 400, {
      ok: false,
      message: 'A room id is required.',
    })
    return
  }

  const room = getOrCreateRoom(roomId)

  if (request.method === 'GET' && segments.length === 3) {
    writeJson(response, 200, {
      ok: true,
      roomId,
      snapshot: createSnapshot(room),
    })
    return
  }

  if (request.method === 'GET' && segments[3] === 'guide') {
    writeJson(response, 200, {
      ok: true,
      guide: createBotGuide(roomId, request),
    })
    return
  }

  if (request.method === 'POST' && segments[3] === 'bot-action') {
    const payload = await readJsonBody(request).catch((error) => {
      writeJson(response, 400, {
        ok: false,
        message: error instanceof Error ? error.message : 'Invalid JSON body.',
      })
      return null
    })

    if (!payload) {
      return
    }

    const result = handleBotAction(request, room, payload)

    if (!result.ok) {
      writeJson(response, 400, result)
      return
    }

    writeJson(response, 200, {
      ok: true,
      roomId,
      botId: result.botId,
      snapshot: createSnapshot(room),
    })
    return
  }

  writeJson(response, 404, {
    ok: false,
    message: 'API route not found.',
  })
}

function handleJoin(socket, payload) {
  const roomId = sanitizeRoomId(payload.roomId)
  const room = getOrCreateRoom(roomId)
  const previousRoom = getRoomForSocket(socket)

  if (previousRoom && previousRoom.id !== roomId) {
    previousRoom.players.delete(socket.data.clientId)
    broadcastToRoom(previousRoom, {
      type: 'player_left',
      payload: {
        playerId: socket.data.clientId,
      },
    })
  }

  const player = {
    id: socket.data.clientId,
    name: sanitizeName(payload.name),
    kind: sanitizePlayerKind(payload.kind),
    title: sanitizeTitle(payload.title),
    accentColor: sanitizeAccentColor(payload.accentColor),
    pose: normalizePose(payload.pose),
    lastSeenAt: Date.now(),
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

  if (!room.studioCanvasArtworks || Object.keys(room.studioCanvasArtworks).length === 0) {
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

  schedulePersistRoom(room)

  send(socket, {
    type: 'welcome',
    payload: {
      selfId: player.id,
      roomId,
      snapshot: createSnapshot(room),
    },
  })

  send(socket, {
    type: 'chat_sync',
    payload: {
      chatMessages: room.chatMessages,
    },
  })

  broadcastToRoom(
    room,
    {
      type: 'player_joined',
      payload: toPublicPlayer(player),
    },
    player.id,
  )
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
  player.lastSeenAt = Date.now()

  broadcastToRoom(
    room,
    {
      type: 'player_presence',
      payload: toPublicPlayer(player),
    },
    player.id,
  )
}

function handleWaypointMove(socket, payload) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  const player = room.players.get(socket.data.clientId)
  const anchor = getMovementAnchor(payload?.anchorId)

  if (!player || !anchor) {
    return
  }

  player.pose = createPoseFromAnchor(anchor)
  player.lastSeenAt = Date.now()

  broadcastToRoom(
    room,
    {
      type: 'player_presence',
      payload: toPublicPlayer(player),
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

  const truthBoard =
    action === 'restart'
      ? createInitialTruthBoard(normalizeObjective(payload?.objective))
      : {
          ...room.truthBoard,
          status: action === 'pause' ? 'paused' : 'running',
        }
  room.truthBoard = truthBoard
  schedulePersistRoom(room)

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
  schedulePersistRoom(room)

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
  schedulePersistRoom(room)

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

function handleCanvasSync(socket, payload) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  applyCanvasArtworkUpdate(room, socket.data.clientId, payload?.canvasId, payload?.artwork)
}

function handleRoomReset(socket, payload) {
  const room = getRoomForSocket(socket)

  if (!room || payload?.target !== 'canvases') {
    return
  }

  room.studioCanvasArtworks = {}
  schedulePersistRoom(room)

  broadcastToRoom(room, {
    type: 'room_reset',
    payload: {
      target: 'canvases',
      changedBy: socket.data.clientId,
    },
  })
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
  schedulePersistRoom(room)

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

function handleChatMessage(socket, payload) {
  const room = getRoomForSocket(socket)

  if (!room) {
    return
  }

  const player = room.players.get(socket.data.clientId)
  const message = sanitizeChatMessage(payload?.message)

  if (!player || !message) {
    return
  }

  player.lastSeenAt = Date.now()
  const chatMessage = appendChatMessage(room, player, message)
  broadcastToRoom(room, {
    type: 'chat_message',
    payload: {
      chatMessage,
    },
  })
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
}

function handleBotAction(request, room, payload) {
  const bot = upsertBotPlayer(room, payload)
  const action = typeof payload?.action === 'string' ? payload.action : ''

  switch (action) {
    case 'join':
      return { ok: true, botId: bot.id }
    case 'move_to_anchor': {
      const anchor = getMovementAnchor(payload?.anchorId)

      if (!anchor) {
        return { ok: false, message: 'Unknown movement anchor.' }
      }

      bot.pose = createPoseFromAnchor(anchor)
      bot.lastSeenAt = Date.now()
      broadcastToRoom(room, {
        type: 'player_presence',
        payload: toPublicPlayer(bot),
      })
      return { ok: true, botId: bot.id }
    }
    case 'teleport':
      bot.pose = normalizePose(payload?.pose)
      bot.lastSeenAt = Date.now()
      broadcastToRoom(room, {
        type: 'player_presence',
        payload: toPublicPlayer(bot),
      })
      return { ok: true, botId: bot.id }
    case 'chat': {
      const message = sanitizeChatMessage(payload?.message)

      if (!message) {
        return { ok: false, message: 'Chat messages cannot be empty.' }
      }

      const chatMessage = appendChatMessage(room, bot, message)
      broadcastToRoom(room, {
        type: 'chat_message',
        payload: {
          chatMessage,
        },
      })
      return { ok: true, botId: bot.id }
    }
    case 'paint_canvas': {
      const outcome = applyCanvasArtworkUpdate(room, bot.id, payload?.canvasId, payload?.artwork)

      if (!outcome.ok) {
        return outcome
      }

      return { ok: true, botId: bot.id }
    }
    case 'clear_canvas': {
      const outcome = applyCanvasArtworkUpdate(room, bot.id, payload?.canvasId, null)

      if (!outcome.ok) {
        return outcome
      }

      return { ok: true, botId: bot.id }
    }
    case 'clear_all_canvases':
      room.studioCanvasArtworks = {}
      schedulePersistRoom(room)
      broadcastToRoom(room, {
        type: 'room_reset',
        payload: {
          target: 'canvases',
          changedBy: bot.id,
        },
      })
      return { ok: true, botId: bot.id }
    case 'set_station':
      room.activeStationId =
        typeof payload?.activeStationId === 'string' && payload.activeStationId.trim().length > 0
          ? payload.activeStationId.trim()
          : null
      schedulePersistRoom(room)
      broadcastToRoom(room, {
        type: 'station_sync',
        payload: {
          activeStationId: room.activeStationId,
          changedBy: bot.id,
        },
      })
      return { ok: true, botId: bot.id }
    case 'snapshot':
      return { ok: true, botId: bot.id }
    default:
      return {
        ok: false,
        message: `Unsupported bot action "${action}". Use the guide endpoint for valid commands.`,
        guide: createBotGuide(room.id, request),
      }
  }
}

function applyCanvasArtworkUpdate(room, changedBy, canvasId, artwork) {
  if (!isKnownCanvasTarget(canvasId)) {
    return { ok: false, message: 'Unknown canvas target.' }
  }

  if (artwork === null || artwork === undefined || artwork === '') {
    const nextArtworks = { ...room.studioCanvasArtworks }
    delete nextArtworks[canvasId]
    room.studioCanvasArtworks = nextArtworks
  } else if (!isArtworkDataUrl(artwork)) {
    return {
      ok: false,
      message: 'Canvas artwork must be a data:image/* URL.',
    }
  } else {
    room.studioCanvasArtworks = {
      ...room.studioCanvasArtworks,
      [canvasId]: artwork,
    }
  }

  schedulePersistRoom(room)
  broadcastToRoom(room, {
    type: 'canvas_sync',
    payload: {
      canvasId,
      artwork: room.studioCanvasArtworks[canvasId] ?? null,
      changedBy,
    },
  })
  return { ok: true }
}

function upsertBotPlayer(room, payload) {
  const requestedId =
    typeof payload?.botId === 'string' && payload.botId.trim().length > 0
      ? payload.botId.trim().slice(0, 48)
      : null
  const botId = requestedId ? sanitizeBotId(requestedId) : `bot-${createId()}`
  const existing = room.players.get(botId)

  if (existing && existing.kind === 'agent') {
    existing.name = sanitizeName(payload?.name ?? existing.name)
    existing.title = sanitizeTitle(payload?.title) ?? existing.title
    existing.accentColor = sanitizeAccentColor(payload?.accentColor) ?? existing.accentColor
    existing.lastSeenAt = Date.now()
    return existing
  }

  const anchor = getMovementAnchor(typeof payload?.anchorId === 'string' ? payload.anchorId : 'hero')
  const bot = {
    id: botId,
    name: sanitizeName(payload?.name ?? 'Bot'),
    kind: 'agent',
    title: sanitizeTitle(payload?.title) ?? 'Studio Bot',
    accentColor: sanitizeAccentColor(payload?.accentColor) ?? '#7c9cff',
    pose: anchor ? createPoseFromAnchor(anchor) : normalizePose(payload?.pose),
    lastSeenAt: Date.now(),
  }
  room.players.set(bot.id, bot)
  broadcastToRoom(room, {
    type: 'player_joined',
    payload: toPublicPlayer(bot),
  })
  return bot
}

function purgeIdleBots() {
  const now = Date.now()

  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (player.kind !== 'agent') {
        continue
      }

      if (now - player.lastSeenAt <= BOT_IDLE_MS) {
        continue
      }

      room.players.delete(player.id)
      broadcastToRoom(room, {
        type: 'player_left',
        payload: {
          playerId: player.id,
        },
      })
    }
  }
}

function getOrCreateRoom(roomId) {
  const existing = rooms.get(roomId)

  if (existing) {
    return existing
  }

  const room = createEmptyRoom(roomId)
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

function createEmptyRoom(roomId) {
  return {
    id: roomId,
    objective: normalizeObjective(),
    uploadedImages: [],
    tilePlacements: {},
    tileImageAssignments: {},
    activeStationId: null,
    truthBoard: createInitialTruthBoard(),
    studioCanvasArtworks: {},
    chatMessages: [],
    players: new Map(),
    saveTimer: null,
  }
}

function createSnapshot(room) {
  return {
    uploadedImages: room.uploadedImages,
    tilePlacements: room.tilePlacements,
    tileImageAssignments: room.tileImageAssignments,
    activeStationId: room.activeStationId ?? null,
    studioCanvasArtworks: room.studioCanvasArtworks ?? {},
    truthBoard: room.truthBoard,
    movementAnchors: MOVEMENT_ANCHORS,
    canvasTargets: CANVAS_TARGETS,
    chatMessages: room.chatMessages,
    players: Array.from(room.players.values()).map(toPublicPlayer),
  }
}

function toPublicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    kind: player.kind,
    title: player.title,
    accentColor: player.accentColor,
    pose: player.pose,
  }
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

async function loadPersistedRooms() {
  const result = new Map()
  const files = await readdir(roomDataRoot).catch(() => [])

  for (const fileName of files) {
    if (!fileName.endsWith('.json')) {
      continue
    }

    const filePath = path.join(roomDataRoot, fileName)

    try {
      const raw = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      const roomId = sanitizeRoomId(parsed?.id ?? path.basename(fileName, '.json'))
      const room = createEmptyRoom(roomId)
      room.objective = normalizeObjective(parsed?.objective)
      room.uploadedImages = Array.isArray(parsed?.uploadedImages) ? parsed.uploadedImages : []
      room.tilePlacements =
        parsed?.tilePlacements && typeof parsed.tilePlacements === 'object'
          ? parsed.tilePlacements
          : {}
      room.tileImageAssignments =
        parsed?.tileImageAssignments && typeof parsed.tileImageAssignments === 'object'
          ? parsed.tileImageAssignments
          : {}
      room.activeStationId =
        typeof parsed?.activeStationId === 'string' && parsed.activeStationId.trim().length > 0
          ? parsed.activeStationId.trim()
          : null
      room.truthBoard =
        parsed?.truthBoard && typeof parsed.truthBoard === 'object'
          ? parsed.truthBoard
          : createInitialTruthBoard(room.objective)
      room.studioCanvasArtworks =
        parsed?.studioCanvasArtworks && typeof parsed.studioCanvasArtworks === 'object'
          ? parsed.studioCanvasArtworks
          : {}
      room.chatMessages = Array.isArray(parsed?.chatMessages)
        ? parsed.chatMessages.filter(isValidChatMessage).slice(-MAX_CHAT_MESSAGES)
        : []
      result.set(roomId, room)
    } catch (error) {
      console.warn(`Skipping unreadable room snapshot "${fileName}":`, error)
    }
  }

  return result
}

function schedulePersistRoom(room) {
  if (room.saveTimer) {
    clearTimeout(room.saveTimer)
  }

  room.saveTimer = setTimeout(() => {
    room.saveTimer = null
    void persistRoom(room)
  }, 180)
}

async function persistRoom(room) {
  const filePath = path.join(roomDataRoot, `${sanitizeRoomId(room.id)}.json`)
  const payload = {
    id: room.id,
    objective: room.objective,
    uploadedImages: room.uploadedImages,
    tilePlacements: room.tilePlacements,
    tileImageAssignments: room.tileImageAssignments,
    activeStationId: room.activeStationId,
    truthBoard: room.truthBoard,
    studioCanvasArtworks: room.studioCanvasArtworks,
    chatMessages: room.chatMessages,
  }

  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function appendChatMessage(room, player, message) {
  const chatMessage = {
    id: createId(),
    authorId: player.id,
    authorName: player.name,
    authorKind: player.kind,
    authorTitle: player.title,
    accentColor: player.accentColor,
    message,
    createdAt: new Date().toISOString(),
  }
  room.chatMessages = [...room.chatMessages, chatMessage].slice(-MAX_CHAT_MESSAGES)
  schedulePersistRoom(room)
  return chatMessage
}

async function readJsonBody(request) {
  const chunks = []
  let totalBytes = 0

  for await (const chunk of request) {
    totalBytes += chunk.length

    if (totalBytes > 12 * 1024 * 1024) {
      throw new Error('Request body is too large.')
    }

    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()

  if (!raw) {
    return {}
  }

  return JSON.parse(raw)
}

function sanitizeRoomId(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'paint-lab'
  }

  return value.replace(/[^a-z0-9-_]/gi, '-').slice(0, 48) || 'paint-lab'
}

function sanitizeBotId(value) {
  return value.replace(/[^a-z0-9-_]/gi, '-').slice(0, 48) || `bot-${createId()}`
}

function sanitizeName(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Guest'
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, 24)
}

function sanitizeTitle(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, 32)
}

function sanitizePlayerKind(value) {
  return value === 'agent' ? 'agent' : 'human'
}

function sanitizeAccentColor(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()

  if (!/^#?[0-9a-f]{6}$/i.test(normalized)) {
    return undefined
  }

  return normalized.startsWith('#') ? normalized : `#${normalized}`
}

function sanitizeChatMessage(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().replace(/\s+/g, ' ')

  if (!normalized) {
    return null
  }

  return normalized.slice(0, MAX_CHAT_MESSAGE_LENGTH)
}

function isArtworkDataUrl(value) {
  return typeof value === 'string' && /^data:image\/[a-z0-9+.-]+;base64,/i.test(value)
}

function isValidChatMessage(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.authorId === 'string' &&
    typeof value.authorName === 'string' &&
    (value.authorKind === 'human' || value.authorKind === 'agent') &&
    typeof value.message === 'string' &&
    typeof value.createdAt === 'string'
  )
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

function createPoseFromAnchor(anchor) {
  return {
    x: toFiniteNumber(anchor.pose.position.x),
    z: toFiniteNumber(anchor.pose.position.z),
    yaw: toFiniteNumber(anchor.pose.yaw),
    pitch: toFiniteNumber(anchor.pose.pitch),
    speed: 0,
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
