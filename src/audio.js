let context;
export function sound(kind,enabled=true){
  if(!enabled)return;
  try{
    context ||= new (window.AudioContext||window.webkitAudioContext)();
    if(context.state==='suspended')context.resume();
    const now=context.currentTime;
    const duration=kind==='shuffle'?.35:kind==='roll'?.12:kind==='flip'?.15:.08;
    const buffer=context.createBuffer(1,Math.floor(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,kind==='shuffle'?1:3);
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;filter.type='bandpass';filter.frequency.value=kind==='flip'?2300:kind==='shuffle'?3300:kind==='roll'?750:480;filter.Q.value=.7;gain.gain.value=kind==='roll'?.45:.22;
    source.connect(filter).connect(gain).connect(context.destination);source.start(now);
    if(kind==='drop'||kind==='roll'){const osc=context.createOscillator(),g=context.createGain();osc.frequency.setValueAtTime(kind==='roll'?180:110,now);osc.frequency.exponentialRampToValueAtTime(55,now+.08);g.gain.setValueAtTime(.045,now);g.gain.exponentialRampToValueAtTime(.001,now+.09);osc.connect(g).connect(context.destination);osc.start(now);osc.stop(now+.1);}
  }catch{/* Audio is optional if the browser does not expose Web Audio. */}
}
