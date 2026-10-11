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
function loadDetails(buffer, buildings, baseId=0) {
  const dv=new DataView(buffer);if(buffer.byteLength<4)return;
  let offset=0;const count=dv.getUint32(offset,true);offset+=4;
  for(let n=0;n<count;n++) {
    const id=dv.getUint32(offset,true),vertexCount=dv.getUint16(offset+4,true),triangleCount=dv.getUint32(offset+6,true);offset+=10;
    const b=buildings[baseId+id];
    if(offset+vertexCount*6+triangleCount*6>buffer.byteLength)throw new Error('The bundled building detail data is truncated.');
    const vertices=new Float32Array(vertexCount*3);
    for(let i=0;i<vertexCount;i++)for(let k=0;k<3;k++)vertices[i*3+k]=dv.getInt16(offset+i*6+k*2,true)/10;
    offset+=vertexCount*6;const indices=new Uint16Array(triangleCount*3);
    for(let i=0;i<indices.length;i++)indices[i]=dv.getUint16(offset+i*2,true);
    offset+=indices.length*2;
    if(!b||indices.some(i=>i>=vertexCount))continue;
    const roof=[];
    for(let i=0;i<indices.length;i+=3) {
      const a=indices[i]*3,c=indices[i+1]*3,d=indices[i+2]*3;
      const ax=vertices[a],ay=vertices[a+1],az=vertices[a+2],bx=vertices[c],by=vertices[c+1],bz=vertices[c+2],cx=vertices[d],cy=vertices[d+1],cz=vertices[d+2];
      const ny=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);
      if(Math.abs(ny)>.02)roof.push(ax,ay,az,bx,by,bz,cx,cy,cz);
    }
    b.detail={vertices,indices,roof};
  }
  if(offset!==buffer.byteLength)throw new Error('The bundled building detail data has an invalid length.');
}
function roofHeight(b,x,z) {
  const tris=b.detail?.roof;if(!tris?.length)return b.h;
  let highest=-Infinity;
  for(let i=0;i<tris.length;i+=9) {
    const ax=b.cx+tris[i],az=b.cz+tris[i+2],bx=b.cx+tris[i+3],bz=b.cz+tris[i+5],cx=b.cx+tris[i+6],cz=b.cz+tris[i+8];
    const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-7)continue;
    const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,w=1-u-v;
    if(u>=-1e-5&&v>=-1e-5&&w>=-1e-5)highest=Math.max(highest,u*tris[i+1]+v*tris[i+4]+w*tris[i+7]);
  }
  return Number.isFinite(highest)?highest:b.h;
}
export async function loadGeography() {
  const [mapResponse,buildingResponse,detailResponse,styleResponse,jerseyResponse,jerseyBuildings,jerseyDetails]=await Promise.all(['geography.json','buildings.bin','buildings-detail.bin','building-styles.json','jersey-city.json','jersey-city-buildings.bin','jersey-city-detail.bin'].map(name=>fetch('./data/'+name)));
  if([mapResponse,buildingResponse,detailResponse,styleResponse,jerseyResponse,jerseyBuildings,jerseyDetails].some(response=>!response.ok)) throw new Error('The bundled city could not load. Serve the birdway folder over HTTP.');
  const map=await mapResponse.json(), buffer=await buildingResponse.arrayBuffer();
  const buildings=[],cells=new Map();
  function readBuildings(buffer,region='manhattan') {
    const dv=new DataView(buffer),baseId=buildings.length,count=dv.getUint32(0,true);let offset=4;
    for(let i=0;i<count;i++) {
      const h=dv.getUint16(offset,true)/10,n=dv.getUint8(offset+2);offset+=3;
      const rings=[];let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;
      for(let r=0;r<n;r++) {
        const v=dv.getUint16(offset,true);offset+=2;const ring=[];
        for(let j=0;j<v;j++) { const x=dv.getInt16(offset,true),z=dv.getInt16(offset+2,true);offset+=4;ring.push([x,z]);x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z); }
        rings.push(ring);
      }
      const b={id:baseId+i,region,h,rings,x0,x1,z0,z1,cx:(x0+x1)/2,cz:(z0+z1)/2};buildings.push(b);
      for(let x=Math.floor(x0/80);x<=Math.floor(x1/80);x++) for(let z=Math.floor(z0/80);z<=Math.floor(z1/80);z++) {
        const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);
      }
    }
  }
  readBuildings(buffer);
  loadDetails(await detailResponse.arrayBuffer(),buildings);
  const jersey=await jerseyResponse.json(),jerseyStart=buildings.length;
  readBuildings(await jerseyBuildings.arrayBuffer(),'jersey-city');
  loadDetails(await jerseyDetails.arrayBuffer(),buildings,jerseyStart);
  for(const [id,style] of Object.entries(jersey.styles))buildings[jerseyStart+Number(id)].style=style;
  map.land.push(...jersey.land);map.streets.push(...jersey.streets);
  map.regions={manhattan:{buildingCount:jerseyStart},jerseyCity:{buildingCount:jersey.buildingCount,meshCount:jersey.meshCount,bbox:jersey.bbox}};
  map.buildingCount=buildings.length;
  map.jerseyCity=jersey;
  const styles=await styleResponse.json();for(const [id,style] of Object.entries(styles))if(buildings[+id])buildings[+id].style=style;
  function buildingAt(x,z) {
    let found=null,foundHeight=-Infinity;
    for(const b of cells.get(`${Math.floor(x/80)},${Math.floor(z/80)}`)||[]) {
      if(x<b.x0||x>b.x1||z<b.z0||z>b.z1||!inRing(x,z,b.rings[0])||b.rings.slice(1).some(r=>inRing(x,z,r)))continue;
      const height=b.detail?roofHeight(b,x,z):b.h;
      if(height>foundHeight){found=b;foundHeight=height;}
    }return found?.detail?{...found,h:foundHeight}:found;
  }
  function onLand(x,z) {return map.land.some(p=>inRing(x,z,p.rings[0])&&!p.rings.slice(1).some(r=>inRing(x,z,r)));}
  function addPlatform(ring,h,id){const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);const b={id,h,rings:[ring],x0,x1,z0,z1,cx:(x0+x1)/2,cz:(z0+z1)/2};for(let x=Math.floor(x0/80);x<=Math.floor(x1/80);x++)for(let z=Math.floor(z0/80);z<=Math.floor(z1/80);z++){const k=`${x},${z}`;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(b);}}
  return {...map,buildings,addPlatform,buildingAt,onLand,surface:(x,z)=>buildingAt(x,z)?.h||0};
}
