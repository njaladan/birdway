import * as THREE from '../vendor/three.module.js';

const whiteGround=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1,THREE.RGBAFormat);
whiteGround.needsUpdate=true;
let groundTextures={grass:whiteGround,pavers:whiteGround,road:whiteGround,concrete:whiteGround,soil:whiteGround};
let groundLoad;
export function loadGroundTextures(){
 if(typeof document==='undefined'||typeof Image==='undefined'||!THREE.TextureLoader)return Promise.resolve(groundTextures);
 if(groundLoad)return groundLoad;
 const loader=new THREE.TextureLoader(),load=file=>new Promise(resolve=>loader.load(`./assets/ground/${file}.jpg`,t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;resolve(t);},undefined,()=>resolve(whiteGround)));
 groundLoad=Promise.all([load('grass'),load('pavers'),load('road'),load('concrete'),load('soil')]).then(([grass,pavers,road,concrete,soil])=>(groundTextures={grass,pavers,road,concrete,soil}));
 return groundLoad;
}

// World-space procedural ground keeps the 22k OSM polygons light while breaking
// up the broad color fields. Frequencies fade with derivatives so detail does
// not turn into a crawling pattern when viewed from above.
export function makeGroundMaterial({detail=false}={}){
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
 material.onBeforeCompile=shader=>{
  shader.uniforms.uGroundGrass={value:groundTextures.grass};shader.uniforms.uGroundPavers={value:groundTextures.pavers};shader.uniforms.uGroundRoad={value:groundTextures.road};shader.uniforms.uGroundConcrete={value:groundTextures.concrete};shader.uniforms.uGroundSoil={value:groundTextures.soil};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float groundKind;\nvarying vec2 vGroundPosition;\nvarying float vGroundKind;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundPosition=transformed.xz;\nvGroundKind=groundKind;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uGroundGrass;uniform sampler2D uGroundPavers;uniform sampler2D uGroundRoad;uniform sampler2D uGroundConcrete;uniform sampler2D uGroundSoil;\nvarying vec2 vGroundPosition;\nvarying float vGroundKind;\nfloat ghash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat gnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(ghash(i),ghash(i+vec2(1.,0.)),f.x),mix(ghash(i+vec2(0.,1.)),ghash(i+vec2(1.,1.)),f.x),f.y);}\nfloat filteredNoise(vec2 p,float frequency){float n=gnoise(p*frequency)*2.-1.;float fade=1.-smoothstep(.12,.8,max(length(dFdx(p*frequency)),length(dFdy(p*frequency))));return n*fade;}\nfloat hexSdf(vec2 p,float r){vec2 q=abs(p);return max(q.x*.8660254+q.y*.5,q.y)-r*.8660254;}\nfloat hexPaverEdge(vec2 p,float r){float sx=1.5*r,sy=1.7320508*r,ix=round(p.x/sx),best=1000.;for(int i=-1;i<=1;i++){float cx=(ix+float(i))*sx,off=mod(abs(ix+float(i)),2.)*.5*sy,iy=round((p.y-off)/sy);for(int j=-1;j<=1;j++){float cy=(iy+float(j))*sy+off;best=min(best,hexSdf(p-vec2(cx,cy),r));}}return best;}');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  vec2 gp=vGroundPosition;
  float broad=filteredNoise(gp,0.028),middle=filteredNoise(gp,0.19),grain=filteredNoise(gp,1.35);
  if(vGroundKind<0.5){
    vec3 turf=vec3(.91,.96,.84)+broad*.10+middle*.045+grain*.018;
    float fleck=filteredNoise(gp+17.3,4.1);turf+=fleck*.008;
    vec3 photo=texture2D(uGroundGrass,gp*.38).rgb;diffuseColor.rgb*=turf*mix(vec3(1.),photo,.46);
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
  }`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
  roughnessFactor=mix(roughnessFactor,.91,step(vGroundKind,.5));
  roughnessFactor=mix(roughnessFactor,.82,step(.5,vGroundKind)*step(vGroundKind,1.5));
  roughnessFactor=mix(roughnessFactor,.92,step(1.5,vGroundKind)*step(vGroundKind,2.5));
  roughnessFactor=mix(roughnessFactor,1.,step(2.5,vGroundKind));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
  float groundRelief=filteredNoise(vGroundPosition,vGroundKind<.5?2.8:1.8)*(vGroundKind<.5?.10:.035);
  vec3 gx=normalize(dFdx(-vViewPosition)),gy=normalize(dFdy(-vViewPosition));
  vec3 gr1=cross(gy,normal),gr2=cross(normal,gx);float gd=dot(gx,gr1)*faceDirection;
  normal=normalize(abs(gd)*normal-sign(gd)*(dFdx(groundRelief)*gr1+dFdy(groundRelief)*gr2));`);
 };
 material.customProgramCacheKey=()=>`ground-procedural-v2-${detail?'detail':'base'}`;
 return material;
}

const TILE=30,SPACING=.7,DETAIL_RADIUS=35;
function insideRing(x,z,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if(((a[1]>z)!==(b[1]>z))&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;}
function nearSegment(x,z,a,b,r){const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/l,0,1):0;return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<r;}
function hash(x,z){let n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);}

// Clumps are built as one mesh per nearby 30 m tile. Each candidate is
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
 const bladeGeometry=(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([
  0,0,0, -.035,0,.012, .012,.20,.025,
  0,0,0, .035,0,-.01, -.008,.24,-.02,
  0,0,0, 0,0,.035, .008,.18,.012,
 ],3));g.setAttribute('color',new THREE.Float32BufferAttribute([.06,.14,.025,.08,.19,.035,.13,.26,.06,.07,.16,.03,.09,.20,.04,.15,.28,.07,.05,.13,.025,.08,.18,.035,.12,.24,.055],3));g.computeVertexNormals();return g;})();
 const birdPosition={value:new THREE.Vector2()};
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  shader.uniforms.uGrassBird=birdPosition;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vGrassPosition;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGrassPosition=transformed.xz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec2 uGrassBird;varying vec2 vGrassPosition;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(distance(vGrassPosition,uGrassBird)>35.)discard;');
 };
 function build(tx,tz){
  const minX=tx*TILE,minZ=tz*TILE,maxX=minX+TILE,maxZ=minZ+TILE;
  const candidates=grass.filter(p=>p.maxX>=minX&&p.minX<=maxX&&p.maxZ>=minZ&&p.minZ<=maxZ);if(!candidates.length)return null;
  const positions=[],colors=[];const paths=pathsByTile.get(`${tx},${tz}`)||[];let seed=0;
  for(let z=Math.ceil(minZ/SPACING)*SPACING;z<maxZ;z+=SPACING)for(let x=Math.ceil(minX/SPACING)*SPACING;x<maxX;x+=SPACING){
   const jx=(hash(x,z)-.5)*.95,jz=(hash(x+41,z-13)-.5)*.95,px=x+jx,pz=z+jz;
   if(!candidates.some(p=>px>=p.minX&&px<=p.maxX&&pz>=p.minZ&&pz<=p.maxZ&&insideRing(px,pz,p.rings[0])&&!p.rings.slice(1).some(h=>insideRing(px,pz,h))))continue;
   if(map?.buildingAt?.(px,pz))continue;
   if(paths.some(([a,b])=>nearSegment(px,pz,a,b,3.)))continue;
   const h=.35+hash(px+7,pz+19)*.25,w=.35+hash(px-8,pz+4)*.35,angle=hash(px+5,pz-7)*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
   for(let v=0;v<9;v++){const rx=bladeGeometry.attributes.position.getX(v),ry=bladeGeometry.attributes.position.getY(v),rz=bladeGeometry.attributes.position.getZ(v);const rotatedX=rx*c-rz*s;positions.push(px+rotatedX*w,ry*h,pz+rx*s+rz*c*w);const vc=bladeGeometry.attributes.color;colors.push(vc.getX(v),vc.getY(v),vc.getZ(v));}
   seed++;
  }
  if(!positions.length)return null;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(Array.from({length:seed*9},(_,i)=>Math.floor(i/9)*9+[0,1,2,3,4,5,6,7,8][i%9]));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,material);mesh.renderOrder=-59;root.add(mesh);return mesh;
 }
 function update(position){
  birdPosition.value.set(position.x,position.z);
  if(position.y>40){for(const mesh of live.values())if(mesh){root.remove(mesh);mesh.geometry.dispose();}live.clear();return;}
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
