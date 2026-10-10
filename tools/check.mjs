// One lightweight smoke check for the actual bundled geography and core gameplay loop.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import * as THREE from '../vendor/three.module.js';
import {loadGeography} from '../src/geography.js';
import {makeBird} from '../src/bird.js';
import {Flight} from '../src/flight.js';
import {CityLife} from '../src/life.js';
const root=new URL('../',import.meta.url);
for(const name of await readdir(new URL('src/',root)))if(name.endsWith('.js')){
 const r=spawnSync(process.execPath,['--check',new URL('src/'+name,root).pathname],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
}
const diskFetch=async path=>new Response(await readFile(new URL(path,root)));
globalThis.fetch=diskFetch;
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
const map=await loadGeography();assert.equal(map.buildings.length,20868);assert.equal(map.streets.length,1152);
const home=map.buildings.find(b=>b.h>50&&b.h<90&&map.buildingAt(b.cx,b.cz)?.id===b.id);
const nest=new THREE.Vector3(home.cx,home.h+.68,home.cz),camera=new THREE.PerspectiveCamera(),bird=makeBird(1.65),flight=new Flight(bird,camera,map,nest);
flight.update(1/60);assert.equal(flight.flying,false);assert.ok(Math.abs(flight.position.y-nest.y)<.01);
flight.takeoff();flight.keys.add('Space');for(let i=0;i<120;i++)flight.update(1/60);flight.keys.clear();assert.ok(flight.flying);assert.ok(flight.position.y>nest.y+10);assert.ok(camera.position.distanceTo(flight.position)<60);
const originalHeading=flight.heading;flight.keys.add('KeyD');for(let i=0;i<12;i++)flight.update(1/60);flight.keys.clear();assert.ok(flight.heading<originalHeading);assert.ok(flight.bank<0,'A right turn lowers the right wing');
flight.home();assert.equal(flight.flying,false);assert.ok(flight.position.distanceTo(nest)<.01);
const audio={coo(){},enabled:false},life=new CityLife(new THREE.Scene(),map,flight,nest,audio,()=>{});
const food=life.moments.find(m=>m.type==='food');assert.equal(map.surface(food.position.x,food.position.z),0,'Food is accessible at street level');
flight.position.copy(food.position).y+=.68;flight.flying=false;life.update(.01);life.interact();assert.equal(life.save.carried?.type,'food');flight.home();life.interact();assert.equal(life.save.food,1);assert.equal(life.save.carried,null);
life.cooldowns.clear();flight.position.copy(food.position).y+=.68;life.update(.01);life.interact();flight.home();life.interact();assert.equal(life.friends,1);assert.equal(life.flock.length,1);
const treasure=life.moments.find(m=>m.type==='shiny');flight.position.copy(treasure.position).y+=.68;life.update(.01);life.interact();flight.home();life.interact();assert.ok(life.save.treasures.includes(treasure.id));
const vent=life.moments.find(m=>m.type==='updraft');flight.position.copy(vent.position).y+=8;flight.flying=true;life.update(.01);assert.ok(flight.vertical>=14);assert.ok(life.save.moments.includes(vent.id));
const bath=life.moments.find(m=>m.type==='bath');flight.position.copy(bath.position).y+=.68;flight.flying=false;life.update(.01);life.interact();assert.ok(life.save.moments.includes(bath.id));
life.persist();const restored=new CityLife(new THREE.Scene(),map,flight,nest,audio,()=>{});assert.equal(restored.save.food,2);assert.ok(restored.save.treasures.includes(treasure.id));
console.log('Birdway smoke check passed: map, takeoff, flight, return, pickup, delivery, flock, treasure, updraft, bath and save reload.');
