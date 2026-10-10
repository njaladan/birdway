import * as THREE from '../vendor/three.module.js';
import {geo} from './geography.js';
export const rand=(n)=>{const r=Math.sin(n*127.1+311.7)*43758.5453;return r-Math.floor(r);};
export function mesh(parent,geometry,color,x=0,y=0,z=0) {const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);parent.add(m);return m;}
export function box(parent,color,x,y,z,w,h,d) {return mesh(parent,new THREE.BoxGeometry(w,h,d),color,x,y,z);}
export function line(parent,points,color,width=1) {const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,linewidth:width}));parent.add(m);return m;}
function flatPolygon(rings,y,color,parent) {
 const shape=new THREE.Shape(rings[0].map(p=>new THREE.Vector2(p[0],-p[1])));
 for(const ring of rings.slice(1))shape.holes.push(new THREE.Path(ring.map(p=>new THREE.Vector2(p[0],-p[1]))));
 const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);
 const m=mesh(parent,g,color,0,y,0);return m;
}
export async function buildCity(scene,map,progress) {
 const root=new THREE.Group();scene.add(root);
 for(const p of map.land)flatPolygon(p.rings,-.25,p.name==='Manhattan'?0xaaa89a:0x8e9e91,root);
 // Actual centerlines, with a sidewalk strip and roadbed. All geometries share one buffer.
 const roadPositions=[],curbPositions=[],stripePositions=[];
 function roadStrip(array,a,b,width,y){const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.01)return;const nx=-dz/l*width/2,nz=dx/l*width/2;const v=[[a[0]+nx,y,a[1]+nz],[a[0]-nx,y,a[1]-nz],[b[0]+nx,y,b[1]+nz],[b[0]-nx,y,b[1]-nz]];for(const i of [0,2,1,1,2,3])array.push(...v[i]);}
 for(const street of map.streets)for(let i=1;i<street.points.length;i++) {
  const a=street.points[i-1],b=street.points[i];const wide=/Broadway|West St|F D R|[Aa]ve/.test(street.name)?17:10;
  roadStrip(curbPositions,a,b,wide+7,.01);roadStrip(roadPositions,a,b,wide,.025);
  if(wide>12)roadStrip(stripePositions,a,b,.16,.035);
 }
 for(const [a,color] of [[curbPositions,0xc9c0ac],[roadPositions,0x626a69],[stripePositions,0xc7b992]]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));g.computeVertexNormals();mesh(root,g,color);}
 // Procedural facade shading on real footprints: metric windows, sills and night lights.
 const night={value:0};
 const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.13,side:THREE.DoubleSide});
 mat.onBeforeCompile=s=>{
  s.uniforms.night=night;
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 facadeUV;').replace('#include <uv_vertex>','#include <uv_vertex>\nfacadeUV=uv;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 facadeUV; uniform float night;');
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 cell = fract(facadeUV); float wall=step(0.0,facadeUV.y);
    float win=step(.18,cell.x)*step(cell.x,.78)*step(.20,cell.y)*step(cell.y,.80)*wall;
    float hash=fract(sin(dot(floor(facadeUV),vec2(127.1,311.7)))*43758.5453);
    diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.46,.63,.69),win*.70);
    diffuseColor.rgb*=1.0-.10*step(.92,cell.y)*wall;
    float lit=win*step(.57,hash)*night;
  `).replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0,.59,.23)*lit*.65;');
 };
 const chunks=new Map(),palette=[0xb9b5a9,0x92a5a7,0xc4b399,0xa79a8b,0x9fadb2,0xb4b5a7].map(c=>new THREE.Color(c));
 const wtc=geo(-74.01338,40.7130);
 for(let index=0;index<map.buildings.length;index++) {
  const b=map.buildings[index];
  if(Math.hypot(b.cx-wtc.x,b.cz-wtc.z)<38&&b.h>300){b.special='wtc';b.h=429;continue;}
  const key=`${Math.floor(b.cx/420)},${Math.floor(b.cz/420)}`;
  if(!chunks.has(key))chunks.set(key,{p:[],n:[],uv:[],c:[]});const chunk=chunks.get(key),color=palette[Math.floor(rand(b.id)*palette.length)];
  const push=(x,y,z,nx,ny,nz,u,v,roof=false)=>{chunk.p.push(x,y,z);chunk.n.push(nx,ny,nz);chunk.uv.push(u,v);chunk.c.push(color.r*(roof?.83:1),color.g*(roof?.83:1),color.b*(roof?.83:1));};
  for(const ring of b.rings)for(let i=0;i<ring.length;i++) {
   const a=ring[i],d=ring[(i+1)%ring.length],dx=d[0]-a[0],dz=d[1]-a[1],l=Math.hypot(dx,dz);if(!l)continue;
   const area=ring.reduce((sum,p,j)=>{const q=ring[(j+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
   const sign=area>0?1:-1, a0=[a[0],0,a[1],0,0],a1=[a[0],b.h,a[1],0,b.h/3.3],d0=[d[0],0,d[1],l/3,0],d1=[d[0],b.h,d[1],l/3,b.h/3.3];
   const order=sign>0?[a0,d1,d0,a0,a1,d1]:[a0,d0,d1,a0,d1,a1];
   for(const [x,y,z,u,v] of order)push(x,y,z,sign*dz/l,0,-sign*dx/l,u,v);
  }
  const contours=b.rings.map(r=>r.map(p=>new THREE.Vector2(p[0],p[1]))),flat=b.rings.flat();
  for(const face of THREE.ShapeUtils.triangulateShape(contours[0],contours.slice(1)))for(const i of [...face].reverse())push(flat[i][0],b.h,flat[i][1],0,1,0,0,-1,true);
  if(index%3500===0){progress?.(index/map.buildings.length);await new Promise(r=>setTimeout(r,0));}
 }
 for(const c of chunks.values()) {const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(c.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(c.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(c.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(c.c,3));g.computeBoundingSphere();root.add(new THREE.Mesh(g,mat));}
 // Roof equipment and raised cornices add scale without individual draw calls.
 const roofs=map.buildings.filter(b=>b.h>10&&b.x1-b.x0>8&&b.z1-b.z0>8&&b.special!=='wtc');
 const units=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x7f8989,roughness:.9}),roofs.length);
 const dummy=new THREE.Object3D();
 roofs.forEach((b,i)=>{dummy.position.set(b.cx,b.h+1.1,b.cz);dummy.scale.set(Math.min(6,(b.x1-b.x0)*.2),2.2,Math.min(5,(b.z1-b.z0)*.2));dummy.rotation.y=rand(i)*Math.PI;dummy.updateMatrix();units.setMatrixAt(i,dummy.matrix);});root.add(units);
 // One WTC's eight tapering faces and mast, placed in its measured footprint.
 const vertices=[]; const size=28,top=20,h=417;
 const base=[[-size,-size],[size,-size],[size,size],[-size,size]];
 const upper=[[0,-top*1.414],[top*1.414,0],[0,top*1.414],[-top*1.414,0]];
 for(let i=0;i<4;i++){const j=(i+1)%4;for(const p of [[...base[i],0],[...base[j],0],[...upper[i],h],[...upper[i],h],[...base[j],0],[...upper[j],h]])vertices.push(wtc.x+p[0],p[2]+12,wtc.z+p[1]);}
 const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));wg.computeVertexNormals();mesh(root,wg,0x94b4be);
 box(root,0xb5c5c8,wtc.x,6,wtc.z,56,12,56);
 mesh(root,new THREE.CylinderGeometry(.9,2.5,112,10),0xb8bfc0,wtc.x,485,wtc.z);
 // Spires on accurately placed landmark footprints.
 for(const [lon,lat,baseY,height,color] of [[-74.009,40.7069,240,42,0xb0ad97],[-74.0079,40.7135,190,50,0x8eaea4],[-73.9857,40.7484,381,62,0xbbbdaf]]){
  const p=geo(lon,lat);mesh(root,new THREE.CylinderGeometry(.5,3,height,8),color,p.x,baseY+height/2,p.z);
 }
 return {root,night,chunks:chunks.size};
}
