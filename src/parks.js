import * as THREE from '../vendor/three.module.js';
import {makeGroundMaterial,createGrassDetail,loadGroundTextures} from './ground.js';
import {buildTrees,loadTrees} from './trees.js';

const PARK_COLORS={park:0x718d59,grass:0x799560,wood:0x53784c,forest:0x5c7e48,recreation_ground:0x718d59,pitch:0x6b8a57,playground:0x87916f,plaza:0xb5ae98,garden:0x63804d};
const PATH_COLORS={footway:0xb9b29e,steps:0xb5ad99,cycleway:0xb1ad9c,pedestrian:0xc2baa4,path:0xb5b09d};
const SURFACE_COLORS={asphalt:0xaaa89b,concrete:0xbcb9a9,paving_stones:0xc4bda9,paved:0xbab5a2,wood:0x9f8c6c,gravel:0xaaa28b,dirt:0x9c927a};
const chunkKey=(x,z)=>`${Math.floor(x/1600)},${Math.floor(z/1600)}`;

export async function loadParks(jersey=null){
 const [, , response, treeResponse]=await Promise.all([loadTrees(),loadGroundTextures(),fetch('./data/parks.json'),fetch('./data/street-trees.json')]);
 if(!response.ok)throw new Error('The park and path data could not load. Serve the birdway folder over HTTP.');
 const data=await response.json();
 if(treeResponse.ok){const census=await treeResponse.json();data.streetTrees=census.trees;data.streetTreeSource=census.source;}
 if(jersey){data.parks.push(...jersey.parks);data.paths.push(...jersey.paths);data.trees.push(...jersey.trees);data.streetTrees=[...(data.streetTrees||[]),...jersey.streetTrees];}
 return data;
}

function groundKind(surface,kind='',name=''){
 const s=String(surface||'').toLowerCase();
 if(/asphalt|tarmac|macadam/.test(s))return 2;
 if(/soil|dirt|earth|ground|mud/.test(s))return 3;
 if(s==='concrete'||s==='concrete:plates'||/zuccotti/i.test(name))return 1.25;
 if(/concrete|paving|paved|sett|stone|wood|gravel|sand|rubber|tartan|acrylic|metal|compacted/.test(s)||kind==='plaza'||PATH_COLORS[kind])return 1;
 return 0;
}

function trianglesForRings(rings,y,out,color,ground){
 if(!rings?.length||rings[0].length<3)return;
 const contours=rings.map(r=>{
  const clean=r.length>1&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?r.slice(0,-1):r;
  return clean.map(([x,z])=>new THREE.Vector2(x,-z));
 });
 const flat=contours.flatMap(r=>r.map(p=>[p.x,-p.y]));
 let faces;
 try{faces=THREE.ShapeUtils.triangulateShape(contours[0],contours.slice(1));}catch{return;}
 for(const face of faces){
  for(const index of face){const p=flat[index];if(p){out.positions.push(p[0],y,p[1]);out.colors.push(color.r,color.g,color.b);out.groundKinds.push(ground);}}
 }
}

function chunkLayer(map,key){if(!map.has(key))map.set(key,{positions:[],colors:[],groundKinds:[]});return map.get(key);}
function addVertexColoredMesh(parent,chunk,renderOrder){
 if(!chunk.positions.length)return;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(chunk.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(chunk.colors,3));geometry.setAttribute('groundKind',new THREE.Float32BufferAttribute(chunk.groundKinds,1));geometry.computeVertexNormals();
 const material=makeGroundMaterial();
 const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=renderOrder;mesh.receiveShadow=true;parent.add(mesh);
}

function addMergedLayers(scene,data){
 const parkChunks=new Map(),detailChunks=new Map();
 for(const park of data.parks||[]){
  const ring=park.rings?.[0];if(!ring?.length)continue;
  const k=chunkKey(ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length);
  const detailed=['garden','plaza','pitch','playground'].includes(park.kind),kind=PARK_COLORS[park.kind]?park.kind:'park';
  const materialColor=SURFACE_COLORS[park.surface]||PARK_COLORS[kind],color=new THREE.Color(materialColor);
  trianglesForRings(park.rings,0,chunkLayer(detailed?detailChunks:parkChunks,k),color,groundKind(park.surface,kind,park.name));
 }
 const root=new THREE.Group();root.name='OpenStreetMap parks and paths';scene.add(root);
 for(const chunk of parkChunks.values())addVertexColoredMesh(root,chunk,-65);
 for(const chunk of detailChunks.values())addVertexColoredMesh(root,chunk,-60);

 const pathChunks=new Map();
 for(const path of data.paths||[]){
  const points=path.points;if(!points||points.length<2)continue;
  const key=chunkKey((points[0][0]+points.at(-1)[0])/2,(points[0][1]+points.at(-1)[1])/2);
  const out=chunkLayer(pathChunks,key),kind=PATH_COLORS[path.kind]?path.kind:'footway';
  const color=new THREE.Color(SURFACE_COLORS[path.surface]||PATH_COLORS[kind]),width=kind==='pedestrian'?4.5:kind==='cycleway'?3.1:kind==='steps'?2.3:1.9,gk=groundKind(path.surface,kind);
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)continue;
   const nx=-dz/length*width/2,nz=dx/length*width/2;
   const quad=[[a[0]+nx,.005,a[1]+nz],[a[0]-nx,.005,a[1]-nz],[b[0]+nx,.005,b[1]+nz],[b[0]-nx,.005,b[1]-nz]];
   for(const i of [0,2,1,1,2,3]){out.positions.push(...quad[i]);out.colors.push(color.r,color.g,color.b);out.groundKinds.push(gk);}
  }
 }
 for(const chunk of pathChunks.values())addVertexColoredMesh(root,chunk,-50);
 return root;
}

export function buildParkWorld(scene,data,map=null){
 const root=addMergedLayers(scene,data),trees=buildTrees(scene,data),grass=createGrassDetail(scene,data,map);
 return {root,update(position,time){trees.update(position,time);grass.update(position,time);}};
}
