"""Match NYC's 2014 LOD2 building survey to the newer bundled footprints.
Input: directory containing rolyatmax/nyc-buildings/models. Requires numpy, pyproj.
Only matching, similarly sized buildings are replaced. New construction stays on
its current footprint. Survey metadata supplies building age/class for facades.
"""
import json,struct,csv,sys,pathlib,math,collections
import numpy as np
from pyproj import Transformer
root=pathlib.Path(__file__).resolve().parent.parent;src=pathlib.Path(sys.argv[1]);kx=111320*math.cos(math.radians(40.72));ky=110540
raw=(root/'data/buildings.bin').read_bytes();off=4;buildings=[];grid=collections.defaultdict(list)
for i in range(struct.unpack_from('<I',raw)[0]):
 h,n=struct.unpack_from('<HB',raw,off);off+=3;rings=[]
 for _ in range(n):
  v=struct.unpack_from('<H',raw,off)[0];off+=2;r=[]
  for _ in range(v):r.append(struct.unpack_from('<hh',raw,off));off+=4
  rings.append(r)
 arr=np.array(rings[0]);x0,z0=arr.min(axis=0);x1,z1=arr.max(axis=0);cx,cz=(arr.min(axis=0)+arr.max(axis=0))/2
 b={'id':i,'h':h/10,'cx':cx,'cz':cz,'w':x1-x0,'d':z1-z0};buildings.append(b);grid[(int(cx//40),int(cz//40))].append(b)
metadata={str(row['BBL']):row for row in csv.DictReader(open(src/'manhattan.pluto.filtered.csv'))}
bin_bbl={row['bin']:row['bbl'] for row in csv.DictReader(open(src/'bin-to-bbl.csv'))}
transform=Transformer.from_crs(2263,4326,always_xy=True)
data=(src/'manhattan.indexed.building.triangles.binary').read_bytes();off=0;selected={};styles={};processed=0
while off+4<len(data):
 binid=struct.unpack_from('<I',data,off)[0];off+=4;end=data.find(b'\xfe\xff\xff\xff',off)
 if end<0:break
 vertices=np.frombuffer(data[off:end],dtype='<f4').reshape(-1,3).astype(np.float64);flag=data[end+4];off=end+5;end=data.find(b'\xff\xff\xff\xff',off)
 if end<0:end=len(data)
 indices=np.frombuffer(data[off:end],dtype='<u1' if flag==0 else '<u2').astype(np.uint16);off=end+4
 processed+=1
 if len(indices)%3 or not len(vertices):continue
 midpoint=(vertices.min(axis=0)+vertices.max(axis=0))/2
 lon,lat=transform.transform(midpoint[0],midpoint[1]);cx=(lon+74)*kx;cz=-(lat-40.72)*ky
 if lat<40.699 or lat>40.768-(lon+.981+73)*.5263:continue
 gx,gz=int(cx//40),int(cz//40);height=(vertices[:,2].max()-vertices[:,2].min())*.3048
 candidates=[]
 for dx in [-1,0,1]:
  for dz in [-1,0,1]:
   for b in grid[(gx+dx,gz+dz)]:
    distance=math.hypot(cx-b['cx'],cz-b['cz'])
    # Strong centroid/height agreement; avoid substituting a demolished/rebuilt site.
    if distance<max(7,min(15,min(b['w'],b['d'])*.2)) and abs(height-b['h'])<max(9,b['h']*.22):candidates.append((distance,b))
 if not candidates:continue
 distance,b=min(candidates,key=lambda v:v[0]);id=b['id']
 if id in selected and selected[id][0]<distance:continue
 lons,lats=transform.transform(vertices[:,0],vertices[:,1]);x=(lons+74)*kx;z=-(lats-40.72)*ky;y=(vertices[:,2]-vertices[:,2].min())*.3048
 if x.max()-x.min()>b['w']*1.25+8 or z.max()-z.min()>b['d']*1.25+8:continue
 quant=np.column_stack([np.round((x-b['cx'])*10),np.round(y*10),np.round((z-b['cz'])*10)]).astype('<i2')
 # Remove downward/ground triangles. Normals are reconstructed at runtime.
 tri=quant[indices.reshape(-1,3)].astype(np.float32);norm=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);keep=(np.linalg.norm(norm,axis=1)>.1)&~((np.max(tri[:,:,1],axis=1)<5))
 indices=indices.reshape(-1,3)[keep].reshape(-1)
 if len(quant)>65535:continue
 selected[id]=(distance,quant,indices)
 row=metadata.get(bin_bbl.get(str(binid),''),{});styles[str(id)]={'year':int(row.get('YearBuilt') or 0),'class':row.get('BldgClass',''),'bin':binid}
out=bytearray(struct.pack('<I',len(selected)))
for id,(_,v,i) in sorted(selected.items()):out+=struct.pack('<IHI',id,len(v),len(i)//3)+v.tobytes()+i.astype('<u2').tobytes()
(root/'data/buildings-detail.bin').write_bytes(out);(root/'data/building-styles.json').write_text(json.dumps(styles,separators=(',',':')))
print(f'{len(selected)} matched LOD2 buildings from {processed} survey entries; {len(out):,} detail bytes')
