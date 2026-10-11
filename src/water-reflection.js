import * as THREE from '../vendor/three.module.js';

// Planar camera reflection follows Three.js Water (MIT), with a capped update
// rate and resolution. Keep the previous matrix with its texture between draws.
// This avoids projecting a stale skyline using the current camera transform.
export function attachWaterReflection(mesh, uniforms) {
 const target = new THREE.WebGLRenderTarget(512, 512, {type: THREE.HalfFloatType});
 target.texture.name = 'Hudson skyline reflection';
 const camera = new THREE.PerspectiveCamera();
 const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), eye = new THREE.Vector3();
 const direction = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3();
 const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
 const normal = new THREE.Vector3(0, 1, 0);
 uniforms.reflectionMap = {value: target.texture};
 uniforms.reflectionMatrix = {value: new THREE.Matrix4()};
 uniforms.reflectionStrength = {value: 0};
 let last = -Infinity, drawing = false;
 mesh.onBeforeRender = (renderer, scene, source) => {
  // Only High quality adds a city pass; other modes keep sky reflection.
  if (drawing || !renderer.userData.waterReflections || source.position.y <= mesh.position.y) {
   if (!drawing) uniforms.reflectionStrength.value = 0;
   return;
  }
  const now = performance.now();
  if (now - last < 1000 / 12) return;
  last = now;
  source.getWorldPosition(eye); source.getWorldDirection(direction);
  point.set(0, mesh.position.y, 0);
  camera.position.copy(eye); camera.position.y = point.y * 2 - eye.y;
  look.copy(eye).add(direction); look.y = point.y * 2 - look.y;
  up.copy(source.up).transformDirection(source.matrixWorld).reflect(normal);
  camera.up.copy(up); camera.lookAt(look); camera.far = source.far;
  camera.updateMatrixWorld(); camera.projectionMatrix.copy(source.projectionMatrix);
  matrix.set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1)
   .multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
  // Clip geometry below the river plane in the reflection camera.
  plane.setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(camera.matrixWorldInverse);
  clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const p = camera.projectionMatrix.elements;
  q.set((Math.sign(clip.x)+p[8])/p[0], (Math.sign(clip.y)+p[9])/p[5], -1, (1+p[10])/p[14]);
  const dot = clip.dot(q);
  if (Math.abs(dot) < 1e-6) return;
  clip.multiplyScalar(2/dot);
  p[2]=clip.x; p[6]=clip.y; p[10]=clip.z+1-.003; p[14]=clip.w;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  const previous = renderer.getRenderTarget(), xr = renderer.xr.enabled;
  const shadows = renderer.shadowMap.autoUpdate, tone = renderer.toneMapping;
  drawing = true; mesh.visible = false;
  try {
   renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
   // Store linear HDR lighting; tone map once when sampling the water.
   renderer.toneMapping = THREE.NoToneMapping;
   renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
   uniforms.reflectionMatrix.value.copy(matrix);
   uniforms.reflectionStrength.value = 1;
  } finally {
   mesh.visible = true; drawing = false; renderer.toneMapping = tone;
   renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadows;
   renderer.setRenderTarget(previous);
   if (source.viewport) renderer.state.viewport(source.viewport);
  }
 };
 return {target, dispose(){target.dispose();mesh.onBeforeRender=()=>{};}};
}
