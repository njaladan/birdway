# Traffic sources and simulation limits

Sources accessed October 11, 2026. The game bundles these crops; it makes no remote requests during play.

## Directed roads and controls

`data/traffic.json` contains 4,089 OpenStreetMap surface road ways, with node IDs, geometry, one-way tags, road class, available lane counts, bus-lane tags, truck restrictions and posted speed tags. It also retains 2,155 mapped traffic-signal points, many of which are separate approaches at the same intersection. These are cropped to mapped Manhattan land below the existing approximate 59th Street boundary. Bridges, tunnels, private roads and non-motor roads are excluded. The game does not apply NYC traffic assumptions to the Jersey City addition.

© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). `data/traffic.json`'s OSM-derived road/control database remains available under ODbL 1.0. Attribution does not imply endorsement. Roads are a snapshot, not a lane-level survey; missing lane counts use a two-lane approximation. Default speed is 25 mph, with lower mapped limits respected.

Download the inputs using Overpass (`https://overpass.kumi.systems/api/interpreter`) with these queries:

```
[out:json][timeout:60];way[highway~"^(primary|secondary|tertiary|residential|unclassified|living_street)$"](40.699,-74.025,40.773,-73.94);out geom;
[out:json][timeout:90];node["highway"="traffic_signals"](40.699,-74.025,40.773,-73.94);out body;
```

## Buses

Official [MTA developer data](https://www.mta.info/developers), Manhattan bus feed: `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip`. Feed version **20260813**, effective **September 6, 2026–January 2, 2027**. `tools/prepare-traffic.py` keeps the most common scheduled shape per route/direction within the playable bounds: 58 directed paths and 1,088 route-stop references (shared physical stops appear on multiple routes). It retains headsigns, stop IDs/names/positions, travel-time estimates, and separate hourly weekday/Saturday/Sunday departures. Departures are counted at each trip's first stop inside the crop, including other shape variants; the renderer follows the representative shape. Scheduled travel time informs cruise speed; generated signal delays and boarding dwell can change actual journey time. Articulated assignment is an approximation for the listed SBS routes and M15, not a vehicle dispatch inventory. No live arrivals, detours, GTFS-RT, full timetable dispatch or exact manufacturer models.

MTA's feed is offered as public developer data; see its [developer terms](https://www.mta.info/developers). Names and liveries identify transit service, without implying endorsement. Simulated passenger counts, boarding times and bus shelters are original approximations.

## Travel distribution

[NYC DOT Automated Traffic Volume Counts](https://data.cityofnewyork.us/Transportation/Automated-Traffic-Volume-Counts/7ym2-wayt) supplies the 24-hour demand curve in `data/traffic-profile.json`. Reproduction query to `https://data.cityofnewyork.us/resource/7ym2-wayt.json`:

```
$select=hh,avg(vol) as mean_volume,count(*) as samples
$where=boro = 'Manhattan' AND yr >= 2024
$group=hh
$order=hh
```

Each hour contains 1,684–1,688 observed count intervals; mean interval volume is normalized to the busiest hour. This pools sampled streets/dates and is not a weighted citywide census or a forecast for a specific block. It supports a substantially quieter overnight city and a broad afternoon peak. Bus density uses MTA's own service curve instead. [NYC Open Data terms](https://opendata.cityofnewyork.us/overview/#termsofuse) apply.

[TLC monthly aggregated reports](https://www.nyc.gov/site/tlc/about/aggregated-reports.page), `https://www.nyc.gov/assets/tlc/downloads/csv/data_reports_monthly.csv`, supply July 2026 context: 674,877 high-volume FHV trips/day and 113,811 yellow taxi trips/day, with 61,044 and 8,494 vehicles/day respectively. Mean daily vehicle hours are 6.4 and 8.1. These describe citywide for-hire operation, not the proportions of all Manhattan road vehicles. They motivate frequent rideshares and visible yellow taxis; they do **not** establish private-car, freight or emergency vehicle shares. The fleet weights are explicitly **estimated**, with an artistic increase in taxi visibility for the Manhattan crop. Green taxis are omitted because their permitted street-hail area is outside this Manhattan crop. For-hire pickup dwell, daytime deliveries, school peaks and overnight sanitation are heuristic schedules. Trips, registered vehicles and traffic counts are different denominators; no exact all-vehicle distribution is claimed.

[NYC DOT signals](https://www.nyc.gov/html/dot/html/infrastructure/signals.shtml) describes typical 45–120-second cycles and pedestrian head starts. Signal locations are mapped; timings, avenue offsets, all-red clearance, pedestrian starts and turn yielding are generated within this guidance. NYC's usual prohibition on right-on-red is respected. OSM does not supply an authoritative current signal controller plan. Stop-control fallback at unmapped junctions, vehicle dimensions, lane offsets, lane choice and collision margins are simulation rules. Large trucks prefer major streets, but this is not an authoritative truck-route compliance model; see [NYC DOT truck guidance](https://www.nyc.gov/html/dot/html/motorist/trucks.shtml).

Rebuild: `python tools/prepare-traffic.py roads.json signals.json gtfs_m.zip`. The Python standard library is sufficient. `data/traffic-profile.json` records the raw aggregate observations alongside the normalized demand curve and clearly marked estimated weights.

## Local density and rendering

The fleet now streams around the bird instead of distributing 1,100 moving slots and 220 parked vehicles across the entire Manhattan crop. Peak moving occupancy targets roughly one vehicle per **32 metres per travel lane on primary/secondary/tertiary streets**, and one per **58 metres on quieter streets**, multiplied by DOT's observed hourly demand curve. Actual counts vary with the local road network, building masks, available vehicle classes, queues, and population budgets. These spacing targets are **artistic estimates for an NYC street feel**, not an inference of instantaneous occupancy from DOT flow counts. No exact measured block density is claimed.

Inferred curb parking uses 7.2-metre bays with 78% target occupancy; placement leaves 20 metres at both ends of each graph edge and 24 metres around mapped bus-stop points. Primary roads, bus-only streets and the inferred right curb of bus-lane streets are excluded. Road widths add inferred curb bays to mapped travel lanes so parked cars fit on asphalt. These are scenery rules, not a current parking regulation, hydrant, bicycle-lane, loading-zone or parking utilization survey.

Moving traffic streams over a 900-metre ring and parking over 720 metres, capped at 1,000 moving non-transit vehicles and 2,600 parked vehicles. Existing residents persist into a wider ring. Ordinary travel replenishes actors outside 660 metres; rendering ends at 620 metres. Newly visited areas load immediately on initial entry or a large location jump. Visible/ridden actors are protected when demand falls; reduced demand thins the offscreen population first. Ridden actors survive streaming and cannot be recycled underneath the bird. The population remains confined to the mapped Manhattan road graph.

Bus population uses scheduled hourly departures multiplied by in-crop scheduled travel time at **full scale**, capped at eight buses per directed representative route (previously 55% scale with a cap of five). This remains an estimate of concurrent service, with generated dispatch, not live locations or full timetable simulation. Safe terminal dispatch leaves room for the preceding vehicle.

At most 32 close vehicles retain detailed meshes, with a 64-model reuse cache. All other visible vehicles use textured, instanced silhouettes (body, glass, tires and lights), one draw call per class. Simplified rendering retains roof/perch collision support. Performance was checked in headless Chromium with software WebGL; it is not an M1 hardware benchmark.

## Vehicles

Kenney's [Car Kit](https://kenney.nl/assets/car-kit), downloaded from `https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip`, is **CC0**. Selected GLB models, their color texture and the source license are bundled in `assets/vehicles/kenney/`. Browser adaptations scale the geometry to plausible metres and add detailed surfaces, lighting and collision support. Original standard/articulated MTA-style buses, school buses and paratransit supplement that kit. They suggest present-day vehicle classes; they are not scanned NYC fleets or licensed manufacturer replicas.

`tools/prepare-vehicle-textures.py` generates the original paint/grime, tire tread, glass, panel seams and service livery atlas, plus roughness. Requires Pillow. No external fonts or image services are required at runtime. All adaptations and generated surfaces are original; downloaded geometry retains CC0.
