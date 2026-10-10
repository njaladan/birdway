import * as THREE from '../vendor/three.module.js';

// A broad, shallow-water surface for the river. The shader uses analytic
// directional waves, so it needs no reflection pass or extra render target.
export function makeWater(scene) {
 const uniforms={
  time:{value:0},night:{value:0},dusk:{value:0},
  sun:{value:new THREE.Vector3(0,1,0)},
  top:{value:new THREE.Color(0x77aebd)},horizon:{value:new THREE.Color(0xd1dac8)},
 };
 const material=new THREE.ShaderMaterial({uniforms,vertexShader:`
 #include <common>
 #include <logdepthbuf_pars_vertex>
 varying vec3 vWorld;
 void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;
  #include <logdepthbuf_vertex>
 }
 `,fragmentShader:`
 varying vec3 vWorld;
 uniform float time,night,dusk;
 uniform vec3 sun,top,horizon;
 #include <logdepthbuf_pars_fragment>
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
 // Several low-amplitude, long directional waves, with fine ripples that
 // fade with distance to keep the far river quiet and free of aliasing.
 vec2 waveNormal(vec2 p,float fade){
  vec2 n=vec2(0.);
  vec2 k1=vec2(.018,.036),k2=vec2(.043,-.017),k3=vec2(-.081,.062),k4=vec2(.16,.11);
  float f1=dot(p,k1)+time*.72,f2=dot(p,k2)-time*.93,f3=dot(p,k3)+time*1.22,f4=dot(p,k4)-time*1.65;
  n+=k1*cos(f1)*.30*(1.-smoothstep(.4,1.3,fwidth(f1)));
  n+=k2*cos(f2)*.18*(1.-smoothstep(.4,1.3,fwidth(f2)));
  n+=k3*cos(f3)*.09*fade*(1.-smoothstep(.4,1.3,fwidth(f3)));
  n+=k4*cos(f4)*.04*fade*(1.-smoothstep(.4,1.3,fwidth(f4)));
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
  vec3 V=normalize(cameraPosition-vWorld),L=normalize(sun);
  float groundDistance=length(cameraPosition.xz-vWorld.xz);
  float distanceFade=1.-smoothstep(1800.,9000.,groundDistance);
  float nearWindFade=1.-smoothstep(75.,150.,groundDistance);
  vec2 slope=waveNormal(p,distanceFade*nearWindFade);
  vec3 N=normalize(vec3(-slope.x,1.,-slope.y));
  float NoV=max(dot(N,V),0.);
  float fresnel=.025+.975*pow(1.-NoV,5.);
  // Approximate the reflected sky with the same vertical gradient as sky.js.
  vec3 R=reflect(-V,N);
  float skyHeight=smoothstep(-.18,.58,R.y);
  vec3 reflected=mix(horizon,top,pow(skyHeight,.72));
  float skyLuma=dot(reflected,vec3(.299,.587,.114));
  reflected=mix(reflected,vec3(skyLuma*.82,skyLuma*.91,skyLuma*.86),.38);
  float sunDisk=pow(max(dot(R,L),0.),180.);
  reflected+=vec3(1.,.77,.48)*sunDisk*(.65*(1.-night)+.13);
  vec3 deep=mix(vec3(.092,.139,.126),vec3(.023,.044,.052),night);
  vec3 water=mix(deep,reflected,fresnel*.9);
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
 }
 `});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(35000,35000),material);
 mesh.rotation.x=-Math.PI/2;mesh.position.y=-.8;mesh.renderOrder=-100;
 mesh.material.depthWrite=false;scene.add(mesh);
 function update({time=0,night=0,sun,top,horizon}={}){
  uniforms.time.value=time;uniforms.night.value=night;
  if(sun)uniforms.sun.value.copy(sun).normalize();
  if(top)uniforms.top.value.copy(top);
  if(horizon)uniforms.horizon.value.copy(horizon);
  uniforms.dusk.value=THREE.MathUtils.clamp((1-night)*Math.max(0,1-Math.abs(uniforms.sun.value.y)*3),0,1);
 }
 return {update,mesh,material};
}
