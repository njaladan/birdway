"""Extract OSM parks, paths and tree locations from a Manhattan PBF.
Usage: python3 tools/prepare-parks.py manhattan.osm.pbf (requires osmium).
The resulting data/parks.json is ODbL 1.0; see CREDITS.md.
"""
import osmium,json,math,pathlib,sys,collections
root=pathlib.Path(__file__).resolve().parent.parent;kx=111320*math.cos(math.radians(40.72));ky=110540
land=json.load(open(root/'data/geography.json'))['land'];manhattan=[p['rings'][0] for p in land if p['name']=='Manhattan']
def proj(lon,lat):return [round((lon+74)*kx,1),round(-(lat-40.72)*ky,1)]
def inside(p,r):
 x,z=p;hit=False
 for a,b in zip(r,r[1:]+r[:1]):
  if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:hit=not hit
 return hit
def allowed(lon,lat):return 40.699<lat<40.768-(lon+73.981)*.5263 and any(inside(proj(lon,lat),r) for r in manhattan)
class Extract(osmium.SimpleHandler):
 def __init__(self):super().__init__();self.parks=[];self.paths=[];self.trees=[];self.factory=osmium.geom.GeoJSONFactory()
 def node(self,n):
  if n.tags.get('natural')=='tree' and allowed(n.location.lon,n.location.lat):self.trees.append(proj(n.location.lon,n.location.lat)+[n.tags.get('leaf_type','broadleaved')])
 def area(self,a):
  tags=dict(a.tags);kind=tags.get('leisure') or tags.get('landuse') or tags.get('natural')
  if kind not in ['park','garden','grass','meadow','wood','forest','recreation_ground','pitch','playground']:return
  try:g=json.loads(self.factory.create_multipolygon(a))
  except: return
  for poly in g['coordinates']:
   ring=poly[0];lon=sum(p[0] for p in ring)/len(ring);lat=sum(p[1] for p in ring)/len(ring)
   if not allowed(lon,lat):continue
   rings=[[proj(*p) for p in r]for r in poly]
   self.parks.append({'id':a.orig_id(),'name':tags.get('name',''),'kind':kind,'surface':tags.get('surface',''),'rings':rings})
 def way(self,w):
  tags=dict(w.tags);kind=tags.get('highway')
  if kind not in ['footway','path','cycleway','pedestrian','steps']:return
  try:pts=[(p.lon,p.lat)for p in w.nodes];middle=pts[len(pts)//2]
  except:return
  if not allowed(*middle):return
  if w.is_closed() and kind=='pedestrian':self.parks.append({'id':w.id,'name':tags.get('name',''),'kind':'plaza','surface':tags.get('surface',''),'rings':[[proj(*p)for p in pts]]})
  else:self.paths.append({'name':tags.get('name',''),'kind':kind,'surface':tags.get('surface',''),'points':[proj(*p)for p in pts]})
h=Extract();h.apply_file(sys.argv[1],locations=True,idx='flex_mem');(root/'data/parks.json').write_text(json.dumps({'parks':h.parks,'paths':h.paths,'trees':h.trees},separators=(',',':')))
print(len(h.parks),'mapped green/plaza areas;',len(h.paths),'mapped paths;',len(h.trees),'mapped trees')
