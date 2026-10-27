import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AUDIO_CUES,objectSound} from '../src/audio.js';

test('every audio recording is bundled in a supported format with its CC0 source license',async()=>{
  const files=new Set(Object.values(AUDIO_CUES).flatMap(cue=>cue.files));
  for(const file of files){
    const data=await readFile(new URL(`../public${file}`,import.meta.url));
    if(file.endsWith('.wav')){
      assert.equal(data.subarray(0,4).toString(),'RIFF',file);
      assert.equal(data.subarray(8,12).toString(),'WAVE',file);
      assert.equal(data.readUInt16LE(20),1,'edited recordings must use PCM');
    }else{
      assert.equal(data.subarray(0,4).toString(),'OggS',file);
      assert.ok(data.includes(Buffer.from('vorbis')),file);
    }
  }
  for(const pack of ['casino','impact'])assert.match(await readFile(new URL(`../public/assets/audio/${pack}/License.txt`,import.meta.url),'utf8'),/CC0/);
});

test('pick up and placement use paper, dice, wood and board materials',()=>{
  for(const [object,material]of [[{type:'card'},'card'],[{type:'deck'},'card'],[{type:'die'},'die'],[{type:'board'},'board'],[{type:'token',kind:'squirrel'},'wood'],[{type:'token',kind:'wheelbarrow'},'wood'],[{type:'token',kind:'disc'},'wood'],[{type:'token',kind:'ih-health'},'card'],[{type:'token',kind:'custom'},'card'],[{type:'token',kind:'chip'},'token']]){
    for(const action of ['pickup','drop']){const cue=objectSound(object,action);assert.equal(cue,`${material}-${action}`);assert.ok(AUDIO_CUES[cue]);}
  }
});

let audioTestId=0;
async function mockAudio(t,waitForFile=()=>Promise.resolve()){
  const starts=[],stops=[];let requests=0;
  const node=()=>({gain:{value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}},connect(){return this;},disconnect(){}});
  class AudioContext{
    state='running';currentTime=0;destination={};
    createGain(){return node();}
    createDynamicsCompressor(){return {...node(),...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key=>[key,{value:0}]))};}
    async decodeAudioData(data){return {url:data.url,duration:.5,length:100,sampleRate:200,numberOfChannels:1,getChannelData:()=>new Float32Array(100).fill(.1)};}
    createBufferSource(){return {...node(),playbackRate:{value:1},start(...args){starts.push({source:this,buffer:this.buffer,args});},stop(at){stops.push({source:this,at});this.onended?.();}};}
  }
  t.mock.method(globalThis,'fetch',async url=>{requests++;await waitForFile(url);return {ok:true,arrayBuffer:async()=>Object.assign(new ArrayBuffer(1),{url})};});
  const previous=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
  globalThis.AudioContext=AudioContext;
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'AudioContext',previous);else delete globalThis.AudioContext;});
  const audio=await import(`../src/audio.js?test=${++audioTestId}`);
  return {audio,starts,stops,get requests(){return requests;}};
}

test('mute cancels playing and pending audio, while cached samples avoid duplicate fetches',async t=>{
  let finishFetch;const pending=new Promise(resolve=>finishFetch=resolve);
  const h=await mockAudio(t,()=>pending),{audio,starts,stops}=h;
  const first=audio.sound('flip');const initialRequests=h.requests;
  audio.setAudioEnabled(false);finishFetch();await first;
  assert.equal(starts.length,0,'a muted in-flight sound must not play when loading finishes');
  await audio.sound('draw');assert.equal(starts.length,1);
  assert.equal(h.requests,initialRequests,'decoded recordings should stay cached');
  audio.setAudioEnabled(false);assert.equal(stops.length,1,'mute immediately stops active playback');
  await audio.sound('roll',false);assert.equal(starts.length,1);
});

test('cached pickup starts in the input event and a fast release retires it before placement',async t=>{
  const {audio,starts,stops}=await mockAudio(t);
  await audio.sound('draw');audio.setAudioEnabled(false);audio.setAudioEnabled(true);
  const baseline=starts.length;
  const pickup=audio.sound('card-pickup');
  assert.equal(starts.length,baseline+1,'cached pickup must start before yielding to a microtask');
  const picked=starts.at(-1).source;
  const drop=audio.sound('card-drop');
  assert.ok(stops.some(stop=>stop.source===picked),'release must retire the current pickup');
  assert.match(starts.at(-1).buffer.url,/card-set-down/);
  // Two complete gestures may occur inside the generic 45 ms cue throttle.
  const next=audio.sound('card-pickup');audio.sound('card-drop');
  assert.equal(starts.length,baseline+4,'a fast second gesture must retain both feedback events');
  await Promise.all([pickup,drop,next]);audio.setAudioEnabled(false);
});

test('release or cancellation prevents an in-flight pickup from sounding later',async t=>{
  let finishPickup;const pending=new Promise(resolve=>finishPickup=resolve);
  const {audio,starts}=await mockAudio(t,url=>url.includes('card-lift')?pending:Promise.resolve());
  await audio.sound('card-drop');
  const cancelled=audio.sound('card-pickup');audio.stopSound('card-pickup');
  const pickup=audio.sound('card-pickup');await audio.sound('card-drop');
  const count=starts.length;finishPickup();await Promise.all([cancelled,pickup]);
  assert.equal(starts.length,count,'a downloaded pickup must not play after its release');
  const next=audio.sound('card-pickup');await next;
  assert.match(starts.at(-1).buffer.url,/card-lift/,'cancelling an old request must not poison later gestures');
  audio.stopSound('card-pickup');audio.setAudioEnabled(false);
});

test('a cold pickup that misses its short feedback window is skipped',async t=>{
  let now=0,finishPickup;const pending=new Promise(resolve=>finishPickup=resolve);
  t.mock.method(performance,'now',()=>now);
  const {audio,starts}=await mockAudio(t,url=>url.includes('card-lift')?pending:Promise.resolve());
  const pickup=audio.sound('card-pickup');now=50;finishPickup();await pickup;
  assert.equal(starts.length,0,'late feedback must be skipped even before release');
  audio.setAudioEnabled(false);
});
