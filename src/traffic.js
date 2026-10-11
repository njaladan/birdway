import * as THREE from '../vendor/three.module.js';
import {TrafficSimulation} from './traffic-simulation.js';
import {samplePath,streetAxis,signalState,angleDifference,random,roadWidth} from './traffic-network.js';
import {VEHICLES,makeVehicle,loadVehicleTextures,updateVehicleVisual,makeVehicleBatch,vehicleColor,vehicleRoofTriangles,disposeVehicle} from './vehicles.js';
import {triangleRoof} from './vehicle-import.js';

export async function loadTraffic(){
 const [roads,profile]=await Promise.all([fetch('./data/traffic.json'),fetch('./data/traffic-profile.json')]);
 if(!roads.ok||!profile.ok)throw new Error('The bundled NYC traffic data could not load.');
 await loadVehicleTextures();return {data:await roads.json(),profile:await profile.json()};
}
const cylinder=new THREE.CylinderGeometry(.075,.095,5.6,7),headGeometry=new THREE.BoxGeometry(.43,1.35,.32),bulbGeometry=new THREE.CircleGeometry(.14,10),armGeometry=new THREE.BoxGeometry(3.9,.09,.09);
const metal=new THREE.MeshStandardMaterial({color:0x7c817b,metalness:.55,roughness:.55}),black=new THREE.MeshStandardMaterial({color:0x3e4039,roughness:.8});
function instanced(root,geometry,material,count){const m=new THREE.InstancedMesh(geometry,material,count);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;m.count=0;root.add(m);return m;}
function signTexture(text,bg='#e8e6d7',fg='#254c72',width=256){
 if(!globalThis.document)return null;const c=document.createElement('canvas');c.width=width;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,width,128);ctx.fillStyle=fg;ctx.font='bold 25px sans-serif';text.split('\n').slice(0,3).forEach((s,i)=>ctx.fillText(s,10,34+i*34));const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export class TrafficWorld {
 constructor(scene,map,flight,bundle){
  this.map=map;this.flight=flight;this.root=new THREE.Group();this.root.name='NYC traffic';scene.add(this.root);this.sim=new TrafficSimulation(bundle.data,bundle.profile,map);this.matrix=new THREE.Object3D();this.nearby=[];this.detailed=new Set();this.vehiclePool=new Map();this.batches=new Map();
  for(const type of Object.keys(VEHICLES)){const mesh=makeVehicleBatch(type);this.root.add(mesh);this.batches.set(type,mesh);}
  const capacity=512;
  this.poles=instanced(this.root,cylinder,metal,capacity);this.arms=instanced(this.root,armGeometry,metal,capacity);this.heads=instanced(this.root,headGeometry,black,capacity);this.bulbs=instanced(this.root,bulbGeometry,new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),capacity*3);
  this.crossings=instanced(this.root,new THREE.BoxGeometry(.52,.018,3.4),new THREE.MeshStandardMaterial({color:0xe1ded0,roughness:.93}),capacity*24);
  this.lines=instanced(this.root,new THREE.BoxGeometry(1,.018,.25),new THREE.MeshStandardMaterial({color:0xe1ded0,roughness:.93}),capacity);
  this.signals=this.sim.network.controllers.map(c=>{
   const approaches=[];
   for(const n of c.nodes)for(const e of n.incoming){
    if(e.path.length<12||approaches.some(a=>Math.abs(angleDifference(a.heading,e.exitHeading))<.5))continue;
    approaches.push({edge:e,heading:e.exitHeading,axis:streetAxis(e.exitHeading),width:roadWidth(e.road),node:n});
   }
   return {control:c,approaches:approaches.slice(0,4),pedestrians:[]};
  });
  this.walkerBodies=instanced(this.root,new THREE.CapsuleGeometry(.17,.66,3,6),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9}),capacity*2);
  this.walkerHeads=instanced(this.root,new THREE.SphereGeometry(.15,6,5),new THREE.MeshStandardMaterial({color:0xb6997f,roughness:.9}),capacity*2);
  this.walkerLegs=instanced(this.root,new THREE.BoxGeometry(.11,.63,.13),new THREE.MeshStandardMaterial({color:0x424b51,roughness:.9}),capacity*4);
  this.stops=new Map();
  for(const route of this.sim.routes)for(const stop of route.stops){
   if(!this.stops.has(stop.id)){const p=samplePath(route.path,stop.distance,5.4);this.stops.set(stop.id,{...stop,x:p.x,z:p.z,heading:p.heading,routes:new Set(),group:null});}
   this.stops.get(stop.id).routes.add(route.route);
  }
  // A dynamic-surface interface keeps vehicle roofs out of the static building index.
  map.dynamicAt=(x,z)=>this.surfaceAt(x,z);
 }
 roofAt(actor,x,z){
  const dx=x-actor.x,dz=z-actor.z,c=Math.cos(actor.heading),s=Math.sin(actor.heading),lx=dx*c-dz*s,lz=dx*s+dz*c,d=actor.spec;
  if(Math.abs(lx)>d.width/2-.035||Math.abs(lz)>d.length/2)return null;
  const triangles=actor.root?.userData.roofTriangles||vehicleRoofTriangles(actor.type,actor.seed);
  if(triangles?.length){const y=triangleRoof(triangles,lx,lz);if(y!==null)return y;return null;}
  if(Math.abs(lz-d.roofZ)>d.roofLength/2)return Math.min(d.height-.6,1.15);
  if(actor.bus){if(Math.abs(lx)<d.width*.325&&Math.abs(lz-1.9)<1.25)return d.height+.285;if(actor.type==='articulated'&&Math.abs(lz)<.7)return d.height+.065;return d.height+.04;}
  return d.height;
 }
 surfaceAt(x,z){
  let best=null;for(const actor of this.nearby){if(!actor.active||Math.abs(x-actor.x)>actor.spec.length||Math.abs(z-actor.z)>actor.spec.length)continue;
   const h=this.roofAt(actor,x,z);if(h!==null&&(!best||h>best.h))best={id:`vehicle-${actor.id}`,h,vehicle:actor};
  }return best;
 }
 carry(flight){
  const a=flight.vehicleSupport;if(!a||flight.flying)return;
  const dx=flight.position.x-a.previousX,dz=flight.position.z-a.previousZ,c=Math.cos(a.previousHeading),s=Math.sin(a.previousHeading),lx=dx*c-dz*s,lz=dx*s+dz*c,angle=angleDifference(a.heading,a.previousHeading);
  flight.position.x=a.x+lx*Math.cos(a.heading)+lz*Math.sin(a.heading);flight.position.z=a.z-lx*Math.sin(a.heading)+lz*Math.cos(a.heading);flight.heading+=angle;
  // Camera translation is accounted for in Flight.update after its previous-position snapshot.
  flight.carrierDelta=new THREE.Vector3(flight.position.x-(a.previousX+dx),0,flight.position.z-(a.previousZ+dz));
  a.rider=true;
 }
 update(dt,position,night,hours,day='weekday'){
  this.sim.setClock(hours,day);for(const a of this.sim.actors)a.rider=this.flight.vehicleSupport===a;
  this.sim.step(dt,position);if(dt)this.carry(this.flight);
  this.nearby=[];
  const visible=[],close=[];
  for(const actor of this.sim.actors){
   const distance=Math.hypot(actor.x-position.x,actor.z-position.z);actor.viewDistance=distance;
   if(actor.active&&(distance<620||actor.rider)){visible.push(actor);if(distance<(actor.root?85:70)||actor.rider)close.push(actor);}
   if(actor.active&&(distance<90||actor.rider))this.nearby.push(actor);
  }
  close.sort((a,b)=>(a.rider?-100:0)+a.viewDistance-((b.rider?-100:0)+b.viewDistance));
  const detailed=new Set(close.slice(0,32));
  for(const actor of this.detailed)if(!detailed.has(actor)){
   const key=this.vehicleKey(actor),pool=this.vehiclePool.get(key)||[];actor.root.visible=false;pool.push(actor.root);this.vehiclePool.set(key,pool);actor.root=null;
  }
  for(const actor of detailed){
   if(!actor.root){const key=this.vehicleKey(actor),pool=this.vehiclePool.get(key);actor.root=pool?.pop()||makeVehicle(actor.type,actor.seed,actor.bus?actor.route:null);if(!actor.root.parent)this.root.add(actor.root);}
   actor.root.visible=true;actor.root.position.set(actor.x,0,actor.z);actor.root.rotation.y=actor.heading;updateVehicleVisual(actor.root,actor.speed,actor.braking,actor.indicator,night,this.sim.time,actor.doors,0,actor.tripDistance);
  }
  this.detailed=detailed;
  // Bound the detailed cache even after travelling through the entire map.
  let cached=0;for(const pool of this.vehiclePool.values())for(let i=pool.length-1;i>=0;i--)if(++cached>64)disposeVehicle(pool.splice(i,1)[0]);
  const counts=new Map();
  for(const actor of visible)if(!detailed.has(actor)){
   const mesh=this.batches.get(actor.type),index=counts.get(actor.type)||0;if(index>=mesh.instanceMatrix.count)continue;
   this.setInstance(mesh,index,actor.x,0,actor.z,actor.heading);mesh.setColorAt(index,new THREE.Color(vehicleColor(actor.type,actor.seed)));counts.set(actor.type,index+1);
  }
  for(const [type,mesh] of this.batches){const count=counts.get(type)||0;mesh.count=count;mesh.instanceMatrix.clearUpdateRanges();if(count)mesh.instanceMatrix.addUpdateRange(0,count*16);mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor){mesh.instanceColor.clearUpdateRanges();if(count)mesh.instanceColor.addUpdateRange(0,count*3);mesh.instanceColor.needsUpdate=true;}}
  this.renderedCount=visible.length;
  this.updateSignals(position);this.updateStops(position,night);
 }
 vehicleKey(actor){return actor.bus?`${actor.type}:${actor.route.route}:${actor.route.headsign}`:`${actor.type}:${Math.abs(Math.trunc(actor.seed))%7}`;}
 setInstance(mesh,index,x,y,z,heading=0,sx=1,sy=1,sz=1){this.matrix.position.set(x,y,z);this.matrix.rotation.set(0,heading,0);this.matrix.scale.set(sx,sy,sz);this.matrix.updateMatrix();mesh.setMatrixAt(index,this.matrix.matrix);}
 updateSignals(position){
  let pole=0,bulb=0,crossing=0,walker=0;const onColors=[new THREE.Color(0xfc4827),new THREE.Color(0xffc247),new THREE.Color(0x7bec94)],offColors=[new THREE.Color(0x382620),new THREE.Color(0x373020),new THREE.Color(0x20392d)];
  for(const signal of this.signals){const c=signal.control;if(Math.hypot(position.x-c.x,position.z-c.z)>320){for(const p of signal.pedestrians)p.group.visible=false;continue;}
   for(let index=0;index<signal.approaches.length;index++){
    if(pole>=this.poles.instanceMatrix.count)break;
    const a=signal.approaches[index],road=samplePath(a.edge.path,a.edge.path.length-12),right=[Math.cos(a.heading),-Math.sin(a.heading)],px=road.x+right[0]*(a.width/2+1),pz=road.z+right[1]*(a.width/2+1),hx=px-right[0]*3.3,hz=pz-right[1]*3.3;
    this.setInstance(this.poles,pole,px,2.8,pz);this.setInstance(this.arms,pole,px-right[0]*1.85,5.48,pz-right[1]*1.85,a.heading);
    this.setInstance(this.heads,pole,hx,4.97,hz,a.heading);
    const state=signalState(c,this.sim.time,a.axis),active=state.color==='red'?0:state.color==='yellow'?1:2;
    for(let i=0;i<3;i++){this.setInstance(this.bulbs,bulb,hx+Math.sin(a.heading)*.17,5.36-i*.39,hz+Math.cos(a.heading)*.17,a.heading);this.bulbs.setColorAt(bulb++,i===active?onColors[i]:offColors[i]);}
    const center=samplePath(a.edge.path,a.edge.path.length-8.5);
    for(let x=-a.width/2+.5;x<a.width/2;x+=1.04)this.setInstance(this.crossings,crossing++,center.x+right[0]*x,.064,center.z+right[1]*x,a.heading);
    const line=samplePath(a.edge.path,a.edge.path.length-11.3);this.setInstance(this.lines,pole,line.x,.063,line.z,a.heading,a.width,1,1);
    pole++;
    const pedestrianState=signalState(c,this.sim.time,1-a.axis),pedPhase=(pedestrianState.phase-(1-a.axis)*45+90)%90;
    for(let person=0;person<2;person++){
     const duration=(a.width+2)/1.25,start=person*11,progress=pedestrianState.walk?Math.max(0,Math.min(1,(pedPhase-start)/duration)):0,direction=person%2?-1:1,offset=(progress-.5)*(a.width+2)*direction;
     const x=center.x+right[0]*offset,z=center.z+right[1]*offset,walking=progress>0&&progress<1;
     this.setInstance(this.walkerBodies,walker,x,1.06+(walking?Math.sin(this.sim.time*7)*.025:0),z,a.heading+Math.PI/2);
     this.walkerBodies.setColorAt(walker,new THREE.Color(person?0x92725b:0x536b81));this.setInstance(this.walkerHeads,walker,x,1.66,z);
     for(let leg=0;leg<2;leg++)this.setInstance(this.walkerLegs,walker*2+leg,x+right[0]*(leg?.09:-.09),.32,z+right[1]*(leg?.09:-.09)+(walking?Math.sin(this.sim.time*7+leg*Math.PI)*.13:0),a.heading+Math.PI/2);
     walker++;
    }
    if(globalThis.document){
     let ped=signal.pedestrians[index];
     if(!ped){
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const group=new THREE.Group(),back=new THREE.Mesh(new THREE.BoxGeometry(.59,.46,.15),black),face=new THREE.Mesh(new THREE.PlaneGeometry(.54,.4),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));face.position.z=.081;group.add(back,face);group.position.set(px,2.48,pz);group.rotation.y=a.heading;this.root.add(group);ped={group,canvas,texture,tick:-1};signal.pedestrians[index]=ped;
     }
     ped.group.visible=true;const pedestrian=signalState(c,this.sim.time,1-a.axis),tick=Math.floor(this.sim.time);
     if(ped.tick!==tick){ped.tick=tick;const ctx=ped.canvas.getContext('2d');ctx.fillStyle='#121611';ctx.fillRect(0,0,128,96);ctx.fillStyle=pedestrian.walk?'#eaf0df':'#ed9f39';ctx.font='bold 22px sans-serif';ctx.fillText(pedestrian.walk?'WALK':'WAIT',10,34);if(pedestrian.clearance){ctx.font='bold 39px monospace';ctx.fillText(String(Math.ceil(pedestrian.remaining)),30,78);}ped.texture.needsUpdate=true;}
    }
   }
  }
  for(const [m,count] of [[this.poles,pole],[this.arms,pole],[this.heads,pole],[this.bulbs,bulb],[this.crossings,crossing],[this.lines,pole],[this.walkerBodies,walker],[this.walkerHeads,walker],[this.walkerLegs,walker*2]]){m.count=count;m.instanceMatrix.clearUpdateRanges();if(count)m.instanceMatrix.addUpdateRange(0,count*16);m.instanceMatrix.needsUpdate=true;}
  if(this.walkerBodies.instanceColor){this.walkerBodies.instanceColor.clearUpdateRanges();if(walker)this.walkerBodies.instanceColor.addUpdateRange(0,walker*3);this.walkerBodies.instanceColor.needsUpdate=true;}
  if(this.bulbs.instanceColor){this.bulbs.instanceColor.clearUpdateRanges();if(bulb)this.bulbs.instanceColor.addUpdateRange(0,bulb*3);this.bulbs.instanceColor.needsUpdate=true;}
 }
 updateStops(position,night){
  for(const stop of this.stops.values()){
   const visible=Math.hypot(position.x-stop.x,position.z-stop.z)<220;
   if(visible&&!stop.group){
    if(this.map.buildingAt(stop.x,stop.z))continue;
    const group=stop.group=new THREE.Group();group.position.set(stop.x,0,stop.z);group.rotation.y=stop.heading;this.root.add(group);
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,3.2,6),metal);post.position.y=1.6;group.add(post);
    const texture=signTexture('BUS STOP\n'+[...stop.routes].join(' / ').slice(0,18)+'\n'+stop.name.slice(0,18));const sign=new THREE.Mesh(new THREE.BoxGeometry(.76,.53,.08),texture?new THREE.MeshStandardMaterial({map:texture,roughness:.8}):black);sign.position.y=2.78;group.add(sign);
    if(random(Number(stop.id))>.6){
     const bench=new THREE.Mesh(new THREE.BoxGeometry(1.9,.12,.5),metal);bench.position.set(0,.5,1.2);group.add(bench);
     const roof=new THREE.Mesh(new THREE.BoxGeometry(2.6,.11,1.35),metal);roof.position.set(0,2.65,1.25);group.add(roof);
     for(const x of [-1.2,1.2]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.065,2.65,.065),metal);leg.position.set(x,1.325,1.8);group.add(leg);}
     const glass=new THREE.Mesh(new THREE.BoxGeometry(2.35,1.95,.035),new THREE.MeshStandardMaterial({color:0xb6c8ce,transparent:true,opacity:.25,roughness:.2,depthWrite:false}));glass.position.set(0,1.55,1.8);group.add(glass);
    }
    const people=[];for(let i=0;i<2;i++){
     const person=new THREE.Group(),coat=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.6,3,6),new THREE.MeshStandardMaterial({color:[0x597482,0xa78764][i]})),head=new THREE.Mesh(new THREE.SphereGeometry(.15,6,5),new THREE.MeshStandardMaterial({color:0xb79978}));coat.position.y=1.1;head.position.y=1.65;person.add(coat,head);person.position.set(i*.55-.4,0,.35);group.add(person);people.push(person);
    }stop.people=people;
   }
   if(stop.group){stop.group.visible=visible;const boarding=this.sim.actors.some(a=>a.bus&&a.active&&a.dwell>0&&Math.hypot(a.x-stop.x,a.z-stop.z)<12);if(visible)stop.people.forEach((p,i)=>{p.visible=!boarding||Math.sin(this.sim.time*.5+i)>0;});}
  }
 }
 snapshot(){return {actors:this.sim.actors.filter(a=>a.active).length,buses:this.sim.actors.filter(a=>a.bus&&a.active).length,signals:this.sim.network.controllers.length,visible:this.renderedCount,nearby:this.nearby.length,parked:this.sim.actors.filter(a=>a.active&&a.parked).length,detailed:this.detailed.size,riding:this.flight.vehicleSupport?.type||null};}
}
