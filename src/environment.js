import * as THREE from '../vendor/three.module.js';

// A small prefiltered sky provides image-based light and soft glass reflections.
// Refresh only when the lighting changes, rather than render six city views
// every frame. Direct sunlight and local shadows still come from sky.js.
export function makeEnvironment(renderer,scene,sky){
 const generator=new THREE.PMREMGenerator(renderer);
 const stage=new THREE.Scene();
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,uniforms:sky.uniforms,
  vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 direction;uniform vec3 top,horizon,sun;uniform float night;
   void main(){vec3 d=normalize(direction);vec3 c=mix(horizon,top,pow(max(d.y,0.),.55));
    float glow=pow(max(dot(d,normalize(sun)),0.),48.)*.45*(1.-night);
    c+=vec3(1.,.79,.57)*glow;
    c=mix(c,horizon*.20,1.-smoothstep(-.5,0.,d.y));
    gl_FragColor=vec4(c,1.);}`});
 stage.add(new THREE.Mesh(new THREE.SphereGeometry(30,24,12),material));
 let target,last=-Infinity;
 return {update(hours){
  const interval=Math.round(hours*4);
  if(interval===last)return;last=interval;
  const next=generator.fromScene(stage,0,.1,80);
  scene.environment=next.texture;scene.environmentIntensity=.55;
  target?.dispose();target=next;
 }};
}
