import * as THREE from '../vendor/three.module.js';
export const ORIGIN = [-74, 40.72];
export function geo(lon, lat, y = 0) { return new THREE.Vector3((lon + 74) * (111320*Math.cos(40.72*Math.PI/180)), y, -(lat - 40.72) * 110540); }
export function inRing(x,z,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export async function loadGeography() {
  const [mapResponse,buildingResponse]=await Promise.all([fetch('./data/geography.json'),fetch('./data/buildings.bin')]);
  if(!mapResponse.ok||!buildingResponse.ok) throw new Error('The bundled city could not load. Serve the birdway folder over HTTP.');
  const map=await mapResponse.json(), buffer=await buildingResponse.arrayBuffer(), dv=new DataView(buffer);
  let offset=4; const count=dv.getUint32(0,true), buildings=[],cells=new Map();
  for(let i=0;i<count;i++) {
    const h=dv.getUint16(offset,true)/10,n=dv.getUint8(offset+2);offset+=3;
    const rings=[];let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
    for(let r=0;r<n;r++) {
      const v=dv.getUint16(offset,true);offset+=2;const ring=[];
      for(let j=0;j<v;j++) { const x=dv.getInt16(offset,true),z=dv.getInt16(offset+2,true);offset+=4;ring.push([x,z]);x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z); }
      rings.push(ring);
    }
    const b={id:i,h,rings,x0,x1,z0,z1,cx:(x0+x1)/2,cz:(z0+z1)/2};buildings.push(b);
    for(let x=Math.floor(x0/80);x<=Math.floor(x1/80);x++) for(let z=Math.floor(z0/80);z<=Math.floor(z1/80);z++) {
      const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);
    }
  }
  function buildingAt(x,z) {
    let found=null;
    for(const b of cells.get(`${Math.floor(x/80)},${Math.floor(z/80)}`)||[]) {
      if(x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1&&inRing(x,z,b.rings[0])&&!b.rings.slice(1).some(r=>inRing(x,z,r))&&(!found||found.h<b.h))found=b;
    }return found;
  }
  function onLand(x,z) {return map.land.some(p=>inRing(x,z,p.rings[0])&&!p.rings.slice(1).some(r=>inRing(x,z,r)));}
  function addPlatform(ring,h,id){const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);const b={id,h,rings:[ring],x0,x1,z0,z1,cx:(x0+x1)/2,cz:(z0+z1)/2};for(let x=Math.floor(x0/80);x<=Math.floor(x1/80);x++)for(let z=Math.floor(z0/80);z<=Math.floor(z1/80);z++){const k=`${x},${z}`;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(b);}}
  return {...map,buildings,addPlatform,buildingAt,onLand,surface:(x,z)=>buildingAt(x,z)?.h||0};
}
