"""Bundle OSM directed surface roads/controls and a bounded MTA Manhattan GTFS crop.
Usage: python tools/prepare-traffic.py roads.json controls.json gtfs_m.zip
Download recipes, snapshot dates and terms: notes/TRAFFIC-SOURCES.md.
Uses Python's standard library; sources are data, never application code.
"""
import collections, csv, io, json, math, pathlib, sys, zipfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
KX = 111320 * math.cos(math.radians(40.72))
def project(lon, lat): return [round((lon + 74) * KX, 2), round(-(lat - 40.72) * 110540, 2)]
def inside(p, ring):
    x,z=p; c=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]: c=not c
    return c
land=[p for p in json.loads((ROOT/'data/geography.json').read_text())['land'] if p['name']=='Manhattan']
def retained(lon,lat):
    p=project(lon,lat)
    return lat>40.699 and lat<40.768-(lon+73.981)*.5263 and any(inside(p,f['rings'][0]) and not any(inside(p,r) for r in f['rings'][1:]) for f in land)
roads=[]
for way in json.load(open(sys.argv[1]))['elements']:
    tags=way.get('tags',{}); g=way['geometry']
    if tags.get('access') in ('private','no') or tags.get('motor_vehicle')=='no' or tags.get('motorcar')=='no' or tags.get('area')=='yes' or tags.get('bridge')=='yes' or tags.get('tunnel')=='yes': continue
    if not all(retained(p['lon'],p['lat']) for p in (g[0],g[-1])): continue
    speed=tags.get('maxspeed','25 mph').split()[0]
    try: speed=float(speed)*(.44704 if 'mph' in tags.get('maxspeed','25 mph') else 1/3.6)
    except ValueError: speed=11.176
    roads.append(dict(id=way['id'],name=tags.get('name',''),nodes=way['nodes'],points=[project(p['lon'],p['lat']) for p in g],oneway=tags.get('oneway')=='yes',lanes=min(5,max(1,int(tags.get('lanes','2').split(';')[0]))) if tags.get('lanes','2').split(';')[0].isdigit() else 2,speed=round(min(11.176,speed),2),kind=tags['highway'],busOnly=tags.get('access')=='bus' or tags.get('motor_vehicle')=='bus',busLane=any('designated' in tags.get(k,'') for k in ['bus:lanes','bus:lanes:forward','busway']),truck=tags.get('hgv')!='no'))
controls=[dict(id=e['id'],point=project(e['lon'],e['lat']),kind=e['tags']['highway']) for e in json.load(open(sys.argv[2]))['elements'] if retained(e['lon'],e['lat'])]
z=zipfile.ZipFile(sys.argv[3])
def rows(name): return list(csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig')))
route_meta={r['route_id']:r for r in rows('routes.txt') if r['route_id'].startswith('M')}
services={s['service_id']:s for s in rows('calendar.txt')}
trips={t['trip_id']:t for t in rows('trips.txt') if t['route_id'] in route_meta}
shapes=collections.defaultdict(list)
for p in rows('shapes.txt'): shapes[p['shape_id']].append(p)
for k in shapes: shapes[k].sort(key=lambda p:int(p['shape_pt_sequence']))
stops={s['stop_id']:s for s in rows('stops.txt')}
trip_stops=collections.defaultdict(list)
for s in rows('stop_times.txt'):
    if s['trip_id'] in trips: trip_stops[s['trip_id']].append(s)
for k in trip_stops: trip_stops[k].sort(key=lambda s:int(s['stop_sequence']))
def seconds(t):
    h,m,s=map(int,t.split(':'));return h*3600+m*60+s
by_route=collections.defaultdict(list)
for t in trips.values(): by_route[(t['route_id'],t['direction_id'])].append(t)
buses=[]
for (rid,direction), ts in sorted(by_route.items()):
    common=collections.Counter(t['shape_id'] for t in ts).most_common(1)[0][0]
    shape=shapes[common]; clipped=[]; runs=[]
    for p in shape:
        if retained(float(p['shape_pt_lon']),float(p['shape_pt_lat'])): clipped.append(project(float(p['shape_pt_lon']),float(p['shape_pt_lat'])))
        elif clipped: runs.append(clipped);clipped=[]
    if clipped: runs.append(clipped)
    if not runs: continue
    path=max(runs,key=len); distances=[0]
    for a,b in zip(path,path[1:]): distances.append(distances[-1]+math.dist(a,b))
    if distances[-1]<450: continue
    # Keep original shape bends but drop consecutive sub-metre duplicates.
    path=[p for i,p in enumerate(path) if i==0 or math.dist(p,path[i-1])>.6]
    distances=[0]
    for a,b in zip(path,path[1:]):distances.append(distances[-1]+math.dist(a,b))
    typical=next(t for t in ts if t['shape_id']==common)
    route_stops=[]
    first_time=None
    for s in trip_stops[typical['trip_id']]:
        st=stops[s['stop_id']];lon,lat=float(st['stop_lon']),float(st['stop_lat'])
        if not retained(lon,lat):continue
        p=project(lon,lat);nearest=min(range(len(path)),key=lambda i:math.dist(p,path[i]))
        if math.dist(p,path[nearest])>45:continue
        time=seconds(s['arrival_time']);first_time=first_time if first_time is not None else time
        route_stops.append(dict(id=s['stop_id'],name=st['stop_name'],point=p,distance=round(distances[nearest],1),time=time-first_time))
    hourly={day:[0]*24 for day in ['weekday','saturday','sunday']}
    for t in ts:
        s=services.get(t['service_id'],{});valid=[st for st in trip_stops[t['trip_id']] if retained(float(stops[st['stop_id']]['stop_lon']),float(stops[st['stop_id']]['stop_lat']))]
        if not valid:continue
        hour=(seconds(valid[0]['arrival_time'])//3600)%24
        for day,field in [('weekday','wednesday'),('saturday','saturday'),('sunday','sunday')]:
            if s.get(field)=='1':hourly[day][hour]+=1
    duration=max(60,route_stops[-1]['time'] if route_stops else distances[-1]/4)
    buses.append(dict(route=rid,direction=int(direction),headsign=typical['trip_headsign'],points=path,stops=route_stops,hourly=hourly,duration=duration,articulated=rid in ['M14A+','M14D+','M15','M15+','M23+','M34+','M34A+']))
result=dict(sourceDate='2026-10-11',feed=list(rows('feed_info.txt'))[0],roads=roads,controls=controls,busRoutes=buses)
(ROOT/'data/traffic.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print(f'{len(roads)} roads, {len(controls)} controls, {len(buses)} directed bus routes; {sum(len(b["stops"]) for b in buses)} route stops')
