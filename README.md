# Mixtiles 3D Museum Room

A standalone Three.js prototype for a walkable Mixtiles-style museum room on the web. The room includes curated gallery walls, a cinematic entry sequence, desktop walking controls, mobile viewpoint hotspots, a retro listening corner with live radio presets, shared room sync, live player dolls for connected visitors, and photo uploads that persist in `localStorage` and sync through the active room server.

The default room art now uses downloaded local copies of open-license sample family imagery sourced from Wikimedia Commons and U.S. government public-domain sources. Source links are listed in [src/assets/open-license/SOURCES.md](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/src/assets/open-license/SOURCES.md). `Upload Photos` still replaces that sample set with a personal gallery.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` now starts both the Vite client and the lightweight WebSocket room server used for multiplayer sync.

To join a named shared room, add `?room=your-room-name` to the URL, for example:

```bash
http://localhost:5173/?room=family-night
```

Open that same URL in another browser or device on the same network and both visitors will see each other as white mannequin dolls and share the same wall arrangement.

## Commands

```bash
npm run build
npm test
npm run preview:shared
```

## Controls

- Desktop: entering the room starts mouse look automatically, then use `W A S D` to walk.
- Mobile: drag to look and tap glowing floor markers to move between viewpoints.
- Rearranging: select a frame, aim at the exact wall point you want, and place it there. Connected visitors see the same layout updates.
- Desktop frame replace: right-click while aiming directly at a frame to upload a new photo into that exact frame only.
- Listening corner: walk to the retro console in the corner and click or tap a station button to switch the room soundtrack for everyone in the same room.
- Stop Music: the listening corner now includes a shared stop control that silences the room radio for everyone in that room.
- Uploads: use `Upload Photos` to replace the placeholder images with your own square-cropped gallery set. In a shared room, the active gallery upload set is synced to everyone else in that room.

## Live station sources

The listening corner currently points to official station stream pages and URLs:

- 80s Hits: 80s80s official stream directory, https://streams.80s80s.de/
- Classical: Radio Swiss Classic internet stream page, https://www.radioswissclassic.ch/en/reception/internet
- Classic Rock: RADIO BOB! stream directory, https://streams.radiobob.de/
- Metal: RADIO BOB! stream directory, https://streams.radiobob.de/

Browsers can still require one direct user interaction before live audio starts playing, so if a station is already active when someone joins, they may need to click the listening corner once on their device.

## Deploy-ready server

The project now includes [server/realtime-server.mjs](/Users/odedb/OneDrive/Documents/Playground/mixtiles-3d-museum/server/realtime-server.mjs), which serves the built app from `dist/` and hosts the multiplayer WebSocket endpoint at `/ws`. That makes the next deployment step straightforward: build once, run the Node server, and point a host such as Render, Railway, or Fly at `npm run preview:shared` or `npm run start`.

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
4. Share room links like `https://your-render-url.onrender.com/?room=family-night`.

Everyone opening the same `room` URL joins the same live multiplayer gallery.
