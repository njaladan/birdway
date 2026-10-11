import * as THREE from '../vendor/three.module.js';

// Bake the mapped coast once. The river shader samples one small distance
// texture instead of searching coastline segments for every water fragment.
export function makeCoastTexture(land,{size=512,minX=-9000,minZ=-10000,width=18000,height=18000}={}){
 const mask=new Uint8Array(size*size),sx=width/size,sz=height/size;
 for(const polygon of land)for(let ringIndex=0;ringIndex<polygon.rings.length;ringIndex++){
  const ring=polygon.rings[ringIndex],zs=ring.map(p=>p[1]);
  const first=Math.max(0,Math.floor((Math.min(...zs)-minZ)/sz)),last=Math.min(size-1,Math.ceil((Math.max(...zs)-minZ)/sz));
  for(let row=first;row<=last;row++){
   const z=minZ+(row+.5)*sz,crossings=[];
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];
    if((a[1]>z)!==(b[1]>z))crossings.push(a[0]+(z-a[1])*(b[0]-a[0])/(b[1]-a[1]));
   }
   crossings.sort((a,b)=>a-b);
   for(let i=0;i+1<crossings.length;i+=2){
    const start=Math.max(0,Math.ceil((crossings[i]-minX)/sx-.5)),end=Math.min(size-1,Math.floor((crossings[i+1]-minX)/sx-.5));
    if(start<=end)mask.fill(ringIndex===0?1:0,row*size+start,row*size+end+1);
   }
  }
 }
 const distance=Float32Array.from(mask,n=>n?0:1e6),diagonal=Math.hypot(sx,sz);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const i=z*size+x;let d=distance[i];
  if(x)d=Math.min(d,distance[i-1]+sx);
  if(z){d=Math.min(d,distance[i-size]+sz);if(x)d=Math.min(d,distance[i-size-1]+diagonal);if(x<size-1)d=Math.min(d,distance[i-size+1]+diagonal);}
  distance[i]=d;
 }
 for(let z=size-1;z>=0;z--)for(let x=size-1;x>=0;x--){
  const i=z*size+x;let d=distance[i];
  if(x<size-1)d=Math.min(d,distance[i+1]+sx);
  if(z<size-1){d=Math.min(d,distance[i+size]+sz);if(x)d=Math.min(d,distance[i+size-1]+diagonal);if(x<size-1)d=Math.min(d,distance[i+size+1]+diagonal);}
  distance[i]=d;
 }
 const bytes=new Uint8Array(size*size*4);
 for(let i=0;i<distance.length;i++){bytes[i*4]=Math.round(Math.min(1,distance[i]/600)*255);bytes[i*4+1]=mask[i]*255;bytes[i*4+3]=255;}
 const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 return {texture,bounds:new THREE.Vector4(minX,minZ,width,height)};
}
