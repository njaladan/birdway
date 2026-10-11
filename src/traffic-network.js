// Directed street graph and pure timing/path helpers, shared by simulation and regressions.
export const TAU=Math.PI*2;
export const random=seed=>{const v=Math.sin(seed*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function makePath(points){
 const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
 return {points,lengths,length:lengths.at(-1)};
}
export function samplePath(path,distance,offset=0){
 const d=Math.max(0,Math.min(path.length,distance));let lo=0,hi=path.lengths.length-1;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(path.lengths[mid]<=d)lo=mid;else hi=mid;}
 const a=path.points[lo],b=path.points[lo+1]||a,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1,t=(d-path.lengths[lo])/length;
 return {x:a[0]+dx*t-dz/length*offset,z:a[1]+dz*t+dx/length*offset,heading:Math.atan2(-dx,-dz)};
}
export function projectPath(path,x,z){
 let best={distance:0,separation:Infinity};
 for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(len2||1)));
  const separation=Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
  if(separation<best.separation)best={distance:path.lengths[i-1]+t*Math.sqrt(len2),separation};
 }return best;
}
export function streetAxis(heading){return Math.abs(-Math.sin(heading)*.485+Math.cos(heading)*.875)>.7?0:1;}
export function signalState(control,time,axis){
 // Coordinated 90 s cycle. Five-second pedestrian lead, 3 s yellow, 2 s all-red.
 const phase=((time+(control.offset||0))%90+90)%90;
 const start=axis===0?0:45,p=(phase-start+90)%90;
 return {color:p>=5&&p<40?'green':p>=40&&p<43?'yellow':'red',walk:p<27,clearance:p>=27&&p<40,remaining:p<27?27-p:Math.max(0,40-p),phase};
}
export function buildNetwork(data){
 const adjacency=new Map(),positions=new Map(),signalIds=new Set(data.controls.map(c=>c.id));
 function link(a,b){if(!adjacency.has(a))adjacency.set(a,new Set());adjacency.get(a).add(b);}
 for(const road of data.roads)for(let i=0;i<road.nodes.length;i++){
  positions.set(road.nodes[i],road.points[i]);if(i){link(road.nodes[i-1],road.nodes[i]);link(road.nodes[i],road.nodes[i-1]);}
 }
 const nodes=new Map(),edges=[];
 function node(id){if(!nodes.has(id)){const p=positions.get(id);nodes.set(id,{id,x:p[0],z:p[1],outgoing:[],incoming:[],control:null,occupiedUntil:0,owner:null,neighbors:adjacency.get(id)?.size||0});}return nodes.get(id);}
 for(const road of data.roads){
  let start=0;
  for(let i=1;i<road.nodes.length;i++){
   if(i<road.nodes.length-1&&adjacency.get(road.nodes[i]).size===2&&!signalIds.has(road.nodes[i]))continue;
   const points=road.points.slice(start,i+1),from=node(road.nodes[start]),to=node(road.nodes[i]);start=i;
   function add(a,b,points){const path=makePath(points);if(path.length<.5)return;const edge={id:edges.length,from:a,to:b,path,road,heading:samplePath(path,0).heading,exitHeading:samplePath(path,path.length).heading};edges.push(edge);a.outgoing.push(edge);b.incoming.push(edge);}
   add(from,to,points);if(!road.oneway)add(to,from,[...points].reverse());
  }
 }
 // Approach signal nodes and geometric intersection nodes belong to one controller.
 // Spatial buckets keep association linear rather than scanning every point/road.
 const cells=new Map(),junctions=[...nodes.values()].filter(n=>n.neighbors>=3);
 for(const n of junctions){const key=`${Math.floor(n.x/40)},${Math.floor(n.z/40)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(n);}
 const controllers=[];
 for(const point of data.controls){
  let nearest=null,best=36;
  const [x,z]=point.point,cx=Math.floor(x/40),cz=Math.floor(z/40);
  for(let ix=cx-1;ix<=cx+1;ix++)for(let iz=cz-1;iz<=cz+1;iz++)for(const n of cells.get(`${ix},${iz}`)||[]){const d=Math.hypot(n.x-x,n.z-z);if(d<best){nearest=n;best=d;}}
  if(!nearest)nearest=nodes.get(point.id);if(!nearest)continue;
  if(!nearest.control){
   const control={id:controllers.length,x:nearest.x,z:nearest.z,kind:point.kind,offset:-(nearest.x*.485-nearest.z*.875)/7.8,nodes:[]};controllers.push(control);nearest.control=control;
  }
  const signalNode=nodes.get(point.id);if(signalNode)signalNode.control=nearest.control;
 }
 // Combine approach nodes within an intersection; disjoint turns share reservation.
 for(const n of nodes.values()){
  if(!n.control&&n.neighbors>=3){const near=controllers.find(c=>Math.hypot(c.x-n.x,c.z-n.z)<22);if(near)n.control=near;}
  if(n.control)n.control.nodes.push(n);
 }
 return {nodes,edges,controllers,junctions};
}
export function choices(edge,type){
 const options=edge.to.outgoing.filter(next=>next.to!==edge.from&&!next.road.busOnly&&(type!=='boxTruck'&&type!=='fire'||next.road.truck));
 return options.length?options:edge.to.outgoing.filter(next=>next.to!==edge.from&&!next.road.busOnly);
}
