// Original ambient score: slow suspended chords, a few felt-like notes, and filtered city air.
export class AmbientAudio {
 constructor(){this.ctx=null;this.enabled=false;this.volume=.55;this.timer=null;this.nextNote=0;this.step=0;this.chord=0;}
 async start(){
  if(!this.ctx){
   const ctx=this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=ctx.createGain();this.master.gain.value=this.volume*.38;this.master.connect(ctx.destination);
   const reverb=ctx.createConvolver(),impulse=ctx.createBuffer(2,ctx.sampleRate*4,ctx.sampleRate);
   for(let c=0;c<2;c++){const a=impulse.getChannelData(c);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.7))*.22;}
   reverb.buffer=impulse;const wet=ctx.createGain();wet.gain.value=.45;reverb.connect(wet);wet.connect(this.master);this.reverb=reverb;
   const delay=ctx.createDelay(2);delay.delayTime.value=.64;const feedback=ctx.createGain();feedback.gain.value=.25;delay.connect(feedback);feedback.connect(delay);const dg=ctx.createGain();dg.gain.value=.15;delay.connect(dg);dg.connect(this.master);this.delay=delay;
   const noise=ctx.createBuffer(1,ctx.sampleRate*6,ctx.sampleRate),a=noise.getChannelData(0);let last=0;for(let i=0;i<a.length;i++){last=(last+.02*(Math.random()*2-1))/1.02;a[i]=last*1.6;}
   const air=ctx.createBufferSource();air.buffer=noise;air.loop=true;const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=550;const airGain=ctx.createGain();airGain.gain.value=.035;air.connect(low);low.connect(airGain);airGain.connect(this.master);air.start();
  }
  await this.ctx.resume();this.enabled=true;this.nextNote=this.ctx.currentTime+.1;if(!this.timer)this.timer=setInterval(()=>this.schedule(),250);
 }
 async toggle(){if(this.enabled){this.enabled=false;await this.ctx?.suspend();}else await this.start();return this.enabled;}
 setVolume(v){this.volume=v;if(this.master)this.master.gain.setTargetAtTime(v*.38,this.ctx.currentTime,.15);}
 tone(midi,time,duration,gain=.1){
  const ctx=this.ctx,frequency=440*Math.pow(2,(midi-69)/12),g=ctx.createGain();g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(gain,time+.12);g.gain.exponentialRampToValueAtTime(.0001,time+duration);g.connect(this.master);g.connect(this.reverb);g.connect(this.delay);
  const osc=ctx.createOscillator();osc.type='sine';osc.frequency.value=frequency;osc.connect(g);osc.start(time);osc.stop(time+duration+.1);
  const bell=ctx.createOscillator();bell.type='sine';bell.frequency.value=frequency*2;const overtone=ctx.createGain();overtone.gain.value=.13;bell.connect(overtone);overtone.connect(g);bell.start(time);bell.stop(time+duration+.1);
 }
 schedule(){if(!this.enabled||this.ctx.state!=='running')return;
  while(this.nextNote<this.ctx.currentTime+.7){
   const chords=[[48,55,62,64],[45,52,59,62],[41,48,55,60],[43,50,57,62]];
   if(this.step%8===0){this.chord=(this.step/8)%4;for(const note of chords[this.chord])this.tone(note,this.nextNote,13,.075);}
   const melody=[76,74,71,67,69,74,76,79,74,71,69,67,64,67,71,74];
   if(this.step%2===0)this.tone(melody[(this.step/2)%melody.length],this.nextNote,5,.065);
   this.step++;this.nextNote+=2.4;
  }
 }
 coo(){if(!this.enabled)return;const t=this.ctx.currentTime;this.tone(51,t,.7,.13);this.tone(48,t+.35,1,.11);}
}
