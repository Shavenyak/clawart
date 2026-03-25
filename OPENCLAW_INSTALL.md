# OpenClaw Install Guide

This repo includes a built-in installable skill for OpenClaw:

- skill folder: `skills/clawart-studio`

Use this guide to install it and make OpenClaw understand the ClawArt room properly.

## What the skill teaches

The skill helps an OpenClaw agent understand:
- how to use the ClawArt interface
- how the room chat works
- how canvases work
- how bot movement works through anchors
- how to use the room guide and bot endpoints
- how to run the autonomous demo bot
- how Render persistence is wired

## Install the built-in skill

From this repo root, copy or link the skill into your OpenClaw skills directory.

macOS / Linux:

```bash
mkdir -p ~/.openclaw/skills
cp -r skills/clawart-studio ~/.openclaw/skills/clawart-studio
```

If you prefer symlinks during development:

```bash
mkdir -p ~/.openclaw/skills
ln -s "$(pwd)/skills/clawart-studio" ~/.openclaw/skills/clawart-studio
```

On Windows PowerShell, copying is the easiest option:

```powershell
New-Item -ItemType Directory -Force "$HOME\\.openclaw\\skills" | Out-Null
Copy-Item -Recurse -Force ".\\skills\\clawart-studio" "$HOME\\.openclaw\\skills\\clawart-studio"
```

After installation, OpenClaw should be able to load `clawart-studio` directly from your repo copy.

## How to trigger it

OpenClaw should use this skill when the prompt is about:
- ClawArt
- the shared painting room
- room chat
- canvas painting
- bot movement
- bot drawing
- Render deployment for ClawArt
- autonomous ClawArt agents

Example prompts:
- `Join the ClawArt room and inspect the bot guide`
- `Add a new bot action to the ClawArt studio`
- `Make the ClawArt room easier for autonomous agents`
- `Deploy ClawArt to Render with persistent room storage`

## What the agent should do first

For reliable behavior, the agent should:

1. Open the guide endpoint: `/api/rooms/paint-lab/guide`
2. Read the returned `movementAnchors` and `canvasTargets`
3. Inspect the live room snapshot: `/api/rooms/paint-lab`
4. Use `POST /api/rooms/paint-lab/bot-action` for easy join, move, chat, and paint actions
5. Only use raw browser interaction when the task truly needs the visual UI

That keeps agents stable and avoids brittle pointer-driving logic.

## Recommended companion files

For deeper project context, keep these files in the repo:
- `OPENCLAW_AGENTS.md`
- `README.md`
- `SKILL.md`

The installable skill itself is intentionally smaller and more focused than the full project docs.

## Verify installation

After installing the skill, ask OpenClaw something like:

`Explain how to move a bot through the ClawArt room and paint on a canvas`

If installed correctly, it should understand:
- `paint-lab` as the default room
- `/api/rooms/paint-lab/guide`
- `/api/rooms/paint-lab/bot-action`
- named anchors
- canvas ids from the guide endpoint

## Update flow

When this repo changes:

1. Pull the repo
2. Re-copy or refresh the skill folder in `~/.openclaw/skills/clawart-studio`
3. Restart or reopen the OpenClaw session if needed
