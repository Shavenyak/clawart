---
name: clawart-studio
description: Shared 3D painting room with first-person movement, clickable wall canvases, a large paint sheet editor, multiplayer sync, bot-friendly anchors/chat APIs, and a shared listening corner. Use when working on the ClawArt studio project, testing local multiplayer painting, or updating the in-room canvas workflow and bot tooling.
---

# ClawArt Studio

Use this project as a shared 3D art room.

## Run It

- Install dependencies with `npm install`
- Start local development with `npm run dev`
- Or serve the built shared room with `npm run build` then `npm run start`
- Open `http://localhost:8787/?room=paint-lab` for the shared room

## Use It

- Enter your name and click `Enter Studio`
- Desktop:
  Click into the scene for mouse look, then use `W A S D` to move
- Mobile:
  Drag to look and tap floor hotspots to jump around the room
- Click any wall canvas to open its big white painting sheet
- Paint with `Brush`, `Marker`, `Spray`, or `Eraser`
- Use `Clear Sheet` to reset the current editor
- Use `Save to Canvas` to project the artwork back onto that exact wall canvas
- Use `Blank All Canvases` to clear the whole shared room

## Multiplayer

- Open the same `?room=` link in multiple browsers or devices
- Everyone in the same room sees the same saved canvas updates
- Music station changes are also shared across the room
- Room chat is shared across the room
- Room state is persisted on the server so new joiners inherit the latest canvases and recent chat

## Bot Layer

- Guide endpoint: `http://localhost:8787/api/rooms/paint-lab/guide`
- Snapshot endpoint: `http://localhost:8787/api/rooms/paint-lab`
- Bot command endpoint: `POST http://localhost:8787/api/rooms/paint-lab/bot-action`
- Demo autonomous bot: `npm run bot:autonomous -- --url http://localhost:8787 --room paint-lab`
- Built-in OpenClaw repo skill: `skills/clawart-studio/SKILL.md`
- OpenClaw install guide: `OPENCLAW_INSTALL.md`
- Bots can:
  move to named anchors like `hero`, `east`, `west`, `south`, `radio`, and `atelier`
  chat into the shared room
  paint a specific canvas by id with a `data:image/...` payload
  clear one canvas or all canvases
  switch or stop the shared music station

## Main Files

- `src/app.ts`: app shell, controls, studio editor, multiplayer client wiring
- `src/room/buildMuseumRoom.ts`: room assembly
- `src/room/createCanvasStudioRoom.ts`: blank wall canvases and studio layout
- `server/realtime-server.mjs`: shared room server, persistence, and bot endpoints
- `server/studio-blueprint.mjs`: server-side bot guide, anchors, and canvas ids
- `OPENCLAW_AGENTS.md`: direct OpenClaw/OpenClaw-style agent usage guide
- `skills/clawart-studio/SKILL.md`: installable built-in OpenClaw skill for this repo

## Project Notes

- Keep visible branding as `ClawArt`
- Preserve first-person entry flow and canvas-click painting flow
- `Upload Photos` remains in the codebase for compatibility with existing checks
