import * as THREE from '../vendor/three.module.js';

const whiteGround=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);
whiteGround.needsUpdate=true;
let groundTextures={grass:whiteGround,pavers:whiteGround,road:whiteGround,concrete:whiteGround,soil:whiteGround,grassNormal:whiteGround,grassRoughness:whiteGround,grassHeight:whiteGround};
let groundLoad;
export function loadGroundTextures(){
 if(typeof document==='undefined'||typeof Image==='undefined'||!THREE.TextureLoader)return Promise.resolve(groundTextures);
 if(groundLoad)return groundLoad;
 const loader=new THREE.TextureLoader();
 const load=(file,srgb=true)=>new Promise(resolve=>loader.load(`./assets/ground/${file}`,t=>{
  t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;resolve(t);
 },undefined,()=>resolve(whiteGround)));
 groundLoad=Promise.all([load('grass-albedo.jpg'),load('pavers.jpg'),load('road.jpg'),load('concrete.jpg'),load('soil.jpg'),load('grass-normal.jpg',false),load('grass-roughness.jpg',false),load('grass-height.png',false)])
  .then(([grass,pavers,road,concrete,soil,grassNormal,grassRoughness,grassHeight])=>(groundTextures={grass,pavers,road,concrete,soil,grassNormal,grassRoughness,grassHeight}));
 return groundLoad;
}

// World-space procedural ground keeps the 22k OSM polygons light while breaking
// up the broad color fields. Frequencies fade with derivatives so detail does
// not turn into a crawling pattern when viewed from above.
export function makeGroundMaterial({detail=false}={}){
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
 material.onBeforeCompile=shader=>{
  shader.uniforms.uGroundGrassNormal={value:groundTextures.grassNormal};shader.uniforms.uGroundGrassRoughness={value:groundTextures.grassRoughness};shader.uniforms.uGroundGrassHeight={value:groundTextures.grassHeight};shader.uniforms.uGroundGrass={value:groundTextures.grass};shader.uniforms.uGroundPavers={value:groundTextures.pavers};shader.uniforms.uGroundRoad={value:groundTextures.road};shader.uniforms.uGroundConcrete={value:groundTextures.concrete};shader.uniforms.uGroundSoil={value:groundTextures.soil};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float groundKind;\nvarying vec2 vGroundPosition;\nvarying float vGroundKind;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundPosition=transformed.xz;\nvGroundKind=groundKind;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uGroundGrassNormal;uniform sampler2D uGroundGrassRoughness;uniform sampler2D uGroundGrassHeight;uniform sampler2D uGroundGrass;uniform sampler2D uGroundPavers;uniform sampler2D uGroundRoad;uniform sampler2D uGroundConcrete;uniform sampler2D uGroundSoil;\nvarying vec2 vGroundPosition;\nvarying float vGroundKind;\nfloat ghash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat gnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(ghash(i),ghash(i+vec2(1.,0.)),f.x),mix(ghash(i+vec2(0.,1.)),ghash(i+vec2(1.,1.)),f.x),f.y);}\nfloat filteredNoise(vec2 p,float frequency){float n=gnoise(p*frequency)*2.-1.;float fade=1.-smoothstep(.12,.8,max(length(dFdx(p*frequency)),length(dFdy(p*frequency))));return n*fade;}\nfloat hexSdf(vec2 p,float r){vec2 q=abs(p);return max(q.x*.8660254+q.y*.5,q.y)-r*.8660254;}\nfloat hexPaverEdge(vec2 p,float r){float sx=1.5*r,sy=1.7320508*r,ix=round(p.x/sx),best=1000.;for(int i=-1;i<=1;i++){float cx=(ix+float(i))*sx,off=mod(abs(ix+float(i)),2.)*.5*sy,iy=round((p.y-off)/sy);for(int j=-1;j<=1;j++){float cy=(iy+float(j))*sy+off;best=min(best,hexSdf(p-vec2(cx,cy),r));}}return best;}');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  vec2 gp=vGroundPosition;
  float groundDistance=distance(gp,cameraPosition.xz);
  float turfDetail=0.;
  if(vGroundKind<0.5){
    // Keep the lawn palette at every mip/resolution. The photograph contains
    // bare soil: use its luminance for texture, never its brown chroma.
    if(groundDistance<220.){
    float broad=filteredNoise(gp,.028),middle=filteredNoise(gp,.19);
    float nearTurf=1.-smoothstep(80.,220.,groundDistance);
    turfDetail=nearTurf*(1.-smoothstep(.08,.5,max(length(dFdx(gp*.5)),length(dFdy(gp*.5)))));
    diffuseColor.rgb*=1.+(broad*.075+middle*.035)*nearTurf;
    if(turfDetail>0.){
     float photoLight=dot(texture2D(uGroundGrass,gp*.5).rgb,vec3(.2126,.7152,.0722));
     float textureShade=clamp(.78+photoLight*1.35,.82,1.13);
     float grain=filteredNoise(gp,4.1);
     diffuseColor.rgb*=mix(1.,textureShade+grain*.025,turfDetail);
    }}
  }else if(groundDistance<220.){
  if(vGroundKind<1.5){
    bool batteryPavers=vGroundKind<1.05&&gp.x < -1000.&&gp.y > 150.;
    float joint;
    if(batteryPavers){float edge=hexPaverEdge(gp,.18),pixel=max(fwidth(gp.x),fwidth(gp.y));joint=(1.-smoothstep(.008,.008+pixel*.7,edge))*(1.-smoothstep(.035,.16,pixel));}
    else{vec2 tile=vec2(gp.x+gp.y*.28,gp.y-gp.x*.28)/1.45;vec2 edge=min(fract(tile),1.-fract(tile));float fw=max(fwidth(tile.x),fwidth(tile.y));joint=(1.-smoothstep(.025,.025+fw*1.5,min(edge.x,edge.y)))*(1.-smoothstep(.08,.55,fw));}
    float stone=filteredNoise(gp,.22)*.035+filteredNoise(gp,1.4)*.012;
    vec3 brick=texture2D(uGroundPavers,gp*.22).rgb,concrete=texture2D(uGroundConcrete,gp*.28).rgb;
    vec3 photo=mix(brick,concrete,smoothstep(1.05,1.24,vGroundKind));diffuseColor.rgb*=(vec3(.98,.96,.91)+stone-joint*.12)*mix(vec3(1.),photo,.42);
  }else if(vGroundKind<2.5){
    float asphalt=filteredNoise(gp,1.9)*.018+filteredNoise(gp,.17)*.025;
    vec3 photo=texture2D(uGroundRoad,gp*.28).rgb;diffuseColor.rgb*=(vec3(.94,.94,.91)+asphalt)*mix(vec3(1.),photo,.46);
  }else{
    float soil=filteredNoise(gp,.16)*.055+filteredNoise(gp,1.1)*.018;vec3 photo=texture2D(uGroundSoil,gp*.25).rgb;
    diffuseColor.rgb*=(vec3(.98,.94,.84)+soil)*mix(vec3(1.),photo,.52);
  }
  }else{diffuseColor.rgb*=vec3(.88);}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
  if(vGroundKind<.5&&turfDetail>0.)roughnessFactor=mix(1.,clamp(texture2D(uGroundGrassRoughness,vGroundPosition*.5).r,.82,1.),turfDetail);
  roughnessFactor=mix(roughnessFactor,.82,step(.5,vGroundKind)*step(vGroundKind,1.5));
  roughnessFactor=mix(roughnessFactor,.92,step(1.5,vGroundKind)*step(vGroundKind,2.5));
  roughnessFactor=mix(roughnessFactor,1.,step(2.5,vGroundKind));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
  if(groundDistance<140.){
  float reliefFade=vGroundKind<.5?1.-smoothstep(60.,140.,groundDistance):1.;
  float groundRelief=filteredNoise(vGroundPosition,vGroundKind<.5?2.8:1.8)*(vGroundKind<.5?.008:.035)*reliefFade;
  if(vGroundKind<.5)groundRelief+=(texture2D(uGroundGrassHeight,vGroundPosition*.5).r-.5)*.012*reliefFade;
  vec3 gx=normalize(dFdx(-vViewPosition)),gy=normalize(dFdy(-vViewPosition));
  vec3 gr1=cross(gy,normal),gr2=cross(normal,gx);float gd=dot(gx,gr1)*faceDirection;
  normal=normalize(abs(gd)*normal-sign(gd)*(dFdx(groundRelief)*gr1+dFdy(groundRelief)*gr2));
  if(vGroundKind<.5){
   vec2 guv=vGroundPosition*.5;vec3 mapNormal=texture2D(uGroundGrassNormal,guv).xyz*2.-1.;
   // World XY tangent basis corresponds to ground XZ with UV V increasing Z.
   vec3 worldNormal=normalize(vec3(mapNormal.x*.48,max(.25,mapNormal.z),mapNormal.y*.48));
   vec3 grassNormal=normalize(mat3(viewMatrix)*worldNormal);
   float normalDetail=1.-smoothstep(.06,.4,max(length(dFdx(guv)),length(dFdy(guv))));
   normal=normalize(mix(normal,grassNormal,normalDetail*.42*reliefFade));
  }} `);
 };
 material.customProgramCacheKey=()=>`ground-green-turf-v4-${detail?'detail':'base'}`;
 return material;
}

const TILE=8,SPACING=.08,SPARSE_SPACING=.24,DENSE_RADIUS=8,DETAIL_RADIUS=18;
function insideRing(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if(((a[1]>z)!==(b[1]>z))&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;}
function nearSegment(x,z,a,b,r){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/l,0,1):0;return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<r;}
function hash(x,z){let n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);}

// Two instanced rings keep 8 cm clumps close to the bird and sparse blades
// farther away. Tile buffers store only roots and rotation/scales, not copies
// of every blade vertex. Mapped holes, paths and buildings remain clear.
export function createGrassDetail(scene,data,map=null){
 const grass=[];
 for(const park of data.parks||[]){
  if(!park.rings?.[0]?.length)continue;
  const s=String(park.surface||'').toLowerCase(),k=String(park.kind||'').toLowerCase();
  if(k==='plaza'||['asphalt','concrete','paving_stones','paved','wood','gravel','fine_gravel','sett','metal','rubber','rubbercrumb','artificial_turf','tartan','acrylic','sand','compacted','ground','dirt','soil'].some(v=>s.includes(v)))continue;
  const rings=park.rings.map(r=>r.length>1&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?r.slice(0,-1):r);
  const all=rings[0],xs=all.map(p=>p[0]),zs=all.map(p=>p[1]);
  grass.push({rings,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)});
 }
 const pathsByTile=new Map();
 const indexPath=(tx,tz,seg)=>{const key=`${tx},${tz}`;if(!pathsByTile.has(key))pathsByTile.set(key,[]);pathsByTile.get(key).push(seg);};
 for(const path of data.paths||[]){const pts=path.points||[];for(let i=1;i<pts.length;i++){
  const a=pts[i-1],b=pts[i],minX=Math.floor((Math.min(a[0],b[0])-3)/TILE),maxX=Math.floor((Math.max(a[0],b[0])+3)/TILE),minZ=Math.floor((Math.min(a[1],b[1])-3)/TILE),maxZ=Math.floor((Math.max(a[1],b[1])+3)/TILE),seg=[a,b];
  for(let tx=minX;tx<=maxX;tx++)for(let tz=minZ;tz<=maxZ;tz++)indexPath(tx,tz,seg);
 }}
 const root=new THREE.Group();root.name='Near-field grass';scene.add(root);const live=new Map();
 // Two curved blades per clump, sharing ten indexed triangles. A pointed
 // final segment avoids the degenerate tip triangles in the old mesh.
 const bladePositions=[],bladeColors=[],bladeIndices=[];
 for(let blade=0;blade<2;blade++){
  const angle=blade*Math.PI*.65,cs=Math.cos(angle),sn=Math.sin(angle);
  const bend=.035+blade*.02,height=.11+blade*.025,width=.018,base=bladePositions.length/3;
  for(let row=0;row<4;row++){
   const t=row/3,half=width*(1.-t)*.5;
   for(const side of row===3?[0]:[-1,1]){
    bladePositions.push(cs*bend*t*t-sn*half*side,height*t,sn*bend*t*t+cs*half*side);
    // Linear-light greens match the lawn, with lighter growing tips.
    bladeColors.push(.055+t*.045,.23+t*.13,.018+t*.025);
   }
  }
  for(let segment=0;segment<2;segment++){
   const a=base+segment*2;bladeIndices.push(a,a+1,a+2,a+1,a+3,a+2);
  }
  bladeIndices.push(base+4,base+5,base+6);
 }
 const bladeGeometry=new THREE.BufferGeometry();bladeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bladePositions,3));bladeGeometry.setAttribute('color',new THREE.Float32BufferAttribute(bladeColors,3));bladeGeometry.setIndex(bladeIndices);bladeGeometry.computeVertexNormals();
 const grassTime={value:0},birdPosition={value:new THREE.Vector2()},heightFade={value:1};
 function grassMaterial(dense){
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
   shader.uniforms.uGrassBird=birdPosition;shader.uniforms.uGrassTime=grassTime;shader.uniforms.uGrassHeightFade=heightFade;
   shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
    attribute vec4 grassRoot;attribute vec2 grassRotation;
    uniform vec2 uGrassBird;uniform float uGrassTime,uGrassHeightFade;
    float grassHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`);
   shader.vertexShader=shader.vertexShader.replace('#include <color_vertex>',`#include <color_vertex>
    vColor*=.88+grassHash(grassRoot.xy+vec2(12.,-9.))*.24;`);
   shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
    objectNormal/=vec3(grassRoot.w,grassRoot.z,grassRoot.w);
    objectNormal.xz=mat2(grassRotation.x,grassRotation.y,-grassRotation.y,grassRotation.x)*objectNormal.xz;`);
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float d=distance(grassRoot.xy,uGrassBird);
    float fade=(1.-smoothstep(${dense?'5.,8.':'12.,18.'},d))*uGrassHeightFade;
    // Shrink whole blades at their roots. Subpixel blades converge to the green
    // turf without screen-space stipple, alpha overdraw or crawling pixels.
    transformed*=vec3(grassRoot.w,grassRoot.z,grassRoot.w)*fade;
    transformed.xz=mat2(grassRotation.x,grassRotation.y,-grassRotation.y,grassRotation.x)*transformed.xz;
    float phase=grassRoot.x*.37+grassRoot.y*.29+uGrassTime*1.8;
    float bend=transformed.y*transformed.y;
    transformed.x+=sin(phase)*bend*.65;transformed.z+=cos(phase*.83)*bend*.38;
    transformed.xz+=grassRoot.xy;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    // Gentle transmission keeps back faces green without dominating daylight.
    totalEmissiveRadiance+=diffuseColor.rgb*.12;`);
  };
  material.customProgramCacheKey=()=>`instanced-green-grass-v4-${dense?'dense':'sparse'}`;
  return material;
 }
 const denseMaterial=grassMaterial(true),sparseMaterial=grassMaterial(false);
 function build(tx,tz,dense){
  const minX=tx*TILE,minZ=tz*TILE,maxX=minX+TILE,maxZ=minZ+TILE;
  const candidates=grass.filter(p=>p.maxX>=minX&&p.minX<=maxX&&p.maxZ>=minZ&&p.minZ<=maxZ);if(!candidates.length)return null;
  const roots=[],rotations=[],spacing=dense?SPACING:SPARSE_SPACING,paths=pathsByTile.get(`${tx},${tz}`)||[];
  // Integer cell coordinates make placement stable across negative tiles,
  // movement and rebuilds; jitter stays inside its cell and tile.
  for(let iz=Math.floor(minZ/spacing);iz<Math.ceil(maxZ/spacing);iz++)for(let ix=Math.floor(minX/spacing);ix<Math.ceil(maxX/spacing);ix++){
   const px=(ix+.1+hash(ix,iz)*.8)*spacing,pz=(iz+.1+hash(ix+41,iz-13)*.8)*spacing;
   if(px<minX||px>=maxX||pz<minZ||pz>=maxZ)continue;
   if(!candidates.some(p=>px>=p.minX&&px<=p.maxX&&pz>=p.minZ&&pz<=p.maxZ&&insideRing(px,pz,p.rings[0])&&!p.rings.slice(1).some(h=>insideRing(px,pz,h))))continue;
   if(paths.some(([a,b])=>nearSegment(px,pz,a,b,3.)))continue;
   if(map?.buildingAt?.(px,pz))continue;
   const h=.55+hash(ix+7,iz+19)*.55,w=.75+hash(ix-8,iz+4)*.4,angle=hash(ix+5,iz-7)*Math.PI*2;
   roots.push(px,pz,h,w);rotations.push(Math.cos(angle),Math.sin(angle));
  }
  if(!roots.length)return null;
  const geometry=new THREE.InstancedBufferGeometry().copy(bladeGeometry);
  geometry.setAttribute('grassRoot',new THREE.InstancedBufferAttribute(new Float32Array(roots.length),4).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('grassRotation',new THREE.InstancedBufferAttribute(new Float32Array(rotations.length),2).setUsage(THREE.DynamicDrawUsage));
  // Bounds include transformed instances, curvature and wind. Local prototype
  // bounds alone would incorrectly cull grass far from the world origin.
  geometry.boundingBox=new THREE.Box3(new THREE.Vector3(minX-.12,0,minZ-.12),new THREE.Vector3(maxX+.12,.18,maxZ+.12));
  geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const mesh=new THREE.Mesh(geometry,dense?denseMaterial:sparseMaterial);mesh.renderOrder=-59;mesh.name=dense?'Dense grass':'Sparse grass';
  mesh.userData.grass={roots:new Float32Array(roots),rotations:new Float32Array(rotations),radius:dense?DENSE_RADIUS:DETAIL_RADIUS};
  compact(mesh);root.add(mesh);return mesh;
 }
 // Only submit roots that can intersect the current fade circle. Padding for
 // the 2 m update cell keeps this valid as the bird moves within that cell.
 // Cached placement survives compaction; geometry is never regenerated for wind.
 function compact(mesh){
  const {roots,rotations,radius}=mesh.userData.grass,geometry=mesh.geometry;
  const rootAttribute=geometry.attributes.grassRoot,rotationAttribute=geometry.attributes.grassRotation;
  const centerX=(lastCellX+.5)*2,centerZ=(lastCellZ+.5)*2,radiusSquared=(radius+Math.SQRT2)**2;let count=0;
  for(let i=0;i<roots.length/4;i++){
   if((roots[i*4]-centerX)**2+(roots[i*4+1]-centerZ)**2>radiusSquared)continue;
   for(let j=0;j<4;j++)rootAttribute.array[count*4+j]=roots[i*4+j];
   for(let j=0;j<2;j++)rotationAttribute.array[count*2+j]=rotations[i*2+j];count++;
  }
  geometry.instanceCount=count;mesh.visible=count>0;
  for(const attribute of [rootAttribute,rotationAttribute]){
   attribute.clearUpdateRanges();if(count)attribute.addUpdateRange(0,count*attribute.itemSize);attribute.needsUpdate=true;
  }
 }
 let lastCellX=Infinity,lastCellZ=Infinity,lastHeightClass,pending=[];
 const remove=mesh=>{if(mesh){root.remove(mesh);mesh.geometry.dispose();}};
 function update(position,time=0){
  grassTime.value=time;birdPosition.value.set(position.x,position.z);
  heightFade.value=1.-THREE.MathUtils.smoothstep(position.y,28,40);
  const heightClass=position.y>=40,cellX=Math.floor(position.x/2),cellZ=Math.floor(position.z/2);
  if(heightClass){
   for(const mesh of live.values())remove(mesh);live.clear();pending=[];
   lastHeightClass=true;return;
  }
  if(cellX!==lastCellX||cellZ!==lastCellZ||heightClass!==lastHeightClass){
   lastCellX=cellX;lastCellZ=cellZ;lastHeightClass=heightClass;
   const centerX=(cellX+.5)*2,centerZ=(cellZ+.5)*2,tx=Math.floor(centerX/TILE),tz=Math.floor(centerZ/TILE),range=Math.ceil(DETAIL_RADIUS/TILE)+1,needed=new Set();pending=[];
   for(let x=tx-range;x<=tx+range;x++)for(let z=tz-range;z<=tz+range;z++){
    const distance=Math.hypot((x+.5)*TILE-centerX,(z+.5)*TILE-centerZ);
    // Half tile diagonal plus the 2 m update cell's half diagonal ensures the
    // moving fade circle always has geometry, including between tile crossings.
    for(const dense of [false,true])if(distance<=(dense?DENSE_RADIUS:DETAIL_RADIUS)+TILE*Math.SQRT1_2+Math.SQRT2){
     const key=`${x},${z},${dense}`;needed.add(key);
     if(!live.has(key))pending.push({key,x,z,dense,distance});
    }
   }
   for(const [key,mesh]of live)if(!needed.has(key)){remove(mesh);live.delete(key);}
   for(const mesh of live.values())if(mesh)compact(mesh);
   pending.sort((a,b)=>a.distance-b.distance||Number(a.dense)-Number(b.dense));
  }
  // Bound work when landing/entering a park. Wind and fades update uniforms;
  // existing tile geometry is reused until the bird leaves its neighborhood.
  for(let built=0;built<2&&pending.length;built++){
   const tile=pending.shift();live.set(tile.key,build(tile.x,tile.z,tile.dense));
  }
 }

 return {root,update};
}
