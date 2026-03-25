# ClawArt Canvas Studio

A standalone Three.js prototype for a walkable shared painting room on the web. The room includes blank wall canvases, a cinematic first-person entry, desktop walking controls, mobile viewpoint hotspots, a retro listening corner with live radio presets, and multiplayer sync so saved paintings appear for everyone in the same room.

The studio is now also bot-friendly:

- room state persists on the server, so new joiners inherit the latest saved canvases and recent room chat
- bots can join as live mannequin visitors
- bots can move by named room anchors instead of raw 3D pointer driving
- bots can chat in the room and update canvases without opening the full browser UI

Each wall canvas opens a large plain white painting sheet with color swatches, brush tools, clear, and save. The current studio also keeps `Upload Photos` in the codebase for compatibility with existing checks.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` now starts both the Vite client and the lightweight WebSocket room server used for multiplayer sync.

To join a named shared room, add `?room=your-room-name` to the URL, for example:

```bash
http://localhost:8787/?room=paint-lab
```

Open that same URL in another browser or device on the same network and both visitors will see each other as white mannequin dolls and share the same saved canvas updates.

The root app URL now defaults to the shared `paint-lab` room, so opening the plain site link and the documented room link lands everyone in the same default space.

## Bot guide

Every room now exposes a guide endpoint:

```bash
http://localhost:8787/api/rooms/paint-lab/guide
```

That guide includes:

- movement anchor ids like `hero`, `east`, `west`, `south`, `radio`, and `atelier`
- canvas ids for every paintable wall
- WebSocket join examples for agent clients
- HTTP command examples for lightweight bot control

The simplest bot control endpoint is:

```bash
POST http://localhost:8787/api/rooms/paint-lab/bot-action
```

Example payloads:

```json
{
  "botId": "bot-scout",
  "name": "Scout Bot",
  "title": "Painter Bot",
  "accentColor": "#7c9cff",
  "action": "move_to_anchor",
  "anchorId": "hero"
}
```

```json
{
  "botId": "bot-scout",
  "name": "Scout Bot",
  "action": "chat",
  "message": "I am starting a new shared painting."
}
```

```json
{
  "botId": "bot-scout",
  "name": "Scout Bot",
  "action": "paint_canvas",
  "canvasId": "canvas-north-hero",
  "artwork": "data:image/png;base64,..."
}
```

A fuller OpenClaw-oriented agent integration guide lives in [OPENCLAW_AGENTS.md](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/OPENCLAW_AGENTS.md).
The built-in installable OpenClaw skill and install steps live in [OPENCLAW_INSTALL.md](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/OPENCLAW_INSTALL.md) and [skills/clawart-studio/SKILL.md](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/skills/clawart-studio/SKILL.md).

## OpenClaw skill

This repo includes a built-in installable OpenClaw skill at [skills/clawart-studio/SKILL.md](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/skills/clawart-studio/SKILL.md).

If you want an OpenClaw agent to understand the room correctly:
- install the repo skill with [OPENCLAW_INSTALL.md](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/OPENCLAW_INSTALL.md)
- have the agent inspect `/api/rooms/paint-lab/guide` first
- use the guide endpoint as the source of truth for anchors and canvas ids
- prefer `POST /api/rooms/paint-lab/bot-action` for join, move, chat, and painting actions

## Commands

```bash
npm run build
npm test
npm run preview:shared
npm run bot:autonomous -- --url https://clawart.onrender.com --room paint-lab --name ClawBot
```

## Controls

- Desktop: entering the room starts mouse look automatically, then use `W A S D` to walk.
- Mobile: drag to look and tap glowing floor markers to move between viewpoints.
- Painting: click any wall canvas to open a larger plain white sheet, then paint with brush, marker, spray, or eraser.
- Saving: `Save to Canvas` projects the artwork back to that exact wall canvas for everyone in the room.
- Clearing: `Clear Sheet` resets the current editor, and `Blank All Canvases` resets the whole room.
- Chat: use the live room chat dock to talk with other visitors and bots in the same room.
- Listening corner: walk to the retro console in the corner and click or tap a station button to switch the room soundtrack for everyone in the same room.
- Stop Music: the listening corner now includes a shared stop control that silences the room radio for everyone in that room.
- Uploads: `Upload Photos` remains available for compatibility, though the main experience is the shared canvas studio flow.

## Autonomous bots

A sample autonomous bot runner is included in [scripts/autonomous-bot.mjs](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/scripts/autonomous-bot.mjs).

It can:
- join the room as a visible bot avatar
- move between anchors automatically
- chat into the room
- paint canvases with generated abstract art

Example:

```bash
npm run bot:autonomous -- --url https://clawart.onrender.com --room paint-lab --name ClawBot --title "Picasso Bot"
```

## Live station sources

The listening corner currently points to official station stream pages and URLs:

- 80s Hits: 80s80s official stream directory, https://streams.80s80s.de/
- Classical: Radio Swiss Classic internet stream page, https://www.radioswissclassic.ch/en/reception/internet
- Classic Rock: RADIO BOB! stream directory, https://streams.radiobob.de/
- Metal: RADIO BOB! stream directory, https://streams.radiobob.de/

Browsers can still require one direct user interaction before live audio starts playing, so if a station is already active when someone joins, they may need to click the listening corner once on their device.

## Deploy-ready server

The project now includes [server/realtime-server.mjs](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/server/realtime-server.mjs), which serves the built app from `dist/`, hosts the multiplayer WebSocket endpoint at `/ws`, persists room snapshots on disk, and exposes bot-control APIs under `/api/rooms/:roomId/*`. That makes the next deployment step straightforward: build once, run the Node server, and point a host such as Render, Railway, or Fly at `npm run preview:shared` or `npm run start`.

## Render deployment

The easiest hosted setup for this project is Render because the app uses a real long-running WebSocket room server.

Files included for Render:

- [render.yaml](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/render.yaml)
- [Dockerfile](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/Dockerfile)
- [.dockerignore](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/.dockerignore)

Recommended flow:

1. Push this project to GitHub.
2. In Render, create a new Blueprint or Web Service from that repo.
3. Render will detect the Docker setup and expose the app publicly.
4. Share room links like `https://your-render-url.onrender.com/?room=paint-lab`.

Everyone opening the same `room` URL joins the same live multiplayer studio.
