import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone} from '../vendor/SkeletonUtils.js';
let template,clips,loading;
export function loadBirdModel(){
 return loading??=(async()=>{
  const response=await fetch('./assets/pigeon/pigeon.glb');
  if(!response.ok)throw new Error('The pigeon model could not load. Serve Birdway over HTTP.');
  const gltf=await new GLTFLoader().parseAsync(await response.arrayBuffer(),'');
  template=gltf.scene;clips=gltf.animations;
  if(!template.getObjectByProperty('isSkinnedMesh',true)||!clips.some(c=>c.name==='Flight'))throw new Error('The pigeon rig or animations are missing.');
  template.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
 })();
}
export function makeBird(scale=1){
 if(!template)throw new Error('Load the pigeon rig before creating a bird.');
 const bird=new THREE.Group(),model=clone(template);bird.add(model);bird.scale.setScalar(scale);
 // Source is metres. GLTF already maps Blender +Y to the game's forward -Z.
 // A 35 cm body, roughly 60 cm wingspan, with feet 16 cm below the player origin.
 const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()),factor=.35/size.z;
 model.scale.set(factor*1.24,factor,factor);model.position.y=-.16;
 const mixer=new THREE.AnimationMixer(model),actions=new Map();
 for(const clip of clips)if(['Flight','Idle','Walk','Peck'].includes(clip.name))actions.set(clip.name,mixer.clipAction(clip));
 let current=actions.get('Idle'),lastTime=null,pecking=false;current.play();
 const change=name=>{const next=actions.get(name);if(!next||next===current)return;next.reset().setEffectiveWeight(1).play();current.crossFadeTo(next,.18,false);current=next;};
 bird.userData.animate=(time,flying,speed=0,peck=0)=>{
  const dt=lastTime===null?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
  const name=flying?'Flight':peck>0?'Peck':speed>.08?'Walk':'Idle';change(name);
  current.timeScale=name==='Flight'?1.8+Math.min(speed/160,.9):name==='Walk'?Math.min(2.8,.8+speed*.7):1;
  if(name==='Peck'){if(!pecking)current.reset();current.time=(1-peck)*current.getClip().duration;current.paused=true;}else current.paused=false;
  pecking=name==='Peck';mixer.update(dt);
 };
 bird.userData.animate(0,false);bird.userData.mixer=mixer;
 return bird;
}
