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
  if(!template.getObjectByProperty('isSkinnedMesh',true)||!clips.some(c=>c.name==='Flight')||!clips.some(c=>c.name==='Glide')||!clips.some(c=>c.name==='Flare'))throw new Error('The pigeon rig or animations are missing.');
  template.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
 })();
}
export function makeBird(scale=1){
 if(!template)throw new Error('Load the pigeon rig before creating a bird.');
 const bird=new THREE.Group(),model=clone(template);bird.add(model);bird.scale.setScalar(scale);
 // Throttled shadow draws advance Three's skeleton cache frame separately
 // from the color pass. Refresh after scene transforms, just before drawing:
 // otherwise the cached world-space bones can trail a moving bird by a frame.
 model.traverse(o=>{if(o.isSkinnedMesh)o.onBeforeRender=()=>o.skeleton.update();});
 // Source is metres. GLTF already maps Blender +Y to the game's forward -Z.
 // A 35 cm body, roughly 60 cm wingspan, with feet 16 cm below the player origin.
 const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()),factor=.35/size.z;
 // Keep the torso at its measured width; flight clips restore the full
 // wingspan through the wing bones without widening the body.
 model.scale.set(factor,factor,factor);model.position.y=-.16;
 const mixer=new THREE.AnimationMixer(model),actions=new Map();
 for(const clip of clips)if(['Flight','Glide','Flare','Idle','Walk','Peck'].includes(clip.name))actions.set(clip.name,mixer.clipAction(clip));
 let current=actions.get('Idle'),lastTime=null,pecking=false,walkPhase=0;
 const upperLegs=['left-upper-leg-bone','right-upper-leg-bone'].map(n=>model.getObjectByName(n));
 const lowerLegs=['left-lower-leg-bone','right-lower-leg-bone'].map(n=>model.getObjectByName(n));
 const walkRotation=new THREE.Quaternion(),walkAxis=new THREE.Vector3(1,0,0),modelY=model.position.y;current.play();
 const change=name=>{const next=actions.get(name);if(!next||next===current)return;next.reset().setEffectiveWeight(1).play();current.crossFadeTo(next,.18,false);current=next;};
 bird.userData.animate=(time,flying,speed=0,peck=0,flightMode=null)=>{
  const dt=lastTime===null?0:Math.max(0,Math.min(.1,time-lastTime));lastTime=time;
  const flightAnimation=flightMode?(flightMode.landing?'Flare':flightMode.glide||flightMode.flapStrength<.18?'Glide':'Flight'):'Flight';
  const name=flying?flightAnimation:peck>0?'Peck':speed>.08?'Walk':'Idle';change(name);
  current.timeScale=name==='Flight'?5.5+Math.min(speed/120,1):name==='Walk'?Math.min(3.2,.9+speed*.62):1;
  bird.userData.flapFrequency=name==='Flight'?current.timeScale:0;
  if(name==='Peck'){if(!pecking)current.reset();current.time=(1-peck)*current.getClip().duration;current.paused=true;}else current.paused=false;
  pecking=name==='Peck';mixer.update(dt);
  if(name==='Walk'){
   walkPhase+=dt*(6+Math.min(speed,5)*3.4);
   const bob=Math.abs(Math.sin(walkPhase*2));
   for(let i=0;i<2;i++){
    const phase=walkPhase+(i===0?0:Math.PI),swing=Math.sin(phase)*.32,step=Math.max(0,Math.cos(phase));
    walkRotation.setFromAxisAngle(walkAxis,swing);if(upperLegs[i])upperLegs[i].quaternion.multiply(walkRotation);
    walkRotation.setFromAxisAngle(walkAxis,step*.42);if(lowerLegs[i])lowerLegs[i].quaternion.multiply(walkRotation);
   }
   model.position.y=modelY+.004+bob*.014;
  }else{
   model.position.y=modelY;
  }
  bird.userData.animationName=name;bird.userData.walkPhase=walkPhase;bird.userData.flightPose=name==='Flare'?'flare':name==='Glide'?'glide':name==='Flight'?'flap':null;
 };
 bird.userData.animate(0,false);bird.userData.mixer=mixer;
 return bird;
}
