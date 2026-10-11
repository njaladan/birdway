import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {loadVehicleModels,importedVehicle} from './vehicle-import.js';

// Dimensions in metres. Silhouettes suggest current NYC classes, not particular manufacturers.
export const VEHICLES = {
 sedan:{width:1.85,length:4.6,height:1.5,roofLength:2.05,roofZ:.05,wheel:.32},
 suv:{width:1.96,length:4.85,height:1.84,roofLength:2.8,roofZ:.15,wheel:.36},
 taxi:{width:1.85,length:4.6,height:1.5,roofLength:2.05,roofZ:.05,wheel:.32,tile:10},
 taxiVan:{width:1.95,length:4.7,height:1.95,roofLength:3.1,roofZ:.2,wheel:.33,tile:10},
 rideshare:{width:1.96,length:4.85,height:1.84,roofLength:2.8,roofZ:.15,wheel:.36},
 van:{width:2.08,length:5.7,height:2.6,roofLength:4.25,roofZ:.45,wheel:.37,tile:9},
 boxTruck:{width:2.5,length:8.1,height:3.65,roofLength:5.5,roofZ:1.1,wheel:.46,tile:4},
 sanitation:{width:2.5,length:8.7,height:3.3,roofLength:5.7,roofZ:1.1,wheel:.49,tile:13},
 ambulance:{width:2.3,length:6.7,height:2.9,roofLength:4.65,roofZ:.55,wheel:.4,tile:6},
 fire:{width:2.5,length:9.6,height:3.3,roofLength:6.9,roofZ:.65,wheel:.49,tile:14},
 police:{width:1.96,length:4.85,height:1.84,roofLength:2.8,roofZ:.15,wheel:.36,tile:15},
 schoolBus:{width:2.45,length:10.6,height:3.05,roofLength:8.3,roofZ:.65,wheel:.45,tile:5},
 paratransit:{width:2.2,length:6.5,height:2.8,roofLength:4.7,roofZ:.45,wheel:.38,tile:11},
 bus:{width:2.55,length:12.2,height:3.3,roofLength:11.8,roofZ:0,wheel:.48,tile:3},
 articulated:{width:2.55,length:18,height:3.3,roofLength:17.6,roofZ:0,wheel:.48,tile:3},
};
const colors=[0xe6e4de,0x383d44,0xaeb6b9,0x5f6b76,0x773c3b,0xb6b1a5,0x42616b];
const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;
let atlas=white,roughness=white,templates=new Map();
export async function loadVehicleTextures(){
 const loader=new THREE.TextureLoader();
 [atlas,roughness]=await Promise.all([loader.loadAsync('./assets/vehicles/surfaces.jpg'),loader.loadAsync('./assets/vehicles/roughness.png')]);
 atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;templates=new Map();await loadVehicleModels();
}
function mapped(geometry,tile){
 const uv=geometry.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,((tile%4)+.015+uv.getX(i)*.97)/4,(3-Math.floor(tile/4)+.015+uv.getY(i)*.97)/4);
 geometry.setAttribute('wheelPart',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count),1));geometry.setAttribute('wheelCenter',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*3),3));
 return geometry;
}
function template(type,variant){
 const key=`${type}:${variant}`,cached=templates.get(key);if(cached)return cached;
 const d=VEHICLES[type],w=d.width,l=d.length,h=d.height,r=d.wheel;
 const pieces={paint:[],glass:[],metal:[],rubber:[],white:[],red:[],amberLeft:[],amberRight:[]};
 const color=type==='taxi'||type==='taxiVan'?0xeeb929:type==='fire'?0xc94b3e:colors[variant%colors.length];
 const paint=new THREE.MeshStandardMaterial({map:atlas,roughnessMap:roughness,color:['sedan','suv','rideshare'].includes(type)?color:0xffffff,metalness:.18,roughness:.68});
 const materials={paint,glass:new THREE.MeshStandardMaterial({map:atlas,color:0xc1d6df,metalness:.55,roughness:.17}),metal:new THREE.MeshStandardMaterial({map:atlas,metalness:.72,roughness:.38}),rubber:new THREE.MeshStandardMaterial({map:atlas,roughness:.95}),white:new THREE.MeshStandardMaterial({color:0xffedc4,emissive:0xffdb99,emissiveIntensity:.05}),red:new THREE.MeshStandardMaterial({color:0xa72d21,emissive:0xff2918,emissiveIntensity:.05}),amberLeft:new THREE.MeshStandardMaterial({color:0xdba446,emissive:0xff8a15,emissiveIntensity:0})};materials.amberRight=materials.amberLeft.clone();
 function part(kind,x,y,z,sx,sy,sz,tile=0,rotation=0){let g=mapped(new THREE.BoxGeometry(sx,sy,sz),tile);if(rotation)g.rotateX(rotation);g.translate(x,y,z);pieces[kind].push(g);}
 const car=['sedan','suv','taxi','taxiVan','rideshare','police'].includes(type),bus=type==='bus'||type==='articulated';
 if(car){
  part('paint',0,.63,0,w,.7,l,d.tile||0);
  // Sloping bonnet and windscreen retain a compact, recognisable silhouette.
  part('paint',0,.92,-l*.35,w-.12,.12,l*.25,d.tile||0,.08);
  part('glass',0,(h+.88)/2,d.roofZ,w-.19,h-.88,d.roofLength,7);
  part('paint',0,h-.055,d.roofZ,w-.18,.11,d.roofLength,0);
  for(const x of [-1,1]){
   for(const z of [-d.roofLength*.42,d.roofLength*.05,d.roofLength*.42])part('paint',x*(w-.17)/2,(h+.9)/2,z+d.roofZ,.055,h-.9,.055,0);
   part('metal',x*(w/2+.09),1.02,-.75,.18,.13,.23,2);
   for(const z of [-.42,.65])part('metal',x*(w/2+.008),.84,z,.025,.055,.2,2);
  }
  if(type==='taxi'||type==='taxiVan')part('white',0,h+.13,0,.64,.19,.24);
  if(type==='police'){part('red',-.28,h+.12,0,.38,.15,.21);part('white',.28,h+.12,0,.38,.15,.21);}
 }else if(bus){
  part('paint',0,(h+.48)/2,0,w,h-.48,l,d.tile);
  part('paint',0,h+.02,0,w-.08,.04,l-.12,0);
  for(const side of [-1,1]){
   for(let z=-l/2+.65;z<l/2-.6;z+=1.12){
    if(type==='articulated'&&Math.abs(z)<.65)continue;
    part('glass',side*(w/2+.007),2.21,z,.025,1.06,.99,7);
   }
   part('metal',side*(w/2+.05),2.2,-l/2+.28,.13,.17,.25,2);
  }
  part('glass',0,2.18,-l/2-.013,w-.23,1.27,.025,7);part('glass',0,2.1,l/2+.012,w-.38,.9,.025,7);
  // Low-floor double doors on the right; children slide at stops.
  for(const z of [-l/2+1.05,l*.12]){part('rubber',w/2+.017,1.55,z,.025,2.23,1.1,1);}
  part('metal',0,h+.16,1.9,w*.65,.25,2.5,12);
  if(type==='articulated')for(let z=-.63;z<.67;z+=.13){part('rubber',0,1.94,z,w+.04,2.85,.075,1);}
 }else{
  const cabLength=type==='schoolBus'?2:2.15,cabZ=-l/2+cabLength/2;
  part('paint',0,1.05,cabZ,w-.08,1.25,cabLength,d.tile||0);
  part('glass',0,2.02,cabZ+.17,w-.22,.88,cabLength*.7,7);
  part('paint',0,2.5,cabZ+.17,w-.12,.13,cabLength*.75,d.tile||0);
  part('paint',0,(h+.56)/2,d.roofZ,w,h-.56,d.roofLength,d.tile||0);
  part('paint',0,h-.035,d.roofZ,w-.08,.07,d.roofLength,0);
  if(['van','paratransit','ambulance'].includes(type)){
   for(const side of [-1,1])for(let z=-.1;z<l/2-.6;z+=1.1)part('glass',side*(w/2+.013),h-.65,z,.025,.65,.79,7);
  }
  if(type==='schoolBus')for(const side of [-1,1])for(let z=-l/2+2.4;z<l/2-.4;z+=.86)part('glass',side*(w/2+.01),2.29,z,.025,.76,.7,7);
  if(type==='fire'){
   for(const side of [-1,1])part('metal',side*(w/2+.016),1.5,1.2,.035,1.12,l*.55,12);
   part('metal',0,h+.1,.7,w*.48,.12,l*.6,2);
  }
  if(['fire','ambulance'].includes(type)){part('red',-.7,2.65,cabZ,.35,.16,.24);part('white',.7,2.65,cabZ,.35,.16,.24);}
 }
 // Bumpers, grille, headlamps and separate brake / indicator channels.
 for(const z of [-1,1])part('metal',0,.53,z*(l/2+.01),w*.92,.18,.12,2);
 part('metal',0,.84,-l/2-.07,w*.42,.3,.035,12);
 for(const side of [-1,1]){
  part('white',side*w*.36,.98,-l/2-.072,w*.19,.19,.04);
  part('red',side*w*.39,.9,l/2+.073,w*.12,.27,.04);
  for(const z of [-1,1])part(side<0?'amberLeft':'amberRight',side*w*.47,1.02,z*(l/2+.08),.08,.11,.035);
 }
 const axles=bus?(type==='articulated'?[-l/2+2.6,-.85,l/2-2.0]:[-l/2+2.6,l/2-2.3]):[-l*.3,l*.31];
 for(const z of axles)for(const side of [-1,1]){
  const tire=mapped(new THREE.CylinderGeometry(r,r,.22,16),1);tire.rotateZ(Math.PI/2);tire.translate(side*(w/2-.08),r+.05,z);setWheel(tire,side*(w/2-.08),r+.05,z);pieces.rubber.push(tire);
  const rim=mapped(new THREE.CylinderGeometry(r*.59,r*.59,.24,12),2);rim.rotateZ(Math.PI/2);rim.translate(side*(w/2-.08),r+.05,z);setWheel(rim,side*(w/2-.08),r+.05,z);pieces.metal.push(rim);
 }
 const group=new THREE.Group();
 for(const [kind,geometries] of Object.entries(pieces))if(geometries.length){const mesh=new THREE.Mesh(mergeGeometries(geometries),materials[kind]);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=kind;group.add(mesh);for(const g of geometries)g.dispose();}
 const imported=importedVehicle(type,d,materials,variant);
 if(imported){for(const child of [...group.children])if(!['white','red','amberLeft','amberRight'].includes(child.name))group.remove(child);for(const child of [...imported.children])group.add(child);group.userData.roofTriangles=imported.userData.roofTriangles;}
 const simple=new THREE.Mesh(new THREE.BoxGeometry(w,h-.45,l),paint);simple.position.y=(h+.45)/2;simple.name='distant';simple.visible=false;group.add(simple);
 const result={group,materials};templates.set(key,result);return result;
}
function setWheel(g,x,y,z){const part=g.attributes.wheelPart,center=g.attributes.wheelCenter;for(let i=0;i<part.count;i++){part.setX(i,1);center.setXYZ(i,x,y,z);}}
const displays=new Map();
function display(route,headsign){
 const key=`${route}:${headsign}`;if(displays.has(key))return displays.get(key);
 if(!globalThis.document)return null;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#101511';ctx.fillRect(0,0,512,64);ctx.fillStyle='#f2c367';ctx.font='bold 35px monospace';ctx.fillText(`${route} ${headsign.replace(/^SELECT BUS /,'')}`.slice(0,24),9,44);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mat=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});displays.set(key,mat);return mat;
}
export function makeVehicle(type,seed=0,route=null){
 const d=VEHICLES[type],base=template(type,Math.abs(Math.trunc(seed))%colors.length),root=base.group.clone();
 root.userData.wheelRoll={value:0};
 for(const mesh of root.children)if(mesh.geometry?.attributes.wheelPart&&['rubber','metal'].includes(mesh.name)){mesh.material=mesh.material.clone();mesh.material.onBeforeCompile=shader=>{shader.uniforms.wheelRoll=root.userData.wheelRoll;shader.vertexShader='uniform float wheelRoll; attribute vec3 wheelCenter; attribute float wheelPart;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nif(wheelPart>.5){float c=cos(wheelRoll),s=sin(wheelRoll);objectNormal.yz=mat2(c,s,-s,c)*objectNormal.yz;}').replace('#include <begin_vertex>','#include <begin_vertex>\nif(wheelPart>.5){float c=cos(wheelRoll),s=sin(wheelRoll);vec3 p=transformed-wheelCenter;p.yz=mat2(c,s,-s,c)*p.yz;transformed=wheelCenter+p;}');};mesh.material.customProgramCacheKey=()=> 'rolling-vehicle-wheels';}
 root.userData.type=type;root.userData.spec=d;
 // Light materials belong to the actor, so a stopped car cannot light all its peers.
 for(const kind of ['white','red','amberLeft','amberRight']){const mesh=root.getObjectByName(kind);if(mesh)mesh.material=mesh.material.clone();}
 if(route){
  const mat=display(route.route,route.headsign);
  if(mat){const front=new THREE.Mesh(new THREE.PlaneGeometry(d.width-.22,.33),mat);front.position.set(0,2.98,-d.length/2-.033);front.rotation.y=Math.PI;front.name='routeDisplay';root.add(front);}
  for(const z of [-d.length/2+1.05,d.length*.12])for(const side of [-1,1]){
   const door=new THREE.Mesh(new THREE.BoxGeometry(.035,2.13,.48),base.materials.glass);door.position.set(d.width/2+.043,1.55,z+side*.25);door.userData.closedZ=door.position.z;door.userData.direction=side;door.name='door';root.add(door);
  }
 }
 return root;
}
export function updateVehicleVisual(root,speed,braking,indicator,night,time,doors=0,distance=0,travel=0){
 root.userData.wheelRoll.value=-travel/root.userData.spec.wheel;
 const close=distance<100;
 for(const child of root.children){
  child.visible=child.name==='distant'?!close:close;
  if(child.name==='door')child.position.z=child.userData.closedZ+child.userData.direction*.42*doors;
 }
 const front=root.getObjectByName('white'),rear=root.getObjectByName('red');
 if(front)front.material.emissiveIntensity=.06+night*1.8;
 if(rear)rear.material.emissiveIntensity=braking?2:.05+night*.5;
 for(const [name,direction] of [['amberLeft',1],['amberRight',-1]]){const turn=root.getObjectByName(name);if(turn)turn.material.emissiveIntensity=indicator===direction&&Math.sin(time*9)>0?2:0;}
}

// Shared textured silhouettes: all distant instances of a class use one draw call.
export function makeVehicleBatch(type,capacity=4096){
 const d=VEHICLES[type],parts=[];
 function box(x,y,z,w,h,l,tile,color,paint=false){
  const g=mapped(new THREE.BoxGeometry(w,h,l),tile);g.translate(x,y,z);
  const c=new THREE.Color(color),count=g.attributes.position.count,colors=[],flags=[];
  for(let i=0;i<count;i++){colors.push(c.r,c.g,c.b);flags.push(paint?1:0);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('bodyPaint',new THREE.Float32BufferAttribute(flags,1));parts.push(g);
 }
 const car=['sedan','suv','taxi','taxiVan','rideshare','police'].includes(type),bus=['bus','articulated'].includes(type);
 if(car){box(0,.67,0,d.width,.75,d.length,d.tile||0,0xffffff,true);box(0,(d.height+.95)/2,d.roofZ,d.width-.18,d.height-.95,d.roofLength,7,0xc1d6df);box(0,d.height-.04,d.roofZ,d.width-.18,.08,d.roofLength,0,0xffffff,true);}
 else {box(0,(d.height+.5)/2,0,d.width,d.height-.5,d.length,d.tile||0,0xffffff,!d.tile);if(bus){for(const x of [-1,1])box(x*(d.width/2+.01),2.2,0,.025,1,d.length-.9,7,0xb5cbd6);box(0,2.18,-d.length/2-.02,d.width-.22,1.25,.03,7,0xb5cbd6);}else box(0,2.02,-d.length/2+.9,d.width-.18,.75,1.4,7,0xb5cbd6);}
 for(const z of [-d.length*.3,d.length*.31])for(const x of [-1,1])box(x*(d.width/2-.08),d.wheel+.04,z,.22,d.wheel*1.8,d.wheel*1.8,1,0x6b6b6b);
 for(const x of [-1,1]){box(x*d.width*.36,.95,-d.length/2-.035,d.width*.18,.18,.04,0,0xffefd1);box(x*d.width*.36,.92,d.length/2+.035,d.width*.12,.22,.04,0,0xe5573c);}
 const geometry=mergeGeometries(parts);for(const g of parts)g.dispose();
 const material=new THREE.MeshStandardMaterial({map:atlas,vertexColors:true,roughness:.72,metalness:.12});
 material.onBeforeCompile=shader=>{shader.vertexShader='attribute float bodyPaint;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>','#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nif(bodyPaint<.5) vColor.rgb = color;\n#endif');};material.customProgramCacheKey=()=> 'batched-vehicle-paint';
 const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;return mesh;
}
export function vehicleColor(type,seed){return type==='taxi'||type==='taxiVan'?0xeeb929:type==='fire'?0xc94b3e:colors[Math.abs(Math.trunc(seed))%colors.length];}
export function vehicleRoofTriangles(type,seed){return template(type,Math.abs(Math.trunc(seed))%colors.length).group.userData.roofTriangles;}
export function disposeVehicle(root){
 for(const mesh of root.children){if(['white','red','amberLeft','amberRight','rubber','metal'].includes(mesh.name))mesh.material.dispose();if(['door','routeDisplay'].includes(mesh.name))mesh.geometry.dispose();}
 root.removeFromParent();
}
