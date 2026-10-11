import {random,samplePath,projectPath} from './traffic-network.js';

// Local street occupancy targets are artistic estimates, not a measured NYC census.
// Stream outside the visible circle; keep residents until they leave a wider ring.
export class TrafficPopulation {
 constructor(sim){
  this.sim=sim;this.cells=new Map();this.parked=new Map();this.lastFocus=null;this.lastTime=-Infinity;
  this.maxMoving=1000;this.maxParked=2600;this.radius=900;this.parkingRadius=720;
  this.stopCells=new Map();
  for(const route of sim.data.busRoutes)for(const stop of route.stops){const key=this.key(...stop.point);if(!this.stopCells.has(key))this.stopCells.set(key,[]);this.stopCells.get(key).push(stop.point);}
  for(const edge of sim.roads){
   const seen=new Set();for(let d=0;d<=edge.path.length+80;d+=80){const p=samplePath(edge.path,d),key=this.key(p.x,p.z);if(seen.has(key))continue;seen.add(key);if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(edge);}
  }
 }
 key(x,z){return `${Math.floor(x/160)},${Math.floor(z/160)}`;}
 nearStop(x,z){const cx=Math.floor(x/160),cz=Math.floor(z/160);for(let ix=cx-1;ix<=cx+1;ix++)for(let iz=cz-1;iz<=cz+1;iz++)for(const p of this.stopCells.get(`${ix},${iz}`)||[])if(Math.hypot(x-p[0],z-p[1])<24)return true;return false;}
 lanes(edge){
  const n=Math.max(1,Math.min(4,edge.road.oneway?edge.road.lanes:Math.floor(edge.road.lanes/2)));
  const lanes=Array.from({length:n},(_,i)=>edge.road.oneway?(i-(n-1)/2)*3.05:1.6+i*3.05);
  return edge.road.busLane&&lanes.length>1?lanes.slice(0,-1):lanes;
 }
 refresh(focus){
  if(!focus)return;
  const sim=this.sim,initial=!this.lastFocus,travel=initial?Infinity:Math.hypot(focus.x-this.lastFocus.x,focus.z-this.lastFocus.z),moved=travel>100,fill=travel>900;
  if(!moved&&sim.time-this.lastTime<2&&this.hour===sim.clockHour)return;
  this.lastFocus={x:focus.x,z:focus.z};this.lastTime=sim.time;this.hour=sim.clockHour;
  // Ridden actors remain residents even when the focus jumps (home/fast travel).
  sim.actors=sim.actors.filter(a=>{
   const keep=a.bus||!a.local||a.rider||a.active&&Math.hypot(a.x-focus.x,a.z-focus.z)<(a.parked?850:1100);
   if(!keep)a.active=false;return keep;
  });
  const residents=new Set(sim.actors);for(const [key,a] of this.parked)if(!residents.has(a))this.parked.delete(key);
  sim.rebuildCells();
  const edges=new Set(),cx=Math.floor(focus.x/160),cz=Math.floor(focus.z/160),r=Math.ceil(this.radius/160);
  for(let ix=cx-r;ix<=cx+r;ix++)for(let iz=cz-r;iz<=cz+r;iz++)for(const edge of this.cells.get(`${ix},${iz}`)||[])edges.add(edge);
  const nearby=[...edges].map(edge=>({edge,separation:projectPath(edge.path,focus.x,focus.z).separation})).filter(e=>e.separation<this.radius).sort((a,b)=>a.separation-b.separation);
  let moving=sim.actors.filter(a=>a.active&&!a.bus&&!a.parked).length,parked=this.parked.size;
  const counts=new Map(),occupants=new Map();for(const a of sim.actors)if(a.active&&!a.parked&&!a.bus){const key=`${a.edge.id}:${a.lane}`;counts.set(key,(counts.get(key)||0)+1);if(!occupants.has(key))occupants.set(key,[]);occupants.get(key).push(a);}
  const demand=sim.profile.hourlyDemand[Math.floor(sim.hours)]||.2;
  for(const {edge,separation} of nearby){
   const major=['primary','secondary','tertiary'].includes(edge.road.kind),spacing=major?32:58,length=Math.max(0,edge.path.length-38);
   for(const lane of this.lanes(edge)){
    const key=`${edge.id}:${lane}`,amount=length/spacing*demand,target=Math.floor(amount)+(random(edge.id+lane+23)<amount%1?1:0),current=counts.get(key)||0;let existing=current;
    for(const a of occupants.get(key)||[])if(existing>target&&!a.rider&&Math.hypot(a.x-focus.x,a.z-focus.z)>660){a.active=false;existing--;moving--;}
    for(let i=existing;i<target&&moving<this.maxMoving;i++){
     const seed=edge.id*113+i*19+lane*7+Math.floor(sim.time/2),a=sim.makeActor(sim.chooseType(seed),seed);a.local=true;
     if(!sim.available(a)||['boxTruck','fire'].includes(a.type)&&!edge.road.truck)continue;
     let placed=false;for(let attempt=0;attempt<12;attempt++){
      const distance=19+random(seed+attempt*17)*length,p=samplePath(edge.path,distance,lane),away=Math.hypot(p.x-focus.x,p.z-focus.z);
      if(away>this.radius||(!fill&&away<660)||sim.map.buildingAt(p.x,p.z)||!this.clear(p,a))continue;
      this.place(a,edge,distance,lane);a.speed=initial?2+random(seed)*2:0;sim.actors.push(a);this.addCell(a);moving++;placed=true;break;
     }
     if(!placed)break;
    }
   }
   if(separation>this.parkingRadius||parked>=this.maxParked||edge.road.busOnly||edge.road.kind==='primary')continue;
   // One-way streets get both curbs. Two-way edges each supply their right curb.
   const offsets=edge.road.oneway?[-sim.parkingLane(edge),sim.parkingLane(edge)]:[sim.parkingLane(edge)];
   for(const lane of offsets)for(let slot=0,d=20;d<edge.path.length-20;slot++,d+=7.2){
    const key=`${edge.id}:${lane}:${slot}`,seed=edge.id*191+slot*43+lane*17;
    if(this.parked.has(key)||random(seed)>.78||parked>=this.maxParked)continue;
    const p=samplePath(edge.path,d,lane),away=Math.hypot(p.x-focus.x,p.z-focus.z);
    if(away>this.parkingRadius||(!fill&&away<660)||sim.map.buildingAt(p.x,p.z)||this.nearStop(p.x,p.z))continue;
    // The inferred right curb on bus-lane streets stays available for buses.
    if(edge.road.busLane&&lane>0)continue;
    const a=sim.makeActor(random(seed+1)<.08?'van':random(seed+2)<.45?'suv':'sedan',seed);a.parked=true;a.local=true;
    if(!this.clear(p,a))continue;this.place(a,edge,d,lane);sim.actors.push(a);this.parked.set(key,a);this.addCell(a);parked++;
   }
  }
  sim.actors=sim.actors.filter(a=>a.bus||!a.local||a.active||a.rider);
 }
 clear(p,a){const cx=Math.floor(p.x/25),cz=Math.floor(p.z/25);for(let ix=cx-1;ix<=cx+1;ix++)for(let iz=cz-1;iz<=cz+1;iz++)for(const b of this.sim.cells.get(`${ix},${iz}`)||[]){
  if(!b.active)continue;const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(p.heading),s=Math.sin(p.heading),side=Math.abs(dx*c-dz*s),along=Math.abs(dx*s+dz*c);
  if(side<(a.spec.width+b.spec.width)/2+.2&&along<(a.spec.length+b.spec.length)/2+2)return false;
 }return true;}
 place(a,edge,distance,lane){a.edge=edge;a.distance=distance;a.lane=lane;this.sim.pose(a);a.previousX=a.x;a.previousZ=a.z;a.previousHeading=a.heading;}
 addCell(a){const key=`${Math.floor(a.x/25)},${Math.floor(a.z/25)}`;if(!this.sim.cells.has(key))this.sim.cells.set(key,[]);this.sim.cells.get(key).push(a);}
}
