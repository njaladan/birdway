"""Download public Jersey City sources and extract the bounded OSM subset.
Usage: python3 tools/download-jersey-city.py /path/to/source-cache
Requires requests, pyproj, shapely and osmium. Raw sources stay outside Git.
Then run prepare-jersey-city.py against the same directory.
"""
import sys, pathlib, requests, json, concurrent.futures
source_cache=pathlib.Path(sys.argv[1]);source_cache.mkdir(parents=True,exist_ok=True)
BBOX='-74.058,40.705,-74.027,40.739'
feature_url='https://services2.arcgis.com/UXbywc7dSkfgdPp4/arcgis/rest/services/JerseyCity_3D__Buildings_Update/FeatureServer/0/query'
path=source_cache/'downtown-footprints.json'
if not path.exists():
    features=[]
    while True:
        q={'f':'json','where':'1=1','geometry':BBOX,'geometryType':'esriGeometryEnvelope','inSR':4326,'outSR':4326,'spatialRel':'esriSpatialRelIntersects','outFields':'*','returnGeometry':'true','multipatchOption':'xyFootprint','resultOffset':len(features),'resultRecordCount':2000,'orderByFields':'OBJECTID'}
        response=requests.get(feature_url,params=q,timeout=60);response.raise_for_status();data=response.json()
        if 'error'in data:raise RuntimeError(data['error'])
        features.extend(data['features'])
        if not data.get('exceededTransferLimit'):break
    path.write_text(json.dumps(features))
for name,dataset in [('downtown-trees-all.json','2021-tree-inventory'),('city-parks-all.json','jersey-city-parks-map')]:
    path=source_cache/name
    if not path.exists():
        response=requests.get('https://data.jerseycitynj.gov/api/explore/v2.1/catalog/datasets/'+dataset+'/exports/json',timeout=60);response.raise_for_status();path.write_text(response.text)
path=source_cache/'new-jersey.osm.pbf'
if not path.exists():
    response=requests.get('https://download.geofabrik.de/north-america/us/new-jersey-latest.osm.pbf',stream=True,timeout=60);response.raise_for_status()
    temporary=path.with_suffix('.partial')
    with temporary.open('wb')as stream:
        for chunk in response.iter_content(1024*1024):stream.write(chunk)
    temporary.replace(path)

# Cache full-detail I3S leaf nodes, filtering by the region extent.
import requests,json,pathlib,concurrent.futures,math
from pyproj import Transformer
r=source_cache;cache=r/'meshes';cache.mkdir(exist_ok=True)
b='https://services2.arcgis.com/UXbywc7dSkfgdPp4/arcgis/rest/services/JerseyCity_3D__Buildings_Update/SceneServer/layers/0/nodes/'
p=Transformer.from_crs(4326,3857,always_xy=True);x0,y0=p.transform(-74.058,40.705);x1,y1=p.transform(-74.027,40.739)
def near(d):
 x,y,z,rad=d['mbs'];return math.hypot(max(x0-x,0,x-x1),max(y0-y,0,y-y1))<=rad

def load(node):
 path=cache/(node+'.json')
 if path.exists():return json.loads(path.read_text())
 res=requests.get(b+node,timeout=45);res.raise_for_status();d=res.json();path.write_text(json.dumps(d));return d
queue=['root'];leaves=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8)as ex:
 while queue:
  docs=list(ex.map(load,queue));queue=[]
  for d in docs:
   if not near(d):continue
   children=d.get('children',[])
   if children:queue.extend(c['id']for c in children if near(c))
   elif d.get('geometryData'):leaves.append(d['id'])
 print('candidate leaf tiles',len(leaves),flush=True)
 def geom(node):
  path=cache/(node+'.bin')
  if not path.exists():
   res=requests.get(b+node+'/geometries/0',timeout=60);res.raise_for_status();path.write_bytes(res.content)
  print('mesh',node,path.stat().st_size,flush=True)
 list(ex.map(geom,leaves))
(cache/'leaves.json').write_text(json.dumps(leaves))

# Extract OSM coastlines, roads, parks, buildings and tree points.
import osmium,json,pathlib
from shapely.geometry import Polygon,LineString,box,shape
R=source_cache;B=box(-74.058,40.705,-74.027,40.739);C=box(-74.11,40.69,-74.02,40.79)
class Extract(osmium.SimpleHandler):
 def __init__(self):super().__init__();self.out={'coast':[],'streets':[],'paths':[],'parks':[],'buildings':[],'trees':[]};self.factory=osmium.geom.GeoJSONFactory()
 def node(self,n):
  if n.tags.get('natural')=='tree' and B.contains(__import__('shapely').geometry.Point(n.location.lon,n.location.lat)):self.out['trees'].append([n.location.lon,n.location.lat,n.tags.get('leaf_type','')])
 def way(self,w):
  t=dict(w.tags)
  if not(t.get('highway')or t.get('natural')=='coastline'):return
  try:p=[(n.lon,n.lat)for n in w.nodes];line=LineString(p)
  except:return
  if t.get('natural')=='coastline':
   if line.intersects(C):self.out['coast'].append(p)
   return
  if not line.intersects(B):return
  rec={'id':w.id,'name':t.get('name',''),'kind':t['highway'],'surface':t.get('surface',''),'width':t.get('width'),'lanes':t.get('lanes'),'points':p,'area':t.get('area')=='yes','bridge':t.get('bridge'),'tunnel':t.get('tunnel')}
  dest='paths'if t['highway']in ['footway','path','cycleway','pedestrian','steps']else 'streets';self.out[dest].append(rec)
 def area(self,a):
  t=dict(a.tags);kind=t.get('leisure')or t.get('landuse')or t.get('natural');building=t.get('building')or t.get('building:part')
  if not building and kind not in ['park','garden','grass','meadow','wood','forest','recreation_ground','pitch','playground']:return
  try:g=json.loads(self.factory.create_multipolygon(a));poly=shape(g)
  except:return
  if not poly.intersects(B):return
  for rings in g['coordinates']:
   if not Polygon(rings[0]).intersects(B):continue
   if building:self.out['buildings'].append({'id':a.orig_id(),'part':bool(t.get('building:part')),'rings':rings,'tags':t})
   else:self.out['parks'].append({'id':a.orig_id(),'rings':rings,'kind':kind,'name':t.get('name',''),'surface':t.get('surface','')})
h=Extract();h.apply_file(str(R/'new-jersey.osm.pbf'),locations=True,idx='flex_mem');(R/'downtown-osm-extract.json').write_text(json.dumps(h.out));print({k:len(v)for k,v in h.out.items()},flush=True)
