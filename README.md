# 🏡 The Home

Design our future apartment together, in 3D, in the browser.

Pick a floor plan and a style, then drag furniture out of the **Playbox**. Walk through it in first
person with real physics. Watch the sun move across the floor and see how the place feels in a summer
storm or a snowy winter night. Turn on the AC, open the windows and watch the breeze move the curtains.

**Open it:** `https://<owner>.github.io/<repo>/` (after GitHub Pages is on; see below).

## What you can do

| | |
|---|---|
| 🏠 **Dollhouse / 📐 Blueprint / 🚶 Walk** | Orbit view, top-down plan with room sizes, and a first-person walk-through with collisions, jumping and doors |
| 🧸 **Playbox** | About 60 built-in pieces. Drag them in, click to select, R to rotate, Delete to remove, Ctrl+D to duplicate |
| 🧩 **Edit every part** | Resize anything. Recolor, refinish or hide each individual part (sofa legs, cushions, lamp shade…). Paint single walls, change each room's floor |
| ⬇️ **Gravity** | Nothing floats. Things settle on the floor, rugs, tables and shelves. Wall items snap to walls. Remove a table and what's on it falls. Physics toys bounce and can be thrown |
| 🌦️ **Weather & seasons** | Real sun path by hour and season, plus clear, cloudy, rain, storms with lightning, snow and fog. Wind, trees that change color, a city that lights up at night, and live weather mode |
| 🌡️ **Climate** | Thermostat with AC and heat, ceiling and floor fans, open windows letting wind in, airflow particles, a thermal heat map and "feels like" readouts |
| 🎥 **Views** | Save camera spots ("Morning coffee", "From the bed") and play them as a tour. Take screenshots |
| 💞 **Together** | Share links, save designs to this repo, and live sessions where you see each other's edits and avatars in real time |
| 💰 **Budget** | Price for every item, totals by category, ❤️ "we both love this" list, activity log |

### Walk-mode keys

`WASD` move · `Shift` run · `Space` jump · `E` open doors and windows or switch things on · `G` grab ·
`Click` push or throw · `B` throw a ball · `F` flashlight · `Esc` pause · `1`/`2`/`3` switch views

## Adding furniture from a photo (Pinterest etc.)

Give any coding agent (Claude Code, Cursor, Copilot…) the photo and say:

> Read `.claude/skills/photo-to-model/SKILL.md` in this repo and turn this photo into a Playbox model.

The agent writes `models/<category>/<id>.json`, validates it, and pushes. A GitHub Action rebuilds the
Playbox list and the new piece shows up for both of you. You can also paste a model JSON in the app with
**📷 Add a model from a photo**.

## Running it locally

```bash
python tools/serve.py          # then open http://localhost:8080
```

A web server is required; double-clicking `index.html` won't work. There's no install and no build step.

Useful commands:

```bash
node tools/models.mjs validate     # check every model (shape, size, nothing floating)
node tools/models.mjs manifest     # rebuild models/index.json + designs/index.json
open preview.html?model=<id>       # look at a single model
```

## Saving to GitHub from the app

- **Without a token:** "Save to our GitHub repo" opens GitHub with the file pre-filled; just click *Commit*.
- **With a token** (⚙️ Settings): create a [fine-grained token](https://github.com/settings/personal-access-tokens/new)
  limited to this repo with **Contents: Read and write**. Saves and model publishing then commit directly.
  The token stays in that browser only.

## How it's built

Plain ES modules with [three.js](https://threejs.org) and [cannon-es](https://github.com/pmndrs/cannon-es) from a CDN,
plus [PeerJS](https://peerjs.com) for live sessions. All textures are generated in code. See `AGENTS.md` for a map of the code.
