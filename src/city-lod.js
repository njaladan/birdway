import * as THREE from '../vendor/three.module.js';
import {facadeStyle} from './facades.js';

// Surveyed architecture stays nearby; distant blocks retain their real mapped
// footprints/heights in a much smaller mesh. This does not change collisions.
export function buildCityLOD(root, map, detailed) {
 const chunks = new Map(), size = 420;
 function simplify(ring) {
  let points=ring.map(p=>p.slice());
  if(points.length>3&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points.pop();
  for(let pass=0;pass<3;pass++){
   const clean=[];
   for(let i=0;i<points.length;i++){
    const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
    const dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);
    const deviation=length?Math.abs(dx*(a[1]-b[1])-(a[0]-b[0])*dz)/length:0;
    if(deviation>.8||points.length-clean.length<=3)clean.push(b);
   }
   if(clean.length<3||clean.length===points.length)break;
   points=clean;
  }
  return points;
 }
 for(const b of map.buildings){
  if(b.special==='wtc')continue;
  const key=`${Math.floor(b.cx/size)},${Math.floor(b.cz/size)}`;
  if(!chunks.has(key))chunks.set(key,{p:[],n:[],c:[]});
  const out=chunks.get(key),style=facadeStyle(b),color=style.color.clone();
  // Filtered mean glass coverage approximates the near facade's appearance.
  color.lerp(new THREE.Color(0x496477),style.kind===4?.48:.22);
  const put=(p,n,roof=false)=>{out.p.push(...p);out.n.push(...n);out.c.push(color.r*(roof?.66:1),color.g*(roof?.68:1),color.b*(roof?.71:1));};
  const rings=b.rings.map(simplify);
  for(const ring of rings){
   const area=ring.reduce((v,p,i)=>{const q=ring[(i+1)%ring.length];return v+p[0]*q[1]-q[0]*p[1];},0),sign=area>0?1:-1;
   for(let i=0;i<ring.length;i++){
    const a=ring[i],d=ring[(i+1)%ring.length],dx=d[0]-a[0],dz=d[1]-a[1],length=Math.hypot(dx,dz);
    if(length<.05)continue;
    const n=[sign*dz/length,0,-sign*dx/length],a0=[a[0],0,a[1]],a1=[a[0],b.h,a[1]],d0=[d[0],0,d[1]],d1=[d[0],b.h,d[1]];
    for(const p of sign>0?[a0,d1,d0,a0,a1,d1]:[a0,d0,d1,a0,d1,a1])put(p,n);
   }
  }
  const contours=rings.map(r=>r.map(([x,z])=>new THREE.Vector2(x,z))),flat=rings.flat();
  for(const face of THREE.ShapeUtils.triangulateShape(contours[0],contours.slice(1)))for(const i of face.slice().reverse())put([flat[i][0],b.h,flat[i][1]],[0,1,0],true);
 }
 const material=new THREE.MeshLambertMaterial({vertexColors:true});
 const records=[];
 for(const [key,data]of chunks){
  const g=new THREE.BufferGeometry();
  for(const [name,values]of [['position',data.p],['normal',data.n],['color',data.c]])g.setAttribute(name,new THREE.Float32BufferAttribute(values,3));
  g.computeBoundingSphere();
  const distant=new THREE.Mesh(g,material);distant.name='Distant Manhattan footprints';distant.userData.distant=true;distant.castShadow=false;distant.visible=false;root.add(distant);
  const [x,z]=key.split(',').map(Number);
  records.push({x:(x+.5)*size,z:(z+.5)*size,near:detailed.get(key),far:distant,close:null});
 }
 let lastX=Infinity,lastZ=Infinity,lastQuality;
 return {
  records,
  update(position,quality=1.25){
   if(Math.hypot(position.x-lastX,position.z-lastZ)<20&&quality===lastQuality)return;
   lastX=position.x;lastZ=position.z;lastQuality=quality;
   const range=quality<=1?720:quality>=1.75?1800:1100;
   for(const r of records){
    const distance=Math.hypot(position.x-r.x,position.z-r.z);
    const close=distance<range+(r.close?100:0);
    r.close=close;if(r.near)r.near.visible=close;
    r.far.visible=!close&&distance<9500;
   }
  },
 };
}
