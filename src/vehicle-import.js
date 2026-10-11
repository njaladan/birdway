import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';

const names={sedan:'sedan',suv:'suv',taxi:'taxi',taxiVan:'van',rideshare:'suv',van:'van',boxTruck:'delivery',sanitation:'garbage-truck',ambulance:'ambulance',fire:'firetruck',police:'police'};
const sources=new Map();
export async function loadVehicleModels(){
 const loader=new GLTFLoader();await Promise.all([...new Set(Object.values(names))].map(async name=>{
  const gltf=await loader.loadAsync(`./assets/vehicles/kenney/${name}.glb`);gltf.scene.updateMatrixWorld(true);sources.set(name,gltf.scene);
 }));
}
export function importedVehicle(type,spec,materials,variant){
 const source=sources.get(names[type]);if(!source)return null;
 const bounds=new THREE.Box3().setFromObject(source),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 const group=new THREE.Group(),buckets={paint:[],glass:[],metal:[],rubber:[]},roofs=[];
 const paletteMesh=source.getObjectByName('body')||source.children.find(c=>c.isMesh),image=paletteMesh.material.map.image;
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;
 const passenger=['sedan','suv','rideshare'].includes(type),paintColor=new THREE.Color([0xe6e4de,0x383d44,0xaeb6b9,0x5f6b76,0x773c3b,0xb6b1a5,0x42616b][variant%7]);
 source.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone(),p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,wheel=mesh.name.includes('wheel');
  const groups={paint:[],glass:[],metal:[],rubber:[]};const point=new THREE.Vector3(),normal=new THREE.Vector3(),matrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for(let i=0;i<p.count;i+=3){
   const ix=Math.min(image.width-1,Math.max(0,Math.floor(uv.getX(i)*image.width))),iy=Math.min(image.height-1,Math.max(0,Math.floor((1-uv.getY(i))*image.height))),index=(iy*image.width+ix)*4;
   const rgb=[pixels[index],pixels[index+1],pixels[index+2]],brightness=Math.max(...rgb),glass=!wheel&&rgb[2]>rgb[0]*1.16&&rgb[2]>rgb[1]*.97;
   const kind=glass?'glass':brightness<65?'rubber':wheel?'metal':'paint';
   const tile=kind==='glass'?7:kind==='rubber'?1:kind==='metal'?2:spec.tile||0;
   const triangle=[];
   for(let k=i;k<i+3;k++){
    point.fromBufferAttribute(p,k).applyMatrix4(mesh.matrixWorld);normal.fromBufferAttribute(n,k).applyMatrix3(matrix).normalize();
    const x=-(point.x-center.x)*spec.width/size.x,y=(point.y-bounds.min.y)*spec.height/size.y,z=-(point.z-center.z)*spec.length/size.z;
    const nx=-normal.x,ny=normal.y,nz=-normal.z;
    const tx=Math.abs(nx)>.6?(z/spec.length+.5):x/spec.width+.5,ty=Math.abs(ny)>.6?(z/spec.length+.5):y/spec.height;
    // Project across the original silhouette, replacing palette-point UVs with actual surface detail.
    const u=((tile%4)+.02+Math.max(0,Math.min(1,tx))*.96)/4,v=(3-Math.floor(tile/4)+.02+Math.max(0,Math.min(1,ty))*.96)/4;
    const tint=kind==='paint'&&passenger?paintColor:kind==='paint'&&!spec.tile?new THREE.Color().setRGB(rgb[0]/255,rgb[1]/255,rgb[2]/255,THREE.SRGBColorSpace):new THREE.Color(0xffffff);
    groups[kind].push(x,y,z,nx,ny,nz,u,v,tint.r,tint.g,tint.b);triangle.push(x,y,z);
   }
   if(!wheel&&normal.y>.45)roofs.push(...triangle);
  }
  for(const [kind,values] of Object.entries(groups))if(values.length){
   const positions=[],normals=[],tex=[],colors=[],wheelParts=[],wheelCenters=[];const sourceCenter=new THREE.Vector3();mesh.getWorldPosition(sourceCenter);const wheelCenter=[-(sourceCenter.x-center.x)*spec.width/size.x,(sourceCenter.y-bounds.min.y)*spec.height/size.y,-(sourceCenter.z-center.z)*spec.length/size.z];
   for(let i=0;i<values.length;i+=11){positions.push(...values.slice(i,i+3));normals.push(...values.slice(i+3,i+6));tex.push(...values.slice(i+6,i+8));colors.push(...values.slice(i+8,i+11));wheelParts.push(wheel?1:0);wheelCenters.push(...wheelCenter);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(tex,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('wheelPart',new THREE.Float32BufferAttribute(wheelParts,1));g.setAttribute('wheelCenter',new THREE.Float32BufferAttribute(wheelCenters,3));buckets[kind].push(g);
  }
  geometry.dispose();
 });
 for(const [kind,geometries] of Object.entries(buckets))if(geometries.length){
  const material=materials[kind].clone();material.color.set(0xffffff);material.vertexColors=true;
  const mesh=new THREE.Mesh(mergeGeometries(geometries),material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=kind;group.add(mesh);for(const g of geometries)g.dispose();
 }
 group.userData.roofTriangles=roofs;return group;
}
export function triangleRoof(triangles,x,z){
 let height=-Infinity;
 for(let i=0;i<triangles.length;i+=9){
  const ax=triangles[i],az=triangles[i+2],bx=triangles[i+3],bz=triangles[i+5],cx=triangles[i+6],cz=triangles[i+8];
  const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-7)continue;
  const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,w=1-u-v;
  if(u>=0&&v>=0&&w>=0)height=Math.max(height,u*triangles[i+1]+v*triangles[i+4]+w*triangles[i+7]);
 }return Number.isFinite(height)?height:null;
}
