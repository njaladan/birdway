// Pointer capture keeps each thumb independent, even outside its control.
export class TouchControls {
 constructor({flight,root,stick,knob,canPlay,onAction}){
  Object.assign(this,{flight,root,stick,knob,canPlay,onAction});
  this.pointers=new Map();this.stickPointer=null;
  flight.onInputClear=()=>this.reset();
  stick.addEventListener('pointerdown',e=>{
   if(!canPlay()||this.stickPointer!==null||e.button!==0)return;
   e.preventDefault();this.stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);this.move(e);
  });
  stick.addEventListener('pointermove',e=>{if(e.pointerId===this.stickPointer){e.preventDefault();this.move(e);}});
  const releaseStick=e=>{if(e.pointerId===this.stickPointer){this.stickPointer=null;flight.touch.turn=flight.touch.pitch=0;knob.style.transform='translate(0px,0px)';}};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,releaseStick);
  for(const button of root.querySelectorAll('[data-touch]')){
   const action=button.dataset.touch;
   button.addEventListener('pointerdown',e=>{
    if(!canPlay()||e.button!==0)return;
    e.preventDefault();button.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{button,action});button.classList.add('held');
    if(action==='flap'){flight.touch.flap=true;flight.takeoff();}
    else if(action==='dive')flight.touch.dive=true;
    else onAction(action);
   });
   const release=e=>{
    if(!this.pointers.has(e.pointerId))return;
    this.pointers.delete(e.pointerId);
    const held=[...this.pointers.values()].some(p=>p.action===action);
    button.classList.toggle('held',held);
    if(action==='flap'||action==='dive')flight.touch[action]=held;
   };
   for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release);
   // Keyboard activation of the visible buttons still works on hybrid devices.
   button.addEventListener('click',e=>{if(e.detail===0&&canPlay()){if(action==='flap')flight.takeoff();else if(action==='dive')flight.touch.dive=!flight.touch.dive;else onAction(action);}});
  }
 }
 move(e){
  const r=this.stick.getBoundingClientRect(),radius=r.width*.32;
  let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  const dead=v=>Math.abs(v)<.12?0:Math.sign(v)*(Math.abs(v)-.12)/.88;
  this.flight.touch.turn=dead(x);this.flight.touch.pitch=dead(-y);
  this.knob.style.transform=`translate(${x*radius}px,${y*radius}px)`;
 }
 reset(){
  this.stickPointer=null;this.pointers.clear();
  this.knob.style.transform='translate(0px,0px)';
  for(const button of this.root.querySelectorAll('[data-touch]'))button.classList.remove('held');
 }
}
