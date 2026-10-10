import * as THREE from '../vendor/three.module.js';
export const BIRD_CLEARANCE=.16;
export const FLIGHT={cruise:35,glide:55,highCruise:100,highGlide:135,flap:38,highFlap:100,walk:1.2,turn:1.05,pitch:.43,cameraLag:3.1,landingSpeed:5,dash:90,highDash:200,dashDuration:1.2,dashCooldown:2,divePitch:1.46};
export class Flight {
 constructor(bird,camera,map,nest) {
  this.bird=bird;this.camera=camera;this.map=map;this.nest=nest.clone();this.position=nest.clone();this.previous=nest.clone();this.heading=Math.PI*.67;this.speed=0;this.vertical=0;this.bank=0;this.pitch=0;this.flying=false;this.landing=false;this.keys=new Set();this.peck=0;this.elapsed=0;this.distance=0;this.orbit=0;this.orbitPitch=0;this.dashTime=0;this.dashCooldown=0;this.diveTime=0;this.gamepad={turn:0,pitch:0,forward:0};this.cameraTarget=new THREE.Vector3();this.forward=new THREE.Vector3();this.desiredCamera=new THREE.Vector3();this.look=new THREE.Vector3();this.onEvent=()=>{};
  this.camera.position.set(nest.x+Math.sin(this.heading)*1.1,nest.y+.55,nest.z+Math.cos(this.heading)*1.1);this.bird.position.copy(this.position);
 }
 axis(a,b){return (this.keys.has(a)?1:0)-(this.keys.has(b)?1:0);}
 takeoff(){if(this.flying)this.landing=false;if(!this.flying){this.flying=true;this.landing=false;this.position.y+=1.8;this.vertical=9;this.speed=8;this.onEvent('takeoff');}}
 dash(){if(!this.flying)this.takeoff();if(this.dashCooldown>0)return;this.landing=false;this.dashTime=FLIGHT.dashDuration;this.dashCooldown=FLIGHT.dashCooldown;this.onEvent('dash');}
 land(){if(this.flying){this.landing=!this.landing;this.onEvent(this.landing?'landing':'takeoff');}}
 home(){this.position.copy(this.nest);this.speed=0;this.vertical=0;this.flying=false;this.landing=false;this.diveTime=0;this.dashTime=0;this.pitch=0;this.camera.position.set(this.nest.x+Math.sin(this.heading)*1.1,this.nest.y+.55,this.nest.z+Math.cos(this.heading)*1.1);this.onEvent('home');}
 update(dt){
  this.elapsed+=dt;this.dashTime=Math.max(0,this.dashTime-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.peck=Math.max(0,this.peck-dt*2.5);this.previous.copy(this.position);
  const pads=navigator.getGamepads?.(),pad=pads&&Array.from(pads).find(Boolean);
  const dead=v=>Math.abs(v)>.13?v:0;this.gamepad.turn=pad?dead(pad.axes[0]||0):0;this.gamepad.pitch=pad?-dead(pad.axes[1]||0):0;
  if(pad?.buttons[0]?.pressed){this.takeoff();this.keys.add('GameFlap');}else this.keys.delete('GameFlap');
  const turn=this.axis('KeyD','KeyA')+this.axis('ArrowRight','ArrowLeft')+this.gamepad.turn;
  const climb=this.axis('KeyW','KeyS')+this.axis('ArrowUp','ArrowDown')+this.gamepad.pitch;
  const flap=this.keys.has('Space')||this.keys.has('GameFlap'),glide=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||pad?.buttons[7]?.pressed;
  const smoothing=(rate)=>1-Math.exp(-rate*dt);
  const forcedDive=this.keys.has('ControlLeft')||this.keys.has('ControlRight');
  this.diveTime=this.flying&&!this.landing&&(climb<-.4||forcedDive)?Math.min(1.4,this.diveTime+dt):Math.max(0,this.diveTime-dt*3);
  const dive=THREE.MathUtils.smoothstep(this.diveTime,.25,1.3);
  const roof=this.map.surface(this.position.x,this.position.z),highAir=THREE.MathUtils.smoothstep(this.position.y-roof,30,100);
  const cruise=THREE.MathUtils.lerp(FLIGHT.cruise,FLIGHT.highCruise,highAir),glideSpeed=THREE.MathUtils.lerp(FLIGHT.glide,FLIGHT.highGlide,highAir);
  const targetSpeed=this.flying?(this.landing?FLIGHT.landingSpeed:this.dashTime>0?THREE.MathUtils.lerp(FLIGHT.dash,FLIGHT.highDash,highAir):glide?glideSpeed+dive*24:flap?THREE.MathUtils.lerp(FLIGHT.flap,FLIGHT.highFlap,highAir):cruise+dive*32):(climb*FLIGHT.walk);
  this.speed=THREE.MathUtils.lerp(this.speed,targetSpeed,smoothing(this.flying?(this.dashTime>0?5:1.7):7));
  this.heading-=turn*FLIGHT.turn*dt*(this.flying?(this.landing?.95:.85):1.9);
  this.bank=THREE.MathUtils.lerp(this.bank,this.flying?-turn*.55:0,smoothing(4.4));
  this.pitch=THREE.MathUtils.lerp(this.pitch,this.flying?(dive>.01?-(.42+dive*(FLIGHT.divePitch-.42)):climb*.52+(flap?.13:0)):0,smoothing(2.7));
  const desiredVertical=this.flying?(this.landing?-10+climb*8:Math.sin(this.pitch)*this.speed+(flap?12:0)-(glide?1.2:1.7)):0;
  this.vertical=THREE.MathUtils.lerp(this.vertical,desiredVertical,smoothing(2.5));
  this.forward.set(-Math.sin(this.heading),0,-Math.cos(this.heading));
  const dx=this.forward.x*this.speed*dt*(this.flying?Math.max(.09,Math.cos(this.pitch)):1),dz=this.forward.z*this.speed*dt*(this.flying?Math.max(.09,Math.cos(this.pitch)):1),dy=this.vertical*dt;
  // Substep fast motion so dash cannot cross a narrow building between frames.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy,dz)/2)),sx=dx/steps,sy=dy/steps,sz=dz/steps;
  for(let i=0;i<steps;i++){
   const px=this.position.x,pz=this.position.z;this.position.x+=sx;this.position.z+=sz;this.position.y+=sy;
   const building=this.map.buildingAt(this.position.x,this.position.z),surface=building?.h||0;
   if(building&&this.position.y<surface+BIRD_CLEARANCE-.03&&this.position.y-sy<surface+BIRD_CLEARANCE-.03){
    const canX=!this.map.buildingAt(this.position.x,pz)||this.map.surface(this.position.x,pz)+BIRD_CLEARANCE-.03<this.position.y;
    const canZ=!this.map.buildingAt(px,this.position.z)||this.map.surface(px,this.position.z)+BIRD_CLEARANCE-.03<this.position.y;
    if(canX)this.position.z=pz;else if(canZ)this.position.x=px;else{this.position.x=px;this.position.z=pz;}
    this.speed*=Math.exp(-dt*3/steps);
   }
  }
  const support=this.map.surface(this.position.x,this.position.z),land=this.map.onLand(this.position.x,this.position.z);
  if(this.flying&&this.vertical<=0&&this.position.y<=support+BIRD_CLEARANCE&&(land||support>0)) {
   if(this.previous.y>=support+BIRD_CLEARANCE-.18){this.position.y=support+BIRD_CLEARANCE;this.flying=false;this.landing=false;this.speed=0;this.vertical=0;this.onEvent('perch');}
  }
  if(!this.flying){
   const prevSupport=this.map.surface(this.previous.x,this.previous.z);
   if((prevSupport>2&&support<prevSupport-2)||!land){this.flying=true;this.speed=8;this.vertical=0;this.onEvent('takeoff');}
   else this.position.y=support+BIRD_CLEARANCE;
  }
  if(this.position.y<4&&!land&&support===0){this.position.y=Math.max(2,this.position.y);this.vertical=Math.max(7,this.vertical);this.landing=false;}
  this.position.y=THREE.MathUtils.clamp(this.position.y,BIRD_CLEARANCE,650);
  // Northern edge follows the 59th Street data cut. Ocean exploration stays bounded.
  const lon=this.position.x/84360-74,lat=-this.position.z/110540+40.72;
  if(lat>40.768-(lon+73.981)*.5263-.00025&&this.forward.z<0){this.heading+=dt*.9;this.onEvent('boundary');}
  if(Math.abs(this.position.x)>6500||this.position.z>4000||this.position.z< -5700)this.heading+=dt*.9;
  this.distance+=this.position.distanceTo(this.previous);
  this.bird.position.copy(this.position);this.bird.rotation.set(this.pitch,this.heading,this.bank,'YXZ');this.bird.userData.animate(this.elapsed,this.flying,Math.abs(this.speed),this.peck);
  this.orbit*=Math.exp(-dt*.45);this.orbitPitch*=Math.exp(-dt*.45);
  // Follow translation immediately; lag only the camera arm and the look angle.
  // Otherwise a small pigeon disappears as a fast flight outruns the camera.
  const movement=this.position.clone().sub(this.previous);this.camera.position.add(movement);this.cameraTarget.add(movement);
  const camHeading=this.heading+this.orbit,behind=this.flying?THREE.MathUtils.clamp(2.2+this.speed*.009,2.2,4):THREE.MathUtils.clamp(1.1+this.speed*.012,1.1,1.8);
  const diveView=this.flying?THREE.MathUtils.smoothstep(-this.pitch,.15,1.3):0;
  const armLength=behind*(1-diveView*.72),cameraHeight=(this.flying?THREE.MathUtils.clamp(.6+this.speed*.0035,.6,1.3):.55)+diveView*behind*.9;
  this.desiredCamera.set(this.position.x+Math.sin(camHeading)*armLength,this.position.y+cameraHeight+this.orbitPitch,this.position.z+Math.cos(camHeading)*armLength);
  // Shorten camera arm against buildings instead of looking through their walls.
  const arm=this.desiredCamera.clone().sub(this.position);
  for(let i=1;i<=12;i++){const p=this.position.clone().addScaledVector(arm,i/12);if(this.map.surface(p.x,p.z)>p.y-.06){this.desiredCamera.copy(this.position).addScaledVector(arm,Math.max(.15,(i-1)/12));this.desiredCamera.y=this.position.y+Math.max(.65,cameraHeight);break;}}
  this.camera.position.lerp(this.desiredCamera,smoothing(FLIGHT.cameraLag));
  this.look.copy(this.position).addScaledVector(this.forward,this.flying?(.3+this.speed*.001)*(1-diveView*.7):.18);this.look.y+=(this.flying?.06:.04)-diveView*.35;this.cameraTarget.lerp(this.look,smoothing(7));this.camera.lookAt(this.cameraTarget);
 }
}
