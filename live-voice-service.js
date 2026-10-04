import {randomUUID} from 'node:crypto';

// Only our fixed-header mono PCM capture format is accepted. No media files or URLs.
export function validateLiveWav(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<1644||bytes.length>64044||
 bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||
 bytes.toString('ascii',12,16)!=='fmt '||bytes.readUInt32LE(16)!==16||
 bytes.readUInt16LE(20)!==1||bytes.readUInt16LE(22)!==1||
 bytes.readUInt32LE(24)!==16000||bytes.readUInt32LE(28)!==32000||
 bytes.readUInt16LE(32)!==2||bytes.readUInt16LE(34)!==16||
 bytes.toString('ascii',36,40)!=='data'||bytes.readUInt32LE(40)!==bytes.length-44||
 bytes.readUInt32LE(4)!==bytes.length-8||(bytes.length-44)%2)throw Error('Send 0.05–2 seconds of mono 16 kHz PCM WAV audio.');
 return (bytes.length-44)/32000;
}

export async function registerLiveVoices(app,{voices,persist,removeVoice,convertAudio,now=Date.now}){
 const sessions=new Map();
 app.addContentTypeParser('audio/wav',{parseAs:'buffer',bodyLimit:64044},(req,body,done)=>done(null,body));
 async function release(s){
  if(s.released)return s.cleanup;
  s.released=true;
  if(s.voice.temporary)s.cleanup=await removeVoice(s.voice)?'deleted':'pending';
  else{s.voice.status=s.previousStatus;await persist();s.cleanup='saved'}
  return s.cleanup;
 }
 async function end(s){
  if(s.ending)return s.ending;
  s.closed=true;s.controller?.abort();
  s.ending=(async()=>{if(s.inflight)await s.inflight;const cleanup=await release(s);sessions.delete(s.id);return cleanup})();
  return s.ending;
 }
 const sweep=setInterval(()=>{for(const s of sessions.values())if(now()>=s.expiresAt||!s.busy&&now()-s.lastSeen>30000)void end(s).catch(()=>{})},1000);sweep.unref();
 app.addHook('onClose',async()=>{clearInterval(sweep);await Promise.all([...sessions.values()].map(end))});
 app.post('/api/voice/live/sessions',async(req,reply)=>{
  if(req.body?.consent!==true)return reply.code(400).send({error:'Confirm permission to use the selected voice live.'});
  if(sessions.size)return reply.code(409).send({error:'Another live voice session is active. Stop it or wait for it to expire.'});
  const v=voices().find(v=>v.id===req.body?.voiceId);
  if(!v||!['ready','verification-required'].includes(v.status)||v.temporary&&Date.parse(v.expiresAt)<=now())return reply.code(400).send({error:'Choose an available voice from the library.'});
  const s={id:randomUUID(),voice:v,previousStatus:v.status,expiresAt:now()+300000,lastSeen:now(),sequence:0,seconds:0,busy:false,closed:false};
  v.status='busy';sessions.set(s.id,s);
  try{await persist()}catch(e){sessions.delete(s.id);v.status=s.previousStatus;throw e}
  return reply.code(201).send({id:s.id,expiresAt:new Date(s.expiresAt).toISOString(),chunkSeconds:2,mode:'buffered-live',temporary:v.temporary});
 });
 app.post('/api/voice/live/sessions/:id/heartbeat',async(req,reply)=>{
  const s=sessions.get(req.params.id);if(!s||s.closed||now()>=s.expiresAt)return reply.code(410).send({error:'Live session ended. Start a new session.'});s.lastSeen=now();return {expiresAt:new Date(s.expiresAt).toISOString()};
 });
 app.post('/api/voice/live/sessions/:id/chunks',{bodyLimit:64044},async(req,reply)=>{
  const s=sessions.get(req.params.id);
  if(!s||s.closed||now()>=s.expiresAt)return reply.code(410).send({error:'Live session ended. Start a new session.'});
  if(s.busy)return reply.code(409).send({error:'Wait for the previous speech segment.'});
  if(String(s.sequence)!==req.headers['x-voice-sequence'])return reply.code(409).send({error:'Speech segments must be submitted in order.'});
  let seconds;try{seconds=validateLiveWav(req.body)}catch(e){return reply.code(400).send({error:e.message})}
  if(s.seconds+seconds>300||s.sequence>=150)return reply.code(429).send({error:'Live voice session limit reached. Stop and start a new session.'});
  s.busy=true;s.lastSeen=now();s.seconds+=seconds;s.controller=new AbortController();
  let finished;s.inflight=new Promise(resolve=>{finished=resolve});
  try{
   const started=now();const audio=await convertAudio(s.voice,req.body,s.controller.signal);
   if(s.closed)return reply.code(410).send({error:'Live session stopped.'});
   s.sequence++;return reply.header('Content-Type','audio/mpeg').header('X-Voice-Processing-Ms',String(now()-started)).send(audio);
  }catch(e){return reply.code(502).send({error:s.closed?'Live session stopped.':e.message})}
  finally{s.busy=false;s.controller=null;s.lastSeen=now();finished()}
 });
 app.delete('/api/voice/live/sessions/:id',async(req,reply)=>{
  const s=sessions.get(req.params.id);if(!s)return {ended:true,voiceCleanup:'already-ended'};
  return {ended:true,voiceCleanup:await end(s)};
 });
}
