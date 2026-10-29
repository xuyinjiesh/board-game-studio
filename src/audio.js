import {assetUrl} from './asset-url.js';
// Kenney CC0 recordings; provenance and original licenses live in /assets/audio/.
const casino=(...names)=>names.map(name=>`/assets/audio/casino/${name}.ogg`);
const impact=(...names)=>names.map(name=>`/assets/audio/impact/${name}.ogg`);
const edited=(...names)=>names.map(name=>`/assets/audio/edited/${name}.wav`);
export const AUDIO_CUES={
  flip:{files:casino('card-shove-1','card-shove-2'),gain:.65,maxDuration:.35},
  draw:{files:casino('card-slide-1','card-slide-2','card-slide-3'),gain:.6},
  'card-pickup':{files:edited('card-lift-1','card-lift-2','card-lift-3'),gain:.5,maxDelay:35},
  'card-drop':{files:edited('card-set-down-1','card-set-down-2'),gain:.6},
  shuffle:{files:casino('card-shuffle'),gain:.55,maxDuration:1.1},
  spread:{files:casino('card-fan-1','card-fan-2'),gain:.55,maxDuration:.6},
  roll:{files:casino('die-throw-1','die-throw-2','die-throw-3','die-throw-4'),gain:.75,roll:true},
  'roll-many':{files:casino('dice-throw-1','dice-throw-2','dice-throw-3'),gain:.65,roll:true},
  'die-pickup':{files:edited('die-lift-1','die-lift-2'),gain:.7},
  'die-drop':{files:casino('chip-lay-1','chip-lay-2','chip-lay-3'),gain:.5},
  'token-pickup':{files:casino('chips-handle-1','chips-handle-2'),gain:.3},
  'token-drop':{files:casino('chip-lay-1','chip-lay-2','chip-lay-3'),gain:.45},
  'wood-pickup':{files:impact('impactWood_light_000','impactWood_light_001','impactWood_light_002'),gain:.2},
  'wood-drop':{files:impact('impactWood_light_000','impactWood_light_001','impactWood_light_002'),gain:.4},
  'board-pickup':{files:impact('impactSoft_medium_000','impactSoft_medium_001'),gain:.2},
  'board-drop':{files:impact('impactSoft_medium_000','impactSoft_medium_001'),gain:.45},
  drop:{files:casino('chip-lay-1','chip-lay-2','chip-lay-3'),gain:.35}
};

export function objectSound(object,action='drop'){
  const material=object?.type==='card'||object?.type==='deck'?'card':object?.type==='die'?'die':object?.type==='board'?'board':
    ['disc','squirrel','wheelbarrow'].includes(object?.kind)?'wood':object?.kind==='custom'||object?.kind?.startsWith('ih-')?'card':'token';
  return `${material}-${action}`;
}

let context,master,enabled=false,generation=0;
const buffers=new Map(),decoded=new Map(),lastFiles=new Map(),lastPlayed=new Map(),cueVersions=new Map(),voices=new Map();
function audioContext(){
  if(context?.state==='closed'){context=null;buffers.clear();decoded.clear();}
  if(!context){
    const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!AudioContext)return null;
    context=new AudioContext({latencyHint:'interactive'});master=context.createGain();master.gain.value=.7;
    const limiter=context.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.1;
    master.connect(limiter).connect(context.destination);
  }
  return context;
}
function load(url){
  if(!buffers.has(url)){
    const pending=fetch(assetUrl(url)).then(response=>{
      if(!response.ok)throw new Error('Audio unavailable');
      return response.arrayBuffer();
    }).then(data=>context.decodeAudioData(data)).then(buffer=>{
      // Keep the original recording, but skip its leading silence for instant feedback.
      let first=buffer.length,last=0;
      for(let channel=0;channel<buffer.numberOfChannels;channel++){
        const samples=buffer.getChannelData(channel);
        for(let i=0;i<samples.length;i++)if(Math.abs(samples[i])>.015){first=Math.min(first,i);last=Math.max(last,i);}
      }
      const offset=first<buffer.length?Math.max(0,first/buffer.sampleRate-.008):0;
      const end=first<buffer.length?Math.min(buffer.duration,last/buffer.sampleRate+.04):buffer.duration;
      const clip={buffer,offset,duration:end-offset};decoded.set(url,clip);return clip;
    }).catch(error=>{buffers.delete(url);throw error;});
    buffers.set(url,pending);
  }
  return buffers.get(url);
}

export function setAudioEnabled(value){
  value=Boolean(value);if(enabled===value)return;enabled=value;
  if(!enabled){
    generation++;lastPlayed.clear();
    for(const source of voices.keys())source.stop();
    voices.clear();return;
  }
  try{
    if(!audioContext())return;
    // Decode once when entering the table, before the first interaction.
    for(const url of new Set(Object.values(AUDIO_CUES).flatMap(cue=>cue.files)))load(url).catch(()=>{});
  }catch{/* Audio remains optional on unsupported browsers. */}
}

export function unlockAudio(value=true){
  if(!value)return;
  try{const ctx=audioContext();if(ctx?.state==='suspended')ctx.resume().catch(()=>{});}catch{}
}

export function stopSound(kind){
  // Invalidate pending decodes as well as sources already playing.
  cueVersions.set(kind,(cueVersions.get(kind)||0)+1);lastPlayed.delete(kind);
  for(const [source,voice]of voices){
    if(voice.kind!==kind)continue;
    try{
      const now=context.currentTime,param=voice.gain.gain;
      param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);param.linearRampToValueAtTime(0,now+.004);
      source.stop(now+.005);
    }catch{try{source.stop();}catch{}}
    voices.delete(source);
  }
}

export async function sound(kind,value=true,{duration=.65}={}){
  if(!value){if(enabled)setAudioEnabled(false);return;}
  const cue=AUDIO_CUES[kind];if(!cue)return;
  try{
    if(!enabled)setAudioEnabled(true);
    const ctx=audioContext();if(!ctx)return;
    unlockAudio();
    // One continuous tactile gesture: a release retires its pickup immediately.
    if(kind.endsWith('-drop'))stopSound(kind.replace(/-drop$/,'-pickup'));
    if(/-(pickup|drop)$/.test(kind))stopSound(kind);
    const requested=performance.now(),epoch=generation,version=cueVersions.get(kind)||0;
    if(requested-(lastPlayed.get(kind)??-Infinity)<45)return;
    lastPlayed.set(kind,requested);
    const choices=cue.files.filter(url=>url!==lastFiles.get(kind));
    const url=(choices.length?choices:cue.files)[Math.floor(Math.random()*(choices.length||cue.files.length))];
    lastFiles.set(kind,url);
    // Warm recordings start in this input event, without waiting for a promise.
    const clip=decoded.get(url)||await load(url);
    // A slow download must never make an old interaction sound later, or after mute.
    if(!enabled||epoch!==generation||version!==(cueVersions.get(kind)||0)||performance.now()-requested>(cue.maxDelay??180)||ctx.state!=='running')return;
    while(voices.size>=8){const oldest=voices.keys().next().value;oldest.stop();voices.delete(oldest);}
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=clip.buffer;
    source.playbackRate.value=cue.roll?Math.max(.9,Math.min(1.1,clip.duration/duration)):.97+Math.random()*.06;
    gain.gain.value=cue.gain*(.94+Math.random()*.06);
    const length=Math.min(clip.duration,cue.maxDuration??Infinity),end=ctx.currentTime+length/source.playbackRate.value;
    gain.gain.setValueAtTime(gain.gain.value,Math.max(ctx.currentTime,end-.015));gain.gain.linearRampToValueAtTime(0,end);
    source.connect(gain).connect(master);voices.set(source,{kind,gain});
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};
    source.start(0,clip.offset,length);
  }catch{/* Missing files or blocked playback must not interrupt the table. */}
}
