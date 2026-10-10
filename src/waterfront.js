import * as THREE from '../vendor/three.module.js';

const CHUNK=1200, MAX_NEAR=600, KEY=(x,z)=>`${Math.floor(x/CHUNK)},${Math.floor(z/CHUNK)}`;
const below59=(lon,lat)=>lat<40.768-(lon+73.981)*.5263;
const len=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const mat=(color,roughness=.86)=>new THREE.MeshStandardMaterial({color,roughness,metalness:.03});
function nearestDistance(p,lines){let d=Infinity;for(const line of lines)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1),0,1);d=Math.min(d,Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t));}return d;}
function boxInstances(root,groups,name,size,color,shadow=true){
 const geometry=new THREE.BoxGeometry(...size),material=mat(color);
 for(const [key,items] of groups){if(!items.length)continue;const mesh=new THREE.InstancedMesh(geometry,material,items.length);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;
  items.forEach((v,i)=>{const p=new THREE.Vector3(v.x,v.y,v.z),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),v.a||0),s=new THREE.Vector3(v.sx||1,v.sy||1,v.sz||1);mesh.setMatrixAt(i,new THREE.Matrix4().compose(p,q,s));});mesh.instanceMatrix.needsUpdate=true;mesh.userData.chunk=key;root.add(mesh);
 }
}
function chunkAdd(groups,key,item){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
function buildWall(scene,map,paths,root){
 const island=map.land.find(p=>p.name==='Manhattan'),rings=island?.rings||[],lines=paths.filter(p=>/esplanade/i.test(p.name||'')).map(p=>p.points).filter(p=>p?.length>1),chunks=new Map(),railPosts=new Map(),railMetal=new Map(),railCaps=new Map();
 const [lon0,lat0]=map.origin||[-74,40.72], [mx,my]=map.metersPerDegree||[84370.17,110540];
 for(const ring of rings)for(let i=1;i<ring.length;i++){
  const a=ring[i-1],b=ring[i],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],ll=[lon0+mid[0]/mx,lat0-mid[1]/my];
  const la=[lon0+a[0]/mx,lat0-a[1]/my],lb=[lon0+b[0]/mx,lat0-b[1]/my];
  if(!below59(...ll)||!below59(...la)||!below59(...lb)||ll[1]<40.699||len(a,b)<.4)continue;
  const distance=len(a,b),dx=(b[0]-a[0])/distance,dz=(b[1]-a[1])/distance,n=[-dz,dx],inside=map.onLand(mid[0]+n[0]*2,mid[1]+n[1]*2)?n:map.onLand(mid[0]-n[0]*2,mid[1]-n[1]*2)?[-n[0],-n[1]]:null;
  if(!inside)continue;
  const key=KEY(...mid);if(!chunks.has(key))chunks.set(key,{positions:[],normals:[]});const c=chunks.get(key),out=[-inside[0],-inside[1]],push=(x,y,z)=>c.positions.push(x,y,z);
  const v=[[a[0],-.82,a[1]],[b[0],-.82,b[1]],[a[0],.24,a[1]],[b[0],.24,b[1]]];for(const [ia,ib,ic] of [[0,1,2],[2,1,3]])for(const ix of [ia,ib,ic]){push(...v[ix]);c.normals.push(out[0],0,out[1]);}
  if(nearestDistance(mid,lines)<32){for(let d=0;d<distance;d+=5){const t=Math.min(1,d/distance),x=THREE.MathUtils.lerp(a[0],b[0],t)+inside[0]*1.2,z=THREE.MathUtils.lerp(a[1],b[1],t)+inside[1]*1.2;if(!map.onLand(x,z)||map.buildingAt(x,z))continue;chunkAdd(railPosts,KEY(x,z),{x,y:.74,z});}
   for(const y of [.42,.82])chunkAdd(railMetal,key,{x:(a[0]+b[0])/2+inside[0]*1.2,y,z:(a[1]+b[1])/2+inside[1]*1.2,a:Math.atan2(-dz,dx),sx:distance,sy:.045,sz:.045});chunkAdd(railCaps,key,{x:(a[0]+b[0])/2+inside[0]*1.2,y:1.08,z:(a[1]+b[1])/2+inside[1]*1.2,a:Math.atan2(-dz,dx),sx:distance,sy:.085,sz:.095});}
 }
 const wallMat=mat(0x8f9088);wallMat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vShorePos;').replace('#include <begin_vertex>','#include <begin_vertex>\nvShorePos=(modelMatrix*vec4(transformed,1.0)).xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vShorePos;').replace('#include <color_fragment>','#include <color_fragment>\nfloat tideNoise=sin(vShorePos.x*.09+sin(vShorePos.z*.035))*sin(vShorePos.z*.12);\nfloat tideBand=1.0-smoothstep(.10,.24,abs(vShorePos.y+.24+tideNoise*.035));\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.60,.64,.62),tideBand*.72);');};
 for(const [key,c] of chunks){if(!c.positions.length)continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(c.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(c.normals,3));const m=new THREE.Mesh(g,wallMat);m.name='Manhattan stone waterfront';m.receiveShadow=true;m.userData.chunk=key;root.add(m);}
 const postMat=mat(0x454944),postGeo=new THREE.CylinderGeometry(.045,.055,.95,6);for(const [key,items] of railPosts){if(!items.length)continue;const m=new THREE.InstancedMesh(postGeo,postMat,items.length);m.name='Esplanade iron railing posts';m.castShadow=true;m.receiveShadow=true;items.forEach((p,i)=>m.setMatrixAt(i,new THREE.Matrix4().makeTranslation(p.x,p.y,p.z)));m.instanceMatrix.needsUpdate=true;m.userData.chunk=key;root.add(m);}
 boxInstances(root,railMetal,'Esplanade iron railing bars',[1,1,1],0x454944);boxInstances(root,railCaps,'Esplanade wood handrail caps',[1,1,1],0x806f56);
}
function addFurniture(map,parkData,root){
 const paths=(parkData?.paths||[]).filter(p=>/esplanade/i.test(p.name||'')&&p.kind==='footway'&&p.points?.length>1),benches=new Map(),benchBack=new Map(),benchLegs=new Map(),lampPosts=new Map(),lampHeads=new Map();
 for(const path of paths){let run=0,nextBench=110,nextLamp=48;for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],d=len(a,b);if(!d)continue;const dx=(b[0]-a[0])/d,dz=(b[1]-a[1])/d,angle=Math.atan2(dx,dz);
  for(let t=0;t<d;t+=5){const dist=run+t,x=THREE.MathUtils.lerp(a[0],b[0],Math.min(1,t/d)),z=THREE.MathUtils.lerp(a[1],b[1],Math.min(1,t/d)),key=KEY(x,z);if(!map.onLand(x,z)||map.buildingAt(x,z))continue;
   if(dist>=nextBench){chunkAdd(benches,key,{x,y:.52,z,a:angle,sx:1,sy:1,sz:1});chunkAdd(benchBack,key,{x,y:.89,z,a:angle,sx:1,sy:1,sz:1});for(const side of [-.6,.6])chunkAdd(benchLegs,key,{x:x+Math.cos(angle)*side,y:.28,z:z-Math.sin(angle)*side,a:angle,sx:1,sy:1,sz:1});nextBench=dist+150;}
   if(dist>=nextLamp){chunkAdd(lampPosts,key,{x,y:2.05,z});chunkAdd(lampHeads,key,{x,y:4.08,z});nextLamp=dist+76;}
  }run+=d;
 }}
 boxInstances(root,benches,'Esplanade wood benches',[1.35,.12,.48],0x88785e);boxInstances(root,benchBack,'Esplanade bench backs',[1.35,.52,.10],0x88785e);boxInstances(root,benchLegs,'Esplanade bench supports',[.10,.55,.10],0x56564d);boxInstances(root,lampPosts,'Esplanade lamps',[.10,3.7,.10],0x414943);boxInstances(root,lampHeads,'Esplanade lamp heads',[.48,.16,.28],0xd6cba7,false);
}
export function buildWaterfront(scene,map,parkData){
 const root=new THREE.Group();root.name='Manhattan waterfront details';scene.add(root);buildWall(scene,map,parkData?.paths||[],root);addFurniture(map,parkData,root);
 const meshes=root.children,stain=root.children.find(m=>m.name==='Manhattan stone waterfront')?.material,lamps=root.children.find(m=>m.name==='Esplanade lamp heads')?.material;
 function update(position,night=0){if(stain)stain.emissive.setRGB(.012*night,.014*night,.012*night);if(lamps){lamps.emissive.setRGB(.22*night,.19*night,.12*night);lamps.emissiveIntensity=night;}for(const m of meshes){const [cx,cz]=String(m.userData.chunk||'0,0').split(',').map(Number);m.visible=Math.hypot((cx+.5)*CHUNK-position.x,(cz+.5)*CHUNK-position.z)<MAX_NEAR+CHUNK*.72;}}
 return {root,update};
}
