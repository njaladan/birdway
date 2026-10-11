import * as THREE from '../vendor/three.module.js';
import {attachWaterReflection} from './water-reflection.js';
import {makeCoastTexture} from './water-coast.js';

// Directional chop, tidal color bands and coast shading share a single surface.
// High quality can add the capped reflection pass; the default uses sky lighting.
export function makeWater(scene) {
 const uniforms={
  time:{value:0},night:{value:0},dusk:{value:0},
  sun:{value:new THREE.Vector3(0,1,0)},
  top:{value:new THREE.Color(0x77aebd)},horizon:{value:new THREE.Color(0xd1dac8)},
  ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  reflectionMatrix:{value:new THREE.Matrix4()},reflectionMap:{value:null},reflectionStrength:{value:0},
  rippleMap:{value:new THREE.DataTexture(new Uint8Array([128,128,255,255]),1,1)},
  coastMap:{value:new THREE.DataTexture(new Uint8Array([255,0,0,255]),1,1)},
  coastBounds:{value:new THREE.Vector4(-9000,-10000,18000,18000)},
 };
 uniforms.rippleMap.value.needsUpdate=true;
 uniforms.coastMap.value.needsUpdate=true;
 if(typeof document!=='undefined')new THREE.TextureLoader().load('./assets/ground/water-normal.jpg',texture=>{
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;uniforms.rippleMap.value=texture;
 });
 const material=new THREE.ShaderMaterial({uniforms,fog:true,vertexShader:`
 #include <common>
 #include <logdepthbuf_pars_vertex>
 #include <fog_pars_vertex>
 varying vec3 vWorld;
 varying vec4 vReflection;
 uniform mat4 reflectionMatrix;
 void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vReflection=reflectionMatrix*w;vec4 mvPosition=viewMatrix*w;gl_Position=projectionMatrix*mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
 }
 `,fragmentShader:`
 varying vec3 vWorld;
 varying vec4 vReflection;
 uniform float time,night,dusk;
 uniform vec3 sun,top,horizon;
 uniform sampler2D reflectionMap;
 uniform sampler2D rippleMap;
 uniform sampler2D coastMap;
 uniform vec4 coastBounds;
 uniform float reflectionStrength;
 #include <logdepthbuf_pars_fragment>
 #include <fog_pars_fragment>
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
 // Several low-amplitude, long directional waves, with fine ripples that
 // fade with distance to keep the far river quiet and free of aliasing.
 vec2 waveNormal(vec2 p,float fade){
  vec2 n=vec2(0.);
  vec2 k1=vec2(.018,.036),k2=vec2(.043,-.017),k3=vec2(-.081,.062),k4=vec2(.16,.11);
  float f1=dot(p,k1)+time*.72,f2=dot(p,k2)-time*.93,f3=dot(p,k3)+time*1.22,f4=dot(p,k4)-time*1.65;
  n+=k1*cos(f1)*1.25*(1.-smoothstep(.4,1.3,fwidth(f1)));
  n+=k2*cos(f2)*.70*(1.-smoothstep(.4,1.3,fwidth(f2)));
  n+=k3*cos(f3)*.32*fade*(1.-smoothstep(.4,1.3,fwidth(f3)));
  n+=k4*cos(f4)*.13*fade*(1.-smoothstep(.4,1.3,fwidth(f4)));
  // Short wind waves add fine broken highlights up close, then vanish as
  // their projected phase approaches a pixel in the distance.
  vec2 kw1=vec2(2.2,1.4),kw2=vec2(-3.1,2.8),kw3=vec2(7.2,-4.6);
  float fw1=dot(p,kw1)+time*2.4,fw2=dot(p,kw2)-time*3.1,fw3=dot(p,kw3)+time*5.8;
  n+=kw1*cos(fw1)*.020*fade*(1.-smoothstep(.4,1.3,fwidth(fw1)));
  n+=kw2*cos(fw2)*.013*fade*(1.-smoothstep(.4,1.3,fwidth(fw2)));
  n+=kw3*cos(fw3)*.0045*fade*(1.-smoothstep(.4,1.3,fwidth(fw3)));
  vec2 q=p*.16+vec2(time*.08,-time*.055);float eps=.5;
  vec2 gx=vec2(eps*.16,0.),gz=vec2(0.,eps*.16);
  float dx=(noise(q+gx)-noise(q-gx))/(2.*eps),dz=(noise(q+gz)-noise(q-gz))/(2.*eps);
  float noiseFade=fade*(1.-smoothstep(.4,1.3,fwidth(p*.16).x+fwidth(p*.16).y));
  n+=vec2(dx,dz)*.045*noiseFade;
  return n;
 }
 void main(){
  #include <logdepthbuf_fragment>
  vec2 p=vWorld.xz;
  vec2 coastUv=(p-coastBounds.xy)/coastBounds.zw;
  float shoreDistance=texture2D(coastMap,coastUv).r*600.;
  float sheltered=1.-smoothstep(25.,190.,shoreDistance);
  vec2 flow=vec2(time*.10,-time*.055);
  float tidal=noise((p+flow)*.0024)*.62+noise((p+flow)*.0081+13.7)*.38;
  float currentBand=smoothstep(.25,.77,tidal);
  vec3 V=normalize(cameraPosition-vWorld),L=normalize(sun);
  float groundDistance=length(cameraPosition.xz-vWorld.xz);
  float distanceFade=1.-smoothstep(1800.,9000.,groundDistance);
  float nearWindFade=1.-smoothstep(120.,600.,groundDistance);
  vec2 slope=waveNormal(p,distanceFade*nearWindFade);
  slope*=mix(.68,1.32,currentBand)*(1.-sheltered*.22);
  vec2 rippleUv=p*.085;
  vec2 photographic=(texture2D(rippleMap,rippleUv+vec2(time*.007,-time*.004)).xy
   +texture2D(rippleMap,rippleUv.yx*.71+vec2(-time*.005,time*.003)).yx-1.)*.15;
  float rippleFade=1.-smoothstep(.10,.65,max(length(dFdx(rippleUv)),length(dFdy(rippleUv))));
  slope+=photographic*rippleFade*distanceFade;
  vec3 N=normalize(vec3(-slope.x,1.,-slope.y));
  float NoV=max(dot(N,V),0.);
  float fresnel=.025+.975*pow(1.-NoV,5.);
  // Approximate the reflected sky with the same vertical gradient as sky.js.
  vec3 R=reflect(-V,N);
  float skyHeight=smoothstep(-.18,.58,R.y);
  vec3 reflected=mix(horizon,top,pow(skyHeight,.72));
  // Reflect the drifting cloud layer as well as the sky gradient. Changes
  // in wave normals break the cloud reflection into broad moving patches.
  vec2 cp=R.xz/max(.16,R.y+.36)*1.65+vec2(time*.0018,-time*.0007);
  float cloudField=noise(cp)*.55+noise(cp*2.03+vec2(13.1,7.7))*.275;
  float cloudCover=smoothstep(.38,.64,cloudField)*smoothstep(-.12,.12,R.y)*(1.-smoothstep(.58,.92,R.y));
  vec3 cloudTint=mix(horizon,vec3(1.,.94,.84),.48+max(R.y,0.)*.18);
  reflected=mix(reflected,cloudTint,cloudCover*(.25+.35*(1.-night)));
  float skyLuma=dot(reflected,vec3(.299,.587,.114));
  reflected=mix(reflected,vec3(skyLuma*.82,skyLuma*.91,skyLuma*.86),.38);
  // Slowly moving wind/current lanes change reflected brightness on a broad
  // scale. They remain visible where grazing Fresnel hides the water body.
  float cloudShade=noise(p*.0012+vec2(time*.0006,-time*.0003));
  reflected*=.70+currentBand*.25+cloudShade*.16;
  reflected=mix(reflected,reflected*vec3(.63,.70,.64),sheltered*.58);
  float sunDisk=pow(max(dot(R,L),0.),180.);
  reflected+=vec3(1.,.77,.48)*sunDisk*(.65*(1.-night)+.13);
  // Sample the actual mirrored skyline, softly distorted by directional chop.
  vec2 uv=vReflection.xy/max(vReflection.w,.001);
  vec2 distortion=slope*.025/(1.+groundDistance*.003);
  vec2 sampleUv=uv+distortion;
  float edge=smoothstep(.0,.06,min(min(sampleUv.x,sampleUv.y),min(1.-sampleUv.x,1.-sampleUv.y)));
  float valid=edge*step(.001,vReflection.w)*reflectionStrength;
  vec3 skyline=texture2D(reflectionMap,clamp(sampleUv,vec2(.002),vec2(.998))).rgb;
  reflected=mix(reflected,skyline,valid*.92);
  // The tidal Hudson is dark olive/brown underneath its reflected sky.
  vec3 deep=mix(vec3(.012,.047,.041),vec3(.074,.089,.039),tidal);
  deep=mix(deep,vec3(.087,.073,.041),sheltered*.48);
  deep*=1.-(1.-smoothstep(0.,45.,shoreDistance))*.45;
  deep=mix(deep,vec3(.006,.013,.017),night);
  vec3 water=mix(deep,reflected,clamp(fresnel+.12,0.,.97));
  // Broad sun path follows the actual sun azimuth and is broken up by waves.
  vec3 H=normalize(L+V);
  float spec=pow(max(dot(N,H),0.),mix(34.,110.,NoV));
  float elongated=pow(max(dot(R,L),0.),mix(5.,24.,NoV));
  float sparkle=noise(p*.11+vec2(time*.18,-time*.12));
  float sparkleFade=1.-smoothstep(.4,1.3,fwidth(p*.11).x+fwidth(p*.11).y);
  float glint=(spec*.35+elongated*.24)*(0.32+sparkle*.9*sparkleFade)*distanceFade;
  vec3 sunTint=mix(vec3(.80,.88,.84),vec3(1.,.64,.38),dusk);
  water+=sunTint*glint*(.22+.78*(1.-night));
  float diffuse=dot(slope,slope);
  water+=vec3(.014,.025,.024)*diffuse;
  gl_FragColor=vec4(water,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
 }
 `});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(35000,35000),material);
 mesh.rotation.x=-Math.PI/2;mesh.position.y=-.8;mesh.renderOrder=-100;
 mesh.material.depthWrite=false;scene.add(mesh);
 const reflection=attachWaterReflection(mesh,uniforms);
 function update({time=0,night=0,sun,top,horizon}={}){
  uniforms.time.value=time;uniforms.night.value=night;
  if(sun)uniforms.sun.value.copy(sun).normalize();
  if(top)uniforms.top.value.copy(top);
  if(horizon)uniforms.horizon.value.copy(horizon);
  uniforms.dusk.value=THREE.MathUtils.clamp((1-night)*Math.max(0,1-Math.abs(uniforms.sun.value.y)*3),0,1);
 }
 function setGeography(land){const coast=makeCoastTexture(land);uniforms.coastMap.value.dispose();uniforms.coastMap.value=coast.texture;uniforms.coastBounds.value.copy(coast.bounds);}
 return {update,setGeography,mesh,material,reflection};
}
