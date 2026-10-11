import * as THREE from '../vendor/three.module.js';
import {geo} from './geography.js';
import {createFacadeMaterial,facadeStyle} from './facades.js';
import {makeGroundMaterial} from './ground.js';
import {buildWorldTradeCenter} from './landmarks.js';
import {addRooftopWaterTowers} from './street-details.js';
import {buildCityLOD} from './city-lod.js';
export const rand=(n)=>{const r=Math.sin(n*127.1+311.7)*43758.5453;return r-Math.floor(r);};
export function mesh(parent,geometry,color,x=0,y=0,z=0) {const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);parent.add(m);return m;}
export function box(parent,color,x,y,z,w,h,d) {return mesh(parent,new THREE.BoxGeometry(w,h,d),color,x,y,z);}
export function line(parent,points,color,width=1) {const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,linewidth:width}));parent.add(m);return m;}
function flatPolygon(rings,y,color,parent) {
 const shape=new THREE.Shape(rings[0].map(p=>new THREE.Vector2(p[0],-p[1])));
 for(const ring of rings.slice(1))shape.holes.push(new THREE.Path(ring.map(p=>new THREE.Vector2(p[0],-p[1]))));
 const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);
 g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:g.attributes.position.count},()=>new THREE.Color(color).toArray()).flat(),3));
 g.setAttribute('groundKind',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1),1));
 const m=new THREE.Mesh(g,makeGroundMaterial());m.position.y=y;m.renderOrder=-90;m.receiveShadow=true;parent.add(m);return m;
}
export async function buildCity(scene,map,progress) {
 const root=new THREE.Group();scene.add(root);
 for(const p of map.land)flatPolygon(p.rings,0,['Manhattan','Jersey City'].includes(p.name)?0xaaa89a:0x8e9e91,root);
 // Actual centerlines, with a sidewalk strip and roadbed. All geometries share one buffer.
 const roadPositions=[],curbPositions=[],stripePositions=[];
 function roadStrip(array,a,b,width,y){const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.01)return;const nx=-dz/l*width/2,nz=dx/l*width/2;const v=[[a[0]+nx,y,a[1]+nz],[a[0]-nx,y,a[1]-nz],[b[0]+nx,y,b[1]+nz],[b[0]-nx,y,b[1]-nz]];for(const i of [0,2,1,1,2,3])array.push(...v[i]);}
 for(const street of map.streets)for(let i=1;i<street.points.length;i++) {
  const a=street.points[i-1],b=street.points[i];const wide=street.width||(/Broadway|West St|F D R|[Aa]ve/.test(street.name)?17:10);
  roadStrip(curbPositions,a,b,wide+7,.01);roadStrip(roadPositions,a,b,wide,.025);
  if(wide>12)roadStrip(stripePositions,a,b,.16,.035);
 }
 for(const [a,color,order,kind] of [[curbPositions,0xb7b4aa,-80,1],[roadPositions,0x494d4e,-70,2],[stripePositions,0xc7b992,-40,1]]){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));g.computeVertexNormals();
  g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:a.length/3},()=>new THREE.Color(color).toArray()).flat(),3));
  g.setAttribute('groundKind',new THREE.Float32BufferAttribute(new Float32Array(a.length/3).fill(kind),1));
  const layer=new THREE.Mesh(g,makeGroundMaterial());layer.renderOrder=order;layer.receiveShadow=true;root.add(layer);
 }
 // Procedural facade shading on real footprints: metric windows, sills and night lights.
 const night={value:0};
 const mat=createFacadeMaterial(THREE,night);
 const chunks=new Map(),palette=[0xb9b5a9,0x92a5a7,0xc4b399,0xa79a8b,0x9fadb2,0xb4b5a7].map(c=>new THREE.Color(c));
 const wtc=geo(-74.01338,40.7130);
 let wtcBuilding;
 for(let index=0;index<map.buildings.length;index++) {
  const b=map.buildings[index];
  if(Math.hypot(b.cx-wtc.x,b.cz-wtc.z)<38&&b.h>300){b.special='wtc';b.detail=null;b.h=417;wtcBuilding=b;continue;}
  const key=`${Math.floor(b.cx/420)},${Math.floor(b.cz/420)}`;
  if(!chunks.has(key))chunks.set(key,{p:[],n:[],uv:[],c:[],f:[]});const chunk=chunks.get(key),style=facadeStyle(b),color=style.color||palette[Math.floor(rand(b.id)*palette.length)];
  const push=(x,y,z,nx,ny,nz,u,v,roof=false,kind=roof?7:style.kind)=>{chunk.p.push(x,y,z);chunk.n.push(nx,ny,nz);chunk.uv.push(u,v);chunk.c.push(color.r*(roof?.83:1),color.g*(roof?.83:1),color.b*(roof?.83:1));chunk.f.push(kind);};
  if(b.detail) {
   const {vertices,indices}=b.detail;
   for(let i=0;i<indices.length;i+=3) {
    const ids=[indices[i],indices[i+1],indices[i+2]],pts=ids.map(id=>[b.cx+vertices[id*3],vertices[id*3+1],b.cz+vertices[id*3+2]]);
    const a=pts[0],d=pts[1],e=pts[2],ab=[d[0]-a[0],d[1]-a[1],d[2]-a[2]],ac=[e[0]-a[0],e[1]-a[1],e[2]-a[2]];
    let nx=ab[1]*ac[2]-ab[2]*ac[1],ny=ab[2]*ac[0]-ab[0]*ac[2],nz=ab[0]*ac[1]-ab[1]*ac[0],len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
    const roof=Math.abs(ny)>.035;if(roof&&ny<0){pts.reverse();ny=-ny;nx=-nx;nz=-nz;}
    let tx=1,tz=0,longest=0;
    if(!roof)for(let j=0;j<3;j++){const p=pts[j],q=pts[(j+1)%3],dx=q[0]-p[0],dz=q[2]-p[2],l=Math.hypot(dx,dz);if(l>longest){longest=l;tx=dx/l;tz=dz/l;}}
    if(tx<0||(Math.abs(tx)<1e-6&&tz<0)){tx=-tx;tz=-tz;}
    for(const p of pts)push(p[0],p[1],p[2],nx,ny,nz,roof?(p[0]-b.cx)/3:(p[0]*tx+p[2]*tz)/3,roof?(p[2]-b.cz)/3:p[1]/3.3,roof,roof?7:style.kind);
   }
   if(index%3500===0){progress?.(index/map.buildings.length);await new Promise(r=>setTimeout(r,0));}
   continue;
  }
  for(const ring of b.rings)for(let i=0;i<ring.length;i++) {
   const a=ring[i],d=ring[(i+1)%ring.length],dx=d[0]-a[0],dz=d[1]-a[1],l=Math.hypot(dx,dz);if(!l)continue;
   const area=ring.reduce((sum,p,j)=>{const q=ring[(j+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
   const base=b.style?.baseHeight||0;
   const sign=area>0?1:-1, a0=[a[0],base,a[1],0,base/3.3],a1=[a[0],b.h,a[1],0,b.h/3.3],d0=[d[0],base,d[1],l/3,base/3.3],d1=[d[0],b.h,d[1],l/3,b.h/3.3];
   const order=sign>0?[a0,d1,d0,a0,a1,d1]:[a0,d0,d1,a0,d1,a1];
   for(const [x,y,z,u,v] of order)push(x,y,z,sign*dz/l,0,-sign*dx/l,u,v);
  }
  const contours=b.rings.map(r=>r.map(p=>new THREE.Vector2(p[0],p[1]))),flat=b.rings.flat();
  for(const face of THREE.ShapeUtils.triangulateShape(contours[0],contours.slice(1)))for(const i of [...face].reverse())push(flat[i][0],b.h,flat[i][1],0,1,0,(flat[i][0]-b.cx)/3,(flat[i][1]-b.cz)/3,true);
  if(index%3500===0){progress?.(index/map.buildings.length);await new Promise(r=>setTimeout(r,0));}
 }
 const detailed=new Map();
 for(const [key,c] of chunks) {const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(c.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(c.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(c.uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(c.c,3));g.setAttribute('facadeKind',new THREE.Float32BufferAttribute(c.f,1));g.computeBoundingSphere();const m=new THREE.Mesh(g,mat);root.add(m);detailed.set(key,m);}
 const lod=buildCityLOD(root,map,detailed);
 // Roof equipment and raised cornices add scale without individual draw calls.
 const waterTowerBuildings=addRooftopWaterTowers(root,map);
 const roofs=map.buildings.filter(b=>!b.detail&&b.h>10&&b.x1-b.x0>8&&b.z1-b.z0>8&&b.special!=='wtc'&&!waterTowerBuildings.has(b.id));
 const units=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x7f8989,roughness:.9}),roofs.length);
 const dummy=new THREE.Object3D();
 roofs.forEach((b,i)=>{dummy.position.set(b.cx,b.h+1.1,b.cz);dummy.scale.set(Math.min(6,(b.x1-b.x0)*.2),2.2,Math.min(5,(b.z1-b.z0)*.2));dummy.rotation.y=rand(i)*Math.PI;dummy.updateMatrix();units.setMatrixAt(i,dummy.matrix);});root.add(units);
 if(wtcBuilding)buildWorldTradeCenter(root,wtcBuilding,mat);
 return {root,night,chunks:chunks.size,update:lod.update,lod:lod.records};
}
