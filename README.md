# 🏡 The Home

Design our future apartment together, in 3D, in the browser.

Pick a floor plan and a style, then drag furniture out of the **Playbox**. Walk through it in first
person with real physics. Watch the sun move across the floor and see how the place feels in a summer
storm or a snowy winter night. Turn on the AC, open the windows and watch the breeze move the curtains.

**Open it:** `https://<owner>.github.io/<repo>/` (after GitHub Pages is on; see below).

## Floor plans from real listings

| Plan | Based on | Size | Layout |
|---|---|---|---|
| **Pierce St Flats #204** | [207 Pierce St #204, Midtown](https://redf.in/2GCSsV) | 1,015 ft² | 1 bed + study · 1 bath · wet bar · covered balcony · loft ceilings |
| **Stratford St #18** | [309 Stratford St #18, Montrose](https://redf.in/4MsX8d) | 704 ft² | 1 bed · 1 bath · laundry room · remodeled 1960 condo |
| **S Bartell Dr #210** | [2830 S Bartell Dr #210, near NRG](https://redf.in/IACap9) | 1,000 ft² | 2 bed · 2 bath · split bedrooms with walk-in closets · balcony |

These layouts are reconstructed from each listing's size, room list and description; the listings don't
publish floor plans. Each one is placed on its real floor (2nd), so the view out the windows is at tree height.
The original concept plans (The Home sketch, Studio Loft, Penthouse) are still available.

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

## 🌱 Living there (the sim part)

The Home keeps living while you're away, on **real time**:

- **Plants dry out** over a few days. They visibly brown and droop until someone walks over and waters them (E).
- **Dishes pile up** in the sink (cooking makes more), **laundry** fills the washer, and the **bed** gets messy after you sleep in it.
- **Mood meters:** 🌿 Plants · 🧽 Tidy · 🎉 Fun · 🛋️ Cozy · 💞 Together. They combine into one **home happiness** score shown at the bottom of the screen.
- **Activities** (Q while looking at furniture, or the **Life** tab):

  | | |
  |---|---|
  | 🍿 Movie night | 🪩 Dance party |
  | 🍳 Cook dinner | 🕯️ Candlelit dinner |
  | 🎯 Darts (real aiming) | 🎱 Pool break (real ball physics) |
  | 🕹️ Heart Catch arcade game | 🎸 Guitar (synthesized G–D–Em–C) |
  | 📚 Reading | ☕ Coffee on the balcony |
  | ♨️ Hot tub | 🛁 Bubble bath |
  | 😴 Sleep till morning | |

- **Memories:** every activity saves a snapshot to the journal. High scores are kept.
- **Together:** activities done during a 💞 Live session count double for *Together*.
- **Welcome back:** when you return after a while, you get a summary of what needs doing and what your partner did.
- **Pace:** in the Life tab you can speed things up (6× or 48×) if real days feel too slow.

### Walking

Press **Walk** (or double-click any floor) to step in right where you're looking. **Drag** to look around,
**WASD** to move and **← →** to turn. The Playbox and inspector stay open, so you can drag furniture in, click a piece to
select it, then drag it, rotate it (R) or delete it while you're standing in the room. **M** turns on full mouse-look,
and **Esc** steps back out.

### Walk-mode keys

`WASD` move · `Shift` run · `Space` jump · `E` use (doors, lights, water plants, chores) · `Q` activity · `G` grab ·
`Click` push, throw or throw a dart · `B` throw a ball · `F` flashlight · `Esc` pause · `1`/`2`/`3` switch views

On phones and tablets, use the left thumb as a joystick and drag with the right thumb to look. On-screen buttons cover Use, Do, Grab and Jump.

## Adding furniture from a photo (Pinterest etc.)

Give any coding agent (Claude Code, Cursor, Copilot…) the photo and say:

> Read `.claude/skills/photo-to-model/SKILL.md` in this repo and turn this photo into a Playbox model.

Agents that can't see the repo (for example a chat app) can fetch the skill directly:
https://raw.githubusercontent.com/jacobthompsn-droid/the-home/main/.claude/skills/photo-to-model/SKILL.md

The agent writes `models/<category>/<id>.json`, validates it, and pushes. A GitHub Action rebuilds the
Playbox list and the new piece shows up for both of you. You can also paste a model JSON in the app with
**📷 Add a model from a photo**.

## Always up to date

You never need to refresh. Open copies of The Home check GitHub about every 40 seconds:
- **New or changed Playbox models** load straight into the running app with a "🧸 New in the Playbox" toast.
- **App code updates** save your work and reload. This happens instantly if the tab is in the background, or after a
  20-second heads-up (with a "Later" button) if you're using it. The `version.json` stamp is written by a GitHub Action.

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
