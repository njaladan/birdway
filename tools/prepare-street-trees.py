"""Download and crop living Manhattan trees from NYC's 2015 Street Tree Census.

Usage: python3 tools/prepare-street-trees.py
The output stores [local_x_m, local_z_m, authoritative_common_species] tuples.
"""
import json
import math
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = 'https://data.cityofnewyork.us/resource/uvpi-gqnh.json'
KX = 111320 * math.cos(math.radians(40.72))
KY = 110540

land = json.loads((ROOT / 'data/geography.json').read_text())['land']
manhattan = [feature['rings'][0] for feature in land if feature['name'] == 'Manhattan']


def inside(point, ring):
    x, z = point
    hit = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > z) != (b[1] > z) and x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]:
            hit = not hit
    return hit


def project(lon, lat):
    return [(lon + 74) * KX, -(lat - 40.72) * KY]


def below_59th(lon, lat):
    # Follows the mapped west-to-east diagonal of 59th Street.
    return 40.699 < lat < 40.768 - (lon + 73.981) * .5263


def fetch_page(offset):
    query = {
        '$select': 'longitude,latitude,spc_common,status,boroname,tree_id',
        '$where': "boroname = 'Manhattan' AND status = 'Alive' AND latitude between 40.69 and 40.78 AND longitude between -74.03 and -73.90",
        '$order': 'tree_id',
        '$limit': '10000',
        '$offset': str(offset),
    }
    request = urllib.request.Request(
        API + '?' + urllib.parse.urlencode(query),
        headers={'User-Agent': 'Birdway NYC street tree census preparation'},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


trees = []
offset = 0
while True:
    rows = fetch_page(offset)
    for row in rows:
        lon, lat = float(row['longitude']), float(row['latitude'])
        if not below_59th(lon, lat):
            continue
        point = project(lon, lat)
        if any(inside(point, ring) for ring in manhattan):
            trees.append([round(point[0], 1), round(point[1], 1), row.get('spc_common') or 'unknown'])
    if len(rows) < 10000:
        break
    offset += 10000

trees.sort(key=lambda tree: (tree[0], tree[1], tree[2]))
out = {
    'source': 'NYC Street Tree Census 2015, NYC Open Data dataset uvpi-gqnh',
    'source_url': 'https://data.cityofnewyork.us/Environment/2015-Street-Tree-Census-Tree-Data/uvpi-gqnh',
    'attribution': 'NYC Department of Parks and Recreation (DPR)',
    'terms': 'NYC Open Data Terms of Use',
    'census_year': 2015,
    'borough': 'Manhattan',
    'status': 'Alive',
    'crop': 'south of mapped 59th Street boundary; points inside mapped Manhattan land polygon',
    'coordinates': 'Local metres from origin [-74.0, 40.72], matching data/geography.json and parks.json',
    'tree_count': len(trees),
    'trees': trees,
}
path = ROOT / 'data/street-trees.json'
path.write_text(json.dumps(out, separators=(',', ':')) + '\n')
print(f'Wrote {len(trees):,} census trees to {path}')
