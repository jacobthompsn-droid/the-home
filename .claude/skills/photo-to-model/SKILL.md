---
name: photo-to-model
description: Turn a photo (Pinterest pin, store listing, snapshot) of furniture or decor into a Playbox model JSON file for The Home 3D apartment planner. Use when asked to "make a model from this photo", "add this to the Playbox", or given an image/link of an item to add to The Home.
---

# Photo → Playbox model (The Home)

The Home is a static three.js site (no build step). Every piece of furniture in the
**Playbox** (the drag-and-drop catalog) is one JSON file in `models/<category>/<id>.json`,
built from simple primitive **parts**. The app lists whatever is in `models/index.json`.
Add a file, rebuild the index, push → it appears in everyone's Playbox.

## Workflow

1. **Study the photo.** List the visible components (legs, seat, cushions, frame, shade…),
   their colors (sample hex values), materials (wood, fabric, metal, glass…) and shape.
2. **Estimate real dimensions in meters** using standard references:
   seat height 0.45, sofa depth 0.95, dining table height 0.76, counter 0.92, desk 0.75,
   nightstand 0.55, door 2.03 tall, queen bed 1.6 × 2.05. Product listings often state dimensions — use them.
3. **Decompose into parts** (usually 5–40). Each part is a primitive with a center position.
4. **Write** `models/<category>/<id>.json` (schema below). The `id` must match the file name.
5. **Validate** — must pass with zero errors:
   `node tools/models.mjs validate models/<category>/<id>.json`
6. **Rebuild the index:** `node tools/models.mjs manifest`
7. **Look at it:** run `python tools/serve.py` and open
   `http://localhost:8080/preview.html?model=<id>` (try `&style=boho` etc.). Compare to the photo; adjust.
8. **Commit & push** the model file and `models/index.json`. Done — it's in the Playbox.

Optionally save the reference image to `models/refs/<id>.jpg` and put the link in `source`.

## Coordinate rules (important)

- Units: **meters**. `x` = width (left/right), `y` = up, `z` = depth. **Front faces +z.**
- Origin = **bottom-center** of the model (y = 0 is the floor it stands on).
  - `placement: "ceiling"` → origin is the **top-center**; parts hang at negative y.
  - `placement: "wall"` → back of the model touches the wall at `z = -depth/2`; set `mountHeight`.
- `size: [w, h, d]` is the overall bounding box; parts must stay inside it.
- `pos` is the **center** of each part. `rot` is degrees `[x, y, z]`.

## Gravity — nothing may float

The validator rejects models with floating parts. Every part must touch (within 2.5 cm) another
part, chained down to the floor (or the wall/ceiling for those placements). The lowest part must sit at
y = 0. In the app, items always settle onto the floor, a rug, or the top of a `surface` item;
wall items snap to walls; ceiling items hang from the ceiling; `dynamic` items are simulated by physics.

## Schema

```json
{
  "id": "velvet-sofa",                 // kebab-case, equals file name
  "name": "Velvet Sofa",
  "category": "living",                // living bedroom kitchen dining bath office game outdoor decor lighting climate play
  "icon": "🛋️",
  "price": 1299,                       // USD estimate
  "size": [2.1, 0.8, 0.95],
  "placement": "floor",                // floor | surface (sits on tables/shelves) | wall | ceiling
  "mountHeight": 1.4,                  // wall only: floor → bottom of model
  "surface": 0.45,                     // optional: height other items can be placed on top of
  "rug": false,                        // true for rugs (flat, walkable)
  "collection": "Pinterest",           // anything except "Built-in"
  "tags": ["sofa", "velvet"],
  "source": { "type": "photo", "url": "https://pinterest.com/pin/...", "notes": "" },
  "physics": { "body": "static", "colliders": [[0, 0.24, 0.05, 2.1, 0.48, 0.85]] },
  "defaultOn": true,                   // devices only
  "behaviors": [],
  "parts": [
    { "name": "base", "shape": "roundedBox", "radius": 0.04, "size": [2.1, 0.25, 0.95], "pos": [0, 0.225, 0], "material": "@fabric" },
    { "name": "leg", "shape": "cylinder", "size": [0.05, 0.1, 0.05], "pos": [0.98, 0.05, 0.4], "material": "@woodDark", "mirror": "xz" }
  ]
}
```

**Shapes:** `box`, `roundedBox` (+`radius`), `cylinder` (+`taper` = top/bottom radius ratio; 0 = cone),
`sphere` (size = diameters → ellipsoids), `torus` (size `[outerDiameter, tubeDiameter, outerDiameter]`, lies flat),
`cloth` (wavy plane for curtains/throws), `group` (+`children`, for pivots/animation).
**`mirror`:** `"x"`, `"z"` or `"xz"` duplicates a part symmetrically (legs!).

**Materials:** a hex `"#c8a77e"`, a style token, or an object
`{ "color": "#hex|@token", "finish": "...", "opacity": 0.5, "texture": "...", "glow": true }`.
- Tokens follow the chosen style so the item restyles with the home: `@fabric @fabric2 @wood @woodDark @metal @accent @accent2 @stone @ceramic @plant @cabinet @light`.
  Use tokens for the main surfaces unless the photo's exact color matters — then use hex.
- Finishes: `matte satin gloss plastic fabric wood metal chrome stone ceramic glass mirror leaf water emissive`.
- Textures: `wood fabric rug art subway marble none`.
- `glow: true` makes a part light up when a `light` behavior is on (lamp shades, bulbs).

**Physics:** `body`: `static` (default; collider = `size` or custom `colliders` `[cx,cy,cz,w,h,d]`),
`dynamic` (+`mass` kg, `shape: "box"|"sphere"`, `restitution`) for throwable/pushable things, `none` for decor.

**Behaviors** (make it alive):
- `{ "type": "light", "at": [x,y,z], "intensity": 1 }`
- `{ "type": "spin", "part": "blades", "axis": "y", "speed": 7 }` (fans)
- `{ "type": "oscillate", "part": "head", "axis": "y", "amount": 35, "speed": 0.6 }`
- `{ "type": "airflow", "kind": "fan|ac|heater", "at": [...], "dir": [...], "strength": 2.5, "range": 4 }`
- `{ "type": "screen", "part": "screen" }` (TVs), `{ "type": "sway", "part": "foliage" }` (plants),
  `{ "type": "cloth", "part": "panel" }` (curtains), `{ "type": "status", "part": "led" }`.

**Every part needs a unique-ish `name`** — users can recolor, change finish, or hide each part in the
inspector by name ("Edit every part"). Name parts like a person would: `seat-cushion-1`, `left-arm`, `shade`.

## Life-sim hooks

- Add `"plant"` to `tags` and the item becomes a living plant that needs watering. Group its leaves in a part named
  `foliage` so they can brown and droop. Optional `"thirstDays": 5` sets how many days it lasts between waterings.
- Activities attach by model id (see `ACTIVITIES` in `js/sim.js`). To give a new model an activity, add its id to
  that activity's `models` list.

## Tips for good results

- Match proportions first, details second. Round edges (`roundedBox`) make soft goods look real.
- Use 2–4 colors max per item; pull them from the photo.
- Look at existing models in `models/` for patterns (sofas, lamps, fans, plants).
- Real meshes: if you can produce a `.glb`, put it in `models/assets/` and add `"mesh": { "url": "models/assets/x.glb" }`;
  it is auto-scaled to `size`. Still include at least one simple part so the validator can check placement.
- A whole room from one photo: create one model per piece, all with the same `collection`
  (e.g. `"Pinterest – Cozy Living"`), so they group together in the Playbox.
