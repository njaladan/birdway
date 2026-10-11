"""Build the Downtown/Grove Street addition from cached public source data.

Usage: python3 tools/prepare-jersey-city.py /path/to/source-cache
Requires numpy, pyproj and shapely. Download/cache instructions and source terms
are in notes/JERSEY-CITY-SOURCES.md. Does not modify the Manhattan source files.
"""
import json, math, pathlib, struct, sys
import numpy as np
from pyproj import Transformer
from shapely.geometry import Polygon, LineString, Point, box, shape, mapping
from shapely.ops import polygonize, unary_union
from shapely import make_valid
from shapely.strtree import STRtree

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = pathlib.Path(sys.argv[1])
KX = 111320 * math.cos(math.radians(40.72))
KY = 110540
BBOX = [-74.058, 40.705, -74.027, 40.739]
AREA = box(*BBOX)
TO_GEO = Transformer.from_crs(3857, 4326, always_xy=True)

def project(p):
    return [round((p[0] + 74) * KX, 1), round(-(p[1] - 40.72) * KY, 1)]

def polygons(g):
    if g.geom_type == 'Polygon':
        return [g]
    if hasattr(g, 'geoms'):
        return [p for part in g.geoms for p in polygons(part)]
    return []

def rings(g):
    return [list(g.exterior.coords)] + [list(h.coords) for h in g.interiors]

def footprint(rr):
    return make_valid(Polygon(rr[0], rr[1:]))

def number(value, fallback=0):
    try:
        return float(str(value).split(';')[0].replace(' m', '').strip())
    except (ValueError, TypeError):
        return fallback

osm = json.loads((CACHE / 'downtown-osm-extract.json').read_text())
osm['buildings']=[rec for rec in osm['buildings']if rec['tags'].get('building')not in ['construction','proposed']and rec['tags'].get('building:part')not in ['construction','proposed']]
features = json.loads((CACHE / 'downtown-footprints.json').read_text())

# Full-detail leaf nodes only: intermediate nodes contain repeated coarse meshes.
meshes = {}
for node in json.loads((CACHE / 'meshes/leaves.json').read_text()):
    raw = (CACHE / 'meshes' / (node + '.bin')).read_bytes()
    nv, nf = struct.unpack_from('<II', raw)
    if len(raw) != 8 + nv * 36 + nf * 16:
        raise ValueError('Unexpected I3S mesh layout: ' + node)
    points = np.frombuffer(raw, '<f4', nv * 3, 8).reshape(-1, 3).astype(np.float64)
    center = json.loads((CACHE / 'meshes' / (node + '.json')).read_text())['mbs'][:3]
    points += np.array(center)
    lon, lat = TO_GEO.transform(points[:, 0], points[:, 1])
    world = np.column_stack([(lon + 74) * KX, points[:, 2], -(lat - 40.72) * KY])
    ids = np.frombuffer(raw, '<u8', nf, 8 + nv * 36)
    ranges = np.frombuffer(raw, '<u4', nf * 2, 8 + nv * 36 + nf * 8).reshape(-1, 2)
    for oid, (first, last) in zip(ids, ranges):
        verts = world[int(first) * 3:(int(last) + 1) * 3]
        meshes.setdefault(int(oid), []).append(verts)

print('Decoded',len(meshes),'mesh features',flush=True)

# Modern OSM structures replace obsolete survey masses on the same sites. Use
# measured height tags first; floor counts are only a labeled fallback.
modern = []
for rec in osm['buildings']:
    t = rec['tags']; g = footprint(rec['rings'])
    if not AREA.contains(g.representative_point()) or rec['part']:
        continue
    height = number(t.get('height'), number(t.get('building:levels')) * 3.3)
    name = t.get('name', '')
    if '99 Hudson' in name or g.distance(Point(-74.0348, 40.71535)) < .00012:
        height = 274.32
        name = '99 Hudson'
    if height >= 45:
        modern.append((rec, g, height, name))

modern_tree=STRtree([p for r,p,h,name in modern])
modern_by_id={r['id']:(r,p,h,name)for r,p,h,name in modern}
print('Modern replacement candidates',len(modern),flush=True)
buildings = []
for feature_index,feature in enumerate(features):
    if feature_index%1000==0:print('Matching mesh',feature_index,flush=True)
    attrs = feature['attributes']; g = footprint(feature['geometry']['rings'])
    if not AREA.contains(g.representative_point()):
        continue
    oid = attrs['OBJECTID']; chunks = meshes.get(oid)
    vertices = np.concatenate(chunks) if chunks else None
    height = float(np.ptp(vertices[:, 1])) if vertices is not None else number(attrs.get('BLDGHEIGHT')) * .3048
    if height < 2 or height > 450:
        continue
    replaced = False
    for modern_index in modern_tree.query(g):
        rec,new,h,name=modern[modern_index]
        intersection = g.intersection(new).area
        if intersection > min(g.area, new.area) * .22 and h > height * 1.25 + 8:
            replaced = True
            break
    if replaced:
        continue
    for poly in polygons(g):
        local = [list(map(project, ring)) for ring in rings(poly)]
        # Existing format uses metre footprints and decimetre roof vertices.
        xx = [p[0] for p in local[0]]; zz = [p[1] for p in local[0]]
        cx, cz = (min(xx) + max(xx)) / 2, (min(zz) + max(zz)) / 2
        detail = None
        if vertices is not None:
            verts = vertices.copy()
            verts[:, 0] -= cx; verts[:, 2] -= cz
            verts[:, 1] -= vertices[:, 1].min()
            quant = np.rint(verts * 10).astype('<i2')
            triangles = quant.reshape(-1, 3, 3).astype(np.int32)
            normal = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
            keep = (np.linalg.norm(normal, axis=1) > 1) & (triangles[:, :, 1].max(axis=1) > 3)
            quant = quant.reshape(-1, 3, 3)[keep].reshape(-1, 3)
            unique, indices = np.unique(quant, axis=0, return_inverse=True)
            if len(unique) < 65536 and len(indices):
                detail = (unique.astype('<i2'), indices.astype('<u2'))
        buildings.append({'h':height,'rings':local,'detail':detail,'style':{'region':'jersey-city','sourceId':oid,'kind':4 if height>65 else 6 if height<25 else 3,'inferred':True}})

# Retain new mapped buildings not covered by the historical model. Building
# parts give separate podiums/setbacks instead of extruding a tower's whole lot.
existing = [footprint(b['rings']) for b in buildings]
print('Survey meshes matched',len(buildings),flush=True)
existing_tree=STRtree(existing)
print('Footprint index ready',flush=True)
part_records = [(x,footprint(x['rings']))for x in osm['buildings']if x['part']]
part_tree=STRtree([p for x,p in part_records])
added_osm = 0
for osm_index,rec in enumerate(osm['buildings']):
    if osm_index%1000==0:print('Adding OSM buildings',osm_index,flush=True)
    t = rec['tags']; g = footprint(rec['rings'])
    if not AREA.contains(g.representative_point()):
        continue
    parent=modern_by_id.get(rec['id'])if not rec['part']else None
    height = number(t.get('height'), number(t.get('building:levels')) * 3.3)
    if parent: height = parent[2]
    if height < 2: height = 10 if t.get('building') in ['house','residential','apartments','terrace'] else 5
    local = [[project(p) for p in ring]for ring in rec['rings']]
    projected = footprint(local)
    nearby=existing_tree.query(projected)
    nearby_union=unary_union([existing[i]for i in nearby])
    overlap=projected.intersection(nearby_union).area/max(projected.area,1)
    if overlap > .35:
        continue
    parts = [part_records[i][0]for i in part_tree.query(g)if part_records[i][1].representative_point().within(g)]if not rec['part']else []
    if parts:
        # The outline is normally a low podium, not the height of its tallest
        # part. Preserve uncovered podium area around the mapped tower parts.
        residual=make_valid(g.difference(unary_union([footprint(x['rings'])for x in parts])))
        for poly in polygons(residual):
            rr=[[project(p)for p in ring]for ring in rings(poly)]
            if footprint(rr).area<4:continue
            podium_height=number(t.get('height'),number(t.get('building:levels'))*3.3)or 6
            buildings.append({'h':podium_height,'rings':rr,'detail':None,'style':{'region':'jersey-city','osmId':rec['id'],'name':t.get('name',''),'kind':1 if t.get('name')=='99 Hudson'else 3,'inferred':True}})
            added_osm+=1
        continue
    name = parent[3] if parent else t.get('name','')
    if g.covers(Point(-74.0348,40.71535)):
        name='99 Hudson';height=274.32
    year = number(t.get('start_date'))
    style = {'region':'jersey-city','osmId':rec['id'],'name':name,'kind':4 if height>65 else 6 if height<25 else 3,'inferred':True}
    if year: style['year']=year
    base=number(t.get('min_height'),number(t.get('building:min_level'))*3.3)
    if base:style['baseHeight']=min(base,height-1)
    if '99 Hudson' in name:style.update(kind=1,name='99 Hudson',heightSource='https://99hudsonjerseycity.com/')
    buildings.append({'h':height,'rings':local,'detail':None,'style':style});added_osm+=1

print('Building conversion ready',len(buildings),flush=True)

# Polygonize oriented OSM coastlines against a context rectangle. In OSM land
# lies on the left of each directed coastline. This preserves slips and piers,
# unlike municipal polygons which include a large portion of the Hudson River.
context = box(-74.11,40.69,-74.02,40.79)
lines = []; segments=[]
for coast in osm['coast']:
    clipped = LineString(coast).intersection(context)
    if not clipped.is_empty: lines.append(clipped)
    for a,b in zip(coast,coast[1:]):
        if LineString([a,b]).intersects(context):segments.append((a,b))
def land_side(point):
    best=float('inf');side=False
    for a,b in segments:
        dx,dy=b[0]-a[0],b[1]-a[1];den=dx*dx+dy*dy
        if not den:continue
        t=max(0,min(1,((point.x-a[0])*dx+(point.y-a[1])*dy)/den))
        d=(point.x-a[0]-t*dx)**2+(point.y-a[1]-t*dy)**2
        if d<best:best=d;side=dx*(point.y-a[1])-dy*(point.x-a[0])>0
    return side
land_polys=[p for p in polygonize(unary_union(lines+[context.boundary])) if land_side(p.representative_point())]
land_union=unary_union(land_polys)
for lon,lat in [(-74.043,40.719),(-74.034,40.716),(-74.045,40.728)]:
    assert land_union.covers(Point(lon,lat)), 'Missing Jersey City land'
assert not land_union.covers(Point(-74.023,40.719)), 'Shoreline fills the Hudson'
land=[{'name':'Jersey City','rings':[[project(p)for p in ring]for ring in rings(g.simplify(.00002,preserve_topology=True))]}for g in land_polys]

def line_parts(g):
    return [g]if g.geom_type=='LineString'else [p for p in getattr(g,'geoms',[])if p.geom_type=='LineString']
streets=[];paths=[];parks=[]
for dest, records in [(streets,osm['streets']),(paths,osm['paths'])]:
    for rec in records:
        if rec.get('tunnel')=='yes' or rec['kind']in ['motorway','motorway_link','construction','proposed']:continue
        if rec.get('area'):
            if len(rec['points'])>3 and rec['points'][0]==rec['points'][-1]:parks.append({'id':rec['id'],'name':rec['name'],'kind':'plaza','surface':rec['surface'],'rings':[[project(p)for p in rec['points']]]})
            continue
        for line in line_parts(LineString(rec['points']).intersection(AREA)):
            width=number(rec.get('width'),max(5,min(16,number(rec.get('lanes'),2)*3.2)))
            dest.append({'name':rec['name'],'kind':rec['kind'],'surface':rec['surface'],'width':width,'points':[project(p)for p in line.coords],'region':'jersey-city'})
for rec in osm['parks']:
    for g in polygons(footprint(rec['rings']).intersection(AREA)):
        parks.append({**{k:rec[k]for k in ['id','name','kind','surface']},'rings':[[project(p)for p in ring]for ring in rings(g)]})
# City boundaries supplement missing named OSM parks without duplicate blanket layers.
for rec in json.loads((CACHE/'city-parks-all.json').read_text()):
    geo=rec.get('geo_shape');name=rec.get('park')or ''
    if not geo or not name or any((p['name']or '').casefold()==name.casefold() for p in parks):continue
    g=shape(geo.get('geometry',geo))
    if not g.intersects(AREA):continue
    for poly in polygons(g.intersection(AREA)):
        parks.append({'id':'city-'+name,'name':name,'kind':'park','surface':'','rings':[[project(p)for p in ring]for ring in rings(poly)]})

trees=[]
for rec in json.loads((CACHE/'downtown-trees-all.json').read_text()):
    lon=number(rec.get('longitude'));lat=number(rec.get('latitude'))
    if AREA.contains(Point(lon,lat)) and rec.get('active')not in [False,'No','false']:
        trees.append(project([lon,lat])+[rec.get('spp_com')or rec.get('spp_bot')or '',rec.get('dbh')or 0])

buf=bytearray(struct.pack('<I',len(buildings)));detail=bytearray(struct.pack('<I',sum(b['detail']is not None for b in buildings)))
styles={}
for i,b in enumerate(buildings):
    buf+=struct.pack('<HB',round(b['h']*10),len(b['rings']))
    for ring in b['rings']:
        buf+=struct.pack('<H',len(ring))
        for x,z in ring:buf+=struct.pack('<hh',round(x),round(z))
    if b['detail']is not None:
        v,idx=b['detail'];detail+=struct.pack('<IHI',i,len(v),len(idx)//3)+v.tobytes()+idx.tobytes()
    styles[str(i)]=b['style']
metadata={'name':'Downtown Jersey City','bbox':BBOX,'buildingCount':len(buildings),'meshCount':sum(b['detail']is not None for b in buildings),'osmBuildingCount':added_osm,'origin':[-74,40.72],'metersPerDegree':[KX,KY],'land':land,'streets':streets,'styles':styles,'parks':parks,'paths':paths,'streetTrees':trees,'trees':[project(p[:2])+[p[2]]for p in osm['trees']],'sourceDate':'2026-10-11'}
(ROOT/'data/jersey-city-buildings.bin').write_bytes(buf)
(ROOT/'data/jersey-city-detail.bin').write_bytes(detail)
(ROOT/'data/jersey-city.json').write_text(json.dumps(metadata,separators=(',',':')))
print({k:metadata[k]for k in ['buildingCount','meshCount','osmBuildingCount']},'streets',len(streets),'parks',len(parks),'paths',len(paths),'trees',len(trees),'bytes',len(buf)+len(detail),flush=True)
