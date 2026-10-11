import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../vendor/three.module.js';
import {buildNetwork,signalState,streetAxis,makePath,samplePath} from '../src/traffic-network.js';
import {TrafficSimulation} from '../src/traffic-simulation.js';
import {TrafficWorld} from '../src/traffic.js';
import {Flight,BIRD_CLEARANCE} from '../src/flight.js';
import {VEHICLES} from '../src/vehicles.js';
const data=JSON.parse(await readFile(new URL('../data/traffic.json',import.meta.url))),profile=JSON.parse(await readFile(new URL('../data/traffic-profile.json',import.meta.url)));
const net=buildNetwork(data);
assert.ok(net.edges.length>4000);assert.ok(net.controllers.length>300);assert.equal(data.busRoutes.length,58);
for(const road of data.roads.filter(r=>r.oneway))for(const e of net.edges.filter(e=>e.road===road))assert.ok(road.nodes.indexOf(e.from.id)<road.nodes.lastIndexOf(e.to.id),'OSM one-way direction is preserved');
for(const route of data.busRoutes){assert.ok(route.points.length>=2);assert.ok(route.stops.length>0);assert.equal(route.hourly.weekday.length,24);}
assert.ok(profile.hourlyDemand[3]<profile.hourlyDemand[16]*.3,'Observed overnight demand is much quieter than the afternoon peak');
for(let t=0;t<90;t+=.25){const a=signalState({offset:0},t,0),b=signalState({offset:0},t,1);assert.ok(!(a.color!=='red'&&b.color!=='red'),'Conflicting signals cannot be green/yellow together');}
assert.equal(signalState({offset:0},2,0).walk,true);assert.equal(signalState({offset:0},2,0).color,'red','Pedestrians get a head start');assert.equal(signalState({offset:0},44,0).color,'red');assert.equal(signalState({offset:0},44,1).color,'red','All-red clearance');
const map={buildingAt:()=>null,surface:()=>0,onLand:()=>true};
const synthetic={roads:[{id:1,name:'Cross street',nodes:[1,2,3],points:[[-100,0],[0,0],[100,0]],oneway:false,lanes:2,speed:11,kind:'residential',truck:true},{id:2,name:'Avenue',nodes:[4,2,5],points:[[0,-100],[0,0],[0,100]],oneway:false,lanes:2,speed:11,kind:'primary',truck:true}],controls:[{id:2,point:[0,0],kind:'traffic_signals'}],busRoutes:[]};
const sim=new TrafficSimulation(synthetic,profile,map,{carCount:0,parkedCount:0});const c=sim.network.controllers[0];c.offset=0;
function car(x,seed){const a=sim.makeActor('sedan',seed);a.edge=sim.network.edges.find(e=>e.from.id===1&&e.to.id===2);a.distance=x+100;a.lane=1.6;a.speed=8;sim.pose(a);sim.actors.push(a);return a;}
const front=car(-65,4),back=car(-79,5);sim.time=52;
assert.equal(sim.canEnter(front,c,1,45),true);assert.equal(c.owner,undefined,'A distant approach does not reserve an intersection');sim.time=5;
assert.equal(sim.canEnter(front,c,1,45),false,'An earlier green does not grant permission to cross a later red');
for(let i=0;i<400;i++)sim.step(.05,{x:0,z:0});
assert.ok(front.x<-11,'Red signal stops before the crosswalk');assert.ok(front.speed<.1);assert.ok(front.x-back.x>VEHICLES.sedan.length+1.5,'Following vehicles queue without overlap');
sim.time=52;for(let i=0;i<400;i++)sim.step(.05,{x:0,z:0});assert.ok(front.x>0||front.z!==1.6,'Green releases the queue onto a connected route');
const route={route:'M22',direction:0,headsign:'TEST',points:[[-100,0],[100,0]],stops:[{id:'1',name:'STOP',point:[-20,0],distance:80,time:0}],hourly:{weekday:Array(24).fill(4),saturday:Array(24).fill(2),sunday:Array(24).fill(2)},duration:120,articulated:false};
const busSim=new TrafficSimulation({...synthetic,controls:[],busRoutes:[route]},profile,map,{carCount:0,parkedCount:0});const bus=busSim.actors.find(a=>a.bus);bus.distance=0;bus.stopIndex=0;bus.speed=5;busSim.pose(bus);
let stopped=false,opened=false;
for(let i=0;i<1000;i++){busSim.step(.05,{x:0,z:0});if(bus.dwell>0){stopped=true;assert.ok(Math.abs(bus.distance-80)<.8);assert.equal(bus.speed,0);if(bus.doors>.5)opened=true;}}
assert.ok(stopped&&opened,'Buses brake at mapped stops and open doors');
bus.terminal=true;bus.rider=true;const atEnd=bus.distance;busSim.step(.05,{x:1000,z:1000});assert.equal(bus.distance,atEnd,'A ridden bus cannot teleport at a cropped terminal');
const bird=new THREE.Group();bird.userData.animate=()=>{};const camera=new THREE.PerspectiveCamera(),moving={id:7,type:'bus',spec:VEHICLES.bus,x:0,z:0,heading:0,previousX:0,previousZ:0,previousHeading:0,speed:5,active:true};
const vehicleMap={...map,dynamicAt:(x,z)=>Math.abs(x-moving.x)<1.27&&Math.abs(z-moving.z)<6?{h:3.3,vehicle:moving}:null};
const flight=new Flight(bird,camera,vehicleMap,new THREE.Vector3(0,4.1,0));flight.flying=true;flight.landing=true;flight.approachBlend=1;flight.heading=0;flight.speed=0;flight.vertical=-1;
for(let i=0;i<120&&flight.flying;i++)flight.update(1/60);
assert.equal(flight.flying,false);assert.equal(flight.vehicleSupport,moving,'Descending bird lands on a vehicle roof');assert.ok(Math.abs(flight.position.y-3.3-BIRD_CLEARANCE)<.01);
const world=Object.create(TrafficWorld.prototype);const before=flight.position.clone();moving.x=1;moving.heading=.15;world.carry(flight);assert.ok(flight.position.x>before.x+.8,'Rider follows translation');assert.ok(Math.abs(flight.heading-.15)<1e-6,'Rider follows vehicle turns');
flight.update(1/60);assert.ok(Math.abs(flight.position.y-3.3-BIRD_CLEARANCE)<.01);flight.takeoff();assert.equal(flight.vehicleSupport,null);assert.ok(flight.carrierVelocity.length()>4.9,'Takeoff inherits the vehicle velocity');flight.home();assert.equal(flight.carrierVelocity.length(),0);assert.equal(flight.vehicleSupport,null);
flight.position.set(0,3.3+BIRD_CLEARANCE,0);moving.x=0;moving.heading=0;flight.vehicleSupport=moving;flight.flying=false;flight.keys.add('KeyW');flight.heading=-Math.PI/2;for(let i=0;i<60;i++)flight.update(1/60);assert.ok(flight.flying,'Walking off a vehicle roof takes flight');
const pauseSim=new TrafficSimulation(synthetic,profile,map,{carCount:4,parkedCount:0}),old=pauseSim.actors.map(a=>[a.x,a.z]);pauseSim.step(0,{x:0,z:0});assert.deepEqual(pauseSim.actors.map(a=>[a.x,a.z]),old);
console.log(`Traffic checks passed: ${net.edges.length} directed edges, ${net.controllers.length} controllers, 58 bus paths, observed demand, signal clearance, red queues, connected travel, bus doors/stops, moving roof landing/riding/takeoff, terminal safety and pause.`);
