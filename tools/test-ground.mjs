// Grass placement and streaming budgets, independent of a graphics driver.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createGrassDetail} from '../src/ground.js';

const rectangle=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]];
const origin=new THREE.Vector3(-100,.15,-100);
const data={parks:[{kind:'park',rings:[rectangle(-150,-150,-50,-50),rectangle(-104,-104,-96,-96)]}],paths:[{points:[[-150,-88],[-50,-88]]}]};
const map={buildingAt:(x,z)=>x>-94&&x<-90&&z>-110&&z<-95?{}:null};
const grass=createGrassDetail(new THREE.Scene(),data,map);
for(let i=0;i<80;i++){
 const previous=grass.root.children.length;grass.update(origin,i/60);
 assert.ok(grass.root.children.length-previous<=2,'Entering a lawn builds at most two tiles per frame');
}
assert.ok(grass.root.children.length>0);
let count=0,bytes=0,dense=0,sparse=0;
for(const mesh of grass.root.children){
 const geometry=mesh.geometry;assert.ok(geometry.isInstancedBufferGeometry,'Blades use compact instances');
 const roots=geometry.attributes.grassRoot;count+=geometry.instanceCount;
 bytes+=Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0);
 bytes+=mesh.userData.grass.roots.byteLength+mesh.userData.grass.rotations.byteLength;
 for(let i=0;i<geometry.instanceCount;i++){
  const x=roots.getX(i),z=roots.getY(i);
  assert.ok(x>=-150&&x<=-50&&z>=-150&&z<=-50,'Roots stay within the polygon');
  assert.ok(!(x>-104&&x<-96&&z>-104&&z<-96),'Polygon holes remain clear');
  assert.ok(Math.abs(z+88)>=3,'Mapped paths remain clear');
  assert.equal(map.buildingAt(x,z),null,'Buildings remain clear');
  assert.ok(geometry.boundingBox.containsPoint(new THREE.Vector3(x,0,z)),'World bounds contain roots away from the origin');
  if(Math.hypot(x-origin.x,z-origin.z)<7){if(mesh.name==='Dense grass')dense++;else sparse++;}
 }
}
assert.ok(dense>sparse*7,'Close grass is much denser than the outer ring');
assert.ok(count<65000,'Only roots near the two moving detail circles are submitted');
assert.ok(bytes<10_000_000,'Cached and GPU buffers stay bounded despite increased density');
const meshes=[...grass.root.children],versions=meshes.map(m=>m.geometry.attributes.grassRoot.version);
grass.update(origin,3);
assert.deepEqual(grass.root.children,meshes,'Stationary wind reuses geometry');
assert.deepEqual(meshes.map(m=>m.geometry.attributes.grassRoot.version),versions,'Wind does not upload placement buffers');
const snapshot=meshes.map(m=>Array.from(m.geometry.attributes.grassRoot.array.slice(0,m.geometry.instanceCount*4)));
let disposed=0;for(const mesh of meshes)mesh.geometry.addEventListener('dispose',()=>disposed++);
grass.update(new THREE.Vector3(-100,40,-100),4);
assert.equal(grass.root.children.length,0,'High flight clears grass');assert.equal(disposed,meshes.length,'Removed GPU geometries are disposed');
for(let i=0;i<80;i++)grass.update(origin,5);
assert.deepEqual(grass.root.children.map(m=>Array.from(m.geometry.attributes.grassRoot.array.slice(0,m.geometry.instanceCount*4))),snapshot,'Returning recreates identical placement');
grass.update(new THREE.Vector3(500,.15,500),6);for(let i=0;i<80;i++)grass.update(new THREE.Vector3(500,.15,500),6);
assert.equal(grass.root.children.length,0,'Leaving mapped lawns removes detail');
console.log('Ground checks passed: dense instancing, path/hole/building masks, streaming budgets, stable wind/placement and disposal.');
