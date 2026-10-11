import * as THREE from '../vendor/three.module.js';
import {rand} from './city.js';
import {makeWater} from './water.js';
export function makeSky(scene) {
 const uniforms={sun:{value:new THREE.Vector3()},top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},sunColor:{value:new THREE.Color()},night:{value:0},time:{value:0}};
 const sky=new THREE.Mesh(new THREE.SphereGeometry(14000,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms,vertexShader:`varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 direction; uniform vec3 sun,top,horizon,sunColor;uniform float night,time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float cloudField(vec2 p){float n=0.,amp=.55;for(int i=0;i<3;i++){n+=noise(p)*amp;p=p*2.03+vec2(13.1,7.7);amp*=.5;}return n;}
void main(){vec3 d=normalize(direction);float h=max(d.y,0.);vec3 c=mix(horizon,top,pow(h,.55));float a=max(dot(d,normalize(sun)),0.);c+=sunColor*(pow(a,180.)*.55+pow(a,22.)*.20);c=mix(c,vec3(1.,.92,.70),smoothstep(.9994,.9998,a)*smoothstep(-.02,.03,sun.y));
 // Two gently drifting cloud strata, projected across the sky dome. Soft
 // coverage edges and low contrast keep them atmospheric rather than graphic.
 vec2 cp=d.xz/max(.16,d.y+.36);
 float c1=cloudField(cp*1.65+vec2(time*.0018,-time*.0007));
 float c2=cloudField(cp*3.4+vec2(-time*.0011,time*.0014));
 float cover=smoothstep(.48,.76,c1*.72+c2*.28)*smoothstep(-.12,.12,d.y)*(1.-smoothstep(.58,.92,d.y));
 vec3 cloudTint=mix(horizon,vec3(1.,.94,.84),.48+max(d.y,0.)*.18);
 c=mix(c,cloudTint,cover*(.20+.30*(1.-night)));
 gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}` }));
 // Ground layers avoid depth writes to prevent coplanar flicker. Paint the sky
 // first, or its distant sphere erases water, roads and parks afterward.
 sky.renderOrder=-120;sky.material.depthTest=false;scene.add(sky);
 const sunLight=new THREE.DirectionalLight(0xffe2b8,2.3);scene.add(sunLight);scene.add(sunLight.target);
 sunLight.castShadow=true;sunLight.shadow.mapSize.set(768,768);sunLight.shadow.autoUpdate=false;sunLight.shadow.camera.left=sunLight.shadow.camera.bottom=-160;sunLight.shadow.camera.right=sunLight.shadow.camera.top=160;sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=1800;sunLight.shadow.normalBias=.45;sunLight.shadow.bias=-.00015;
 let lastShadow=-Infinity,lastShadowHours=-Infinity;
 const hemi=new THREE.HemisphereLight(0xe3f1ed,0x75796b,1.25);scene.add(hemi);
 const water=makeWater(scene);
 const starsGeo=new THREE.BufferGeometry(),points=[];for(let i=0;i<450;i++){const theta=rand(i+1000)*Math.PI*2,y=rand(i+1500)*.9+.1,r=Math.sqrt(1-y*y);points.push(Math.cos(theta)*r*11000,y*11000,Math.sin(theta)*r*11000);}starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));const starMat=new THREE.PointsMaterial({color:0xf5eee4,size:9,transparent:true,opacity:0,depthWrite:false,fog:false});const stars=new THREE.Points(starsGeo,starMat);scene.add(stars);
 const topDay=new THREE.Color(0x83a9d5),topDusk=new THREE.Color(0x717c9f),topNight=new THREE.Color(0x111e37);
 const dayHorizon=new THREE.Color(0xd1deea),duskHorizon=new THREE.Color(0xefb08a),nightHorizon=new THREE.Color(0x394954);
 // Exponential depth haze preserves close details while distant blocks lose
 // contrast and blend into the sky. Reuse built-in fog, including on water.
 scene.fog=new THREE.FogExp2(0xd1deea,.00022);
 function update(hours,elapsed,position) {
  const angle=(hours-6)/24*Math.PI*2,alt=Math.sin(angle),night=1-THREE.MathUtils.smoothstep(alt,-.15,.2),dusk=1-THREE.MathUtils.smoothstep(Math.abs(alt),.05,.48);
  uniforms.time.value=elapsed;
  uniforms.sun.value.set(Math.cos(angle),alt,-.35);uniforms.top.value.copy(topDay).lerp(topDusk,dusk*.6).lerp(topNight,night);uniforms.horizon.value.copy(dayHorizon).lerp(duskHorizon,dusk).lerp(nightHorizon,night);uniforms.sunColor.value.set(0xffd1a0).multiplyScalar(1-night);uniforms.night.value=night;
  sunLight.target.position.copy(position);sunLight.position.copy(uniforms.sun.value).normalize().multiplyScalar(800).add(position);sunLight.intensity=(.45+Math.max(0,alt)*2.7)*(1-night);sunLight.color.set(dusk>.4?0xffd2a6:0xffefd9);
  // Sun/foliage shadows need not redraw the surveyed city at display frequency.
  if(elapsed-lastShadow>=.125||Math.abs(hours-lastShadowHours)>.05){sunLight.shadow.needsUpdate=true;lastShadow=elapsed;lastShadowHours=hours;}
  // Cool skylight keeps brick, glass and stone distinct while the sun turns warm.
  hemi.intensity=1.25-night*.65;hemi.color.set(0xddeaf3).lerp(new THREE.Color(0x657a9f),night);hemi.groundColor.set(0x74776e).lerp(new THREE.Color(0x323c4c),night);
  // Warmer, denser air at twilight; clearer silhouettes at night and above
  // the lower atmosphere. Stars belong to the sky, outside this local haze.
  const hazeDensity=THREE.MathUtils.lerp(.00022+dusk*.00006,.00014,night);
  const altitudeFade=1-.28*THREE.MathUtils.smoothstep(position.y,120,1400);
  scene.fog.density=hazeDensity*altitudeFade;
  scene.fog.color.copy(uniforms.horizon.value);water.update({time:elapsed,night,sun:uniforms.sun.value,top:uniforms.top.value,horizon:uniforms.horizon.value});starMat.opacity=night*.7;
  sky.position.copy(position);stars.position.copy(position);
  return {night,dusk};
 }
 return {update,uniforms,setGeography:water.setGeography};
}
