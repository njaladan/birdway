import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {loadGeography} from '../src/geography.js';
import {makeBoats} from '../src/boats.js';
import {makeCoastTexture} from '../src/water-coast.js';

const outer=[[100,100],[200,100],[200,200],[100,200]],hole=[[130,130],[170,130],[170,170],[130,170]];
const options={size:40,minX:0,minZ:0,width:400,height:400};
const sample=(texture,x,z)=>texture.image.data[(z*40+x)*4]/255*600;
const solid=makeCoastTexture([{rings:[outer]}],options).texture;
assert.equal(sample(solid,15,15),0,'mapped land shades the river edge');
assert.ok(Math.abs(sample(solid,30,15)-110)<5,'open water grades away from the mapped coastline');
assert.ok(sample(solid,39,39)>sample(solid,30,15),'farther water has greater shore distance');
const island=makeCoastTexture([{rings:[outer,hole]}],options).texture;
assert.equal(sample(island,11,11),0);
assert.ok(sample(island,15,15)>0&&sample(island,15,15)<50,'water holes remain water within a land ring');
solid.dispose();island.dispose();

globalThis.fetch=async path=>new Response(await readFile(new URL('../'+path,import.meta.url)));
const map=await loadGeography(),harbor=makeBoats(new THREE.Scene(),map);
assert.equal(harbor.root.children.length,6,'four ferries and two workboats spawn');
const previous=harbor.root.children.map(b=>b.position.clone());
let largestStep=0;
// Traverse every lane, including its loop boundary. A valid seam advances by
// at most speed * dt, rather than teleporting to a distant route endpoint.
for(let frame=0;frame<120000;frame++){
 harbor.update(.05);
 harbor.root.children.forEach((boat,i)=>{
  const d=Math.hypot(boat.position.x-previous[i].x,boat.position.z-previous[i].z);
  largestStep=Math.max(largestStep,d);previous[i].copy(boat.position);
 });
}
assert.ok(largestStep>.4&&largestStep<.421,`boat route wraps remain continuous (${largestStep} m step)`);
harbor.update(0);
harbor.root.children.forEach((boat,i)=>assert.ok(boat.position.distanceTo(previous[i])<1e-8,'pausing holds the boats in place'));
console.log('Harbor checks passed: mapped coast, water holes, safe boat lanes, continuous loop seams and pause.');
