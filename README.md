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
- OpenStreetMap geometry for **7,099 park and plaza polygons**, **22,054 paths**, and **13,504 mapped tree points**. The additional 2015 NYC Street Tree Census provides **23,016 living street-tree records** with species. Up to 10,000 census trees and 2,000 OSM park trees are instanced, with canopy forms selected by species.
- A CC0 rigged pigeon, about 35 cm long with a roughly 65 cm wingspan, with wingbeat, extended glide, landing flare, tucked-wing idle, brisk walking and pecking animations.
- Smooth acceleration, banking, climb/descent, faster gliding, trailing camera with a forward view while walking and a downward view during dives, automatic ledge takeoff, forgiving facade collisions, rooftop and street landing, and an animated brisk walking gait. No damage, hunger, lives or timed goals.
- Day/night cycle (24-minute day), adjustable time and 1–60 minute cycle length, time presets, golden skies, calm water, stars and illuminated windows.
- Filtered directional tidal river waves, rippled sun highlights, broad olive/blue tidal color bands, mapped shore shading, and actual skyline reflections (512 px, capped at 12 Hz in High). Layered drifting clouds, atmospheric haze and prefiltered sky lighting for glass. CC0 photographic brick, concrete, metal, asphalt, grass and soil materials are bundled locally.
- Species-shaped branching trees with photographed foliage, textured bark, gentle wind and distance-based detail, plus a trimmed CC0 Poly Haven pine model for close conifers. Park turf uses photographed albedo, normal, roughness and height maps with nearby curved, tapered blades, gentle wind, transmission and distance fading; Battery/BPC paving uses small hexagonal joints. Seawalls follow the mapped shoreline, with railings and furniture near named Esplanade paths. 105 classic elevated water tanks dress verified flat prewar apartment roof patches.
- Four ferries and two harbor workboats move through the Hudson, East River and harbor, with broken foam wakes. Their looping routes are checked against mapped land.
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
| W / S or up / down | Climb / descend | Brisk walk forward / back |
| A / D or left / right | Bank and turn | Turn |
| Space | Tap to take off; hold to flap and rise smoothly | Take off |
| Shift | Faster glide | — |
| Alt / left trigger | Slow, precise flight | — |
| F | Short dash burst | Take off with a dash |
| Ctrl | Deliberate steep dive; release to recover | — |
| T / [ / ] | Time presets / previous / next hour | Same |
| E | Begin or cancel a gentle landing approach | Interact / pick up / deliver |
| P | — | Peck food, or eat a carried bite |
| Q | Coo | Coo |
| H | Return to the nest | Return to the nest |
| C | Photograph | Photograph |
| Tab | City map | City map |
| B / J | Scrapbook / field guide | Scrapbook / field guide |
| M / Escape | Mute / pause | Mute / pause |
| Mouse drag | Look around; camera gently recenters | Look around |

Gamepad support: left stick steers and climbs, A / Cross takes off and flaps, B / Circle dashes, X / Square begins or cancels landing (or interacts on the ground), left trigger brakes for precise low-speed flight, and right trigger glides. Menus and other actions use the keyboard. Desktop keyboard play is the primary experience; touch flight controls are not implemented.

For a landing, press E and steer toward the chosen surface. The bird eases down to a brisk approach speed, then slows and flares near the roof or street. Press E again to cancel; W can also climb out of an approach. Alt / left trigger brakes for precise low-speed flight. W climbs and S descends smoothly; Ctrl starts a deliberate steep dive, and releasing it lets the bird recover. In ordinary flight, the pigeon alternates short wingbeat bursts with extended glides; holding Space keeps flapping to climb. Wings fold close to the body on foot and spread for a glide or landing flare. Walking off a roof spreads the wings automatically. Over water, a gentle lift keeps the pigeon safe. H is a convenience for an unhurried trip home, not a penalty.

## Performance

Balanced starts at pixel ratio 1.25 and adapts down in small steps to 0.8 when frames remain slower than 30 fps; Light uses pixel ratio 1 and disables shadows; High uses pixel ratio 2 and shadows. Use Settings → Light on a large Retina display if needed. Building, park, and path geometry is batched by spatial chunk. Roof equipment and trees are instanced; trees switch between detailed and sparse canopy cards by distance; grass blades are generated within 24 m and cleared above 40 m; each rigged pigeon uses one skinned draw call; distant small props and traffic are hidden. There is no postprocessing, streaming imagery or physics engine. High adds a capped skyline reflection pass; Balanced and Light retain wave shading with analytic sky reflections. Nearby architecture retains surveyed roofs; distant blocks use simplified footprints and heights. Shadows update at most eight times per second, and the minimap crops a cached atlas.

Flight targets 35 m/s cruise and 55 m/s glide at any altitude. A dash targets 90 m/s for 1.2 seconds, with a two-second cooldown. Brisk ground walking targets 3.6 m/s; holding Space builds lift over a short flap instead of jumping upward instantly. Approaches automatically reduce forward speed near the landing surface. These are game movement values, not a measured biological simulation.

The implementation targets an M1 MacBook Pro, but no M1 hardware benchmark has been run. Software-rendered Chromium validates rendering and interactions here; it cannot establish Mac frame rate. Try Light first if Balanced feels heavy. Flight tuning lives in the small `FLIGHT` object in `src/flight.js`.

## Limits / simplified parts

This is a geographically grounded, stylized game, not photogrammetry. Footprints reflect their source snapshot and are quantized to about one metre. The 2014 roof survey is matched to the newer footprints by location and dimensions; unmatched or newer construction uses its footprint and fallback roof height. PLUTO 2017 year-built and building-class fields guide eight generated façade families, with photographic material maps. Those façades are approximations, not scans, and do not reproduce every setback, material or current construction. One WTC has a footprint-aligned 200-foot base, taper, 417 m roof and 541 m mast; landmark crowns, the bridge, the arch and High Line walkway are artistic approximations. OSM park boundaries, paths, and tree positions are real mapped features, while their rendering, road widths, traffic, people and street props are stylized. Distant neighboring boroughs have land silhouettes, without full building coverage.

Boat models and routes are artistic approximations rather than live vessel locations or ferry timetables. Water color and shore shading suggest tidal conditions; they are not measured bathymetry.

Tiny moments are deliberately lightweight: bathing splashes, gardening adds flowers, music answers your coo, and resting gives a quiet pause. Human characters and vehicles follow simple short paths, with no social or traffic simulation. Companion birds follow you; they do not have independent schedules. No interiors, dialogue trees, multiplayer or cloud save.

See [CREDITS.md](CREDITS.md) for map sources, provenance and accuracy. `tools/prepare-map.py` regenerates the footprints, land and streets from its three source inputs; `tools/prepare-detail.py` matches the LOD2 roof survey and PLUTO metadata; `tools/prepare-parks.py` extracts the OpenStreetMap subset; `tools/prepare-street-trees.py` reproduces the census crop. The bundled city data is about 19 MB.

## Code layout and checks

`src/main.js` connects the small game modules. Rendering is split into `city.js`, `city-lod.js`, `facades.js`, `landmarks.js`, `parks.js`, `ground.js`, `trees.js`, `street-details.js`, `waterfront.js`, `sky.js`, `water.js`, `water-coast.js`, `water-reflection.js`, `boats.js`, and `environment.js`. `vendor/` contains Three.js; `data/` contains bundled geography and derived map data; `assets/` contains the rig and licensed materials. Plain JavaScript and CSS; no framework.

```sh
npm run check
```

This runs a city/gameplay smoke check, deterministic flight and animation regressions, and harbor checks. Coverage includes smooth lift, braking and approaches, mixed input, gamepad edges, collision sweeps, rooftop landings, camera clipping, folded/gliding silhouettes, home reset, mapped coast shading, water holes, boat loop continuity and pause. Use the browser to assess feel, landing and visual quality.

## Agent workflow

Every agent must read [AGENTS.md](AGENTS.md) before editing. Work on `main`, make small self-contained commits as each change is ready, and immediately push each commit to `origin/main`. A shared-checkout coordinator serializes commits and pushes for collaborating agents.
