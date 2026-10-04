import {authenticateStudio} from '/studio-auth.js';
import {encodeWav,frameIndex} from '/live-voice-pcm.js';
const $=id=>document.getElementById(id);
export function mountLiveVoice({getStream,getCanvas,onStopping}){
 const canvas=$('liveCallCanvas'),ctx=canvas.getContext('2d'),audio=$('liveVoiceAudio'),status=$('liveVoiceStatus');
 let session=null,context=null,capture=null,input=null,destination=null,zero=null,timer=null,heartbeat=null,deadline=null,raf=null,controller=null,outputFeed=null;
 let ring=[],segments=[],ready=[],playing=null,processing=false,starting=false,stopping=false,epoch=0,sequence=0;
 const active=()=>!!session;
 const report=message=>{status.textContent=message};
 async function request(path,options={}){const r=await fetch('/api/voice/live/'+path,options);if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||'Live voice request failed.')}return r}
 async function devices(){const previous=$('liveVoiceSink').value;const list=await navigator.mediaDevices.enumerateDevices();$('liveVoiceSink').replaceChildren(new Option('Default audio output',''));for(const d of list.filter(d=>d.kind==='audiooutput'))$('liveVoiceSink').add(new Option(d.label||'Audio output',d.deviceId));$('liveVoiceSink').value=previous;if($('liveVoiceSink').selectedIndex<0)$('liveVoiceSink').value='';if(!audio.setSinkId)report('This browser cannot select audio outputs. Use Chrome/Edge or OS audio routing.')}
 async function route(){if(audio.setSinkId)await audio.setSinkId($('liveVoiceSink').value);else if($('liveVoiceSink').value)throw Error('Audio output selection is unsupported.');audio.muted=!$('liveVoiceMonitor').checked}
 function sampleFrame(){if(!session||!context)return;const c=document.createElement('canvas');c.width=480;c.height=270;c.getContext('2d').drawImage(getCanvas(),0,0,480,270);ring.push({time:context.currentTime,canvas:c});const limit=context.currentTime-12;while(ring.length&&ring[0].time<limit)ring.shift();if(ring.length>160)ring.splice(0,ring.length-160)}
 function draw(){if(!session)return;
  if(playing){const elapsed=context.currentTime-playing.at;const index=frameIndex(elapsed,playing.buffer.duration,playing.frames.length);const frame=playing.frames[index];if(frame)ctx.drawImage(frame.canvas,0,0,canvas.width,canvas.height);if(elapsed>=playing.buffer.duration){playing.node.disconnect();playing=null}}
  if(!playing&&ready.length){const clip=ready.shift();const node=context.createBufferSource();node.buffer=clip.buffer;node.connect(destination);const at=context.currentTime+.03;node.start(at);playing={...clip,node,at};report(`Voice playing · ${(context.currentTime-clip.start).toFixed(1)} s buffered delay · ${ready.length+segments.length} waiting`)}
  raf=requestAnimationFrame(draw);
 }
 async function process(){if(processing||!session)return;processing=true;const generation=epoch;
  try{while(segments.length&&session&&generation===epoch){
   const segment=segments.shift();let buffer;
   if(segment.rms<.008){buffer=context.createBuffer(1,32000,16000)}else{
    report('Converting live speech…');controller=new AbortController();const r=await request('sessions/'+session.id+'/chunks',{method:'POST',headers:{'Content-Type':'audio/wav','X-Voice-Sequence':String(sequence)},body:encodeWav(segment.samples),signal:controller.signal});sequence++;
    buffer=await context.decodeAudioData(await r.arrayBuffer());
   }
   if(!session||generation!==epoch)break;
   if(buffer.duration<.1||buffer.duration>6)throw Error('Provider returned an invalid speech duration.');
   const offset=Number($('liveVoiceOffset').value)/1000;
   while(context.currentTime<segment.end+offset&&session&&generation===epoch)await new Promise(resolve=>setTimeout(resolve,40));
   if(!session||generation!==epoch)break;
   const frames=ring.filter(f=>f.time>=segment.start+offset&&f.time<segment.end+offset);
   if(!frames.length||context.currentTime-segment.start>10)throw Error('Voice conversion is too slow to keep video aligned. Live output stopped.');
   ready.push({buffer,frames,start:segment.start});
  }}catch(e){if(generation===epoch&&!stopping)await stop(e.name==='AbortError'?'Live voice request timed out.':e.message)}finally{if(generation===epoch)processing=false}
 }
 async function stop(message='Live voice stopped. Call output is silent.'){
  if(stopping)return;stopping=true;epoch++;const ended=session;session=null;
  clearInterval(timer);clearInterval(heartbeat);clearTimeout(deadline);cancelAnimationFrame(raf);controller?.abort();capture?.disconnect();input?.disconnect();zero?.disconnect();if(capture)capture.port.onmessage=null;
  playing?.node.stop();playing=null;segments=[];ready=[];ring=[];processing=false;
  // Stop recordings before removing the cloned track; never swap in the raw microphone.
  onStopping();audio.pause();audio.srcObject=null;$('liveCallPreview').srcObject=null;outputFeed?.getTracks().forEach(t=>t.stop());outputFeed=null;
  await context?.close().catch(()=>{});context=null;destination=null;capture=null;input=null;zero=null;
  ctx.fillStyle='#101927';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(ended)try{const result=await(await request('sessions/'+ended.id,{method:'DELETE',keepalive:true})).json();if(result.voiceCleanup==='pending')message+=' Temporary voice deletion is pending; automatic retries are active.';else if(result.voiceCleanup==='deleted')message+=' Temporary voice deleted.'}catch{message+=' Server cleanup will resume after session expiry.'}
  $('liveVoiceStart').disabled=false;$('liveVoiceStop').disabled=true;report(message);stopping=false;
 }
 async function start(){
  if(starting||session||stopping)return;starting=true;$('liveVoiceStart').disabled=true;
  try{
   const stream=getStream();if(!stream?.getAudioTracks().some(t=>t.readyState==='live'))throw Error('Start the camera with Include microphone enabled first.');
   if(!$('liveVoiceConsent').checked)throw Error('Confirm permission to use the selected voice live.');
   const voiceId=$('voiceSelect').value;if(!voiceId)throw Error('Select a voice in the voice library first.');
   if(!$('stopRecord').disabled)throw Error('Stop the current recording before starting live voice.');
   if(!window.AudioWorkletNode)throw Error('Use a browser supporting AudioWorklet, such as desktop Chrome or Edge.');
   await authenticateStudio($('transformKey'));await devices();
   context=new AudioContext({sampleRate:16000});await context.resume();await context.audioWorklet.addModule('/live-voice-worklet.js');
   destination=context.createMediaStreamDestination();outputFeed=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...destination.stream.getAudioTracks()]);
   $('liveCallPreview').srcObject=outputFeed;await $('liveCallPreview').play();audio.srcObject=new MediaStream(destination.stream.getAudioTracks());await route();await audio.play();
   session=await(await request('sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voiceId,consent:true})})).json();sequence=0;epoch++;const generation=epoch;
   input=context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));capture=new AudioWorkletNode(context,'mycam-voice-capture');zero=context.createGain();zero.gain.value=0;input.connect(capture).connect(zero).connect(context.destination);
   capture.port.onmessage=event=>{if(!session||generation!==epoch)return;const segment=event.data;const buffered=segments.length+ready.length+(playing?1:0)+(processing?1:0);if(buffered>=4){void stop('Conversion cannot keep up with speech. Live output stopped; try again with a faster connection or provider.');return}segments.push(segment);void process()};
   sampleFrame();timer=setInterval(sampleFrame,83);raf=requestAnimationFrame(draw);
   heartbeat=setInterval(()=>request('sessions/'+session.id+'/heartbeat',{method:'POST'}).catch(e=>void stop(e.message)),10000);
   deadline=setTimeout(()=>void stop('Five-minute live session ended.'),Math.max(0,Date.parse(session.expiresAt)-Date.now()));
   $('liveVoiceStop').disabled=false;report('Live voice buffering · speak normally. The call preview waits for converted speech.');
  }catch(e){await stop(e.message)}finally{starting=false;if(!session)$('liveVoiceStart').disabled=false}
 }
 $('liveVoiceStart').onclick=start;$('liveVoiceStop').onclick=()=>void stop();$('liveVoiceDevices').onclick=()=>devices().catch(e=>report(e.message));$('liveVoiceSink').onchange=()=>route().catch(e=>report(e.message));$('liveVoiceMonitor').onchange=()=>route().catch(e=>report(e.message));
 $('liveVoiceOffset').oninput=()=>{$('liveVoiceOffsetValue').textContent=$('liveVoiceOffset').value+' ms'};
 window.addEventListener('pagehide',()=>{controller?.abort();if(session)fetch('/api/voice/live/sessions/'+session.id,{method:'DELETE',keepalive:true}).catch(()=>{})});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&session)void stop('Live voice stopped because MyCam was hidden. Keep the studio visible during calls.')});
 navigator.mediaDevices?.addEventListener('devicechange',()=>devices().catch(()=>{}));
 return {active,getCanvas:()=>canvas,getAudioTracks:()=>destination?.stream.getAudioTracks()||[],stop};
}
