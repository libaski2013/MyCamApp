import {readFile,writeFile,rename,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {registerLiveVoices} from './live-voice-service.js';

export function runMedia(args,timeout=120000){return new Promise((resolve,reject)=>{
 const proc=spawn(process.env.FFMPEG_PATH||ffmpeg,args,{stdio:['ignore','ignore','pipe']});let error='';
 proc.stderr.on('data',v=>{error=(error+v).slice(-3000)});const timer=setTimeout(()=>proc.kill('SIGKILL'),timeout);
 proc.on('error',()=>{clearTimeout(timer);reject(Error('Video processing tool is unavailable.'))});
 proc.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Media processing failed. Check that the recording contains speech and valid video.'))});
})}
export async function registerVoices(app,{data,recordings,state,authorized,media=runMedia}){
 const db=join(data,'voices.json'),outputs=join(data,'voice-videos'),work=join(data,'voice-work');await mkdir(outputs,{recursive:true});await mkdir(work,{recursive:true});
 let store;try{store=JSON.parse(await readFile(db,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;store={voices:[],jobs:[]}}
 let queue=Promise.resolve();const persist=()=>{const content=JSON.stringify(store);queue=queue.catch(()=>{}).then(async()=>{await writeFile(db+'.tmp',content);await rename(db+'.tmp',db)});return queue};
 const enabled=()=>!!process.env.ELEVENLABS_API_KEY;
 const publicVoice=v=>({id:v.id,name:v.name,temporary:v.temporary,expiresAt:v.expiresAt,status:v.status});
 const publicJob=j=>({id:j.id,status:j.status,message:j.message,url:j.status==='complete'?`/api/voice/jobs/${j.id}/file`:null,voiceCleanup:j.voiceCleanup});
 async function provider(path,method,body){const res=await fetch('https://api.elevenlabs.io/v1/'+path,{method,headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},body,signal:AbortSignal.timeout(120000)});if(!res.ok){const e=Error(res.status===401||res.status===403?'ElevenLabs API access denied. Check the key, cloning permission and plan.':res.status===402||res.status===429?'ElevenLabs credits or usage limit reached.':'ElevenLabs rejected the audio request. Check voice verification, sample quality and model access.');e.providerStatus=res.status;throw e}return res}
 async function removeVoice(v){v.status='deleting';await persist();try{const res=await fetch('https://api.elevenlabs.io/v1/voices/'+encodeURIComponent(v.remote),{method:'DELETE',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},signal:AbortSignal.timeout(20000)});if(!res.ok&&res.status!==404)throw Error('delete failed');store.voices=store.voices.filter(x=>x.id!==v.id);for(const j of store.jobs)if(j.voiceId===v.id&&j.voiceCleanup==='pending')j.voiceCleanup='deleted';await persist();return true}catch{v.status='cleanup-pending';await persist();return false}}
 async function cleanup(){if(!enabled())return;for(const v of [...store.voices])if(v.status==='cleanup-pending'||v.status==='deleting'||v.temporary&&Date.parse(v.expiresAt)<Date.now()&&v.status!=='busy')await removeVoice(v)}
 // A restart interrupts running jobs; mark them honestly and delete one-video voices.
 for(const j of store.jobs)if(!['complete','failed'].includes(j.status)){j.status='failed';j.message='Server restarted during conversion. Retry with a saved voice or create a new temporary voice.'}
 for(const v of store.voices)if(v.status==='busy')v.status=v.temporary?'cleanup-pending':'ready';
 await persist();await rm(work,{recursive:true,force:true});await mkdir(work,{recursive:true});
 const sweep=setInterval(()=>cleanup().catch(()=>{}),60000);sweep.unref();app.addHook('onClose',async()=>clearInterval(sweep));
 app.addHook('preHandler',async(req,reply)=>{if(!req.url.startsWith('/api/voice/'))return;reply.header('Cache-Control','no-store');if(!authorized(req))return reply.code(401).send({error:'Sign in to the studio first.'});if(!enabled())return reply.code(503).send({error:'Set ELEVENLABS_API_KEY in Railway to enable voice cloning.'})});
 app.get('/api/voice/capabilities',async()=>({enabled:enabled(),scope:'recorded-video-and-buffered-live',maxVideoSeconds:300,liveChunkSeconds:2,liveMaxSeconds:300}));
 app.get('/api/voice/library',async()=>{await cleanup();return {voices:store.voices.map(publicVoice),jobs:store.jobs.slice(-30).reverse().map(publicJob)}});
 let cloning=false;
 app.post('/api/voice/library',async(req,reply)=>{
  if(cloning)return reply.code(409).send({error:'Another voice is being created. Wait for it to finish.'});
  if(req.query.consent!=='true')return reply.code(400).send({error:'Confirm you own this voice or have the speaker’s permission.'});
  const name=String(req.query.name||'').trim().slice(0,80),temporary=req.query.mode==='temporary';
  if(!name||!['saved','temporary'].includes(req.query.mode))return reply.code(400).send({error:'Enter a voice name and choose saved or one-video use.'});
  if(store.voices.length>=20)return reply.code(409).send({error:'Voice library limit reached. Delete unused voices first.'});
  cloning=true;let dir,remote;
  try{
   const part=await req.file();if(!part||!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/webm','audio/mp4','audio/ogg','audio/flac','audio/x-flac'].includes(part.mimetype))return reply.code(415).send({error:'Upload MP3, WAV, M4A, WebM, Ogg or FLAC audio.'});
   const chunks=[];let size=0;for await(const chunk of part.file){size+=chunk.length;if(size>15*1024*1024)throw Error('Voice sample exceeds 15 MB.');chunks.push(chunk)}if(part.file.truncated)throw Error('Voice sample is too large.');
   dir=await mkdtemp(join(work,'sample-'));const raw=join(dir,'input'),wav=join(dir,'sample.wav');await writeFile(raw,Buffer.concat(chunks));
   await media(['-y','-protocol_whitelist','file,pipe','-i',raw,'-t','180','-vn','-ac','1','-ar','22050','-c:a','pcm_s16le',wav]);
   const bytes=await readFile(wav),seconds=(bytes.length-44)/44100;if(seconds<5)throw Error('Use at least 5 seconds of clear speech. 1–2 minutes is recommended.');
   const form=new FormData();form.append('name',name);form.append('files',new Blob([bytes],{type:'audio/wav'}),'sample.wav');
   const result=await (await provider('voices/add','POST',form)).json();remote=result.voice_id;if(!remote)throw Error('Provider did not return a voice.');
   const v={id:randomUUID(),remote,name,temporary,expiresAt:temporary?new Date(Date.now()+3600000).toISOString():null,status:result.requires_verification?'verification-required':'ready',createdAt:new Date().toISOString()};store.voices.push(v);await persist();
   return reply.code(201).send({...publicVoice(v),warning:seconds<60?'Short sample: identity and accent may be less consistent.':null});
  }catch(e){if(remote&&!store.voices.some(v=>v.remote===remote))await provider('voices/'+encodeURIComponent(remote),'DELETE').catch(()=>{});return reply.code(502).send({error:e.message})}
  finally{cloning=false;if(dir)await rm(dir,{recursive:true,force:true})}
 });
 app.delete('/api/voice/library/:id',async(req,reply)=>{const v=store.voices.find(v=>v.id===req.params.id);if(!v)return reply.code(404).send({error:'Voice not found.'});if(v.status==='busy')return reply.code(409).send({error:'Voice is converting a video. Wait for completion.'});const removed=await removeVoice(v);return {removed,message:removed?'Voice deleted locally and from the provider.':'Provider deletion pending. Automatic retries are active.'}});
 let converting=false;
 async function convert(job,v,item){let dir;try{
   dir=await mkdtemp(join(work,'video-'));const source=join(recordings,item.id+(item.mime==='video/mp4'?'.mp4':'.webm')),wav=join(dir,'speech.wav');
   job.status='extracting';job.message='Extracting recorded speech…';await persist();
   await media(['-y','-protocol_whitelist','file,pipe','-i',source,'-t','301','-vn','-ac','1','-ar','22050','-c:a','pcm_s16le',wav]);
   const audio=await readFile(wav),seconds=(audio.length-44)/44100;if(seconds>300)throw Error('Recordings must be 5 minutes or shorter.');
   job.status='converting';job.message='Applying the selected voice…';await persist();
   const form=new FormData();form.append('audio',new Blob([audio],{type:'audio/wav'}),'speech.wav');form.append('model_id',process.env.ELEVENLABS_VOICE_MODEL||'eleven_multilingual_sts_v2');
   const response=await provider('speech-to-speech/'+encodeURIComponent(v.remote)+'?output_format=mp3_44100_128','POST',form);const converted=join(dir,'converted.mp3');await writeFile(converted,Buffer.from(await response.arrayBuffer()));
   job.status='merging';job.message='Combining the converted voice with your video…';await persist();
   await media(['-y','-protocol_whitelist','file,pipe','-i',source,'-i',converted,'-map','0:v:0','-map','1:a:0','-t','300','-c:v','libx264','-preset','veryfast','-threads','2','-crf','22','-c:a','aac','-af','apad','-shortest','-movflags','+faststart',join(outputs,job.id+'.mp4')]);
   job.status='complete';job.message='Video ready. Original recording retained.';
  }catch(e){job.status='failed';job.message=e.message;await rm(join(outputs,job.id+'.mp4'),{force:true})}
  finally{
   if(dir)await rm(dir,{recursive:true,force:true});
   if(v.temporary){job.voiceCleanup=await removeVoice(v)?'deleted':'pending';}else v.status='ready';
   await persist();converting=false;
  }
 }
 app.post('/api/voice/jobs',async(req,reply)=>{
  if(converting)return reply.code(409).send({error:'A video is already converting. Wait for completion.'});
  const v=store.voices.find(v=>v.id===req.body?.voiceId),item=state.recordings.find(r=>r.id===req.body?.recordingId);
  if(!v||!['ready','verification-required'].includes(v.status)||v.temporary&&Date.parse(v.expiresAt)<Date.now())return reply.code(400).send({error:'Choose a ready, unexpired voice.'});
  if(!item)return reply.code(404).send({error:'Recording not found.'});
  converting=true;v.status='busy';const j={id:randomUUID(),voiceId:v.id,recordingId:item.id,status:'queued',message:'Preparing voice conversion…',createdAt:new Date().toISOString()};store.jobs.push(j);await persist();
  void convert(j,v,item);return reply.code(202).send(publicJob(j));
 });
 app.get('/api/voice/jobs/:id',async(req,reply)=>{const j=store.jobs.find(j=>j.id===req.params.id);return j?publicJob(j):reply.code(404).send({error:'Job not found.'})});
 app.get('/api/voice/jobs/:id/file',async(req,reply)=>{const j=store.jobs.find(j=>j.id===req.params.id);if(!j||j.status!=='complete')return reply.code(404).send({error:'Video is not ready.'});return reply.header('Content-Type','video/mp4').header('Content-Disposition','attachment; filename="mycam-voice-'+j.id+'.mp4"').send(createReadStream(join(outputs,j.id+'.mp4')))});
 app.delete('/api/voice/jobs/:id',async(req,reply)=>{const j=store.jobs.find(j=>j.id===req.params.id);if(!j)return reply.code(404).send({error:'Job not found.'});if(!['complete','failed'].includes(j.status))return reply.code(409).send({error:'Wait for conversion to finish.'});await rm(join(outputs,j.id+'.mp4'),{force:true});store.jobs=store.jobs.filter(x=>x.id!==j.id);await persist();return {removed:true}});
 await registerLiveVoices(app,{voices:()=>store.voices,persist,removeVoice,convertAudio:async(v,bytes,signal)=>{
  const form=new FormData();form.append('audio',new Blob([bytes],{type:'audio/wav'}),'segment.wav');form.append('model_id',process.env.ELEVENLABS_VOICE_MODEL||'eleven_multilingual_sts_v2');
  const response=await fetch('https://api.elevenlabs.io/v1/speech-to-speech/'+encodeURIComponent(v.remote)+'?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY},body:form,signal:AbortSignal.any([signal,AbortSignal.timeout(25000)])});
  if(!response.ok)throw Error(response.status===401||response.status===403?'ElevenLabs access denied. Check voice verification and API key permissions.':response.status===402||response.status===429?'ElevenLabs credits or usage limit reached.':'Live voice conversion failed at ElevenLabs. Stop and retry.');
  const reader=response.body.getReader();const chunks=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw Error('Converted speech exceeded the segment limit.');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
  return Buffer.concat(chunks);
 }});
 await cleanup();
}
