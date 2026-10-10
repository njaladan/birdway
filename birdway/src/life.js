import * as THREE from '../vendor/three.module.js';
import {geo} from './geography.js';
import {box,mesh,rand} from './city.js';
import {makeBird} from './bird.js';
import {LANDMARKS,MOMENTS,INTENTIONS} from './content.js';
const KEY='birdway-save-v1';
export function loadSave(){
 const empty={food:0,treasures:[],visited:[],moments:[],carried:null,flowers:0,distance:0,photos:[],hours:17.55};
 try{const s=JSON.parse(localStorage.getItem(KEY));if(!s)return empty;
  for(const k of ['food','flowers','distance'])if(Number.isFinite(s[k]))empty[k]=Math.max(0,Math.min(s[k],1e7));
  empty.treasures=Array.isArray(s.treasures)?s.treasures.filter(x=>MOMENTS.some(m=>m.type==='shiny'&&m.id===x)):[];
  empty.visited=Array.isArray(s.visited)?s.visited.filter(x=>LANDMARKS.some(m=>m.id===x)):[];
  empty.moments=Array.isArray(s.moments)?s.moments.filter(x=>MOMENTS.some(m=>m.id===x)):[];
  if(s.carried&&MOMENTS.some(m=>m.id===s.carried.id&&['food','shiny'].includes(m.type)))empty.carried={id:s.carried.id,type:s.carried.type,item:s.carried.item};
  empty.photos=Array.isArray(s.photos)?s.photos.filter(p=>typeof p.src==='string'&&p.src.startsWith('data:image/jpeg;base64,')).slice(-6):[];
  if(Number.isFinite(s.hours))empty.hours=((s.hours%24)+24)%24;
 }catch{}return empty;
}
export class CityLife {
 constructor(scene,map,flight,nest,audio,toast){
  this.scene=scene;this.map=map;this.flight=flight;this.nest=nest;this.audio=audio;this.toast=toast;this.save=loadSave();this.time=0;this.nearby=null;this.target=null;this.cooldowns=new Map();this.flock=[];this.markerRoot=new THREE.Group();scene.add(this.markerRoot);this.decoration=new THREE.Group();this.decoration.position.copy(nest);scene.add(this.decoration);
  this.landmarks=LANDMARKS.map(l=>({...l,position:geo(l.lon,l.lat)}));
  this.moments=MOMENTS.map(m=>{let p=geo(m.lon,m.lat);if(m.roof)p.y=map.surface(p.x,p.z);else p=this.freeGround(p);return {...m,position:p};});
  this.buildParks();this.buildBridge();this.buildStreetLife();
  for(const m of this.moments){m.group=new THREE.Group();m.group.position.copy(m.position);scene.add(m.group);this.buildProp(m);}
  const glintMat=new THREE.MeshBasicMaterial({color:0xe6c885});
  for(const m of this.moments){const glint=new THREE.Mesh(new THREE.OctahedronGeometry(.32),glintMat);glint.position.copy(m.position).y+=3;this.markerRoot.add(glint);m.marker=glint;}
  this.carriedMesh=mesh(flight.bird,new THREE.SphereGeometry(.12,10,8),0xe6c69a,0,.68,-1.08);
  this.rebuildHome();
 }
 freeGround(p){if(!this.map.buildingAt(p.x,p.z)&&this.map.onLand(p.x,p.z))return p;
  let best=null,d=Infinity;for(const s of this.map.streets)for(const a of s.points){const dist=Math.hypot(a[0]-p.x,a[1]-p.z);if(dist<d&&this.map.onLand(...a)&&!this.map.buildingAt(...a)){d=dist;best=a;}}
  return best?new THREE.Vector3(best[0],0,best[1]):p;
 }
 record(id){if(!this.save.moments.includes(id))this.save.moments.push(id);this.persist();}
 persist(){this.save.distance+=this.flight.distance;this.flight.distance=0;try{localStorage.setItem(KEY,JSON.stringify(this.save));this.storageWarning=false;}catch{if(!this.storageWarning){this.toast('Your browser storage is full. New memories will last for this visit.');this.storageWarning=true;}}}
 get friends(){return Math.min(5,Math.floor(this.save.food/2));}
 get completed(){return this.save.food>=4&&this.save.treasures.length>=3&&this.save.visited.length>=6&&this.save.moments.some(id=>this.moments.find(m=>m.id===id)?.type==='updraft')&&this.save.moments.includes('bath')&&this.save.moments.includes('busker');}
 get intention(){const s=this.save;if(s.food<1)return 0;if(this.friends<1)return 1;if(s.visited.length<3)return 2;if(s.treasures.length<1)return 3;if(!s.moments.some(id=>this.moments.find(m=>m.id===id)?.type==='updraft'))return 4;if(!s.moments.includes('bath')||!s.moments.includes('busker'))return 5;return this.completed?7:6;}
 get intentionText(){return INTENTIONS[this.intention];}
 interact(){
  const p=this.flight.position;
  if(p.distanceTo(this.nest)<6&&!this.flight.flying){
   if(this.save.carried){const item=this.save.carried;if(item.type==='food'){this.save.food++;this.toast(`A ${item.item} for home.${this.save.food%2===0?' A new friend has joined your flock!':' Your nest feels a little warmer.'}`);}else{if(!this.save.treasures.includes(item.id))this.save.treasures.push(item.id);this.toast(`Your ${item.item} has a place in the nest.`);}this.save.carried=null;this.rebuildHome();this.persist();if(this.completed&&!this.celebrated){this.celebrated=true;this.toast('A home full of stories. You belong here, little bird.');}}
   else{this.audio.coo();this.toast(`${this.friends+1} little birds. ${this.save.food} bites shared. ${this.save.treasures.length} lovely finds. Home.`);}return;
  }
  const m=this.nearby;if(!m||this.flight.flying){this.flight.land();return;}
  if(['food','shiny'].includes(m.type)){
   if(this.save.carried){this.toast('Your beak is full. Bring this find home, or press P to eat a carried snack.');return;}
   if(m.type==='shiny'&&this.save.treasures.includes(m.id)){this.toast('You already kept this little treasure. Look for another glimmer.');return;}
   if((this.cooldowns.get(m.id)||0)>this.time){this.toast('The city is taking its time. Another bite will appear soon.');return;}
   this.save.carried={id:m.id,type:m.type,item:m.item};this.flight.peck=1;this.cooldowns.set(m.id,this.time+55);this.record(m.id);this.toast(`${m.item[0].toUpperCase()+m.item.slice(1)} in your beak. Bring it home with H, or fly back on your own.`);
  }else if(m.type==='bath'){this.flight.peck=1;this.splashUntil=this.time+3;this.record(m.id);this.toast('A tiny bath. A very satisfied pigeon.');}
  else if(m.type==='music'){this.audio.coo();if(this.audio.enabled){this.audio.tone(79,this.audio.ctx.currentTime+.4,3,.12);this.audio.tone(76,this.audio.ctx.currentTime+1,3,.10);}this.record(m.id);this.toast('The musician smiles. You contribute a soft little coo.');}
  else if(m.type==='garden'){if((this.cooldowns.get(m.id)||0)>this.time)return;this.cooldowns.set(m.id,this.time+15);this.save.flowers++;this.record(m.id);this.addFlower(m);this.toast('A seed finds a home. Another flower on the rooftop.');}
  else if(m.type==='friend'){this.audio.coo();this.record(m.id);this.toast('Coo, coo. A neighbor answers. Share food at home to welcome a companion.');}
  else if(m.type==='rest'){this.restUntil=this.time+5;this.audio.coo();this.record(m.id);this.toast('Warm linen, a soft breeze. It’s good to be small.');}
  this.persist();
 }
 peck(){if(this.flight.flying)return;this.flight.peck=1;if(this.save.carried?.type==='food'){this.toast(`A little ${this.save.carried.item}. Delicious.`);this.save.carried=null;this.persist();}else if(this.nearby?.type==='food'&&(this.cooldowns.get(this.nearby.id)||0)<=this.time){this.cooldowns.set(this.nearby.id,this.time+30);this.record(this.nearby.id);this.toast('Just a peck. There’s enough city to share.');}else this.audio.coo();}
 coo(){this.audio.coo();this.flight.peck=.35;this.toast(this.friends?'Your little flock answers.':'A quiet coo disappears between the buildings.');}
 rebuildHome(){
  while(this.flock.length<this.friends){const b=makeBird(1.15);this.scene.add(b);this.flock.push(b);}
  while(this.flock.length>this.friends){this.scene.remove(this.flock.pop());}
  for(const child of [...this.decoration.children]){child.geometry?.dispose();child.material?.dispose();this.decoration.remove(child);}
  const items=this.save.treasures;
  items.forEach((id,i)=>{const a=i*2.3,x=Math.cos(a)*1.1,z=Math.sin(a)*1.1;const m=id==='ring'?mesh(this.decoration,new THREE.TorusGeometry(.23,.055,8,20),0xe5bf64,x,-.35,z):mesh(this.decoration,new THREE.SphereGeometry(.23,12,8),id==='button'?0x78adb1:id==='glass'?0x87ba96:0xd78a94,x,-.35,z);m.scale.y=.4;m.rotation.x=.2;});
  for(let i=0;i<Math.min(this.save.food,10);i++)mesh(this.decoration,new THREE.SphereGeometry(.12,8,6),0xdbbc7f,Math.cos(i)*.65,-.33,Math.sin(i)*.65);
 }
 update(dt){
  this.time+=dt;const p=this.flight.position;this.nearby=null;let closest=Infinity;
  for(const l of this.landmarks){const d=Math.hypot(p.x-l.position.x,p.z-l.position.z);const radius=['wtc','empire'].includes(l.id)?110:75;if(d<radius&&!this.save.visited.includes(l.id)){this.save.visited.push(l.id);this.persist();this.toast(`A memory kept: ${l.name}. Open your scrapbook with B.`);}}
  for(const m of this.moments){
   const d=Math.hypot(p.x-m.position.x,p.z-m.position.z),height=p.y-m.position.y;
   m.group.visible=d<900;
   if(d<6&&height<4&&height>-.5&&d<closest){closest=d;this.nearby=m;}
   if(m.type==='updraft'&&d<10&&height<95&&this.flight.flying){this.flight.vertical=Math.max(this.flight.vertical,14+18*(1-d/10));this.flight.position.y+=dt*12;if(!this.save.moments.includes(m.id)){this.record(m.id);this.toast('Warm air under your wings. The city gives you a lift.');}}
   m.marker.visible=d<160&&(m.type!=='shiny'||!this.save.treasures.includes(m.id))&&(this.cooldowns.get(m.id)||0)<this.time;
   m.marker.position.y=m.position.y+2.6+Math.sin(this.time*1.5)*.2;m.marker.rotation.y=this.time*.7;
   if(m.itemMesh)m.itemMesh.visible=(this.cooldowns.get(m.id)||0)<this.time&&(m.type!=='shiny'||!this.save.treasures.includes(m.id));
   if(m.steam){const a=m.steam.geometry.attributes.position;for(let i=0;i<a.count;i++){a.array[i*3+1]=((this.time*5+i*1.7)%38);a.array[i*3]=Math.sin(i*2.5+this.time*.4)*(1+a.array[i*3+1]*.08);a.array[i*3+2]=Math.cos(i*1.3+this.time*.3)*(1+a.array[i*3+1]*.08);}a.needsUpdate=true;}
   if(m.clothes)m.clothes.rotation.z=Math.sin(this.time*.7)*.025;
   if(m.npc){m.npc.rotation.y=Math.sin(this.time*.3)*.5;m.npc.userData.animate(this.time,false,0);}
   if(m.splash)m.splash.visible=(this.splashUntil||0)>this.time;
  }
  this.carriedMesh.visible=!!this.save.carried;if(this.save.carried)this.carriedMesh.material.color.set(this.save.carried.type==='shiny'?0xdabc68:0xdabb8e);
  this.flock.forEach((b,i)=>{
   const angle=this.flight.heading+(i%2?-.55:.55),radius=6+Math.floor(i/2)*4;
   const target=p.clone().add(new THREE.Vector3(Math.sin(angle)*radius,this.flight.flying?Math.sin(this.time+i)*.7:-.1,Math.cos(angle)*radius));
   if(!this.flight.flying){target.y=this.map.surface(target.x,target.z)+.7;if(target.y>p.y+3||target.y<p.y-3)target.copy(this.nest).add(new THREE.Vector3(Math.cos(i)*2,.2,Math.sin(i)*2));}
   else target.y=Math.max(target.y,this.map.surface(target.x,target.z)+1.7);
   if(b.position.lengthSq()<1)b.position.copy(target);else b.position.lerp(target,1-Math.exp(-dt*2));b.rotation.set(this.flight.pitch,this.flight.heading,this.flight.bank*.8,'YXZ');b.userData.animate(this.time+i*.3,this.flight.flying,this.flight.speed);
  });
  this.updateStreet(dt);
  if(this.target){const d=Math.hypot(p.x-this.target.position.x,p.z-this.target.position.z);if(d<15)this.target=null;}
  if(Math.floor(this.time/12)!==this.saveTick){this.saveTick=Math.floor(this.time/12);this.persist();}
 }
 addFlower(m){if(m.flowers>=18)return;m.flowers=(m.flowers||0)+1;const i=m.flowers,x=(rand(i)-.5)*5,z=(rand(i+60)-.5)*4;mesh(m.group,new THREE.CylinderGeometry(.02,.03,.5,6),0x698658,x,.65,z);mesh(m.group,new THREE.SphereGeometry(.14,8,6),[0xd8a886,0xedcb81,0xc4a8c3][i%3],x,.92,z);}
 buildProp(m){const g=m.group;
  if(m.prop==='vendor'){
   box(g,0x9ba59c,0,.75,0,2,1.2,1.2);box(g,0xd0cbbb,0,1.39,0,2.1,.1,1.4);
   for(const s of [-1,1]){mesh(g,new THREE.CylinderGeometry(.045,.045,1.6,8),0x747c76,s*.9,2.1,.48);const wheel=mesh(g,new THREE.TorusGeometry(.25,.07,8,16),0x434e4a,s*.9,.25,0);wheel.rotation.y=Math.PI/2;}
   for(let i=0;i<8;i++)box(g,i%2?0xf1deb5:0x708c76,-.98+i*.28,2.85,0,.28,.16,1.7);
   for(let i=0;i<7;i++){const b=mesh(g,new THREE.TorusGeometry(.15,.055,8,12),0xc4a56d,(i%4-.5)*.25,1.5,Math.floor(i/4)*.3-.1);b.rotation.x=Math.PI/2;}
   mesh(g,new THREE.CylinderGeometry(.14,.14,.4,12),0xc0c9bb,-.65,1.65,.1);
  }
  if(['bench','busker','friend'].includes(m.prop)){
   for(let i=0;i<5;i++)box(g,0x8c7958,0,.65,-.35+i*.16,2.4,.09,.12);
   for(let i=0;i<3;i++)box(g,0x8c7958,0,.95+i*.18,.40,2.4,.12,.08);
   for(const x of [-.85,.85])box(g,0x57675b,x,.35,0,.12,.65,.65);
  }
  if(m.prop==='busker'){
   mesh(g,new THREE.CapsuleGeometry(.23,.6,4,8),0xb38868,0,1.1,0);mesh(g,new THREE.SphereGeometry(.21,12,8),0xd9b99a,0,1.8,0);const guitar=mesh(g,new THREE.SphereGeometry(.3,12,8),0x997247,.28,1.0,-.3);guitar.scale.set(1,1.2,.3);box(g,0x806442,.5,1.35,-.3,.1,.75,.07).rotation.z=-.4;
  }
  if(m.prop==='friend'){m.npc=makeBird(.9);m.npc.position.set(2,.6,0);g.add(m.npc);}
  if(m.prop==='planter'||m.prop==='garden'){
   const n=m.prop==='garden'?4:1;for(let i=0;i<n;i++){const x=(i-(n-1)/2)*1.6;box(g,0x9b9a7a,x,.35,.8,1.2,.7,1.2);mesh(g,new THREE.SphereGeometry(.55,12,8),0x789468,x,.9,.8).scale.y=.7;}
   if(m.prop==='garden')for(let i=0;i<Math.min(18,this.save.flowers);i++)this.addFlower(m);
  }
  if(m.prop==='vent'){
   const grate=mesh(g,new THREE.CylinderGeometry(.8,.8,.15,16),0x68766e,0,.08,0);for(let i=-3;i<=3;i++)box(g,0x303e38,i*.19,.16,0,.055,.03,1.2);
   const a=new Float32Array(28*3),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(a,3));m.steam=new THREE.Points(geo,new THREE.PointsMaterial({color:0xf3e7cd,size:3.4,transparent:true,opacity:.16,depthWrite:false}));m.steam.frustumCulled=false;g.add(m.steam);
  }
  if(m.prop==='fountain'){
   mesh(g,new THREE.CylinderGeometry(3.5,3.5,.5,40),0xb7b49c,0,.2,0);mesh(g,new THREE.CylinderGeometry(3.1,3.1,.1,40),0x82aaa1,0,.48,0);mesh(g,new THREE.CylinderGeometry(.35,.5,1.8,12),0xbac1a3,0,1.1,0);mesh(g,new THREE.SphereGeometry(.48,12,8),0x95bdb2,0,2.0,0).scale.y=.3;
   const positions=[];for(let i=0;i<25;i++){const a=i*Math.PI*2/25;positions.push(Math.cos(a)*1.2,.65+rand(i)*1.2,Math.sin(a)*1.2);}
   const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));m.splash=new THREE.Points(sg,new THREE.PointsMaterial({color:0xd1ede1,size:.14}));m.splash.visible=false;g.add(m.splash);
  }
  if(m.prop==='laundry'){
   for(const x of [-3,3])box(g,0x6d7668,x,1.7,0,.06,3.4,.06);
   box(g,0x949a87,0,3.0,0,6,.025,.025);m.clothes=new THREE.Group();g.add(m.clothes);
   for(let i=0;i<5;i++){const cloth=box(m.clothes,[0xe9d5bc,0xb8c7b3,0xc9a8a0][i%3],-2.2+i*1.1,2.4,0,.75,1.1,.02);cloth.rotation.y=(rand(i)-.5)*.2;}
  }
  if(['food','shiny'].includes(m.type)){
   m.itemMesh=m.type==='shiny'&&m.id==='ring'?mesh(g,new THREE.TorusGeometry(.25,.06,8,16),0xdfbc61,2,.18,1):mesh(g,new THREE.SphereGeometry(m.type==='food'?.22:.18,12,8),m.type==='food'?0xd8ba80:m.id==='button'?0x6eafb8:0x9acaaa,2,.18,1);m.itemMesh.scale.y=.45;
  }
 }
 buildParks(){
  const parks=[[-74.0162,40.7036,65],[-74.0175,40.7048,50],[-74.0060,40.7129,48],[-73.9973,40.7308,65],[-73.9832,40.7536,49],[-73.9876,40.7413,50],[-74.0176,40.7170,40]];
  const spots=[];for(const [lon,lat,radius] of parks){const p=geo(lon,lat);const ground=mesh(this.scene,new THREE.CircleGeometry(radius,40),0x93a77d,p.x,-.05,p.z);ground.rotation.x=-Math.PI/2;
   for(let i=0;i<32;i++){const a=rand(i+radius)*Math.PI*2,r=Math.sqrt(rand(i+500+radius))*radius,x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;if(this.map.onLand(x,z)&&!this.map.buildingAt(x,z))spots.push([x,z,5+rand(i)*4]);}
  }
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.2,.3,1,7),new THREE.MeshStandardMaterial({color:0x84785d}),spots.length);
  const crown=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshStandardMaterial({color:0x7c9b70,roughness:1}),spots.length*3);const d=new THREE.Object3D();
  spots.forEach(([x,z,h],i)=>{d.position.set(x,h/2,z);d.scale.set(1,h,1);d.updateMatrix();trunk.setMatrixAt(i,d.matrix);for(let j=0;j<3;j++){d.position.set(x+Math.sin(j*2.1)*1.3,h-1+j*.6,z+Math.cos(j*2.1)*1.3);d.scale.set(h*.32,h*.28,h*.32);d.updateMatrix();crown.setMatrixAt(i*3+j,d.matrix);crown.setColorAt(i*3+j,new THREE.Color().setHSL(.23+rand(i)*.045,.18+rand(i+40)*.08,.34+rand(i+30)*.11));}});this.scene.add(trunk,crown);
  // A garden walkway along the High Line, with a supporting surface for little feet.
  const ha=geo(-74.0077,40.7363),hb=geo(-74.0017,40.7440),hd=hb.clone().sub(ha),hl=hd.length(),hy=Math.atan2(hd.x,hd.z),nx=Math.cos(hy)*3.5,nz=-Math.sin(hy)*3.5;
  const high=new THREE.Group();high.position.copy(ha);high.rotation.y=hy;this.scene.add(high);box(high,0x9b9f87,0,9,hl/2,7,1,hl);for(const x of [-2.8,2.8])box(high,0x859775,x,9.7,hl/2,.8,.5,hl);
  this.map.addPlatform([[ha.x+nx,ha.z+nz],[hb.x+nx,hb.z+nz],[hb.x-nx,hb.z-nz],[ha.x-nx,ha.z-nz]],9.5,'high-line');
  // Washington Square Arch, a small modeled destination on the real park location.
  const arch=geo(-73.9971,40.7312);for(const side of [-1,1]){box(this.scene,0xd5ccaf,arch.x+side*5.5,6,arch.z,3.3,12,4);box(this.scene,0xc7bfa6,arch.x+side*5.5,1,arch.z,3.7,2,4.4);}box(this.scene,0xd5ccaf,arch.x,14,arch.z,15,4,4.5);box(this.scene,0xe2d7bb,arch.x,16.4,arch.z,16,.8,4.8);
 }
 buildBridge(){
  const a=geo(-73.9992,40.7081,36),b=geo(-73.9931,40.7046,36),endA=geo(-74.0010,40.7112,25),endB=geo(-73.9892,40.7025,22),dir=endB.clone().sub(endA);dir.y=0;const angle=Math.atan2(dir.x,dir.z),length=dir.length();
  const nx=Math.cos(angle)*12.5,nz=-Math.sin(angle)*12.5;this.map.addPlatform([[endA.x+nx,endA.z+nz],[endB.x+nx,endB.z+nz],[endB.x-nx,endB.z-nz],[endA.x-nx,endA.z-nz]],36,'brooklyn-bridge');
  const g=new THREE.Group();g.position.copy(endA);g.rotation.y=angle;this.scene.add(g);box(g,0x8b9290,0,0,length/2,25,2.0,length);box(g,0xb2b4a1,0,2,length/2,4,.5,length);
  for(const p of [a,b]){const tower=new THREE.Group();tower.position.copy(p);tower.rotation.y=angle;this.scene.add(tower);for(const x of [-9,0,9]){box(tower,0x9d9981,x,18,0,5,38,9);box(tower,0xb6ad8d,x,37.5,0,5.6,2.5,9.6);}box(tower,0xaaa188,0,33,0,23,6,10);}
  const cablePositions=[];const points=[endA,a.clone().add(new THREE.Vector3(0,36,0)),b.clone().add(new THREE.Vector3(0,36,0)),endB];
  for(let side of [-1,1])for(let section=0;section<3;section++){const u=points[section],v=points[section+1];for(let i=0;i<35;i++){const t=i/35,t2=(i+1)/35;const at=q=>u.clone().lerp(v,q).add(new THREE.Vector3(Math.cos(angle)*side*10,-Math.sin(q*Math.PI)*(section===1?24:8),-Math.sin(angle)*side*10));const p=at(t),q=at(t2);cablePositions.push(...p.toArray(),...q.toArray());if(i%2===0)cablePositions.push(...p.toArray(),p.x,35,p.z);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(cablePositions,3));this.scene.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x777e72})));
 }
 buildStreetLife(){
  this.vehicles=[];const nearby=this.map.streets.filter(s=>s.points.length>=2&&!/F D R|Ramp|Bridge|Tunnel/.test(s.name));
  for(let i=0;i<28;i++){const s=nearby[Math.floor(rand(i+888)*nearby.length)],a=s.points[0],b=s.points[s.points.length-1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<40||len>500)continue;
   const g=new THREE.Group();this.scene.add(g);const color=i%3===0?0xc6a766:i%3===1?0x929fa3:0xa2ae94;box(g,color,0,.8,0,1.7,.9,3.8);box(g,0x768c8e,0,1.4,-.3,1.5,.7,2);box(g,color,0,1.83,-.3,1.6,.1,2.1);
   for(const x of [-.85,.85])for(const z of [-1.2,1.2]){const wheel=mesh(g,new THREE.CylinderGeometry(.32,.32,.12,12),0x434c44,x,.4,z);wheel.rotation.z=Math.PI/2;}
   g.rotation.y=Math.atan2(-(b[0]-a[0]),-(b[1]-a[1]));this.vehicles.push({g,a,b,t:rand(i+90),length:len});
  }
  const selected=nearby.filter((_,i)=>i%19===0).slice(0,60);this.walkers=[];
  for(let i=0;i<selected.length;i++){const s=selected[i],a=s.points[0],b=s.points[s.points.length-1];if(Math.hypot(b[0]-a[0],b[1]-a[1])<12)continue;const g=new THREE.Group();this.scene.add(g);mesh(g,new THREE.CapsuleGeometry(.23,.75,4,8),[0x898d72,0xb9a18b,0x6e838c][i%3],0,1.1,0);mesh(g,new THREE.SphereGeometry(.18,10,8),0xc7ad8a,0,1.84,0);for(const x of [-.12,.12])box(g,0x63726b,x,.38,0,.15,.65,.18);this.walkers.push({g,a,b,t:rand(i+66),length:Math.hypot(b[0]-a[0],b[1]-a[1])});}
 }
 updateStreet(dt){for(const v of this.vehicles){v.t=(v.t+dt*2.8/v.length)%1;v.g.position.set(THREE.MathUtils.lerp(v.a[0],v.b[0],v.t),0,THREE.MathUtils.lerp(v.a[1],v.b[1],v.t));v.g.visible=Math.hypot(v.g.position.x-this.flight.position.x,v.g.position.z-this.flight.position.z)<700&&!this.map.buildingAt(v.g.position.x,v.g.position.z);}
  for(const v of this.walkers){v.t=(v.t+dt*.65/v.length)%1;v.g.position.set(THREE.MathUtils.lerp(v.a[0],v.b[0],v.t)+5.8,Math.sin(this.time*6)*.025,THREE.MathUtils.lerp(v.a[1],v.b[1],v.t));v.g.visible=Math.hypot(v.g.position.x-this.flight.position.x,v.g.position.z-this.flight.position.z)<250&&!this.map.buildingAt(v.g.position.x,v.g.position.z);}
 }
}
