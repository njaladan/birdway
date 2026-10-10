# Birdway

A peaceful 3D pigeon game for the browser. Start on a Hudson-side rooftop, spread your wings, and make a small life in Manhattan.

## Run

Install Node.js 20 or later, then from this repository:

```sh
npm start
```

Open **http://localhost:8000**. No `npm install`, build step, API key or live map service is required. Alternatively, `python3 -m http.server 8000` serves the same game. Opening `index.html` directly with `file://` does not work because the city uses ES modules and bundled data fetches.

The entire repository is a static website. To host it, serve this directory with HTTPS on any static host, or configure GitHub Pages to publish `main` / root. Hosting is not currently configured by this repository.

## What works

- Actual Manhattan building footprints and roof heights below an approximate line along 59th Street: **20,868 buildings** and **1,152 real street centerlines**, bundled locally in about 1.5 MB of map data.
- Smooth acceleration, banking, climb/descent, faster gliding, trailing camera, automatic ledge takeoff, forgiving facade collisions, rooftop and street landing, and ground waddling. No damage, hunger, lives or timed goals.
- Day/night cycle (24-minute day), adjustable time and 1–60 minute cycle length, time presets, golden skies, calm water, stars and illuminated windows.
- A rooftop nest. Carry food home, peck a snack, bring shiny finds back, decorate the nest, and welcome up to five flock companions. Every two delivered bites invites a friend.
- **17 neighborhood discoveries:** bagel/pretzel carts, picnic/bakery/café crumbs, shiny keepsakes, fountain bathing, steam updrafts, cooing with a busker and a neighbor, rooftop flowers and laundry perches.
- **12 landmark postcards**, a field guide with destinations, local minimap, city map, and a direction/distance hint when you choose an outing.
- Photographs with `C`; the last six live in your scrapbook and can be downloaded.
- Original synthesized ambient music, quiet city air, soft coos, mute and volume controls. Audio begins with your play gesture. No remote audio files or licenses required.
- Browser-local progress saving, including food, friends, finds, postcards, photographs and time of day. Autosaves, delivery saves, and page-exit saves.
- A gentle sequence of intentions ending in a cozy home; exploration continues after completing it.

## Controls

| Input | In flight | On a street / roof |
| --- | --- | --- |
| W / S or up / down | Climb / descend | Waddle forward / back |
| A / D or left / right | Bank and turn | Turn |
| Space | Flap and rise | Take off |
| Shift | Faster glide | — |
| F | Short dash burst | Take off with a dash |
| Ctrl / hold S | Almost vertical / progressive dive | — |
| T / [ / ] | Time presets / previous / next hour | Same |
| E | Toggle landing approach | Interact / pick up / deliver |
| P | — | Peck food, or eat a carried bite |
| Q | Coo | Coo |
| H | Return to the nest | Return to the nest |
| C | Photograph | Photograph |
| Tab | City map | City map |
| B / J | Scrapbook / field guide | Scrapbook / field guide |
| M / Escape | Mute / pause | Mute / pause |
| Mouse drag | Look around; camera gently recenters | Look around |

Gamepad support: left stick steers, A / Cross takes off and flaps, right trigger glides. Menus and other actions use the keyboard. Desktop keyboard play is the primary experience; touch flight controls are not implemented.

For a landing, press E, steer above the chosen surface, and let your pigeon settle. W / S still steer altitude while flying; landing mode keeps descending gently. Walking off a roof spreads the wings automatically. Over water, a gentle lift keeps the pigeon safe. H is a convenience for an unhurried trip home, not a penalty.

## Performance

Balanced caps pixel ratio at 1.5; Light at 1; High at 2. Use Settings → Light on a large Retina display if needed. Buildings are batched into spatial chunks with frustum culling. Roof equipment and trees are instanced; static bird feathers are merged within animated joints; distant small props and traffic are hidden. No realtime shadows, postprocessing, streaming imagery or physics engine.

The implementation targets an M1 MacBook Pro, but no M1 hardware benchmark has been run. Software-rendered Chromium validates rendering and interactions here; it cannot establish Mac frame rate. Try Light first if Balanced feels heavy. Flight tuning lives in the small `FLIGHT` object in `src/flight.js`.

## Limits / simplified parts

This is a geographically grounded, stylized game, not photogrammetry. Footprints are accurate to the source snapshot and approximately one-metre quantization. Generic procedural façades and flat roofs do not capture all building setbacks, textures or current construction. Missing source heights fall back to 4m. One WTC has a modeled taper and mast; landmark crowns, the bridge, the arch and High Line walkway are artistic approximations. Road widths, parks, traffic, people and street props are stylized. Distant neighboring boroughs have land silhouettes, without full building coverage.

Tiny moments are deliberately lightweight: bathing splashes, gardening adds flowers, music answers your coo, and resting gives a quiet pause. Human characters and vehicles follow simple short paths, with no social or traffic simulation. Companion birds follow you; they do not have independent schedules. No interiors, dialogue trees, multiplayer or cloud save.

See [CREDITS.md](CREDITS.md) for map sources, provenance and accuracy. `tools/prepare-map.py` regenerates the geographic subset from its three source inputs.

## Code layout and checks

`src/main.js` connects the small modules: `flight.js`, `bird.js`, `geography.js`, `city.js`, `sky.js`, `life.js`, `content.js`, `interface.js`, and `audio.js`. `vendor/` contains Three.js; `data/` contains bundled geography. Plain JavaScript and CSS; no framework.

```sh
npm run check
```

This is a single lightweight smoke check for the actual map, flight and the pickup → delivery → flock/save loop. It is intentionally small. Use the browser to assess feel, landing and visual quality.
