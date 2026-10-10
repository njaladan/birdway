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

- Actual Manhattan building footprints, roof heights, and surveyed roof meshes below an approximate line along 59th Street: **20,868 footprint records**, including **19,666 matched LOD2 roof models** from the 2014 NYC 3D Building Model. The bundled city data also includes **1,152 street centerlines** and OpenStreetMap parks, paths, and tree locations.
- OpenStreetMap geometry for **7,099 park and plaza polygons**, **22,054 paths**, and **13,504 mapped tree points**. Up to 4,000 trees are instanced for rendering.
- A CC0 rigged pigeon, about 35 cm long with a roughly 65 cm wingspan, with animated flight, folded-wing idle, walking and pecking.
- Smooth acceleration, banking, climb/descent, faster gliding, trailing camera with a downward view during dives, automatic ledge takeoff, forgiving facade collisions, rooftop and street landing, and ground waddling. No damage, hunger, lives or timed goals.
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

Balanced caps pixel ratio at 1.5 and uses local 1024-pixel shadows; Light uses pixel ratio 1 and disables shadows; High uses pixel ratio 2 and shadows. Use Settings → Light on a large Retina display if needed. Building, park, and path geometry is batched by spatial chunk. Roof equipment and trees are instanced; each rigged pigeon uses one skinned draw call; distant small props and traffic are hidden. There is no postprocessing, streaming imagery or physics engine.

Near roofs, the flight model targets 35 m/s cruise and 55 m/s glide; between 30 and 100 m above the local roof, it smoothly increases toward 100 m/s cruise and 135 m/s glide. A dash targets 90 m/s near roofs or 200 m/s aloft for 1.2 seconds, with a two-second cooldown. Ground walking targets 1.2 m/s. These are game movement values, not a measured biological simulation.

The implementation targets an M1 MacBook Pro, but no M1 hardware benchmark has been run. Software-rendered Chromium validates rendering and interactions here; it cannot establish Mac frame rate. Try Light first if Balanced feels heavy. Flight tuning lives in the small `FLIGHT` object in `src/flight.js`.

## Limits / simplified parts

This is a geographically grounded, stylized game, not photogrammetry. Footprints reflect their source snapshot and are quantized to about one metre. The 2014 roof survey is matched to the newer footprints by location and dimensions; unmatched or newer construction uses its footprint and fallback roof height. PLUTO 2017 year-built and building-class fields guide eight procedural façade families. Those façades are approximations, not scans, and do not reproduce every setback, material or current construction. One WTC has a modeled taper and mast; landmark crowns, the bridge, the arch and High Line walkway are artistic approximations. OSM park boundaries, paths, and tree positions are real mapped features, while their rendering, road widths, traffic, people and street props are stylized. Distant neighboring boroughs have land silhouettes, without full building coverage.

Tiny moments are deliberately lightweight: bathing splashes, gardening adds flowers, music answers your coo, and resting gives a quiet pause. Human characters and vehicles follow simple short paths, with no social or traffic simulation. Companion birds follow you; they do not have independent schedules. No interiors, dialogue trees, multiplayer or cloud save.

See [CREDITS.md](CREDITS.md) for map sources, provenance and accuracy. `tools/prepare-map.py` regenerates the footprints, land and streets from its three source inputs; `tools/prepare-detail.py` matches the LOD2 roof survey and PLUTO metadata; `tools/prepare-parks.py` extracts the OpenStreetMap subset. The bundled city data is about 19 MB.

## Code layout and checks

`src/main.js` connects the small modules: `flight.js`, `bird.js`, `geography.js`, `city.js`, `facades.js`, `parks.js`, `sky.js`, `life.js`, `content.js`, `interface.js`, and `audio.js`. `vendor/` contains Three.js; `data/` contains bundled geography and derived map data. Plain JavaScript and CSS; no framework.

```sh
npm run check
```

This is a single lightweight smoke check for the actual map, flight and the pickup → delivery → flock/save loop. It is intentionally small. Use the browser to assess feel, landing and visual quality.
