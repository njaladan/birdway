# Downtown Jersey City geography

The playable addition covers longitude -74.058 to -74.027 and latitude 40.705 to
40.739: Downtown, Grove Street, Hamilton Park, Paulus Hook and Newport. The OSM
shoreline extends farther for distant land context. The flat street datum follows
Birdway's Manhattan convention; this addition does not include the Heights.

## Rebuild

Raw public sources are cached outside the repository. Install Python packages
`numpy pyproj shapely requests osmium`, then run:

```sh
python3 tools/download-jersey-city.py /tmp/jersey-city-source-cache
python3 tools/prepare-jersey-city.py /tmp/jersey-city-source-cache
```

The downloader caches approximately 164 MB of New Jersey OSM data and selected
I3S mesh tiles. Existing cached inputs are reused. Refresh the cache explicitly
to obtain a different snapshot; generated output will reflect source updates.
Only compact derived assets are committed. No live geography APIs are contacted
by the game. The source snapshot used for this addition was fetched October 11,
2026. Manhattan's binary assets and their stable IDs are preserved.

## Sources and terms

- [JerseyCity_3D__Buildings_Update](https://www.arcgis.com/home/item.html?id=475d65c1e3a149f6867ff1d29345b52c),
  published April 2023. [Scene layer](https://services2.arcgis.com/UXbywc7dSkfgdPp4/arcgis/rest/services/JerseyCity_3D__Buildings_Update/SceneServer/layers/0)
  contains detailed multipatch geometry; [feature layer](https://services2.arcgis.com/UXbywc7dSkfgdPp4/arcgis/rest/services/JerseyCity_3D__Buildings_Update/FeatureServer/0)
  supplies geographic footprints and IDs. Publication date is not acquisition date.
  Only leaf geometry is retained to avoid duplicating coarser representations.
  Mesh XY coordinates are EPSG:3857, local to node centers. Mesh Z is metres;
  BLDGHEIGHT attributes are feet, checked against geometry. Building base heights
  are normalized to the game's flat ground; roof/setback relationships remain.
  Invalid heights and features outside the playable rectangle are rejected.
- [Jersey City open-data policy](https://data.jerseycitynj.gov/explore/assets/jersey-city-open-data-policy/).
  The city's published policy says it places no restrictions on third-party reuse
  of data. Source item license fields are blank; no CC0 or photogrammetry license
  is claimed. Sources are credited and the game is independent of these services.
- [2021 Tree Inventory](https://data.jerseycitynj.gov/explore/dataset/2021-tree-inventory/):
  filtered coordinates, common/botanical species and trunk diameter. Tree shapes
  and heights are approximations; an inventory record is not a scanned tree.
- [Jersey City Parks](https://data.jerseycitynj.gov/explore/dataset/jersey-city-parks-map/):
  supplements named park boundaries missing from OSM. Internal paths, plazas and
  surface subdivisions primarily follow OSM. Parks are not uniformly surveyed.
- [Geofabrik New Jersey OSM extract](https://download.geofabrik.de/north-america/us/new-jersey.html),
  © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright).
  Supplies the actual directed coastline (including piers and marina slips),
  streets, pedestrian routes, park subdivisions and newer mapped buildings.
  Municipal boundaries are intentionally not used as land polygons: they include
  water. The OSM-derived geography in `data/jersey-city.json` and footprint data is
  available under ODbL 1.0; the non-OSM inputs retain their source terms.
- [99 Hudson](https://99hudsonjerseycity.com/): the building's own site gives a
  900-foot height (274.32 m). Its mapped tower part and podium footprints come
  from OSM. [Jersey City Urby's architect](https://concreteamsterdam.nl/projects/jersey-city-urby/)
  documents the 69-storey completed tower; the mapped height is 217 m. Newer
  building/part geometry replaces low obsolete source masses on those sites. OSM
  buildings tagged construction or proposed are excluded (including the planned
  55 Hudson tower), rather than presenting future towers as complete.

## Accuracy limits

This is schematic building massing with mapped outdoor geometry, matching
Birdway's approach in Manhattan. It is not an exact facade scan or a current
survey of every address. Modern height tags are preferred; floor-count estimates
and inferred material families are explicitly marked in the derived metadata.
Separate OSM building parts preserve mapped podiums and setbacks where provided.
Unknown roofs use footprint extrusions. Map quantization is about one metre,
roof vertices about 0.1 m. Streets use mapped widths where present, otherwise lane
counts and conservative fallback widths. Street props and ground materials remain
stylized. Far land context beyond the rectangle does not imply building coverage.
