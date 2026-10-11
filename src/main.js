import * as THREE from '../vendor/three.module.js';
import {loadGeography,geo} from './geography.js';
import {buildCity,box,mesh,rand} from './city.js';
import {makeSky} from './sky.js';
import {makeBird,loadBirdModel} from './bird.js';
import {Flight,BIRD_CLEARANCE} from './flight.js';
import {CityLife} from './life.js';
import {GameInterface} from './interface.js';
import {TouchControls} from './touch-controls.js';
import {AmbientAudio} from './audio.js';
import {loadParks} from './parks.js';
import {makeEnvironment} from './environment.js';
import {loadFacadeTextures} from './facades.js';
import {buildWaterfront} from './waterfront.js';
import {makeBoats} from './boats.js';
import {loadTraffic,TrafficWorld} from './traffic.js';
import {roadWidth} from './traffic-network.js';
const $=id=>document.getElementById(id);
const touchDevice=matchMedia('(any-pointer: coarse)').matches||navigator.maxTouchPoints>0;
let touchEnabled=touchDevice;
document.body.classList.toggle('touch-enabled',touchEnabled);
let renderer,scene,camera,map,city,sky,environment,waterfront,boats,traffic,flight,nest,started=false,paused=false,elapsed=0,hours=17.55,autoTime=true,dayLength=24,last=0,life,ui,audio=new AmbientAudio(),qualityMode='balanced',perfWindow=0,perfFrames=0,slowFrames=0,fastWindows=0;
const toast=(message)=>{ $('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4200);};
async function boot(){
 try{
  renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:false,alpha:false,logarithmicDepthBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1:1.25));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.userData={waterReflections:false};
  renderer.shadowMap.enabled=!touchDevice;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.08,16000);sky=makeSky(scene);environment=makeEnvironment(renderer,scene,sky);
  $('loading-progress').style.width='10%';map=await loadGeography();sky.setGeography(map.land);boats=makeBoats(scene,map);await loadBirdModel();$('loading-note').textContent=`Opening ${map.buildings.length.toLocaleString()} rooftops across the Hudson…`;
  const [parkData,trafficBundle]=await Promise.all([loadParks(map.jerseyCity),loadTraffic(),loadFacadeTextures()]);
  // Current directed OSM roads also supply the asphalt under the traffic graph.
  map.streets=[...trafficBundle.data.roads.map(r=>({name:r.name,points:r.points,width:roadWidth(r)})),...map.jerseyCity.streets];
  city=await buildCity(scene,map,p=>$('loading-progress').style.width=`${15+p*65}%`);
  city.root.traverse(o=>{if(o.isMesh){o.receiveShadow=true;if(o.userData.distant)o.castShadow=false;else if(o.material.depthWrite!==false)o.castShadow=true;}});
  waterfront=buildWaterfront(scene,map,parkData);
  const near=geo(-74.01805,40.709);const home=map.buildings.filter(b=>b.h>120&&b.h<170&&Math.min(b.x1-b.x0,b.z1-b.z0)>12).sort((a,b)=>Math.hypot(a.cx-near.x,a.cz-near.z)-Math.hypot(b.cx-near.x,b.cz-near.z))[0];
  // Choose a point strictly inside the actual roof, including irregular footprints.
  let hx=home.cx,hz=home.cz;
  let roofFound=false;
  for(let x=home.x0+3;x<home.x1-3&&!roofFound;x+=2)for(let z=home.z0+3;z<home.z1-3;z+=2){
   const hit=map.buildingAt(x,z);if(hit?.id!==home.id||hit.h<home.h-18)continue;
   if([[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>Math.abs(map.surface(x+dx,z+dz)-hit.h)<.4)){hx=x;hz=z;roofFound=true;break;}
  }
  if(map.buildingAt(hx,hz)?.id!==home.id){[hx,hz]=home.rings[0][0];hx=(hx+home.cx)/2;hz=(hz+home.cz)/2;}
  nest=new THREE.Vector3(hx,map.surface(hx,hz)+BIRD_CLEARANCE,hz);
  const nestGroup=new THREE.Group();nestGroup.position.copy(nest).y-=BIRD_CLEARANCE-.045;scene.add(nestGroup);
  mesh(nestGroup,new THREE.TorusGeometry(.18,.03,8,32),0x8a7554).rotation.x=Math.PI/2;
  mesh(nestGroup,new THREE.CylinderGeometry(.17,.20,.018,24),0x9b8960,0,-.025,0);
  for(let i=0;i<30;i++){const a=i*Math.PI*2/30;const twig=box(nestGroup,0x8e7a58,Math.cos(a)*.17,.01+rand(i)*.015,Math.sin(a)*.17,.01,.008,.085);twig.rotation.y=-a+rand(i)*.7;}
  const bird=makeBird();scene.add(bird);flight=new Flight(bird,camera,map,nest);flight.heading=flight.homeHeading=1.45;flight.cameraTarget.copy(nest);
  life=new CityLife(scene,map,flight,nest,audio,toast,parkData);hours=life.save.hours;traffic=new TrafficWorld(scene,map,flight,trafficBundle);ui=new GameInterface({life,flight,map,nest,renderer,scene,camera,toast,openModal,closeModal});
  flight.onEvent=event=>{if(event==='dash')toast('A quick beat of the wings.');if(event==='perch')toast(flight.vehicleSupport?'A moving perch. Ride along, or press Space to fly.':'A soft landing. Stay a while.');if(event==='landing')toast('An easy approach. Guide yourself down to a roof or street.');};
  flight.onControlAction=action=>{if(!started||paused||!$('modal-shade').hidden)return;if(action==='dash')flight.dash();if(action==='interact')life.interact();};
  $('loading-progress').style.width='100%';const initialLight=sky.update(hours,0,nest);city.night.value=initialLight.night;environment.update(hours);city.update(nest,renderer.getPixelRatio());life.update(0);traffic.update(0,nest,initialLight.night,hours);waterfront.update(nest,initialLight.night);for(let i=0;i<100;i++)flight.update(.016);renderer.render(scene,camera);
  $('loading').hidden=true;$('welcome').hidden=false;
  installControls();requestAnimationFrame(frame);
 }catch(error){console.error(error);$('loading-note').textContent=error.message;$('loading-progress').style.width='0';}
}
function syncTouch(){
 if(flight)flight.compactView=touchEnabled&&innerWidth<innerHeight;
 document.body.classList.toggle('touch-enabled',touchEnabled);
 if(touchEnabled)$('pause-button').textContent=paused?'Play':'Pause';
 document.body.classList.toggle('touch-paused',paused);
 $('touch-controls').hidden=!touchEnabled||!started||!$('modal-shade').hidden;
}
function installControls(){
 new TouchControls({flight,root:$('touch-controls'),stick:$('touch-stick'),knob:$('touch-knob'),canPlay:()=>started&&!paused&&$('modal-shade').hidden,onAction:action=>flight.onControlAction(action)});
 addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!touchEnabled){touchEnabled=true;syncTouch();}}, {capture:true});
 $('touch-more').onclick=()=>{
  openModal('Take a little pause','BIRDWAY · YOUR OWN PACE',`<p id="touch-status"></p><p id="touch-goal"></p><p id="touch-nearby"></p><div class="touch-menu"><button data-action="guide">Field guide</button><button data-action="album">Scrapbook</button><button data-action="map">City map</button><button data-action="home">Return to your nest</button><button data-action="photo">Keep a photograph</button><button data-action="settings">Settings & sound</button><button data-action="peck">Peck / eat a snack</button><button data-action="coo">A little coo</button><button data-action="sound">Sound: ${audio.enabled?'on':'off'}</button></div><div class="settings-row"><label for="extra-flight">Extra flight buttons<small>Show Dash and Dive while exploring.</small></label><input id="extra-flight" type="checkbox" ${document.body.classList.contains('touch-advanced')?'checked':''}></div><details><summary>Touch controls</summary><p>Drag the left pad to steer and climb, or walk on a ledge. Hold Flap to take off and rise. Land starts or cancels an approach; Explore picks up or shares a find. Drag the scenery to look around. Enable extra flight buttons above to dash or hold Dive for a steep descent. Close this menu to resume.</p></details>`);
  $('touch-status').textContent=`${$('district').textContent} · ${$('clock').textContent} · ${$('altitude').textContent} · ${$('bag').textContent}`;
  $('touch-goal').textContent=`${$('intention').textContent} ${$('intention-detail').textContent}`;
  $('touch-nearby').textContent=$('context').hidden?'':`${$('context-title').textContent} — ${$('context-detail').textContent} Tap Explore when you resume.`;
  $('extra-flight').onchange=e=>document.body.classList.toggle('touch-advanced',e.target.checked);
  for(const b of $('modal-content').querySelectorAll('[data-action]'))b.onclick=()=>{
   const action=b.dataset.action;
   if(action==='guide'){ui.journal();return;}if(action==='album'){ui.album();return;}if(action==='map'){ui.mapDialog();return;}if(action==='settings'){settings();return;}if(action==='sound'){closeModal();$('audio-button').click();return;}
   closeModal();if(action==='photo')ui.photo();if(action==='peck')life.peck();if(action==='coo')life.coo();if(action==='home'){flight.home();toast('Back to your little corner of the city.');}
  };
 };
 $('context').onclick=()=>{if(started&&!paused)life.interact();};
 $('begin').onclick=async()=>{started=true;$('welcome').hidden=true;for(const id of ['outing','map-wrap','flight-hud'])$(id).hidden=false;syncTouch();try{await audio.start();updateAudio();}catch{toast('Sound is unavailable in this browser. You can still explore.');}toast(touchEnabled?'Welcome home, little bird. Hold Flap to catch the breeze.':'Welcome home, little bird. Press Space to catch the breeze.');};
 $('audio-button').onclick=async()=>{try{await audio.toggle();updateAudio();}catch{toast('Your browser could not start the audio.');}};
 $('pause-button').onclick=()=>{paused=!paused;if(paused)flight.clearInput();$('pause-button').textContent=paused?'▶':'Ⅱ';$('pause-button').setAttribute('aria-label',paused?'Resume game':'Pause game');syncTouch();};
 $('close-modal').onclick=closeModal;$('modal-shade').onclick=e=>{if(e.target===$('modal-shade'))closeModal();};
 $('settings-button').onclick=settings;$('album-button').onclick=()=>ui.album();$('map-button').onclick=()=>ui.mapDialog();
 $('journal-button').onclick=()=>ui.journal();
 addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'){if(!$('modal-shade').hidden)closeModal();else if(started){paused=!paused;if(paused)flight.clearInput();$('pause-button').textContent=paused?'▶':'Ⅱ';$('pause-button').setAttribute('aria-label',paused?'Resume game':'Pause game');syncTouch();}return;}
  if(!started||!$('modal-shade').hidden||paused)return;
  flight.keys.add(e.code);if(e.repeat)return;
  if(e.code==='Space')flight.takeoff();if(e.code==='KeyF')flight.dash();if(e.code==='KeyT'){const presets=[8,13,17.65,22];hours=presets.find(h=>h>hours+.1)||presets[0];autoTime=false;toast('A different light. Time is held; resume the cycle in Settings.');}if(e.code==='BracketLeft'||e.code==='BracketRight'){hours=(hours+(e.code==='BracketRight'?1:23))%24;autoTime=false;}if(e.code==='KeyE')life.interact();if(e.code==='KeyP')life.peck();if(e.code==='KeyQ')life.coo();if(e.code==='KeyC')ui.photo();if(e.code==='Tab')ui.mapDialog();if(e.code==='KeyH'){flight.home();toast('Back to your little corner of the city.');}
  if(e.code==='KeyM')$('audio-button').click();if(e.code==='KeyB')$('album-button').click();if(e.code==='KeyJ')$('journal-button').click();
 });
 addEventListener('keyup',e=>flight.keys.delete(e.code));addEventListener('blur',()=>flight.clearInput());addEventListener('pagehide',()=>life.persist());
 document.addEventListener('visibilitychange',()=>{flight.clearInput();if(audio.ctx&&audio.enabled){if(document.hidden)audio.ctx.suspend();else audio.ctx.resume();}});
 let dragPointer=null,px=0,py=0;
 const resetTouch=flight.onInputClear;flight.onInputClear=()=>{resetTouch();dragPointer=null;};
 $('world').addEventListener('pointerdown',e=>{if(!started||paused||dragPointer!==null||e.button!==0)return;e.preventDefault();dragPointer=e.pointerId;px=e.clientX;py=e.clientY;$('world').setPointerCapture(e.pointerId);});
 $('world').addEventListener('pointermove',e=>{if(e.pointerId===dragPointer&&started&&!paused){flight.orbit-=(e.clientX-px)*.005;flight.orbitPitch=THREE.MathUtils.clamp(flight.orbitPitch+(e.clientY-py)*.05,-3,15);px=e.clientX;py=e.clientY;}});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])$('world').addEventListener(event,e=>{if(e.pointerId===dragPointer)dragPointer=null;});
 addEventListener('blur',()=>dragPointer=null);document.addEventListener('visibilitychange',()=>dragPointer=null);
 $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;flight.clearInput();syncTouch();toast('The graphics context paused. Reload to return to your saved nest.');});
 addEventListener('resize',()=>{syncTouch();camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}
function updateAudio(){$('audio-label').textContent=audio.enabled?'on':'off';$('audio-button').setAttribute('aria-pressed',String(audio.enabled));}
function openModal(title,kicker,html){paused=true;flight.clearInput();$('modal-title').textContent=title;$('modal-kicker').textContent=kicker;$('modal-content').innerHTML=html;$('modal-shade').hidden=false;$('close-modal').focus();syncTouch();}
function closeModal(){$('modal-shade').hidden=true;paused=false;$('pause-button').textContent='Ⅱ';$('pause-button').setAttribute('aria-label','Pause game');syncTouch();}
function settings(){openModal('Make yourself comfortable','YOUR OWN PACE',`<div class="settings-row"><label for="time-slider">Time of day<small>Watch the city turn gold, then glow.</small></label><input id="time-slider" type="range" min="0" max="23.99" step=".01" value="${hours}"></div><div class="time-presets"><button data-time="8">Morning</button><button data-time="13">Daylight</button><button data-time="17.65">Golden hour</button><button data-time="22">Night</button></div><div class="settings-row"><label for="day-length">Day length<small>Choose a quicker cycle to explore the light.</small></label><input id="day-length" type="range" min="1" max="60" step="1" value="${dayLength}"><span id="day-length-label">${dayLength} min</span></div><div class="settings-row"><label for="cycle">Day / night cycle<small>Hold the light still, or let the day drift by.</small></label><input id="cycle" type="checkbox" ${autoTime?'checked':''}></div><div class="settings-row"><label for="volume">Ambient sound<small>An original, gentle city soundtrack.</small></label><input id="volume" type="range" min="0" max="1" step=".01" value="${audio.volume}"></div><div class="settings-row"><label for="quality">Rendering quality<small>Light uses fewer pixels and no shadows; try it on a phone.</small></label><select id="quality"><option value="1.25">Balanced</option><option value="1">Light</option><option value="2">High</option></select></div><p>Drag the view to look around with a mouse or finger. Touch controls appear on touch screens; keyboard and gamepad also work.</p>`);$('time-slider').oninput=e=>{hours=+e.target.value;autoTime=false;$('cycle').checked=false;};for(const b of $('modal-content').querySelectorAll('[data-time]'))b.onclick=()=>{hours=+b.dataset.time;autoTime=false;$('time-slider').value=hours;$('cycle').checked=false;};$('day-length').oninput=e=>{dayLength=+e.target.value;$('day-length-label').textContent=dayLength+' min';};$('cycle').onchange=e=>autoTime=e.target.checked;$('volume').oninput=e=>audio.setVolume(+e.target.value);$('quality').value=qualityMode==='high'?'2':qualityMode==='light'?'1':'1.25';$('quality').onchange=e=>{const quality=+e.target.value;qualityMode=quality===1.25?'balanced':quality===1?'light':'high';renderer.setPixelRatio(Math.min(devicePixelRatio,quality));renderer.shadowMap.enabled=quality>1;renderer.userData.waterReflections=quality>1.5;perfWindow=perfFrames=slowFrames=fastWindows=0;};}
const trafficDay=['sunday','weekday','weekday','weekday','weekday','weekday','saturday'][new Date().getDay()];
let minimapAtlas;
function drawMinimap(){
 const canvas=$('minimap'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,p=flight.position,scale=.095;
 // Geography is static. Rasterize it once; each HUD refresh only crops the
 // local view instead of visiting every footprint and repainting thousands.
 if(!minimapAtlas){
  const image=document.createElement('canvas'),worldScale=.19,x0=-6500,z0=-5700;
  image.width=Math.ceil(13000*worldScale);image.height=Math.ceil(9700*worldScale);
  const base=image.getContext('2d');base.fillStyle='#becfc4';base.fillRect(0,0,image.width,image.height);
  base.scale(worldScale,worldScale);base.translate(-x0,-z0);
  base.fillStyle='#e2e3ce';for(const land of map.land){base.beginPath();for(const ring of land.rings){ring.forEach((v,i)=>i?base.lineTo(...v):base.moveTo(...v));base.closePath();}base.fill('evenodd');}
  base.strokeStyle='#c4c9b6';base.lineWidth=9;base.beginPath();for(const street of map.streets)street.points.forEach((v,i)=>i?base.lineTo(...v):base.moveTo(...v));base.stroke();
  base.fillStyle='#c3c7b2';base.beginPath();for(const b of map.buildings){b.rings[0].forEach((v,i)=>i?base.lineTo(...v):base.moveTo(...v));base.closePath();}base.fill();
  minimapAtlas={image,x0,z0,worldScale};
 }
 const atlas=minimapAtlas,sw=w/scale*atlas.worldScale,sh=h/scale*atlas.worldScale;
 ctx.fillStyle='#becfc4';ctx.fillRect(0,0,w,h);
 ctx.drawImage(atlas.image,(p.x-atlas.x0)*atlas.worldScale-sw/2,(p.z-atlas.z0)*atlas.worldScale-sh/2,sw,sh,0,0,w,h);
 ctx.fillStyle='#ac8d54';ctx.beginPath();ctx.arc(w/2+(nest.x-p.x)*scale,h/2+(nest.z-p.z)*scale,28*scale,0,Math.PI*2);ctx.fill();
 ctx.save();ctx.translate(w/2,h/2);ctx.rotate(-flight.heading);ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-4,5);ctx.lineTo(0,2);ctx.lineTo(4,5);ctx.closePath();ctx.fillStyle='#445f46';ctx.fill();ctx.restore();
}
function frame(time){requestAnimationFrame(frame);const frameSeconds=(time-last)/1000||.016,dt=Math.min(frameSeconds,.035);last=time;if(document.hidden)return;
 if(qualityMode==='balanced'){
  perfWindow+=frameSeconds;perfFrames++;if(frameSeconds>.033)slowFrames++;
  if(perfWindow>=1){const slowRatio=slowFrames/perfFrames,current=renderer.getPixelRatio(),ceiling=Math.min(devicePixelRatio,touchDevice?1:1.25);
   if(slowRatio>.55&&current>.8){renderer.setPixelRatio(Math.max(.8,Math.round((current-.1)*10)/10));fastWindows=0;}
   else if(slowRatio<.08){fastWindows++;if(fastWindows>=5&&current<ceiling){renderer.setPixelRatio(Math.min(ceiling,Math.round((current+.1)*10)/10));fastWindows=0;}}
   else fastWindows=0;
   perfWindow=perfFrames=slowFrames=0;
  }
 }
 if(started&&!paused){elapsed+=dt;if(autoTime)hours=(hours+dt*24/(dayLength*60))%24;traffic.update(dt,flight.position,city.night.value,hours,trafficDay);flight.update(dt);life.update(dt);life.save.hours=hours;}
 const light=sky.update(hours,elapsed,flight.position);city.night.value=light.night;environment.update(hours);city.update(flight.position,renderer.getPixelRatio());waterfront.update(flight.position,light.night);
 boats.update(started&&!paused?dt:0,flight.position,light.night);
 if(!started||paused)traffic.update(0,flight.position,light.night,hours,trafficDay);
 renderer.render(scene,camera);
 
 if(started){$('mode').textContent=flight.flying?(flight.landing?'COMING TO REST':'ON THE BREEZE'):flight.vehicleSupport?'RIDING THROUGH THE CITY':'A LITTLE WADDLE';$('altitude').textContent=`${Math.round(flight.position.y)} m`;if(touchEnabled)$('touch-interact').textContent=flight.flying?(flight.landing?'Cancel land':'Land'):'Explore';const hh=Math.floor(hours),mm=Math.floor((hours-hh)*60);$('clock').textContent=`${hh%12||12}:${String(mm).padStart(2,'0')} ${hh>=12?'PM':'AM'}`;ui.update();if(!touchEnabled&&Math.floor(time/150)!==frame.mapTick){frame.mapTick=Math.floor(time/150);drawMinimap();ui.mapMarkers($('minimap'),.095,flight.position);}}
}
window.birdwayState=()=>life?({position:flight.position.toArray(),camera:camera.position.toArray(),speed:flight.speed,pitch:flight.pitch,touch:{...flight.touch},birdBounds:new THREE.Box3().setFromObject(flight.bird,true).getSize(new THREE.Vector3()).toArray(),birdScreen:flight.position.clone().project(camera).toArray(),flying:flight.flying,pixelRatio:renderer.getPixelRatio(),quality:qualityMode,food:life.save.food,carried:life.save.carried,visited:[...life.save.visited],friends:life.friends,traffic:traffic?.snapshot(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles}):null;
boot();
