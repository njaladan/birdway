import {VEHICLES} from './vehicles.js';
import {buildNetwork,makePath,samplePath,projectPath,random,angleDifference,streetAxis,signalState,choices} from './traffic-network.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class TrafficSimulation {
 constructor(data,profile,map,{carCount=1100,busScale=.55,parkedCount=220}={}){
  this.data=data;this.profile=profile;this.map=map;this.network=buildNetwork(data);this.time=0;this.hours=17.55;this.day='weekday';this.actors=[];this.serial=0;this.busScale=busScale;this.cells=new Map();
  this.roads=this.network.edges.filter(e=>e.path.length>35&&!e.road.busOnly);
  this.routes=data.busRoutes.map(route=>{
   const path=makePath(route.points),controls=[];
   for(const control of this.network.controllers){const hit=projectPath(path,control.x,control.z);if(hit.separation<15&&hit.distance>20&&hit.distance<path.length-20)controls.push({control,distance:hit.distance,axis:streetAxis(samplePath(path,hit.distance).heading)});}
   controls.sort((a,b)=>a.distance-b.distance);
   return {...route,path,controls,actors:[],lastDispatch:-10000};
  });
  for(let i=0;i<carCount;i++){const actor=this.makeActor(this.chooseType(i),i);this.actors.push(actor);this.spawnCar(actor,true);}
  for(let i=0;i<parkedCount;i++){const actor=this.makeActor(i%7===0?'van':i%3?'sedan':'suv',i+9000);actor.parked=true;this.actors.push(actor);this.spawnCar(actor,true);actor.lane=this.parkingLane(actor.edge);this.pose(actor);if(this.map.buildingAt(actor.x,actor.z))actor.active=false;}
  this.setClock(this.hours,this.day,true);this.rebuildCells();
 }
 available(a){
  if(a.type==='schoolBus')return this.day==='weekday'&&(this.hours>=6&&this.hours<10||this.hours>=13&&this.hours<18);
  if(a.type==='sanitation')return this.hours<9||random(a.seed)<.2;
  if(['van','boxTruck'].includes(a.type)&&!(this.hours>=6&&this.hours<20))return random(a.seed)<.25;
  return true;
 }
 chooseType(seed){
  const weights=this.profile.fleetWeights,total=Object.values(weights).reduce((a,b)=>a+b,0);let roll=random(seed+57)*total;
  for(const [type,weight] of Object.entries(weights)){roll-=weight;if(roll<=0)return type;}return 'sedan';
 }
 makeActor(type,seed){return {id:++this.serial,type,spec:VEHICLES[type],seed,active:true,parked:false,bus:false,speed:0,distance:0,lane:1.55,x:0,z:0,heading:0,previousX:0,previousZ:0,previousHeading:0,braking:false,indicator:0,doors:0,dwell:0,stopIndex:0,tripDistance:0,pickupAt:800+random(seed+43)*1400,terminal:false,rider:false,age:0,root:null};}
 parkingLane(edge){return edge.road.oneway?Math.max(3.6,edge.road.lanes*1.55+.65):Math.max(3.6,edge.road.lanes*1.55+.65);}
 laneFor(edge,actor){return edge.road.oneway?(actor.bus||['van','boxTruck','sanitation'].includes(actor.type)?Math.max(0,(edge.road.lanes-1)*1.5):edge.road.lanes>1?(random(actor.seed+edge.id)>.5?1.5:-1.5):0):1.6;}
 spawnCar(actor,initial=false){
  for(let attempt=0;attempt<40;attempt++){
   const edge=this.roads[Math.floor(random(actor.seed+actor.id*31+attempt*7+Math.floor(this.time))*this.roads.length)];
   if(!edge)break;if(['boxTruck','fire'].includes(actor.type)&&!edge.road.truck)continue;
   const distance=12+random(actor.seed+attempt+71)*Math.max(1,edge.path.length-24),lane=this.laneFor(edge,actor),p=samplePath(edge.path,distance,lane);
   if(this.map.buildingAt(p.x,p.z))continue;
   if(!initial&&this.focus&&Math.hypot(p.x-this.focus.x,p.z-this.focus.z)<500)continue;
   if(this.actors.some(a=>a!==actor&&a.active&&Math.hypot(a.x-p.x,a.z-p.z)<(a.spec.length+actor.spec.length)/2+3))continue;
   actor.edge=edge;actor.distance=distance;actor.lane=lane;actor.speed=initial&&!actor.parked?Math.min(4,edge.road.speed*.4):0;actor.turn=null;actor.next=null;actor.committedControl=null;actor.pickupPending=null;actor.dwell=0;actor.active=true;actor.age=0;actor.terminal=false;actor.tripDistance=0;this.pose(actor);actor.previousX=actor.x;actor.previousZ=actor.z;actor.previousHeading=actor.heading;return true;
  }
  actor.active=false;return false;
 }
 setClock(hours,day='weekday',initial=false){
  this.hours=hours;this.day=day;const hour=Math.floor(hours)%24;
  if(hour===this.clockHour&&day===this.clockDay&&!initial)return;this.clockHour=hour;this.clockDay=day;
  for(const route of this.routes){
   const frequency=route.hourly[day]?.[hour]||0;
   // Scheduled buses/hour × in-crop scheduled duration, scaled for a sparse playable city.
   route.target=clamp(Math.round(frequency*route.duration/3600*this.busScale),frequency?1:0,5);
   while(route.actors.length<route.target){
    const a=this.makeActor(route.articulated?'articulated':'bus',this.serial+400);a.bus=true;a.route=route;a.path=route.path;a.distance=route.path.length*random(a.seed+11);a.lane=2.3;
    a.speed=4;
    a.stopIndex=route.stops.findIndex(s=>s.distance>a.distance+12);if(a.stopIndex<0)a.stopIndex=route.stops.length;
    this.pose(a);
    if(this.actors.some(other=>other.active&&Math.hypot(other.x-a.x,other.z-a.z)<(other.spec.length+a.spec.length)/2+4)){a.active=false;a.distance=0;}
    route.actors.push(a);this.actors.push(a);
   }
  }
 }
 pose(a){
  const path=a.turn?.path||(a.bus?a.route.path:a.edge?.path);if(!path)return;
  const point=samplePath(path,a.distance,a.turn?0:a.lane);a.x=point.x;a.z=point.z;a.heading=a.bus&&a.age>0?a.heading+clamp(angleDifference(point.heading,a.heading),-.85*(a.lastStep||.05),.85*(a.lastStep||.05)):point.heading;
  if(this.map.buildingAt(a.x,a.z)){
   // A coarse map footprint sometimes intrudes into the inferred outer lane.
   const center=samplePath(path,a.distance,0);if(!this.map.buildingAt(center.x,center.z)){a.x=center.x;a.z=center.z;}
  }
 }
 rebuildCells(){
  this.cells.clear();for(const a of this.actors)if(a.active){const key=`${Math.floor(a.x/25)},${Math.floor(a.z/25)}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(a);}
 }
 leadGap(a){
  const cx=Math.floor(a.x/25),cz=Math.floor(a.z/25),fx=-Math.sin(a.heading),fz=-Math.cos(a.heading);let best=Infinity;
  for(let ix=cx-1;ix<=cx+1;ix++)for(let iz=cz-1;iz<=cz+1;iz++)for(const b of this.cells.get(`${ix},${iz}`)||[]){
   if(a===b||!b.active)continue;const dx=b.x-a.x,dz=b.z-a.z,ahead=dx*fx+dz*fz,side=Math.abs(dx*fz-dz*fx);
   if(ahead<=0||ahead>38||side>(a.spec.width+b.spec.width)*.46)continue;
   if(Math.abs(angleDifference(a.heading,b.heading))>1.05)continue;
   best=Math.min(best,ahead-(a.spec.length+b.spec.length)/2);
  }return best;
 }
 chooseNext(a){
  const options=choices(a.edge,a.type);if(!options.length)return null;
  const weighted=options.map(e=>({e,w:Math.abs(angleDifference(e.heading,a.edge.exitHeading))<.3?5:1}));let pick=random(a.seed+a.edge.id*13+Math.floor(a.tripDistance))*weighted.reduce((s,v)=>s+v.w,0);
  for(const v of weighted){pick-=v.w;if(pick<=0)return v.e;}return options[0];
 }
 canEnter(a,control,axis,remaining,turn=0){
  if(control){
   if(a.committedControl===control&&Math.hypot(a.x-control.x,a.z-control.z)<22+a.spec.length/2)return true;
   const state=signalState(control,this.time,axis),stopping=a.speed*a.speed/6+2;
   if(state.color==='red'||state.color==='yellow'&&remaining>stopping)return false;
   // Turners yield to small crossing groups during the conflicting WALK window.
   if(Math.abs(turn)>.35&&signalState(control,this.time,axis).walk&&((this.time+control.offset)%6+6)%6<2.8)return false;
   const owner=control.owner;
   if(owner&&owner!==a&&owner.active&&Math.hypot(owner.x-control.x,owner.z-control.z)<22+owner.spec.length/2)return false;
   if(remaining<1.5){control.owner=a;a.committedControl=control;}return true;
  }
  const node=a.edge?.to;if(!node||node.neighbors<3)return true;
  // Conservative stop-and-yield at an unmapped junction, rather than an invented light.
  if(a.speed>.35&&remaining<4)return false;
  if(node.owner&&node.owner!==a&&node.occupiedUntil>this.time)return false;
  node.owner=a;node.occupiedUntil=this.time+3;return true;
 }
 beginTurn(a){
  const edge=a.edge,next=a.next;if(!next)return false;
  const radius=Math.min(10,edge.path.length*.4,next.path.length*.4),start=samplePath(edge.path,edge.path.length-radius,a.lane),nextLane=this.laneFor(next,a),end=samplePath(next.path,radius,nextLane),middle=[edge.to.x,edge.to.z],points=[];
  for(let i=0;i<=12;i++){const t=i/12,u=1-t;points.push([u*u*start.x+2*u*t*middle[0]+t*t*end.x,u*u*start.z+2*u*t*middle[1]+t*t*end.z]);}
  a.turn={path:makePath(points),next,lane:nextLane,resume:radius};a.distance=0;return true;
 }
 tickActor(a,dt){
  if(!a.active||a.parked)return;
  a.age+=dt;a.lastStep=dt;a.previousX=a.x;a.previousZ=a.z;a.previousHeading=a.heading;
  const far=!this.focus||Math.hypot(a.x-this.focus.x,a.z-this.focus.z)>600;
  if(!a.bus&&!a.parked&&far&&!a.rider&&(!this.available(a)||random(a.seed+99)>this.profile.hourlyDemand[Math.floor(this.hours)])){a.active=false;return;}
  if(a.bus&&a.route.actors.indexOf(a)>=a.route.target&&far&&!a.rider){a.active=false;return;}
  if(a.terminal){a.speed=0;if(far&&!a.rider){if(a.bus){a.distance=0;a.stopIndex=0;a.terminal=false;a.active=a.route.actors.indexOf(a)<a.route.target;this.pose(a);}else this.spawnCar(a);}return;}
  if(a.dwell>0){a.dwell=Math.max(0,a.dwell-dt);a.speed=0;a.braking=true;a.doors=a.bus?Math.min(1,a.doors+dt*2):0;return;}
  a.doors=Math.max(0,a.doors-dt*2);
  if(a.pickupPending&&a.pickupPending.edge!==a.edge)a.pickupPending=null;
  let desired=a.bus?clamp(a.route.path.length/Math.max(60,a.route.duration)*1.8,4.5,9):a.edge.road.speed*(.72+random(a.seed)*.2),obstacle=Infinity;
  a.indicator=0;
  if(a.bus){
   while(a.route.stops[a.stopIndex]&&a.route.stops[a.stopIndex].distance<a.distance-2)a.stopIndex++;
   const stop=a.route.stops[a.stopIndex];
   if(stop){const remaining=stop.distance-a.distance;
    if(remaining>=-.6)obstacle=Math.min(obstacle,remaining);
    if(remaining<.65&&a.speed<.35){a.stopIndex++;a.dwell=12+random(a.seed+a.stopIndex)*18;a.speed=0;a.braking=true;a.doors=0;return;}
   }
   for(const s of a.route.controls){const remaining=s.distance-a.distance-10-a.spec.length/2;
    if(remaining<-.8||remaining>45)continue;
    if(!this.canEnter(a,s.control,s.axis,remaining))obstacle=Math.min(obstacle,Math.max(0,remaining));
    break;
   }
   if(a.route.path.length-a.distance<1){a.terminal=true;a.speed=0;return;}
  }else if(!a.turn){
   if(!a.next)a.next=this.chooseNext(a);
   const radius=a.next?Math.min(10,a.edge.path.length*.4,a.next.path.length*.4):0,entry=a.edge.path.length-radius,stopCenter=Math.max(0,entry-a.spec.length/2-1),remaining=stopCenter-a.distance;
   const turn=a.next?angleDifference(a.next.heading,a.edge.exitHeading):0;
   if(Math.abs(turn)>.3&&remaining<35)a.indicator=Math.sign(turn);
   if(remaining<45&&remaining>=-.8){
    if(!this.canEnter(a,a.edge.to.control,streetAxis(a.edge.exitHeading),remaining,turn))obstacle=Math.min(obstacle,Math.max(0,remaining));
   }
   if(Math.abs(turn)>.45&&entry-a.distance<20)desired=Math.min(desired,4.2);
   if(a.distance>=entry&&a.next){this.beginTurn(a);}else if(a.distance>=a.edge.path.length-.2&&!a.next){a.terminal=true;a.speed=0;return;}
  }else desired=Math.min(desired,4.2);
  if(a.pickupPending){const remaining=a.pickupPending.distance-a.distance;obstacle=Math.min(obstacle,Math.max(0,remaining));if(remaining<.5&&a.speed<.35){a.dwell=a.pickupPending.dwell;a.pickupPending=null;a.speed=0;return;}}
  const lead=this.leadGap(a),following=1.8+a.speed*1.15;
  if(Number.isFinite(lead)){obstacle=Math.min(obstacle,Math.max(0,lead-1.8));if(lead<following)desired=Math.min(desired,Math.max(0,(lead-1.8)/1.15));}
  if(Number.isFinite(obstacle))desired=Math.min(desired,Math.sqrt(Math.max(0,obstacle)*2*(a.bus?1.8:2.7)));
  a.braking=desired<a.speed-.15||desired<.5;
  a.speed=Math.max(0,a.speed+clamp(desired-a.speed,-(a.bus?2.4:3.8)*dt,(a.bus?.9:1.5)*dt));
  const movement=Math.min(a.speed*dt,Number.isFinite(obstacle)?Math.max(0,obstacle):Infinity);a.distance+=movement;a.tripDistance+=movement;
  if(a.turn&&a.distance>=a.turn.path.length){const t=a.turn;a.edge=t.next;a.distance=t.resume+(a.distance-t.path.length);a.lane=t.lane;a.turn=null;a.next=null;}
  this.pose(a);
  // For-hire and delivery dwell only on safe longer curb approaches, away from junctions.
  if(!a.bus&&!a.turn&&a.tripDistance>a.pickupAt&&a.edge.path.length-a.distance>45&&a.distance>25&&['taxi','taxiVan','rideshare','van','boxTruck','sanitation'].includes(a.type)){
   a.pickupAt+=700+random(a.id+a.tripDistance)*2000;a.pickupPending={edge:a.edge,distance:Math.min(a.edge.path.length-25,a.distance+Math.max(8,a.speed*a.speed/4)),dwell:a.type==='sanitation'?25:a.type==='van'||a.type==='boxTruck'?45+random(a.seed)*40:8+random(a.seed)*14};
  }

 }
 step(dt,focus=this.focus){
  this.focus=focus;dt=clamp(dt,0,.05);if(dt===0)return;this.time+=dt;
  for(const c of this.network.controllers)if(c.owner&&(!c.owner.active||Math.hypot(c.owner.x-c.x,c.owner.z-c.z)>26+c.owner.spec.length/2)){if(c.owner.committedControl===c)c.owner.committedControl=null;c.owner=null;}
  this.rebuildCells();for(const a of this.actors)this.tickActor(a,dt);
  if(Math.floor(this.time/3)!==this.spawnTick){
   this.spawnTick=Math.floor(this.time/3);
   for(const a of this.actors)if(!a.active&&!a.parked){
    if(a.bus){if(a.route.actors.indexOf(a)<a.route.target&&(!focus||Math.hypot(a.route.points[0][0]-focus.x,a.route.points[0][1]-focus.z)>350)){a.distance=0;a.active=true;a.terminal=false;a.stopIndex=0;this.pose(a);}}
    else if(this.available(a)&&random(a.seed+99)<=this.profile.hourlyDemand[Math.floor(this.hours)])this.spawnCar(a);
   }
  }
 }
}
