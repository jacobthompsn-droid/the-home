# The Home — guide for coding agents

**What this is:** a shareable 3D apartment designer for a couple. It's a static three.js site with
no build step, hosted on GitHub Pages. It has floor plans and styles, a drag-and-drop **Playbox**
of furniture, first-person walk-throughs with physics (cannon-es), real sun, seasons and weather,
an indoor climate simulation, saved camera views, share links, GitHub saving and live sessions.

## Most common task: add furniture from a photo
Follow **`.claude/skills/photo-to-model/SKILL.md`**. In short: write `models/<category>/<id>.json`,
run `node tools/models.mjs validate`, then `node tools/models.mjs manifest`, check it in
`preview.html?model=<id>`, and commit.

## Run locally
`python tools/serve.py` → http://localhost:8080 (you need a server; opening the HTML file directly won't work).

## Map of the code
- `index.html`, `css/style.css`: page shell and UI styling
- `js/main.js`: app bootstrap and main loop
- `js/model-spec.js`: model format and validator (shared with `tools/models.mjs`)
- `js/models.js`: Playbox library and JSON → three.js builder
- `js/items.js`: furniture in the scene, gravity and settling, behaviors
- `js/apartment.js`: walls, doors and windows, floors, building
- `js/data/blueprints.js`: floor plans ("The Home" is the owners' sketch)
- `js/data/styles.js`: styles and floor types
- `js/environment.js`: sky, sun, seasons, weather
- `js/climate.js`: thermostat, airflow, heat map
- `js/physics.js`: physics
- `js/sim.js`: life sim (needs, chores, mood meters, activities, darts and pool, memories)
- `js/minigames.js`: the arcade game
- `js/thumbs.js`: rendered Playbox thumbnails
- `js/icons.js`: UI icons
- `js/updater.js`: live updates (hot-loads new models, self-updates the app)
- `js/cameras.js`: dollhouse, blueprint and walk camera modes
- `js/editor.js`: interaction
- `js/ui.js`: all panels
- `js/store.js`: design data, undo, share links
- `js/collab.js`: GitHub API and PeerJS live sessions
- `designs/`: saved designs (JSON)
- `models/`: Playbox models plus `index.json`
- `tools/`: validator, manifest builder, built-in model generator, dev server

## Rules
- Nothing may float: models must pass `node tools/models.mjs validate`.
- Keep it build-free (ES modules + import map in `index.html`).
- Don't edit `models/index.json` by hand; regenerate it.
