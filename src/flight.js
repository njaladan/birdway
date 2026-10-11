import * as THREE from '../vendor/three.module.js';
export const BIRD_CLEARANCE=.16;
export const BIRD_RADIUS=.18;
export const FLIGHT={cruise:35,flap:38,walk:3.6,turn:1.05,pitch:.34,fastPitch:.85,cameraLag:3.1,approachSpeed:12,landingSpeed:3.5,dash:90,dashDuration:1.2,dashCooldown:2,divePitch:1.18};
export class Flight {
 constructor(bird,camera,map,nest) {
  this.bird=bird;this.camera=camera;this.map=map;this.nest=nest.clone();this.position=nest.clone();this.previous=nest.clone();this.heading=Math.PI*.67;this.homeHeading=this.heading;this.speed=0;this.vertical=0;this.bank=0;this.pitch=0;this.flapStrength=0;this.approachBlend=0;this.flying=false;this.landing=false;this.keys=new Set();this.peck=0;this.elapsed=0;this.distance=0;this.orbit=0;this.orbitPitch=0;this.dashTime=0;this.dashCooldown=0;this.diveTime=0;this.compactView=false;this.touch={turn:0,pitch:0,flap:false,dive:false};this.onInputClear=()=>{};this.gamepad={turn:0,pitch:0,buttons:[]};this.gamepadActionsArmed=true;this.cameraTarget=new THREE.Vector3();this.forward=new THREE.Vector3();this.desiredCamera=new THREE.Vector3();this.look=new THREE.Vector3();this.onEvent=()=>{};this.onControlAction=()=>{};
  this.camera.position.set(nest.x+Math.sin(this.heading)*1.1,nest.y+.55,nest.z+Math.cos(this.heading)*1.1);this.bird.position.copy(this.position);
 }
 axis(a,b){return (this.keys.has(a)?1:0)-(this.keys.has(b)?1:0);}
 takeoff(){if(this.flying)this.landing=false;if(!this.flying){this.flying=true;this.landing=false;this.flapStrength=Math.max(this.flapStrength,.28);this.onEvent('takeoff');}}
 dash(){if(!this.flying)this.takeoff();if(this.dashCooldown>0)return;this.landing=false;this.dashTime=FLIGHT.dashDuration;this.dashCooldown=FLIGHT.dashCooldown;this.onEvent('dash');}
 land(){if(this.flying){this.landing=!this.landing;this.onEvent(this.landing?'landing':'takeoff');}}
 clearInput(){this.touch.turn=this.touch.pitch=0;this.touch.flap=this.touch.dive=false;this.onInputClear();this.keys.clear();this.gamepad.turn=0;this.gamepad.pitch=0;this.gamepadActionsArmed=false;}
 home(){this.position.copy(this.nest);this.previous.copy(this.nest);this.heading=this.homeHeading;this.speed=0;this.vertical=0;this.bank=0;this.pitch=0;this.flapStrength=0;this.approachBlend=0;this.flying=false;this.landing=false;this.clearInput();this.diveTime=0;this.dashTime=0;this.dashCooldown=0;this.orbit=0;this.orbitPitch=0;this.peck=0;this.gamepad.turn=0;this.gamepad.pitch=0;this.gamepadActionsArmed=false;this.camera.position.set(this.nest.x+Math.sin(this.heading)*1.1,this.nest.y+.55,this.nest.z+Math.cos(this.heading)*1.1);this.forward.set(-Math.sin(this.heading),0,-Math.cos(this.heading));this.cameraTarget.copy(this.nest).addScaledVector(this.forward,.18);this.cameraTarget.y+=.04;this.bird.position.copy(this.nest);this.bird.rotation.set(0,this.heading,0,'YXZ');this.onEvent('home');}
 update(dt){
  dt=THREE.MathUtils.clamp(dt,0,.05);this.elapsed+=dt;this.dashTime=Math.max(0,this.dashTime-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.peck=Math.max(0,this.peck-dt*2.5);this.previous.copy(this.position);
  const pads=globalThis.navigator?.getGamepads?.(),pad=pads&&Array.from(pads).find(Boolean);
  const dead=v=>{v=THREE.MathUtils.clamp(v||0,-1,1);return Math.abs(v)<.13?0:Math.sign(v)*(Math.abs(v)-.13)/.87;};
  this.gamepad.turn=pad?dead(pad.axes[0]):0;this.gamepad.pitch=pad?-dead(pad.axes[1]):0;
  const buttons=pad?Array.from(pad.buttons,b=>!!b?.pressed):[];
  const justPressed=i=>buttons[i]&&!this.gamepad.buttons[i];
  if(!buttons[1]&&!buttons[2])this.gamepadActionsArmed=true;
  if(buttons[0])this.keys.add('GameFlap');else this.keys.delete('GameFlap');
  if(justPressed(0)&&!this.flying)this.takeoff();
  if(this.gamepadActionsArmed&&justPressed(1))this.onControlAction('dash');
  if(this.gamepadActionsArmed&&justPressed(2))this.onControlAction('interact');
  this.gamepad.buttons=buttons;
  const clampAxis=v=>THREE.MathUtils.clamp(v,-1,1);
  const turn=clampAxis(this.axis('KeyD','KeyA')+this.axis('ArrowRight','ArrowLeft')+this.gamepad.turn+this.touch.turn);
  const climb=clampAxis(this.axis('KeyW','KeyS')+this.axis('ArrowUp','ArrowDown')+this.gamepad.pitch+this.touch.pitch);
  const flap=this.keys.has('Space')||this.keys.has('GameFlap')||this.touch.flap;
  const pitchLimit=this.axis('ArrowUp','ArrowDown')!==0||this.touch.pitch!==0?FLIGHT.fastPitch:FLIGHT.pitch;
  const smoothing=(rate)=>1-Math.exp(-rate*dt);
  this.flapStrength=THREE.MathUtils.lerp(this.flapStrength,flap?1:0,smoothing(6));
  const forcedDive=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||pad?.buttons[7]?.pressed||this.touch.dive;
  this.diveTime=this.flying&&!this.landing&&forcedDive?Math.min(1.4,this.diveTime+dt):Math.max(0,this.diveTime-dt*3);
  const dive=THREE.MathUtils.smoothstep(this.diveTime,.25,1.3);
  // Pigeons cruise with short flapping bursts between long, wings-extended
  // glides. The same pulse gives a small lift impulse; Space remains the
  // stronger, deliberate flap input for takeoff and climbing.
  const beatPhase=this.elapsed%2.65;
  const surfaceHeight=this.map.surface(this.position.x,this.position.z);
  const heightAboveSurface=Math.max(0,this.position.y-surfaceHeight);
  const autoFlap=this.flying&&!this.landing&&!forcedDive&&dive<.08&&heightAboveSurface>24&&beatPhase<1.2?Math.sin(Math.PI*beatPhase/1.2):0;
  if(this.landing&&climb>.35){this.landing=false;this.onEvent('landingCancel');}
  const descendingTowardSurface=this.flying&&this.vertical<-.35&&heightAboveSurface<24&&(surfaceHeight>0||this.map.onLand(this.position.x,this.position.z));
  this.approachBlend=THREE.MathUtils.lerp(this.approachBlend,this.landing||descendingTowardSurface?1:0,smoothing(2.3));
  const cruiseTarget=this.dashTime>0?FLIGHT.dash:THREE.MathUtils.lerp(FLIGHT.cruise,FLIGHT.flap,this.flapStrength);
  const nearSurface=1-THREE.MathUtils.smoothstep(heightAboveSurface,1.5,7);
  const landingTarget=THREE.MathUtils.lerp(FLIGHT.approachSpeed,FLIGHT.landingSpeed,nearSurface);
  const targetSpeed=this.flying?THREE.MathUtils.lerp(cruiseTarget,landingTarget,this.approachBlend):(climb*FLIGHT.walk);
  this.speed=THREE.MathUtils.lerp(this.speed,targetSpeed,smoothing(this.flying?(this.dashTime>0?5:1.7):7));
  this.heading-=turn*FLIGHT.turn*dt*(this.flying?(this.landing?.95:.85):1.9);
  this.bank=THREE.MathUtils.lerp(this.bank,this.flying?-turn*.55:0,smoothing(4.4));
  this.pitch=THREE.MathUtils.lerp(this.pitch,this.flying?(dive>.01?-(.3+dive*(FLIGHT.divePitch-.3)):climb*pitchLimit+(flap?.1:0)):0,smoothing(2.7));
  const landingFall=THREE.MathUtils.lerp(-4,-1.15,nearSurface)+climb*2.2;
  const desiredVertical=this.flying?(this.landing?landingFall:Math.sin(this.pitch)*this.speed+this.flapStrength*16+autoFlap*6-1.7):0;
  this.vertical=THREE.MathUtils.lerp(this.vertical,desiredVertical,smoothing(2.5));
  this.forward.set(-Math.sin(this.heading),0,-Math.cos(this.heading));
  const airborneAtMove=this.flying;
  const dx=this.forward.x*this.speed*dt*(this.flying?Math.max(.09,Math.cos(this.pitch)):1),dz=this.forward.z*this.speed*dt*(this.flying?Math.max(.09,Math.cos(this.pitch)):1),dy=this.vertical*dt;
  // Sweep at 0.4 m resolution: fast flight cannot skip a narrow roof or facade.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy,dz)/.4)),sx=dx/steps,sy=dy/steps,sz=dz/steps;let perched=false;
  const nearbyBuilding=(x,z,atY=this.position.y)=>{
   let nearest=this.map.buildingAt(x,z);
   if(!nearest||nearest.h+BIRD_CLEARANCE<=atY)for(const [ox,oz] of [[BIRD_RADIUS,0],[-BIRD_RADIUS,0],[0,BIRD_RADIUS],[0,-BIRD_RADIUS]]){
    const b=this.map.buildingAt(x+ox,z+oz);if(b&&(!nearest||b.h>nearest.h))nearest=b;
   }
   return nearest;
  };
  for(let i=0;i<steps;i++){
   const px=this.position.x,pz=this.position.z,py=this.position.y,nx=px+sx,nz=pz+sz,ny=py+sy;
   const centerSurface=this.map.surface(nx,nz);
   if(this.flying&&sy<0&&ny<=centerSurface+BIRD_CLEARANCE&&py>=centerSurface+BIRD_CLEARANCE-.05&&(centerSurface>0||this.map.onLand(nx,nz))){
    this.position.set(nx,centerSurface+BIRD_CLEARANCE,nz);this.flying=false;this.landing=false;this.speed=0;this.vertical=0;perched=true;this.onEvent('perch');break;
   }
   const wall=nearbyBuilding(nx,nz,ny);
   if(wall&&ny<wall.h+BIRD_CLEARANCE-.02){
    const xWall=nearbyBuilding(nx,pz,ny),zWall=nearbyBuilding(px,nz,ny);
    const canX=!xWall||ny>=xWall.h+BIRD_CLEARANCE-.02,canZ=!zWall||ny>=zWall.h+BIRD_CLEARANCE-.02;
    if(canX){this.position.set(nx,ny,pz);}else if(canZ){this.position.set(px,ny,nz);}else this.position.y=ny;
    this.speed*=Math.exp(-dt*3/steps);
   }else this.position.set(nx,ny,nz);
  }
  const support=this.map.surface(this.position.x,this.position.z),land=this.map.onLand(this.position.x,this.position.z);
  if(!perched&&this.flying&&this.vertical<=0&&this.position.y<=support+BIRD_CLEARANCE&&(land||support>0)) {
   if(this.previous.y>=support+BIRD_CLEARANCE-.18){this.position.y=support+BIRD_CLEARANCE;this.flying=false;this.landing=false;this.speed=0;this.vertical=0;this.onEvent('perch');}
  }
  if(!this.flying){
   const prevSupport=this.map.surface(this.previous.x,this.previous.z);
   if(!airborneAtMove&&((prevSupport>2&&support<prevSupport-2)||!land)){this.flying=true;this.speed=8;this.vertical=0;this.onEvent('takeoff');}
   else this.position.y=support+BIRD_CLEARANCE;
  }
  if(this.position.y<4&&!land&&support===0){this.position.y=Math.max(2,this.position.y);this.vertical=Math.max(7,this.vertical);this.landing=false;}
  this.position.y=THREE.MathUtils.clamp(this.position.y,BIRD_CLEARANCE,650);
  // Northern edge follows the 59th Street data cut. Ocean exploration stays bounded.
  const lon=this.position.x/84360-74,lat=-this.position.z/110540+40.72;
  if(lat>40.768-(lon+73.981)*.5263-.00025&&this.forward.z<0){this.heading+=dt*.9;this.onEvent('boundary');}
  if(Math.abs(this.position.x)>6500||this.position.z>4000||this.position.z< -5700)this.heading+=dt*.9;
  this.distance+=this.position.distanceTo(this.previous);
  this.bird.position.copy(this.position);this.bird.rotation.set(this.pitch,this.heading,this.bank,'YXZ');
  const animationFlap=Math.max(this.flapStrength,autoFlap),animationGlide=forcedDive||this.landing||(animationFlap<.18);
  const landingPose=this.landing||heightAboveSurface<8&&this.approachBlend>.45;
  this.bird.userData.animate(this.elapsed,this.flying,Math.abs(this.speed),this.peck,{flapStrength:animationFlap,glide:animationGlide,landing:landingPose,dive});
  this.orbit*=Math.exp(-dt*.45);this.orbitPitch*=Math.exp(-dt*.45);
  // Follow translation immediately; lag only the camera arm and the look angle.
  // Otherwise a small pigeon disappears as a fast flight outruns the camera.
  const movement=this.position.clone().sub(this.previous);this.camera.position.add(movement);this.cameraTarget.add(movement);
  const camHeading=this.heading+this.orbit,behind=this.flying?THREE.MathUtils.clamp(2.2+this.speed*.009,2.2,4):THREE.MathUtils.clamp(2+this.speed*.035,2,2.5);
  const diveView=this.flying?THREE.MathUtils.smoothstep(-this.pitch,.15,1.3):0;
  const armLength=behind*(1-diveView*.72),cameraHeight=(this.flying?THREE.MathUtils.clamp(.6+this.speed*.0035,.6,1.3):.65)+diveView*behind*.9;
  this.desiredCamera.set(this.position.x+Math.sin(camHeading)*armLength,this.position.y+cameraHeight+this.orbitPitch,this.position.z+Math.cos(camHeading)*armLength);
  // Shorten camera arm against buildings instead of looking through their walls.
  const arm=this.desiredCamera.clone().sub(this.position);
  for(let i=1;i<=12;i++){const p=this.position.clone().addScaledVector(arm,i/12);if(this.map.surface(p.x,p.z)>p.y-.06){this.desiredCamera.copy(this.position).addScaledVector(arm,Math.max(.15,(i-1)/12));this.desiredCamera.y=this.position.y+Math.max(.65,cameraHeight);break;}}
  this.camera.position.lerp(this.desiredCamera,smoothing(FLIGHT.cameraLag));
  const cameraArm=this.camera.position.clone().sub(this.position);
  for(let i=1;i<=16;i++){const p=this.position.clone().addScaledVector(cameraArm,i/16);if(this.map.surface(p.x,p.z)>p.y-.08){this.camera.position.copy(this.position).addScaledVector(cameraArm,Math.max(.12,(i-1)/16));this.camera.position.y=Math.max(this.camera.position.y,this.position.y+Math.max(.55,cameraHeight));break;}}
  this.look.copy(this.position).addScaledVector(this.forward,this.flying?(.3+this.speed*.001)*(1-diveView*.7):(this.compactView?0:2.5));this.look.y+=(this.flying?.06:(this.compactView?0:.48))-diveView*.35;this.cameraTarget.lerp(this.look,smoothing(this.flying?7:5));this.camera.lookAt(this.cameraTarget);
 }
}
