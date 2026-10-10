import * as THREE from '../vendor/three.module.js';
import {rand} from './city.js';
export function makeSky(scene) {
 const uniforms={sun:{value:new THREE.Vector3()},top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},sunColor:{value:new THREE.Color()},night:{value:0},time:{value:0}};
 const sky=new THREE.Mesh(new THREE.SphereGeometry(14000,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms,vertexShader:`varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 direction; uniform vec3 sun,top,horizon,sunColor;uniform float night;void main(){vec3 d=normalize(direction);float h=max(d.y,0.);vec3 c=mix(horizon,top,pow(h,.55));float a=max(dot(d,normalize(sun)),0.);c+=sunColor*(pow(a,180.)*.55+pow(a,22.)*.20);c=mix(c,vec3(1.,.92,.70),smoothstep(.9994,.9998,a)*smoothstep(-.02,.03,sun.y));gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}` }));scene.add(sky);
 const sunLight=new THREE.DirectionalLight(0xffe2b8,2.3);scene.add(sunLight);scene.add(sunLight.target);
 sunLight.castShadow=true;sunLight.shadow.mapSize.set(1024,1024);sunLight.shadow.camera.left=sunLight.shadow.camera.bottom=-160;sunLight.shadow.camera.right=sunLight.shadow.camera.top=160;sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=1800;sunLight.shadow.normalBias=.45;sunLight.shadow.bias=-.00015;
 const hemi=new THREE.HemisphereLight(0xe3f1ed,0x75796b,1.25);scene.add(hemi);
 const waterUniforms={time:{value:0},night:{value:0},gold:{value:0},sky:{value:new THREE.Color(0xa0c5bd)}};
 const water=new THREE.Mesh(new THREE.PlaneGeometry(35000,35000),new THREE.ShaderMaterial({uniforms:waterUniforms,vertexShader:`varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 world;uniform float time,night,gold;uniform vec3 sky;void main(){float wave=sin(world.x*.035+time*.3)*sin(world.z*.025-time*.2);float small=sin(world.x*.13+world.z*.11+time*.4);vec3 c=mix(vec3(.28,.46,.48),vec3(.055,.11,.18),night);c+=sky*(wave*.025+small*.012);float stripe=pow(max(0.,sin(world.x*.0008+world.z*.0011)),12.)*(.5+.5*wave);c+=vec3(.61,.32,.12)*stripe*gold*.48;gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}` }));water.material.depthWrite=false;water.renderOrder=-100;water.rotation.x=-Math.PI/2;water.position.y=-.8;scene.add(water);
 const clouds=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),new THREE.MeshBasicMaterial({color:0xf5e7d6,transparent:true,opacity:.42,depthWrite:false}),90);
 const dummy=new THREE.Object3D();for(let i=0;i<90;i++){dummy.position.set((rand(i)-.5)*18000,900+rand(i+500)*850,(rand(i+30)-.5)*18000);dummy.scale.set(120+rand(i+700)*360,35+rand(i+800)*55,70+rand(i+900)*160);dummy.updateMatrix();clouds.setMatrixAt(i,dummy.matrix);}scene.add(clouds);
 const starsGeo=new THREE.BufferGeometry(),points=[];for(let i=0;i<450;i++){const theta=rand(i+1000)*Math.PI*2,y=rand(i+1500)*.9+.1,r=Math.sqrt(1-y*y);points.push(Math.cos(theta)*r*11000,y*11000,Math.sin(theta)*r*11000);}starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));const starMat=new THREE.PointsMaterial({color:0xf5eee4,size:9,transparent:true,opacity:0,depthWrite:false});const stars=new THREE.Points(starsGeo,starMat);scene.add(stars);
 const topDay=new THREE.Color(0x77aebd),topDusk=new THREE.Color(0x717c9f),topNight=new THREE.Color(0x111e37);
 const dayHorizon=new THREE.Color(0xd1dac8),duskHorizon=new THREE.Color(0xefb08a),nightHorizon=new THREE.Color(0x394954);
 scene.fog=new THREE.FogExp2(0xd1dac8,.00016);
 function update(hours,elapsed,position) {
  const angle=(hours-6)/24*Math.PI*2,alt=Math.sin(angle),night=1-THREE.MathUtils.smoothstep(alt,-.15,.2),dusk=1-THREE.MathUtils.smoothstep(Math.abs(alt),.05,.48);
  uniforms.sun.value.set(Math.cos(angle),alt,-.35);uniforms.top.value.copy(topDay).lerp(topDusk,dusk*.6).lerp(topNight,night);uniforms.horizon.value.copy(dayHorizon).lerp(duskHorizon,dusk).lerp(nightHorizon,night);uniforms.sunColor.value.set(0xffd1a0).multiplyScalar(1-night);uniforms.night.value=night;
  sunLight.target.position.copy(position);sunLight.position.copy(uniforms.sun.value).normalize().multiplyScalar(800).add(position);sunLight.intensity=(.45+Math.max(0,alt)*2.7)*(1-night);sunLight.color.set(dusk>.4?0xffd2a6:0xffefd9);
  // Cool skylight keeps brick, glass and stone distinct while the sun turns warm.
  hemi.intensity=1.25-night*.65;hemi.color.set(0xddeaf3).lerp(new THREE.Color(0x657a9f),night);hemi.groundColor.set(0x74776e).lerp(new THREE.Color(0x323c4c),night);
  scene.fog.color.copy(uniforms.horizon.value);waterUniforms.time.value=elapsed;waterUniforms.night.value=night;waterUniforms.gold.value=dusk*(1-night);waterUniforms.sky.value.copy(uniforms.horizon.value);starMat.opacity=night*.7;clouds.material.opacity=.35*(1-night*.7);clouds.material.color.copy(uniforms.horizon.value).lerp(new THREE.Color(0xffffff),.35);
  sky.position.copy(position);stars.position.copy(position);clouds.position.x=elapsed*1.2;
  return {night,dusk};
 }
 return {update};
}
