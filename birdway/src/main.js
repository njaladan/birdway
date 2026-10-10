import * as THREE from '../vendor/three.module.js';
import {loadGeography,geo} from './geography.js';
import {buildCity,box,mesh,rand} from './city.js';
import {makeSky} from './sky.js';
import {makeBird} from './bird.js';
import {Flight} from './flight.js';
import {CityLife} from './life.js';
import {GameInterface} from './interface.js';
import {AmbientAudio} from './audio.js';
const $=id=>document.getElementById(id);
let renderer,scene,camera,map,city,sky,flight,nest,started=false,paused=false,elapsed=0,hours=17.55,autoTime=true,last=0,life,ui,audio=new AmbientAudio();
const toast=(message)=>{ $('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4200);};
async function boot(){
 try{
  renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.15,16000);sky=makeSky(scene);
  $('loading-progress').style.width='10%';map=await loadGeography();$('loading-note').textContent='Opening 20,868 windows onto Manhattan…';
  city=await buildCity(scene,map,p=>$('loading-progress').style.width=`${15+p*65}%`);
  const near=geo(-74.01805,40.709);const home=map.buildings.filter(b=>b.h>65&&b.h<100&&Math.min(b.x1-b.x0,b.z1-b.z0)>12).sort((a,b)=>Math.hypot(a.cx-near.x,a.cz-near.z)-Math.hypot(b.cx-near.x,b.cz-near.z))[0];
  // Choose a point strictly inside the actual roof, including irregular footprints.
  let hx=home.cx,hz=home.cz;
  for(let x=home.x0+7;x<home.x1-7;x+=4){let found=false;for(let z=home.z0+7;z<home.z1-7;z+=4)if(map.buildingAt(x,z)?.id===home.id&&Math.hypot(x-home.cx,z-home.cz)>10){hx=x;hz=z;found=true;break;}if(found)break;}
  if(map.buildingAt(hx,hz)?.id!==home.id){[hx,hz]=home.rings[0][0];hx=(hx+home.cx)/2;hz=(hz+home.cz)/2;}
  nest=new THREE.Vector3(hx,map.surface(hx,hz)+.68,hz);
  const nestGroup=new THREE.Group();nestGroup.position.copy(nest).y-=.52;scene.add(nestGroup);
  mesh(nestGroup,new THREE.TorusGeometry(1.45,.28,8,32),0x8a7554).rotation.x=Math.PI/2;
  mesh(nestGroup,new THREE.CylinderGeometry(1.3,1.5,.12,24),0x9b8960,0,-.04,0);
  for(let i=0;i<30;i++){const a=i*Math.PI*2/30;const twig=box(nestGroup,0x8e7a58,Math.cos(a)*1.35,.05+rand(i)*.12,Math.sin(a)*1.35,.1,.08,.85);twig.rotation.y=-a+rand(i)*.7;}
  const bird=makeBird(1.65);scene.add(bird);flight=new Flight(bird,camera,map,nest);flight.heading=-1.1;flight.cameraTarget.copy(nest);
  life=new CityLife(scene,map,flight,nest,audio,toast);hours=life.save.hours;ui=new GameInterface({life,flight,map,nest,renderer,scene,camera,toast,openModal,closeModal});
  flight.onEvent=event=>{if(event==='perch')toast('A soft landing. Stay a while.');if(event==='landing')toast('Wings tucked. Guide yourself down to a roof or street.');};
  $('loading-progress').style.width='100%';sky.update(hours,0,nest);for(let i=0;i<100;i++)flight.update(.016);renderer.render(scene,camera);
  $('loading').hidden=true;$('welcome').hidden=false;
  installControls();requestAnimationFrame(frame);
 }catch(error){console.error(error);$('loading-note').textContent=error.message;$('loading-progress').style.width='0';}
}
function installControls(){
 $('begin').onclick=async()=>{started=true;$('welcome').hidden=true;for(const id of ['outing','map-wrap','flight-hud'])$(id).hidden=false;try{await audio.start();updateAudio();}catch{toast('Sound is unavailable in this browser. You can still explore.');}toast('Welcome home, little bird. Press Space to catch the breeze.');};
 $('audio-button').onclick=async()=>{try{await audio.toggle();updateAudio();}catch{toast('Your browser could not start the audio.');}};
 $('pause-button').onclick=()=>{paused=!paused;$('pause-button').textContent=paused?'▶':'Ⅱ';};
 $('close-modal').onclick=closeModal;$('modal-shade').onclick=e=>{if(e.target===$('modal-shade'))closeModal();};
 $('settings-button').onclick=settings;$('album-button').onclick=()=>ui.album();$('map-button').onclick=()=>ui.mapDialog();
 $('journal-button').onclick=()=>ui.journal();
 addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code))e.preventDefault();
  if(e.code==='Escape'){if(!$('modal-shade').hidden)closeModal();else if(started){paused=!paused;$('pause-button').textContent=paused?'▶':'Ⅱ';}return;}
  if(!started||!$('modal-shade').hidden||paused)return;
  flight.keys.add(e.code);if(e.repeat)return;
  if(e.code==='Space')flight.takeoff();if(e.code==='KeyE')life.interact();if(e.code==='KeyP')life.peck();if(e.code==='KeyQ')life.coo();if(e.code==='KeyC')ui.photo();if(e.code==='Tab')ui.mapDialog();if(e.code==='KeyH'){flight.home();toast('Back to your little corner of the city.');}
  if(e.code==='KeyM')$('audio-button').click();if(e.code==='KeyB')$('album-button').click();if(e.code==='KeyJ')$('journal-button').click();
 });
 addEventListener('keyup',e=>flight.keys.delete(e.code));addEventListener('blur',()=>{flight.keys.clear();});addEventListener('pagehide',()=>life.persist());
 document.addEventListener('visibilitychange',()=>{flight.keys.clear();if(audio.ctx&&audio.enabled){if(document.hidden)audio.ctx.suspend();else audio.ctx.resume();}});
 let dragging=false,px=0,py=0;$('world').addEventListener('pointerdown',e=>{dragging=true;px=e.clientX;py=e.clientY;$('world').setPointerCapture(e.pointerId);});$('world').addEventListener('pointermove',e=>{if(dragging){flight.orbit-=(e.clientX-px)*.005;flight.orbitPitch=THREE.MathUtils.clamp(flight.orbitPitch+(e.clientY-py)*.05,-3,15);px=e.clientX;py=e.clientY;}});$('world').addEventListener('pointerup',()=>dragging=false);
 addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}
function updateAudio(){$('audio-label').textContent=audio.enabled?'on':'off';$('audio-button').setAttribute('aria-pressed',String(audio.enabled));}
function openModal(title,kicker,html){paused=true;flight.keys.clear();$('modal-title').textContent=title;$('modal-kicker').textContent=kicker;$('modal-content').innerHTML=html;$('modal-shade').hidden=false;$('close-modal').focus();}
function closeModal(){$('modal-shade').hidden=true;paused=false;$('pause-button').textContent='Ⅱ';}
function settings(){openModal('Make yourself comfortable','YOUR OWN PACE',`<div class="settings-row"><label for="time-slider">Time of day<small>Watch the city turn gold, then glow.</small></label><input id="time-slider" type="range" min="0" max="23.99" step=".01" value="${hours}"></div><div class="settings-row"><label for="cycle">Day / night cycle<small>One unhurried day takes 24 minutes.</small></label><input id="cycle" type="checkbox" ${autoTime?'checked':''}></div><div class="settings-row"><label for="volume">Ambient sound<small>An original, gentle city soundtrack.</small></label><input id="volume" type="range" min="0" max="1" step=".01" value="${audio.volume}"></div><div class="settings-row"><label for="quality">Rendering quality<small>Balanced is recommended for an M1 Mac.</small></label><select id="quality"><option value="1.5">Balanced</option><option value="1">Light</option><option value="2">High</option></select></div><p>Mouse drag looks around. Headphones feel lovely. Keyboard or a gamepad is recommended.</p>`);$('time-slider').oninput=e=>hours=+e.target.value;$('cycle').onchange=e=>autoTime=e.target.checked;$('volume').oninput=e=>audio.setVolume(+e.target.value);$('quality').onchange=e=>renderer.setPixelRatio(Math.min(devicePixelRatio,+e.target.value));}
function drawMinimap(){const canvas=$('minimap'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,p=flight.position,scale=.095;ctx.clearRect(0,0,w,h);ctx.fillStyle='#becfc4';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.translate(-p.x,-p.z);
 for(const land of map.land){ctx.beginPath();for(const ring of land.rings){ring.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();}ctx.fillStyle='#e2e3ce';ctx.fill('evenodd');}
 ctx.strokeStyle='#c4c9b6';ctx.lineWidth=9;ctx.beginPath();for(const s of map.streets){if(s.points.some(v=>Math.abs(v[0]-p.x)<1300&&Math.abs(v[1]-p.z)<1100)){s.points.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));}}ctx.stroke();
 for(const b of map.buildings){if(Math.abs(b.cx-p.x)<1300&&Math.abs(b.cz-p.z)<1100){ctx.beginPath();b.rings[0].forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.fillStyle='#c3c7b2';ctx.fill();}}
 ctx.fillStyle='#ac8d54';ctx.beginPath();ctx.arc(nest.x,nest.z,28,0,Math.PI*2);ctx.fill();ctx.restore();ctx.save();ctx.translate(w/2,h/2);ctx.rotate(-flight.heading);ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(-4,5);ctx.lineTo(0,2);ctx.lineTo(4,5);ctx.closePath();ctx.fillStyle='#445f46';ctx.fill();ctx.restore();}
function frame(time){requestAnimationFrame(frame);const dt=Math.min((time-last)/1000||.016,.035);last=time;if(document.hidden)return;
 if(started&&!paused){elapsed+=dt;if(autoTime)hours=(hours+dt/60)%24;flight.update(dt);life.update(dt);life.save.hours=hours;}
 const light=sky.update(hours,elapsed,flight.position);city.night.value=light.night;
 renderer.render(scene,camera);
 
 if(started){$('mode').textContent=flight.flying?(flight.landing?'COMING TO REST':'ON THE BREEZE'):'A LITTLE WADDLE';$('altitude').textContent=`${Math.round(flight.position.y)} m`;const hh=Math.floor(hours),mm=Math.floor((hours-hh)*60);$('clock').textContent=`${hh%12||12}:${String(mm).padStart(2,'0')} ${hh>=12?'PM':'AM'}`;ui.update();if(Math.floor(time/150)!==frame.mapTick){frame.mapTick=Math.floor(time/150);drawMinimap();ui.mapMarkers($('minimap'),.095,flight.position);}}
}
window.birdwayState=()=>life?({position:flight.position.toArray(),flying:flight.flying,food:life.save.food,carried:life.save.carried,visited:[...life.save.visited],friends:life.friends,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles}):null;
boot();
