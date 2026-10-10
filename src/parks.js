import * as THREE from '../vendor/three.module.js';

const PARK_COLORS={park:0x91a77e,grass:0x92a980,wood:0x718b68,forest:0x76916c,recreation_ground:0x91a77e,pitch:0x78966e,playground:0x9aa77a,plaza:0xb5ae98,garden:0x829773};
const PATH_COLORS={footway:0xb9b29e,steps:0xb5ad99,cycleway:0xb1ad9c,pedestrian:0xc2baa4,path:0xb5b09d};
const SURFACE_COLORS={asphalt:0xaaa89b,concrete:0xbcb9a9,paving_stones:0xc4bda9,paved:0xbab5a2,wood:0x9f8c6c,gravel:0xaaa28b,dirt:0x9c927a};
const chunkKey=(x,z)=>`${Math.floor(x/1600)},${Math.floor(z/1600)}`;

export async function loadParks(){
 const response=await fetch('./data/parks.json');
 if(!response.ok)throw new Error('The park and path data could not load. Serve the birdway folder over HTTP.');
 return response.json();
}

function trianglesForRings(rings,y,out,color){
 if(!rings?.length||rings[0].length<3)return;
 const contours=rings.map(r=>{
  const clean=r.length>1&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?r.slice(0,-1):r;
  return clean.map(([x,z])=>new THREE.Vector2(x,-z));
 });
 const flat=contours.flatMap(r=>r.map(p=>[p.x,-p.y]));
 let faces;
 try{faces=THREE.ShapeUtils.triangulateShape(contours[0],contours.slice(1));}catch{return;}
 for(const face of faces){
  for(const index of face){const p=flat[index];if(p){out.positions.push(p[0],y,p[1]);out.colors.push(color.r,color.g,color.b);}}
 }
}

function chunkLayer(map,key){if(!map.has(key))map.set(key,{positions:[],colors:[]});return map.get(key);}
function addVertexColoredMesh(parent,chunk,renderOrder){
 if(!chunk.positions.length)return;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(chunk.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(chunk.colors,3));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
 const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=renderOrder;mesh.receiveShadow=true;parent.add(mesh);
}

function addMergedLayers(scene,data){
 const parkChunks=new Map(),detailChunks=new Map();
 for(const park of data.parks||[]){
  const ring=park.rings?.[0];if(!ring?.length)continue;
  const k=chunkKey(ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length);
  const detailed=['garden','plaza','pitch','playground'].includes(park.kind),kind=PARK_COLORS[park.kind]?park.kind:'park';
  const materialColor=SURFACE_COLORS[park.surface]||PARK_COLORS[kind],color=new THREE.Color(materialColor);
  trianglesForRings(park.rings,detailed?-.115:-.14,chunkLayer(detailed?detailChunks:parkChunks,k),color);
 }
 const root=new THREE.Group();root.name='OpenStreetMap parks and paths';scene.add(root);
 for(const chunk of parkChunks.values())addVertexColoredMesh(root,chunk,-65);
 for(const chunk of detailChunks.values())addVertexColoredMesh(root,chunk,-60);

 const pathChunks=new Map();
 for(const path of data.paths||[]){
  const points=path.points;if(!points||points.length<2)continue;
  const key=chunkKey((points[0][0]+points.at(-1)[0])/2,(points[0][1]+points.at(-1)[1])/2);
  const out=chunkLayer(pathChunks,key),kind=PATH_COLORS[path.kind]?path.kind:'footway';
  const color=new THREE.Color(SURFACE_COLORS[path.surface]||PATH_COLORS[kind]),width=kind==='pedestrian'?4.5:kind==='cycleway'?3.1:kind==='steps'?2.3:1.9;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)continue;
   const nx=-dz/length*width/2,nz=dx/length*width/2;
   const quad=[[a[0]+nx,-.085,a[1]+nz],[a[0]-nx,-.085,a[1]-nz],[b[0]+nx,-.085,b[1]+nz],[b[0]-nx,-.085,b[1]-nz]];
   for(const i of [0,2,1,1,2,3]){out.positions.push(...quad[i]);out.colors.push(color.r,color.g,color.b);}
  }
 }
 for(const chunk of pathChunks.values())addVertexColoredMesh(root,chunk,-50);
 return root;
}

function addTrees(scene,data){
 const trees=data.trees||[],limit=4000,stride=Math.max(1,Math.ceil(trees.length/limit)),chunks=new Map();
 for(let i=0;i<trees.length;i+=stride){
  const [x,z,leaf]=trees[i],k=chunkKey(x,z);if(!chunks.has(k))chunks.set(k,[]);chunks.get(k).push([x,z,leaf,i]);
 }
 const trunkGeometry=new THREE.CylinderGeometry(.16,.25,1,6),trunkMaterial=new THREE.MeshStandardMaterial({color:0x766c52,roughness:1});
 const broadGeometry=new THREE.SphereGeometry(1,8,6),needleGeometry=new THREE.ConeGeometry(1,2,7);
 const broadMaterial=new THREE.MeshStandardMaterial({color:0x78946d,roughness:1}),needleMaterial=new THREE.MeshStandardMaterial({color:0x607b60,roughness:1});
 const dummy=new THREE.Object3D(),root=new THREE.Group();root.name='OpenStreetMap trees';scene.add(root);
 const records=[];
 for(const [key,items] of chunks){
  const [cx,cz]=key.split(',').map(Number),trunks=new THREE.InstancedMesh(trunkGeometry,trunkMaterial,items.length),broad=items.filter(t=>t[2]!=='needleleaved'),needle=items.filter(t=>t[2]==='needleleaved'),objects=[trunks];
  trunks.castShadow=true;
  for(let j=0;j<items.length;j++){
   const [x,z,,seed]=items[j],height=4.6+Math.sin(seed*12.9898)*1.1;
   dummy.position.set(x,height*.42,z);dummy.scale.set(1,height*.84,1);dummy.updateMatrix();trunks.setMatrixAt(j,dummy.matrix);
  }
  root.add(trunks);
  for(const [group,geometry,material,conifer] of [[broad,broadGeometry,broadMaterial,false],[needle,needleGeometry,needleMaterial,true]])if(group.length){
   const crown=new THREE.InstancedMesh(geometry,material,group.length*2);
   group.forEach(([x,z,,seed],i)=>{
    const h=4.6+Math.sin(seed*12.9898)*1.1;
    for(let j=0;j<2;j++){
     const s=2.1+((seed+j*17)%7+7)%7*.11;
     dummy.position.set(x+(j?1:-1)*.52,h+(j?1.25:.6),z+(j?-.38:.4));dummy.scale.set(s,conifer?s*1.25:s*.82,s);dummy.rotation.set(0,seed*.17+j,0);dummy.updateMatrix();crown.setMatrixAt(i*2+j,dummy.matrix);
     crown.setColorAt(i*2+j,new THREE.Color().setHSL(conifer?.31:.26,.19,.30+((seed+j*13)%9+9)%9*.009));
    }
    });crown.castShadow=true;objects.push(crown);root.add(crown);
  }
  records.push({cx:cx*1600+800,cz:cz*1600+800,objects});
 }
 return {root,update(position){for(const c of records){const visible=Math.hypot(position.x-c.cx,position.z-c.cz)<2100;for(const o of c.objects)o.visible=visible;}}};
}

export function buildParkWorld(scene,data){
 const root=addMergedLayers(scene,data),trees=addTrees(scene,data);
 return {root,update:trees.update};
}
