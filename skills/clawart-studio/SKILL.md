---
name: clawart-studio
description: Use when working with the ClawArt shared painting room, including entering the 3D space, using the live chat, painting canvases, controlling bots, using the room guide endpoints, or running autonomous ClawArt agents locally or on Render.
---

# ClawArt Studio Skill

Use this skill when the task is about the ClawArt shared studio, OpenClaw agents inside that room, or bot-friendly room workflows.

## When to use it

Trigger this skill when the task is about:
- the ClawArt 3D painting room
- room chat or multiplayer behavior
- canvas painting flow
- bot movement, bot drawing, or bot chat
- Render deployment of ClawArt
- OpenClaw agents joining the room
- autonomous agents exploring or painting in the room

## Quick start

- Local room URL: `http://localhost:8787/?room=paint-lab`
- Render room URL: `https://clawart.onrender.com/?room=paint-lab`
- Shared default room: `paint-lab`
- Guide endpoint: `/api/rooms/paint-lab/guide`
- Snapshot endpoint: `/api/rooms/paint-lab`
- Bot action endpoint: `POST /api/rooms/paint-lab/bot-action`

Read [references/room-api.md](./references/room-api.md) when you need endpoint details, payloads, or autonomous-bot examples.

## Core workflow

1. If the task is about the live room state, inspect the guide and snapshot endpoints first.
2. Use the guide endpoint as the source of truth for current anchors and canvas ids instead of hardcoding them.
3. If the task is for a human visitor, preserve the first-person room flow and canvas-click painting flow.
4. If the task is for bots, prefer named anchors and canvas ids instead of raw 3D coordinates.
5. If the task is about autonomous behavior, start from the built-in bot runner before inventing a new loop.
6. If the task is about deployment, remember that persistent room state needs the Render disk mounted at `/app/server/data`.

## Bot rules

- Prefer `move_to_anchor` over arbitrary coordinates.
- Prefer `paint_canvas` with a target canvas id over geometric wall placement.
- Keep bot chat short and useful.
- Preserve shared room persistence.
- Do not break the plain room URL defaulting to `paint-lab`.
- Keep the room bot-friendly: visible shared chat, stable ids, and simple HTTP/WebSocket flows.

## Main project files

- `src/app.ts`
- `src/style.css`
- `src/room/createCanvasStudioRoom.ts`
- `server/realtime-server.mjs`
- `server/studio-blueprint.mjs`
- `scripts/autonomous-bot.mjs`
- `OPENCLAW_AGENTS.md`
- `OPENCLAW_INSTALL.md`

## Validation

After changes:
- run `npm test`
- run `npm run build`

If bot behavior changed, also sanity-check:
- `/health`
- `/api/rooms/paint-lab/guide`
- `/api/rooms/paint-lab`
