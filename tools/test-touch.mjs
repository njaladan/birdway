// Exercise cancellation and simultaneous thumbs without requiring a browser.
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {Flight} from '../src/flight.js';
import {TouchControls} from '../src/touch-controls.js';
class Target extends EventTarget {
 constructor(action){super();this.dataset={touch:action};this.style={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};}
 setPointerCapture(){}
 getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
 send(type,id,x=50,y=50){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,clientX:x,clientY:y,button:0,detail:1});this.dispatchEvent(e);}
}
const bird=new THREE.Group();bird.userData.animate=()=>{};
const flight=new Flight(bird,new THREE.PerspectiveCamera(),{},new THREE.Vector3());
const stick=new Target(),knob=new Target(),flap=new Target('flap'),dive=new Target('dive'),dash=new Target('dash');
const buttons=[flap,dive,dash],root={querySelectorAll:()=>buttons};
let active=true,actions=[];
new TouchControls({flight,root,stick,knob,canPlay:()=>active,onAction:a=>actions.push(a)});
stick.send('pointerdown',1,82,18);flap.send('pointerdown',2);
assert.ok(flight.touch.turn>0&&flight.touch.pitch>0);assert.equal(flight.touch.flap,true);assert.equal(flight.flying,true);
stick.send('pointermove',7,0,100);assert.ok(flight.touch.pitch>0,'unrelated fingers cannot move the stick');
flap.send('pointercancel',2);assert.equal(flight.touch.flap,false);assert.ok(flight.touch.turn>0,'canceling flap leaves the steering thumb active');
stick.send('lostpointercapture',1);assert.equal(flight.touch.turn,0);assert.equal(flight.touch.pitch,0);
dive.send('pointerdown',3);dive.send('pointerdown',4);dive.send('pointerup',3);
assert.equal(flight.touch.dive,true,'one remaining finger keeps the hold active');
dive.send('pointerup',4);assert.equal(flight.touch.dive,false);
dash.send('pointerdown',5);dash.send('pointermove',5);assert.deepEqual(actions,['dash'],'dash fires once per press');dash.send('pointerup',5);
stick.send('pointerdown',6,82,50);flap.send('pointerdown',7);flight.clearInput();
assert.deepEqual(flight.touch,{turn:0,pitch:0,flap:false,dive:false});assert.equal(flap.classes.has('held'),false);
stick.send('pointermove',6,82,18);assert.equal(flight.touch.pitch,0,'a cleared finger cannot reactivate steering');
active=false;flap.send('pointerdown',8);dash.send('pointerdown',9);assert.equal(flight.touch.flap,false);assert.deepEqual(actions,['dash']);
active=true;stick.send('pointerdown',10,50,50);assert.equal(flight.touch.turn,0);assert.equal(flight.touch.pitch,0,'center dead zone stays still');stick.send('pointercancel',10);
console.log('Touch checks passed: simultaneous thumbs, pointer ownership, cancellation, capture loss, multiple holds, action edges and paused input.');
