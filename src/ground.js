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
  if(groundDistance<220.){
  float broad=filteredNoise(gp,0.028),middle=filteredNoise(gp,0.19),grain=filteredNoise(gp,1.35);
  if(vGroundKind<0.5){
    vec3 turf=vec3(.91,.96,.84)+broad*.10+middle*.045+grain*.018;
    float fleck=filteredNoise(gp+17.3,4.1);turf+=fleck*.008;
    // Photographed turf is the base albedo, rather than a second green tint.
    // Broad patches break tiling; mipmaps filter the physical 2 m repeat.
    vec3 photo=texture2D(uGroundGrass,gp*.5).rgb;
    diffuseColor.rgb=mix(diffuseColor.rgb,photo,.88)*turf*(.96+broad*.08);
  }else if(vGroundKind<1.5){
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
  }else{diffuseColor.rgb*=vGroundKind<.5?vec3(.70,.80,.57):vec3(.88);}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
  if(groundDistance<220.&&vGroundKind<.5)roughnessFactor=clamp(texture2D(uGroundGrassRoughness,vGroundPosition*.5).r,.72,1.);
  roughnessFactor=mix(roughnessFactor,.82,step(.5,vGroundKind)*step(vGroundKind,1.5));
  roughnessFactor=mix(roughnessFactor,.92,step(1.5,vGroundKind)*step(vGroundKind,2.5));
  roughnessFactor=mix(roughnessFactor,1.,step(2.5,vGroundKind));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
  if(groundDistance<140.){
  float groundRelief=filteredNoise(vGroundPosition,vGroundKind<.5?2.8:1.8)*(vGroundKind<.5?.018:.035);
  if(vGroundKind<.5)groundRelief+=(texture2D(uGroundGrassHeight,vGroundPosition*.5).r-.5)*.025;
  vec3 gx=normalize(dFdx(-vViewPosition)),gy=normalize(dFdy(-vViewPosition));
  vec3 gr1=cross(gy,normal),gr2=cross(normal,gx);float gd=dot(gx,gr1)*faceDirection;
  normal=normalize(abs(gd)*normal-sign(gd)*(dFdx(groundRelief)*gr1+dFdy(groundRelief)*gr2));
  if(vGroundKind<.5){
   vec2 guv=vGroundPosition*.5;vec3 mapNormal=texture2D(uGroundGrassNormal,guv).xyz*2.-1.;
   // World XY tangent basis corresponds to ground XZ with UV V increasing Z.
   vec3 worldNormal=normalize(vec3(mapNormal.x*.48,max(.25,mapNormal.z),mapNormal.y*.48));
   vec3 grassNormal=normalize(mat3(viewMatrix)*worldNormal);
   float normalDetail=1.-smoothstep(.06,.4,max(length(dFdx(guv)),length(dFdy(guv))));
   normal=normalize(mix(normal,grassNormal,normalDetail*.72));
  }} `);
 };
 material.customProgramCacheKey=()=>`ground-pbr-v3-${detail?'detail':'base'}`;
 return material;
}

const TILE=16,SPACING=.30,DETAIL_RADIUS=24;
function insideRing(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if(((a[1]>z)!==(b[1]>z))&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;}
function nearSegment(x,z,a,b,r){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/l,0,1):0;return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<r;}
function hash(x,z){let n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);}

// Clumps are built as one mesh per nearby 16 m tile. Each candidate is
// accepted only within a mapped grass polygon, outside holes, and clear of OSM
// paths. No detail meshes are allocated beyond the moving bird's local area.
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
 // Curved, tapered blades catch backlight. The merged local tiles share a
 // shader and time uniform, so wind does not rebuild geometry every frame.
 const bladePositions=[],bladeColors=[];
 for(let blade=0;blade<3;blade++){
  const angle=blade*Math.PI*2/3,cs=Math.cos(angle),sn=Math.sin(angle);
  const bend=.045+(blade%2)*.02,height=.12+blade*.02,width=.024;
  const rows=Array.from({length:4},(_,i)=>{
   const t=i/3,half=width*(1.-t)*.5;
   const center=[cs*bend*t*t,height*t,sn*bend*t*t];
   return [[center[0]-sn*half,center[1],center[2]+cs*half],[center[0]+sn*half,center[1],center[2]-cs*half]];
  });
  for(let segment=0;segment<3;segment++)for(const [r,side] of [[segment,0],[segment,1],[segment+1,0],[segment,1],[segment+1,1],[segment+1,0]]){
   bladePositions.push(...rows[r][side]);const t=r/3;bladeColors.push(.045+t*.042,.105+t*.072,.016+t*.020);
  }
 }
 const bladeGeometry=new THREE.BufferGeometry();bladeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(bladePositions,3));bladeGeometry.setAttribute('color',new THREE.Float32BufferAttribute(bladeColors,3));
 const grassTime={value:0},birdPosition={value:new THREE.Vector2()};
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.uniforms.uGrassBird=birdPosition;shader.uniforms.uGrassTime=grassTime;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vGrassPosition;uniform float uGrassTime;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vGrassPosition=transformed.xz;
   float phase=transformed.x*.37+transformed.z*.29+uGrassTime*1.8;
   float bend=transformed.y*transformed.y;
   transformed.x+=sin(phase)*bend*.65;transformed.z+=cos(phase*.83)*bend*.38;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec2 uGrassBird;varying vec2 vGrassPosition;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float d=distance(vGrassPosition,uGrassBird);
   float fade=1.-smoothstep(17.,24.,d);
   // Stable stochastic edge coverage fades the tile fringe without blending.
   float coverage=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
   if(coverage>fade)discard;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
   // A little transmission through thin blades avoids black back faces.
   totalEmissiveRadiance+=diffuseColor.rgb*.22;`);
 };
 material.customProgramCacheKey=()=> 'curved-grass-wind-v3';
 function build(tx,tz){
  const minX=tx*TILE,minZ=tz*TILE,maxX=minX+TILE,maxZ=minZ+TILE;
  const candidates=grass.filter(p=>p.maxX>=minX&&p.minX<=maxX&&p.maxZ>=minZ&&p.minZ<=maxZ);if(!candidates.length)return null;
  const positions=[],colors=[];const paths=pathsByTile.get(`${tx},${tz}`)||[];let seed=0;
  for(let z=Math.ceil(minZ/SPACING)*SPACING;z<maxZ;z+=SPACING)for(let x=Math.ceil(minX/SPACING)*SPACING;x<maxX;x+=SPACING){
   const jx=(hash(x,z)-.5)*SPACING*.9,jz=(hash(x+41,z-13)-.5)*SPACING*.9,px=x+jx,pz=z+jz;
   if(!candidates.some(p=>px>=p.minX&&px<=p.maxX&&pz>=p.minZ&&pz<=p.maxZ&&insideRing(px,pz,p.rings[0])&&!p.rings.slice(1).some(h=>insideRing(px,pz,h))))continue;
   if(map?.buildingAt?.(px,pz))continue;
   if(paths.some(([a,b])=>nearSegment(px,pz,a,b,3.)))continue;
   const h=.42+hash(px+7,pz+19)*.55,w=.65+hash(px-8,pz+4)*.55,angle=hash(px+5,pz-7)*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
   for(let v=0;v<bladeGeometry.attributes.position.count;v++){const rx=bladeGeometry.attributes.position.getX(v),ry=bladeGeometry.attributes.position.getY(v),rz=bladeGeometry.attributes.position.getZ(v);const rotatedX=rx*c-rz*s;positions.push(px+rotatedX*w,ry*h,pz+(rx*s+rz*c)*w);const vc=bladeGeometry.attributes.color;const tint=.82+hash(px+12,pz-9)*.40;colors.push(vc.getX(v)*tint,vc.getY(v)*tint,vc.getZ(v)*tint);}
   seed++;
  }
  if(!positions.length)return null;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,material);mesh.renderOrder=-59;root.add(mesh);return mesh;
 }
 let lastTileX=Infinity,lastTileZ=Infinity,lastHeightClass;
 function update(position,time=0){
  grassTime.value=time;
  birdPosition.value.set(position.x,position.z);
  const heightClass=position.y>40;
  const tileX=Math.floor(position.x/TILE),tileZ=Math.floor(position.z/TILE);
  if(tileX===lastTileX&&tileZ===lastTileZ&&heightClass===lastHeightClass)return;
  lastTileX=tileX;lastTileZ=tileZ;lastHeightClass=heightClass;
  if(heightClass){for(const mesh of live.values())if(mesh){root.remove(mesh);mesh.geometry.dispose();}live.clear();return;}
  const tx=Math.floor(position.x/TILE),tz=Math.floor(position.z/TILE),range=Math.ceil(DETAIL_RADIUS/TILE)+1,needed=new Set();
  for(let x=tx-range;x<=tx+range;x++)for(let z=tz-range;z<=tz+range;z++){
   if(Math.hypot((x+.5)*TILE-position.x,(z+.5)*TILE-position.z)<=DETAIL_RADIUS+TILE*.72){
    const key=`${x},${z}`;needed.add(key);
    if(!live.has(key))live.set(key,build(x,z));
   }
  }
  for(const [key,mesh]of live)if(!needed.has(key)){if(mesh){root.remove(mesh);mesh.geometry.dispose();}live.delete(key);}
 }
 return {root,update};
}
