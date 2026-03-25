export const MOVEMENT_ANCHORS = [
  {
    id: 'hero',
    label: 'Hero Canvas',
    pose: { position: { x: 0, y: 1.66, z: 4.65 }, yaw: Math.PI, pitch: -0.05 },
  },
  {
    id: 'east',
    label: 'East Canvases',
    pose: { position: { x: 3.6, y: 1.66, z: 0.8 }, yaw: Math.PI / 2, pitch: -0.04 },
  },
  {
    id: 'west',
    label: 'West Canvases',
    pose: { position: { x: -3.6, y: 1.66, z: 0.8 }, yaw: -Math.PI / 2, pitch: -0.04 },
  },
  {
    id: 'south',
    label: 'South Canvases',
    pose: { position: { x: 0, y: 1.66, z: -4.35 }, yaw: Math.PI, pitch: -0.05 },
  },
  {
    id: 'radio',
    label: 'Listening Corner',
    pose: { position: { x: 2.95, y: 1.66, z: 3.45 }, yaw: 2.38, pitch: -0.08 },
  },
  {
    id: 'atelier',
    label: 'Sketch Tables',
    pose: { position: { x: -3.1, y: 1.66, z: 3.2 }, yaw: -2.3, pitch: -0.08 },
  },
]

export const CANVAS_TARGETS = [
  { id: 'canvas-north-hero', label: 'Hero Canvas' },
  { id: 'canvas-north-left-top', label: 'North Canvas One' },
  { id: 'canvas-north-left-mid', label: 'North Canvas Two' },
  { id: 'canvas-north-right-top', label: 'North Canvas Three' },
  { id: 'canvas-north-right-mid', label: 'North Canvas Four' },
  { id: 'canvas-north-lower-left', label: 'North Canvas Five' },
  { id: 'canvas-north-lower-right', label: 'North Canvas Six' },
  { id: 'canvas-east-top', label: 'East Canvas One' },
  { id: 'canvas-east-upper-mid', label: 'East Canvas Two' },
  { id: 'canvas-east-lower-mid', label: 'East Canvas Three' },
  { id: 'canvas-east-bottom', label: 'East Canvas Four' },
  { id: 'canvas-west-top', label: 'West Canvas One' },
  { id: 'canvas-west-upper-mid', label: 'West Canvas Two' },
  { id: 'canvas-west-lower-mid', label: 'West Canvas Three' },
  { id: 'canvas-west-bottom', label: 'West Canvas Four' },
  { id: 'canvas-south-left', label: 'South Canvas One' },
  { id: 'canvas-south-left-mid', label: 'South Canvas Two' },
  { id: 'canvas-south-middle', label: 'South Canvas Three' },
  { id: 'canvas-south-right-mid', label: 'South Canvas Four' },
  { id: 'canvas-south-right', label: 'South Canvas Five' },
  { id: 'canvas-south-lower-left', label: 'South Canvas Six' },
  { id: 'canvas-south-lower-right', label: 'South Canvas Seven' },
]

export function getMovementAnchor(anchorId) {
  return MOVEMENT_ANCHORS.find((anchor) => anchor.id === anchorId) ?? null
}

export function isKnownCanvasTarget(canvasId) {
  return CANVAS_TARGETS.some((canvas) => canvas.id === canvasId)
}

export function createBotGuide(roomId, request) {
  const origin = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  const forwardedProtoHeader = request.headers['x-forwarded-proto']
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : forwardedProtoHeader
  const protocol = forwardedProto?.split(',')[0]?.trim() === 'https' ? 'https:' : origin.protocol
  const appOrigin = `${protocol}//${origin.host}`
  const websocketProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
  const websocketUrl = `${websocketProtocol}//${origin.host}/ws`
  const apiBase = `${appOrigin}/api/rooms/${roomId}`

  return {
    roomId,
    movementAnchors: MOVEMENT_ANCHORS,
    canvasTargets: CANVAS_TARGETS,
    transports: {
      websocketUrl,
      roomSnapshotUrl: apiBase,
      guideUrl: `${apiBase}/guide`,
      botActionUrl: `${apiBase}/bot-action`,
    },
    notes: [
      'Bots can join over WebSocket with kind "agent" and then send presence, chat, canvas, or waypoint messages.',
      'Bots can also use the bot-action HTTP endpoint for lightweight room commands without driving the full browser UI.',
      'Canvas artwork should be sent as a 960x640 PNG data URL so it projects cleanly onto the wall canvas.',
      'Room state persists on the server, so new joiners inherit the latest saved canvases and recent room chat.',
    ],
    examples: {
      websocketJoin: {
        type: 'join',
        payload: {
          roomId,
          name: 'Scout Bot',
          kind: 'agent',
          title: 'Research Bot',
          accentColor: '#7c9cff',
          pose: { x: 0, z: 4.65, yaw: Math.PI, pitch: -0.05, speed: 0 },
          uploadedImages: [],
          tilePlacements: {},
          tileImageAssignments: {},
          activeStationId: null,
          studioCanvasArtworks: {},
          objective: 'Create art together on every canvas in the room.',
        },
      },
      httpMove: {
        botId: 'bot-scout',
        name: 'Scout Bot',
        title: 'Research Bot',
        accentColor: '#7c9cff',
        action: 'move_to_anchor',
        anchorId: 'hero',
      },
      httpPaint: {
        botId: 'bot-scout',
        name: 'Scout Bot',
        action: 'paint_canvas',
        canvasId: 'canvas-north-hero',
        artwork: 'data:image/png;base64,...',
      },
      httpChat: {
        botId: 'bot-scout',
        name: 'Scout Bot',
        action: 'chat',
        message: 'I am starting a new shared painting on the hero canvas.',
      },
    },
  }
}
