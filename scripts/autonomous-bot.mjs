const defaults = {
  url: 'http://localhost:8787',
  room: 'paint-lab',
  botId: `bot-${Math.random().toString(36).slice(2, 8)}`,
  name: 'ClawBot',
  title: 'Autonomous Painter',
  accent: '#ff9c4a',
  intervalMs: 12000,
  style: 'picasso',
}

const options = parseArgs(process.argv.slice(2))
const config = {
  ...defaults,
  ...options,
  intervalMs: Number(options.intervalMs ?? defaults.intervalMs),
}

const roomBase = `${config.url.replace(/\/$/, '')}/api/rooms/${config.room}`
const guide = await fetchJson(`${roomBase}/guide`)

console.log(`Autonomous bot started for room "${config.room}" as ${config.name} (${config.botId})`)
console.log(`Guide: ${guide.ok ? 'loaded' : 'missing'}`)

await sendBotAction({
  botId: config.botId,
  name: config.name,
  title: config.title,
  accentColor: config.accent,
  action: 'join',
})

await runCycle()
setInterval(runCycle, config.intervalMs)

async function runCycle() {
  const anchors = guide.guide?.movementAnchors ?? []
  const canvases = guide.guide?.canvasTargets ?? []

  if (anchors.length > 0) {
    const anchor = anchors[randomIndex(anchors.length)]
    await sendBotAction({
      botId: config.botId,
      name: config.name,
      title: config.title,
      accentColor: config.accent,
      action: 'move_to_anchor',
      anchorId: anchor.id,
    })
    console.log(`Moved to ${anchor.id}`)
  }

  if (Math.random() > 0.35 && canvases.length > 0) {
    const canvas = canvases[randomIndex(canvases.length)]
    const artwork = createAutonomousArtworkDataUrl(config.style, canvas.label)
    await sendBotAction({
      botId: config.botId,
      name: config.name,
      title: config.title,
      accentColor: config.accent,
      action: 'paint_canvas',
      canvasId: canvas.id,
      artwork,
    })
    console.log(`Painted ${canvas.id}`)
  }

  if (Math.random() > 0.2) {
    await sendBotAction({
      botId: config.botId,
      name: config.name,
      title: config.title,
      accentColor: config.accent,
      action: 'chat',
      message: createAutonomousChatLine(),
    })
    console.log('Sent chat line')
  }
}

async function sendBotAction(payload) {
  const response = await fetch(`${roomBase}/bot-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Bot action failed (${response.status}): ${errorText}`)
  }

  return response.json()
}

async function fetchJson(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Unable to fetch ${url}: ${response.status}`)
  }

  return response.json()
}

function createAutonomousChatLine() {
  const lines = [
    'I am exploring the room and looking for a fresh canvas.',
    'Switching walls for a new abstract composition.',
    'Trying a bold cubist stroke on this canvas.',
    'Sharing a new experiment with color and shape.',
    'Wandering to another corner to keep the room alive.',
  ]

  return lines[randomIndex(lines.length)]
}

function createAutonomousArtworkDataUrl(style, label) {
  const palettes = [
    ['#e4512f', '#ffcb3c', '#3158a9', '#17171f', '#f7eee2'],
    ['#ff8f6b', '#f8d764', '#4b6cb7', '#1c2440', '#fff8ef'],
    ['#cf4d6f', '#f3b145', '#3cae9f', '#22324f', '#f7f0e6'],
  ]
  const palette = palettes[randomIndex(palettes.length)]
  const circles = Array.from({ length: 5 }, (_, index) => {
    const fill = palette[index % palette.length]
    const cx = 140 + Math.round(Math.random() * 680)
    const cy = 120 + Math.round(Math.random() * 380)
    const rx = 50 + Math.round(Math.random() * 90)
    const ry = 40 + Math.round(Math.random() * 110)
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" fill-opacity="0.82" />`
  }).join('')

  const shards = Array.from({ length: 8 }, () => {
    const fill = palette[randomIndex(palette.length)]
    const points = Array.from({ length: 4 }, () => {
      const x = 80 + Math.round(Math.random() * 800)
      const y = 70 + Math.round(Math.random() * 500)
      return `${x},${y}`
    }).join(' ')
    return `<polygon points="${points}" fill="${fill}" fill-opacity="0.68" />`
  }).join('')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
      <rect width="960" height="640" fill="${palette[4]}" />
      <rect x="54" y="54" width="852" height="532" rx="36" fill="#fffdfa" />
      ${style === 'picasso' ? `<rect x="392" y="112" width="176" height="372" fill="${palette[1]}" fill-opacity="0.34" />` : ''}
      ${circles}
      ${shards}
      <path d="M290 200 C355 120, 430 160, 468 246" stroke="${palette[3]}" stroke-width="18" fill="none" stroke-linecap="round" />
      <path d="M474 246 C520 188, 598 198, 650 286" stroke="${palette[0]}" stroke-width="16" fill="none" stroke-linecap="round" />
      <path d="M336 408 C424 344, 562 356, 642 428" stroke="${palette[2]}" stroke-width="14" fill="none" stroke-linecap="round" />
      <text x="76" y="594" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="${palette[3]}">${escapeXml(label)} · ${escapeXml(style)}</text>
      <text x="76" y="70" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${palette[0]}">${escapeXml(config.name)}</text>
    </svg>
  `

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function randomIndex(length) {
  return Math.floor(Math.random() * length)
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function parseArgs(argv) {
  const args = {}

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index]

    if (!entry.startsWith('--')) {
      continue
    }

    const key = entry.slice(2)
    const next = argv[index + 1]

    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }

    args[key] = next
    index += 1
  }

  return args
}
