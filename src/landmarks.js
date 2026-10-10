import * as THREE from '../vendor/three.module.js';

// One WTC: square 200 ft base, eight tapering faces, rotated square roof at
// 1,368 ft, and mast to 1,776 ft. Align with the actual footprint rather than
// a guessed north-south box. This is an architectural approximation, not a scan.
export function buildWorldTradeCenter(parent,b,material){
 const ring=b.rings[0];let angle=0,longest=0;
 for(let i=0;i<ring.length;i++){
  const a=ring[i],d=ring[(i+1)%ring.length],length=Math.hypot(d[0]-a[0],d[1]-a[1]);
  if(length>longest){longest=length;angle=Math.atan2(-(d[1]-a[1]),d[0]-a[0]);}
 }
 const positions=[],normals=[],uvs=[],colors=[],kinds=[];
 const color=new THREE.Color(0x9eafb5),base=30.48,crown=31.24,podium=56.4,roof=417;
 function point([x,y,z]){return new THREE.Vector3(b.cx+x*Math.cos(angle)+z*Math.sin(angle),y,b.cz-x*Math.sin(angle)+z*Math.cos(angle));}
 function triangle(a,d,e,kind=4){
  const pts=[a,d,e].map(point),n=pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();
  const tangent=new THREE.Vector2(-n.z,n.x).normalize();
  for(const p of pts){positions.push(...p);normals.push(...n);uvs.push(kind===7?(p.x-b.cx)/3:(p.x*tangent.x+p.z*tangent.y)/3,kind===7?(p.z-b.cz)/3:p.y/3.3);colors.push(color.r,color.g,color.b);kinds.push(kind);}
 }
 const square=[[-base,-base],[base,-base],[base,base],[-base,base]],upper=[[0,-crown],[crown,0],[0,crown],[-crown,0]];
 for(let i=0;i<4;i++){
  const j=(i+1)%4,a=[square[i][0],podium,square[i][1]],d=[square[j][0],podium,square[j][1]],e=[upper[i][0],roof,upper[i][1]],f=[upper[j][0],roof,upper[j][1]];
  triangle(a,e,d);triangle(e,f,d);
  const lowA=[a[0],0,a[2]],lowD=[d[0],0,d[2]];
  triangle(lowA,a,lowD);triangle(a,d,lowD);
  triangle([0,roof,0],f,e,7);
 }
 const geometry=new THREE.BufferGeometry();
 for(const [name,data,size]of[['position',positions,3],['normal',normals,3],['uv',uvs,2],['color',colors,3],['facadeKind',kinds,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
 const tower=new THREE.Mesh(geometry,material);tower.name='One World Trade Center';parent.add(tower);
 const mast=new THREE.Mesh(new THREE.CylinderGeometry(.65,1.65,124,12),new THREE.MeshStandardMaterial({color:0xadb3b5,metalness:.65,roughness:.42}));mast.position.set(b.cx,479,b.cz);parent.add(mast);
 const gallery=new THREE.Mesh(new THREE.CylinderGeometry(3.5,4.5,5,12),mast.material);gallery.position.set(b.cx,419.5,b.cz);parent.add(gallery);
 for(const y of[433,448,470,495]){const ring=new THREE.Mesh(new THREE.TorusGeometry(y<450?2.4:1.3,.14,4,12),mast.material);ring.rotation.x=Math.PI/2;ring.position.set(b.cx,y,b.cz);parent.add(ring);}
}
