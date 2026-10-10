"""Extract bundled NYC geography. Inputs are data, never upstream application code.
Usage: python3 tools/prepare-map.py payload.json boroughs.geojson streets.geojson
Source URLs and accuracy limitations are in ../CREDITS.md.
"""
import base64,json,math,struct,sys,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
LAT,LON=40.72,-74.0
KX=111320*math.cos(math.radians(LAT)); KY=110540
def project(p): return [round((p[0]-LON)*KX,1),round(-(p[1]-LAT)*KY,1)]
def below59(lon,lat): return lat < 40.768-(lon+73.981)*.5263
p=json.load(open(sys.argv[1])); raw=base64.b64decode(p['b64']); old=p['meta']; ox=111320*math.cos(math.radians(old['lat0']))
count=struct.unpack_from('<I',raw)[0]; off=4; out=[]
for _ in range(count):
 h,n=struct.unpack_from('<HB',raw,off);off+=3;rings=[]
 for _ in range(n):
  v=struct.unpack_from('<H',raw,off)[0];off+=2;r=[]
  for _ in range(v):
   x,y=struct.unpack_from('<hh',raw,off);off+=4
   lon=x/ox+old['lon0'];lat=y/KY+old['lat0'];r.append(project([lon,lat]))
  rings.append(r)
 lon=sum(x[0] for x in rings[0])/len(rings[0])/KX+LON
 lat=-sum(x[1] for x in rings[0])/len(rings[0])/KY+LAT
 if lat>40.699 and below59(lon,lat): out.append((h,rings))
buf=bytearray(struct.pack('<I',len(out)))
for h,rings in out:
 buf+=struct.pack('<HB',h,len(rings))
 for ring in rings:
  buf+=struct.pack('<H',len(ring))
  for x,z in ring: buf+=struct.pack('<hh',round(x),round(z))
(root/'data/buildings.bin').write_bytes(buf)
boroughs=json.load(open(sys.argv[2]))
land=[]; manhattan=[]
def simplify(r):
 # Retain coastline vertices at least 5m apart; polygons stay geographic.
 out=[]
 for p in r:
  xy=project(p)
  if not out or math.dist(xy,out[-1])>5: out.append(xy)
 if out and out[-1]!=out[0]:out.append(out[0])
 return out
for f in boroughs['features']:
 for poly in f['geometry']['coordinates']:
  ring=poly[0]
  if f['properties']['BoroName']=='Manhattan':manhattan.append(ring)
  if any(-74.05<p[0]<-73.94 and .68+40<p[1]<40.80 for p in ring):
   land.append({'name':f['properties']['BoroName'],'rings':[simplify(r) for r in poly]})
def inside(p,r):
 c=False;x,y=p
 for a,b in zip(r,r[1:]+r[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:c=not c
 return c
streets=[]
for f in json.load(open(sys.argv[3]))['features']:
 for line in (f['geometry']['coordinates'] if f['geometry']['type']=='MultiLineString' else [f['geometry']['coordinates']]):
  middle=line[len(line)//2]
  if middle[1]>40.699 and below59(*middle) and any(inside(middle,r) for r in manhattan):
   streets.append({'name':f['properties'].get('FULLNAME',''),'points':[project(p) for p in line]})
meta={'origin':[LON,LAT],'metersPerDegree':[KX,KY],'buildingCount':len(out),'land':land,'streets':streets}
(root/'data/geography.json').write_text(json.dumps(meta,separators=(',',':')))
print(f'{len(out)} buildings; {len(streets)} real street lines; {len(buf):,} bytes of footprints')
