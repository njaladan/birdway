// Deterministic controller regression checks using a flat synthetic map and gamepad.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {Flight,FLIGHT,BIRD_CLEARANCE} from '../src/flight.js';
import {loadBirdModel,makeBird} from '../src/bird.js';

let pad=null,obstacles=[];
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Node.js flight test',getGamepads:()=>pad?[pad]:[]}});
const buildingAt=(x,z)=>obstacles.find(b=>x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1)||null;
const map={surface:(x,z)=>buildingAt(x,z)?.h||0,buildingAt,onLand:()=>false};
function create(y=100){
 const bird=new THREE.Group();bird.userData.animate=()=>{};
 const camera=new THREE.PerspectiveCamera(58,1,.08,16000);
 const flight=new Flight(bird,camera,map,new THREE.Vector3(0,y,0));
 flight.flying=true;flight.cameraTarget.copy(flight.position);
 return {flight,camera,bird};
}
function run(flight,frames=120){for(let i=0;i<frames;i++)flight.update(1/60);}

// Cruise, glide and dash targets stay stable high above the map.
const high=create(300);run(high.flight,240);assert.ok(Math.abs(high.flight.speed-FLIGHT.cruise)<.2);
high.flight.keys.add('ShiftLeft');run(high.flight,240);assert.ok(Math.abs(high.flight.speed-FLIGHT.glide)<.2);
high.flight.keys.clear();high.flight.dash();run(high.flight,30);assert.ok(Math.abs(high.flight.speed-FLIGHT.dash)<3);
const brake=create(300);brake.flight.keys.add('AltLeft');run(brake.flight,240);
assert.ok(Math.abs(brake.flight.speed-FLIGHT.brake)<.2,'Alt should settle into low-speed precision flight');
assert.ok(brake.flight.vertical>-.6,'airbraking should not force a dive');
const cruise=create(300),cruiseHeight=cruise.flight.position.y;run(cruise.flight,480);
assert.ok(Math.abs(cruise.flight.position.y-cruiseHeight)<2,'automatic cruise wingbeats support level flight without a continual climb');

// Takeoff adds no position or velocity impulse; flap lift grows over several frames.
const takeoffSmooth=create(10);const startY=takeoffSmooth.flight.position.y;
takeoffSmooth.flight.takeoff();assert.equal(takeoffSmooth.flight.position.y,startY);assert.equal(takeoffSmooth.flight.vertical,0);
takeoffSmooth.flight.keys.add('Space');takeoffSmooth.flight.update(1/60);
assert.ok(Math.abs(takeoffSmooth.flight.position.y-startY)<.03);assert.ok(takeoffSmooth.flight.vertical<1,'first flap frame should accelerate gently');
run(takeoffSmooth.flight,75);assert.ok(takeoffSmooth.flight.position.y>startY+1,'a held flap builds lift over time');

// Descending near a surface automatically eases speed; landing mode flares gently.
const approach=create(14);approach.flight.vertical=-5;approach.flight.speed=35;run(approach.flight,45);
assert.ok(approach.flight.speed<27,'a low descending approach automatically slows the bird');
map.onLand=()=>true;const flare=create(5);flare.flight.vertical=-3;flare.flight.speed=20;flare.flight.landing=true;run(flare.flight,240);
assert.equal(flare.flight.flying,false,'landing approach settles onto the surface');
assert.ok(flare.flight.speed<10,'landing mode reaches a precise low speed');assert.ok(flare.flight.vertical> -2,'landing flare reduces descent near the surface');map.onLand=()=>false;

// Ground control is brisk and the camera looks toward the horizon ahead.
map.onLand=()=>true;const walking=create(BIRD_CLEARANCE);walking.flight.flying=false;walking.flight.keys.add('KeyW');run(walking.flight,240);
assert.ok(Math.abs(walking.flight.speed-FLIGHT.walk)<.2);walking.camera.updateMatrixWorld();
const cameraForward=walking.camera.getWorldDirection(new THREE.Vector3());
assert.ok(cameraForward.dot(walking.flight.forward)>.9,'walking camera should look ahead, nearly level');
const footScreenY=walking.flight.position.clone().project(walking.camera).y;
assert.ok(footScreenY>-.8,'the bird remains visible above the lower HUD while walking');map.onLand=()=>false;

// The rig plays an amplified Walk clip with an obvious leg cycle and body bob.
globalThis.fetch=async()=>new Response(await readFile(new URL('../assets/pigeon/pigeon.glb',import.meta.url)));
await loadBirdModel();const gaitBird=makeBird();gaitBird.position.set(0,0,0);gaitBird.userData.animate(.1,false,FLIGHT.walk,0);
const model=gaitBird.children[0],leftLeg=model.getObjectByName('left-upper-leg-bone'),rightLeg=model.getObjectByName('right-upper-leg-bone'),leftKnee=model.getObjectByName('left-lower-leg-bone'),rightKnee=model.getObjectByName('right-lower-leg-bone'),firstLeg=leftLeg.quaternion.clone(),firstBob=model.position.y;
gaitBird.userData.animate(.2,false,FLIGHT.walk,0);
assert.equal(gaitBird.userData.animationName,'Walk');assert.ok(gaitBird.userData.walkPhase>0);
assert.ok(model.position.y>firstBob,'walking gait visibly bobs the body without moving the player origin');assert.ok(leftLeg.quaternion.angleTo(firstLeg)>.03,'walking gait moves the legs');
assert.ok(leftLeg.quaternion.angleTo(rightLeg.quaternion)>.05,'walking legs alternate instead of stepping in sync');
assert.ok(leftKnee.quaternion.angleTo(rightKnee.quaternion)>.05,'walking knees bend on alternating footfalls');
const wingSpan=()=>{
 model.updateMatrixWorld(true);
 return Math.abs(model.getObjectByName('left-wing-2').getWorldPosition(new THREE.Vector3()).x-model.getObjectByName('right-wing-2').getWorldPosition(new THREE.Vector3()).x);
};
gaitBird.userData.animate(.3,false,0,0);const foldedSpan=wingSpan(),tail=model.getObjectByName('tail-bone-1'),foldedTail=tail.scale.x;
gaitBird.userData.animate(.5,true,35,0,{flapStrength:0,glide:true});const glideSpan=wingSpan(),glideTail=tail.scale.x;
assert.equal(gaitBird.userData.animationName,'Glide');assert.equal(gaitBird.userData.flightPose,'glide');
assert.ok(glideSpan>foldedSpan*1.35,'gliding wings extend beyond the folded walking pose');
assert.ok(glideTail>foldedTail*1.3,'resting tail feathers tuck closer than the gliding tail');
gaitBird.userData.animate(.8,true,35,0,{flapStrength:1,glide:false});
assert.equal(gaitBird.userData.animationName,'Flight');assert.equal(gaitBird.userData.flightPose,'flap','Space-style input selects the flap cycle');
const flightTail=tail.scale.x;
gaitBird.userData.animate(1.1,true,8,0,{flapStrength:0,glide:true,landing:true});
assert.equal(gaitBird.userData.animationName,'Flare');assert.equal(gaitBird.userData.flightPose,'flare');
assert.ok(tail.scale.x>flightTail,'landing flare opens the tail after the tucked glide');

const periodicBird=makeBird(),periodicFlight=new Flight(periodicBird,new THREE.PerspectiveCamera(),map,new THREE.Vector3(0,300,0));periodicFlight.flying=true;
const cruisePos=periodicFlight.position.clone(),poses=new Set();
for(let i=0;i<480;i++){periodicFlight.update(1/60);poses.add(periodicBird.userData.animationName);}
assert.ok(poses.has('Flight')&&poses.has('Glide'),'ordinary cruise alternates wingbeat bursts with extended-wing glides');
assert.ok(Math.abs(periodicFlight.position.y-cruisePos.y)<2,'alternating flaps and glides retain nearly level cruise height');

// S descends at a mild pitch; only holding Ctrl builds a deliberate steep dive.
const controls=create(300);controls.flight.keys.add('KeyS');run(controls.flight,60);
assert.equal(controls.flight.diveTime,0);assert.ok(controls.flight.pitch>-.6,'S must not force a steep dive');
controls.flight.keys.delete('KeyS');controls.flight.keys.add('ControlLeft');run(controls.flight,70);
assert.ok(controls.flight.diveTime>.9);assert.ok(controls.flight.pitch<-.8,'Ctrl should produce a deliberate steep dive');
const speedAtDive=controls.flight.speed;assert.ok(speedAtDive<FLIGHT.dash,'diving alone must not add extreme speed');

// Keyboard and analog turn inputs combine within the same normalized range.
const keyboard=create(),combined=create();keyboard.flight.keys.add('KeyD');combined.flight.keys.add('KeyD');
pad={axes:[1,0],buttons:[]};run(combined.flight,60);pad=null;run(keyboard.flight,60);
assert.ok(Math.abs(combined.flight.heading-keyboard.flight.heading)<1e-8,'keyboard plus stick must clamp to one turn input');

// Gamepad action buttons fire on their press edge, not every held frame.
const actions=create();let dash=0,interact=0;actions.flight.onControlAction=a=>{if(a==='dash')dash++;if(a==='interact')interact++;};
pad={axes:[0,0],buttons:[{pressed:false},{pressed:true},{pressed:true}]};actions.flight.update(1/60);run(actions.flight,30);
assert.equal(dash,1);assert.equal(interact,1);
pad.buttons[1].pressed=false;pad.buttons[2].pressed=false;actions.flight.update(1/60);
pad.buttons[1].pressed=true;pad.buttons[2].pressed=true;actions.flight.update(1/60);
assert.equal(dash,2);assert.equal(interact,2);pad=null;

// Gamepad A takes off once at the press edge; a held button cannot relaunch after landing.
const takeoff=create(BIRD_CLEARANCE);takeoff.flight.flying=false;map.onLand=()=>true;
pad={axes:[0,0],buttons:[{pressed:true}]};takeoff.flight.update(1/60);assert.equal(takeoff.flight.flying,true);
takeoff.flight.flying=false;takeoff.flight.position.copy(takeoff.flight.nest);takeoff.flight.update(1/60);assert.equal(takeoff.flight.flying,false);
pad.buttons[0].pressed=false;takeoff.flight.update(1/60);pad.buttons[0].pressed=true;takeoff.flight.update(1/60);assert.equal(takeoff.flight.flying,true);pad=null;map.onLand=()=>false;

// Clear releases held keyboard controls, and normal landing settles onto support.
controls.flight.clearInput();assert.equal(controls.flight.keys.size,0);
map.onLand=()=>true;const landing=create(2);landing.flight.vertical=-4;landing.flight.landing=true;run(landing.flight,90);
assert.equal(landing.flight.flying,false);assert.ok(Math.abs(landing.flight.position.y-BIRD_CLEARANCE)<1e-8);
assert.ok(landing.camera.position.distanceTo(landing.flight.position)<60,'camera stays near the bird');

// Swept facade collision blocks a dash into a wall, while descending catches a narrow roof.
obstacles=[{x0:2,x1:2.7,z0:-.5,z1:.5,h:10}];
const wall=create(5);wall.flight.heading=-Math.PI/2;wall.flight.speed=90;wall.flight.update(.05);
assert.ok(wall.flight.position.x<=2-.18,'fast flight stops with body-radius clearance at a tall facade');
obstacles=[{x0:1.8,x1:4.1,z0:-.5,z1:.5,h:5}];map.onLand=()=>true;
const roof=create(7);roof.flight.heading=-Math.PI/2;roof.flight.speed=90;roof.flight.vertical=-50;roof.flight.update(.05);
assert.equal(roof.flight.flying,false,'downward dash sweep lands on a narrow roof');
assert.ok(roof.flight.position.x>=1.8&&roof.flight.position.x<=4.1);assert.ok(Math.abs(roof.flight.position.y-(5+BIRD_CLEARANCE))<1e-8);

// Returning home resets flight and camera state together, without retaining the old target.
obstacles=[];map.onLand=()=>false;
const home=create(BIRD_CLEARANCE);home.flight.homeHeading=-.6;home.flight.heading=1.1;home.flight.bank=.8;home.flight.orbit=2;home.flight.orbitPitch=5;home.flight.dashCooldown=1;
home.flight.keys.add('KeyD');home.flight.cameraTarget.set(400,80,-200);home.flight.home();
assert.equal(home.flight.heading,-.6);assert.equal(home.flight.bank,0);assert.equal(home.flight.orbit,0);assert.equal(home.flight.orbitPitch,0);
assert.equal(home.flight.dashCooldown,0);assert.equal(home.flight.keys.size,0);assert.ok(home.flight.cameraTarget.distanceTo(home.flight.position)<1);
home.flight.update(1/60);assert.ok(home.camera.position.distanceTo(home.flight.position)<4,'camera immediately follows the home reset');

// Camera smoothing cannot carry the final camera point through a nearby facade.
obstacles=[{x0:-2,x1:2,z0:1,z1:4,h:40}];
const cameraWall=create(20);cameraWall.flight.heading=0;cameraWall.flight.speed=35;cameraWall.flight.update(1/60);
assert.ok(cameraWall.camera.position.z<1,'camera stays on the bird side of the wall after smoothing');
console.log('Flight controller checks passed: smooth flap takeoff, brisk gait, approach slowing, landing flare, speed targets, dive intent, clamped steering, gamepad edges/takeoff, collisions and camera/home resets.');
