import * as THREE from '../vendor/three.module.js';
export const FLIGHT={cruise:27,glide:44,flap:32,walk:3.8,turn:1.05,pitch:.43,cameraLag:3.1,landingSpeed:8};
export class Flight {
 constructor(bird,camera,map,nest) {
  this.bird=bird;this.camera=camera;this.map=map;this.nest=nest.clone();this.position=nest.clone();this.previous=nest.clone();this.heading=Math.PI*.67;this.speed=0;this.vertical=0;this.bank=0;this.pitch=0;this.flying=false;this.landing=false;this.keys=new Set();this.peck=0;this.elapsed=0;this.distance=0;this.orbit=0;this.orbitPitch=0;this.gamepad={turn:0,pitch:0,forward:0};this.cameraTarget=new THREE.Vector3();this.forward=new THREE.Vector3();this.desiredCamera=new THREE.Vector3();this.look=new THREE.Vector3();this.onEvent=()=>{};
  this.camera.position.copy(nest).add(new THREE.Vector3(-18,10,18));this.bird.position.copy(this.position);
 }
 axis(a,b){return (this.keys.has(a)?1:0)-(this.keys.has(b)?1:0);}
 takeoff(){if(!this.flying){this.flying=true;this.landing=false;this.position.y+=1.8;this.vertical=9;this.speed=8;this.onEvent('takeoff');}}
 land(){if(this.flying){this.landing=!this.landing;this.onEvent(this.landing?'landing':'takeoff');}}
 home(){this.position.copy(this.nest);this.speed=0;this.vertical=0;this.flying=false;this.landing=false;this.camera.position.copy(this.nest).add(new THREE.Vector3(-18,10,18));this.onEvent('home');}
 update(dt){
  this.elapsed+=dt;this.peck=Math.max(0,this.peck-dt*2.5);this.previous.copy(this.position);
  const pads=navigator.getGamepads?.(),pad=pads&&Array.from(pads).find(Boolean);
  const dead=v=>Math.abs(v)>.13?v:0;this.gamepad.turn=pad?dead(pad.axes[0]||0):0;this.gamepad.pitch=pad?-dead(pad.axes[1]||0):0;
  if(pad?.buttons[0]?.pressed){this.takeoff();this.keys.add('GameFlap');}else this.keys.delete('GameFlap');
  const turn=this.axis('KeyD','KeyA')+this.axis('ArrowRight','ArrowLeft')+this.gamepad.turn;
  const climb=this.axis('KeyW','KeyS')+this.axis('ArrowUp','ArrowDown')+this.gamepad.pitch;
  const flap=this.keys.has('Space')||this.keys.has('GameFlap'),glide=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||pad?.buttons[7]?.pressed;
  const smoothing=(rate)=>1-Math.exp(-rate*dt);
  const targetSpeed=this.flying?(this.landing?FLIGHT.landingSpeed:glide?FLIGHT.glide:flap?FLIGHT.flap:FLIGHT.cruise):(climb*FLIGHT.walk);
  this.speed=THREE.MathUtils.lerp(this.speed,targetSpeed,smoothing(this.flying?1.15:7));
  this.heading-=turn*FLIGHT.turn*dt*(this.flying?(this.landing?.95:.85):1.9);
  this.bank=THREE.MathUtils.lerp(this.bank,this.flying?turn*.55:0,smoothing(4.4));
  this.pitch=THREE.MathUtils.lerp(this.pitch,this.flying?(climb*.42+(flap?.13:0)):0,smoothing(2.7));
  const desiredVertical=this.flying?(this.landing?-10:climb*18+(flap?12:0)-(glide?1.2:1.7)):0;
  this.vertical=THREE.MathUtils.lerp(this.vertical,desiredVertical,smoothing(2.5));
  this.forward.set(-Math.sin(this.heading),0,-Math.cos(this.heading));
  this.position.addScaledVector(this.forward,this.speed*dt);this.position.y+=this.vertical*dt;
  const building=this.map.buildingAt(this.position.x,this.position.z),surface=building?.h||0;
  if(building&&this.position.y<surface+.7&&this.previous.y<surface+.5) {
   // Slide along facades. Collisions cost momentum, never a life.
   const canX=!this.map.buildingAt(this.position.x,this.previous.z)||this.map.surface(this.position.x,this.previous.z)+.5<this.position.y;
   const canZ=!this.map.buildingAt(this.previous.x,this.position.z)||this.map.surface(this.previous.x,this.position.z)+.5<this.position.y;
   if(canX)this.position.z=this.previous.z;else if(canZ)this.position.x=this.previous.x;else{this.position.x=this.previous.x;this.position.z=this.previous.z;}
   this.speed*=Math.exp(-dt*3);
  }
  const support=this.map.surface(this.position.x,this.position.z),land=this.map.onLand(this.position.x,this.position.z);
  if(this.flying&&this.vertical<=0&&this.position.y<=support+.68&&(land||support>0)) {
   if(this.previous.y>=support+.5){this.position.y=support+.68;this.flying=false;this.landing=false;this.speed=0;this.vertical=0;this.onEvent('perch');}
  }
  if(!this.flying){
   const prevSupport=this.map.surface(this.previous.x,this.previous.z);
   if((prevSupport>2&&support<prevSupport-2)||!land){this.flying=true;this.speed=8;this.vertical=0;this.onEvent('takeoff');}
   else this.position.y=support+.68;
  }
  if(this.position.y<4&&!land&&support===0){this.position.y=Math.max(2,this.position.y);this.vertical=Math.max(7,this.vertical);this.landing=false;}
  this.position.y=THREE.MathUtils.clamp(this.position.y,.68,650);
  // Northern edge follows the 59th Street data cut. Ocean exploration stays bounded.
  const lon=this.position.x/84360-74,lat=-this.position.z/110540+40.72;
  if(lat>40.768-(lon+73.981)*.5263-.00025&&this.forward.z<0){this.heading+=dt*.9;this.onEvent('boundary');}
  if(Math.abs(this.position.x)>6500||this.position.z>4000||this.position.z< -5700)this.heading+=dt*.9;
  this.distance+=this.position.distanceTo(this.previous);
  this.bird.position.copy(this.position);this.bird.rotation.set(this.pitch,this.heading,this.bank,'YXZ');this.bird.userData.animate(this.elapsed,this.flying,Math.abs(this.speed),this.peck);
  this.orbit*=Math.exp(-dt*.45);this.orbitPitch*=Math.exp(-dt*.45);
  const camHeading=this.heading+this.orbit,behind=this.flying?17+this.speed*.16:10;
  this.desiredCamera.set(this.position.x+Math.sin(camHeading)*behind,this.position.y+(this.flying?6:4)+this.orbitPitch,this.position.z+Math.cos(camHeading)*behind);
  // Shorten camera arm against buildings instead of looking through their walls.
  const arm=this.desiredCamera.clone().sub(this.position);
  for(let i=1;i<=12;i++){const p=this.position.clone().addScaledVector(arm,i/12);if(this.map.surface(p.x,p.z)>p.y-.7){this.desiredCamera.copy(this.position).addScaledVector(arm,Math.max(.1,(i-1)/12));break;}}
  this.camera.position.lerp(this.desiredCamera,smoothing(FLIGHT.cameraLag));
  this.look.copy(this.position).addScaledVector(this.forward,this.flying?10:3);this.look.y+=this.flying?1:1.2;this.cameraTarget.lerp(this.look,smoothing(5));this.camera.lookAt(this.cameraTarget);
 }
}
