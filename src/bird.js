import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import * as THREE from '../vendor/three.module.js';
const materials={
 body:new THREE.MeshStandardMaterial({color:0x87949f,roughness:.8}),
 head:new THREE.MeshStandardMaterial({color:0x566672,roughness:.65}),
 neck:new THREE.MeshStandardMaterial({color:0x607f79,metalness:.36,roughness:.38}),
 purple:new THREE.MeshStandardMaterial({color:0x796b87,metalness:.3,roughness:.4}),
 wing:new THREE.MeshStandardMaterial({color:0x758493,roughness:.85}),
 dark:new THREE.MeshStandardMaterial({color:0x37434e,roughness:.8}),
 beak:new THREE.MeshStandardMaterial({color:0xaba79d}),
 foot:new THREE.MeshStandardMaterial({color:0xb58078}),
 eye:new THREE.MeshStandardMaterial({color:0xe5ac62}),
 pupil:new THREE.MeshStandardMaterial({color:0x111820}),
};
const sphere=new THREE.SphereGeometry(1,16,12);
function ellipsoid(parent,mat,pos,scale) {const m=new THREE.Mesh(sphere,materials[mat]);m.position.set(...pos);m.scale.set(...scale);parent.add(m);return m;}
export function makeBird(scale=1) {
 const bird=new THREE.Group(),body=new THREE.Group();bird.add(body);bird.scale.setScalar(scale);
 ellipsoid(body,'body',[0,0,0],[.46,.52,.79]);
 const neck=ellipsoid(body,'neck',[0,.37,-.43],[.28,.42,.32]);neck.rotation.x=-.25;
 ellipsoid(body,'purple',[0,.27,-.67],[.22,.28,.13]);
 const head=new THREE.Group();head.position.set(0,.72,-.61);body.add(head);
 ellipsoid(head,'head',[0,0,0],[.29,.29,.32]);
 ellipsoid(head,'beak',[0,-.08,-.37],[.095,.075,.17]);
 ellipsoid(head,'body',[0,-.035,-.28],[.115,.075,.07]);
 for(const s of [-1,1]) {ellipsoid(head,'eye',[s*.269,.045,-.08],[.031,.067,.067]);ellipsoid(head,'pupil',[s*.295,.045,-.09],[.016,.039,.042]);ellipsoid(head,'beak',[s*.309,.061,-.105],[.008,.014,.014]);}
 const tail=new THREE.Group();tail.position.set(0,-.15,.62);body.add(tail);
 for(let i=0;i<7;i++){const f=ellipsoid(tail,'dark',[(i-3)*.082,-.015,.29],[.066,.047,.38]);f.rotation.y=(i-3)*-.07;}
 const wings=[];
 for(const side of [-1,1]) {
  const pivot=new THREE.Group();pivot.position.set(side*.35,.14,-.1);body.add(pivot);wings.push(pivot);
  ellipsoid(pivot,'wing',[side*.35,-.02,.05],[.48,.12,.53]);
  for(let i=0;i<9;i++) {const feather=ellipsoid(pivot,'wing',[side*(.44+i*.09),-.035,.18+i*.03],[.13,.055,.47-i*.018]);feather.rotation.y=side*(.22+i*.03);}
  for(let j=0;j<2;j++) {const band=ellipsoid(pivot,'dark',[side*(.26+j*.20),.084,.14],[.062,.03,.43]);band.rotation.y=side*.13;}
 }
 const feet=new THREE.Group();body.add(feet);
 for(const side of [-1,1]) {ellipsoid(feet,'foot',[side*.18,-.50,.04],[.038,.16,.038]);for(let i=-1;i<=1;i++){const toe=ellipsoid(feet,'foot',[side*.18+i*.06,-.64,-.11],[.026,.025,.16]);toe.rotation.y=i*.3;}}
 // Merge static feathers within each animated joint, keeping the model light for a flock.
 for(const parent of [body,head,tail,feet,...wings]){const groups=new Map();for(const child of [...parent.children])if(child.isMesh){child.updateMatrix();if(!groups.has(child.material))groups.set(child.material,[]);groups.get(child.material).push(child);}for(const [material,children]of groups){if(children.length<2)continue;const copies=children.map(m=>m.geometry.clone().applyMatrix4(m.matrix));const geometry=mergeGeometries(copies);copies.forEach(g=>g.dispose());children.forEach(m=>parent.remove(m));parent.add(new THREE.Mesh(geometry,material));}}
 bird.userData.animate=(time,flying,speed=0,peck=0)=> {
  const flap=flying?Math.sin(time*(speed>35?8:11))*.33:0;
  wings[0].rotation.z=flying?.12+flap:1.20;wings[1].rotation.z=flying?-.12-flap:-1.20;
  wings[0].rotation.y=flying?-.12: .20;wings[1].rotation.y=flying?.12:-.20;
  feet.visible=!flying;tail.rotation.x=flying?.06:-.18;
  body.position.y=!flying&&speed>.1?Math.sin(time*15)*.05:0;
  head.rotation.x=peck>0?Math.sin(peck*Math.PI)*1.1:(!flying&&speed>.1?Math.sin(time*15)*.07:0);
 };
 return bird;
}
