import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {registerVoices,runMedia} from '../voice-service.js';
test('recorded voice conversion produces video and deletes temporary clone with retry',async()=>{
 const data=await mkdtemp(join(tmpdir(),'mycam-voice-test-')),recordings=join(data,'recordings');await mkdir(recordings);
 const wav=join(data,'sample.wav'),source=join(recordings,'recording.webm');
 await runMedia(['-y','-f','lavfi','-i','sine=frequency=440:duration=6','-ac','1','-ar','22050',wav]);
 await runMedia(['-y','-f','lavfi','-i','color=c=blue:s=160x90:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libvpx','-c:a','libopus','-shortest',source]);
 const oldKey=process.env.ELEVENLABS_API_KEY;process.env.ELEVENLABS_API_KEY='voice-test-secret';const oldFetch=globalThis.fetch;let deletes=0,deleteFails=true,conversionFails=false;
 globalThis.fetch=async(url,opts)=>{assert.equal(opts.headers['xi-api-key'],'voice-test-secret');if(opts.method==='DELETE'){deletes++;return new Response('',{status:deleteFails?503:200})}if(String(url).endsWith('voices/add')){assert.ok(opts.body.get('files') instanceof Blob);return Response.json({voice_id:'provider-voice',requires_verification:false})}assert.match(String(url),/speech-to-speech/);if(conversionFails)return new Response('',{status:503});assert.equal(opts.body.get('model_id'),'eleven_multilingual_sts_v2');return new Response(await readFile(wav),{headers:{'Content-Type':'audio/mpeg'}})};
 const app=Fastify();await app.register(multipart);await registerVoices(app,{data,recordings,state:{recordings:[{id:'recording',mime:'video/webm'}]},save:async()=>{},authorized:r=>r.headers['x-test']==='admin'});
 try{
  assert.equal((await app.inject('/api/voice/library')).statusCode,401);
  const boundary='voiceBoundary',bytes=await readFile(wav),payload=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="sample.wav"\r\nContent-Type: audio/wav\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
  const create=await app.inject({method:'POST',url:'/api/voice/library?name=Test&mode=temporary&consent=true',headers:{'x-test':'admin','content-type':'multipart/form-data; boundary='+boundary},payload});assert.equal(create.statusCode,201,create.body);const v=create.json();assert.ok(!create.body.includes('provider-voice'));
  const submitted=await app.inject({method:'POST',url:'/api/voice/jobs',headers:{'x-test':'admin'},payload:{voiceId:v.id,recordingId:'recording'}});assert.equal(submitted.statusCode,202);
  let job;for(let i=0;i<200;i++){job=(await app.inject({url:'/api/voice/jobs/'+submitted.json().id,headers:{'x-test':'admin'}})).json();if(['complete','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,20))}assert.equal(job.status,'complete',job.message);
  for(let i=0;i<100&&!job.voiceCleanup;i++){await new Promise(r=>setTimeout(r,20));job=(await app.inject({url:'/api/voice/jobs/'+job.id,headers:{'x-test':'admin'}})).json()}
  assert.equal(job.voiceCleanup,'pending');deleteFails=false;
  const library=(await app.inject({url:'/api/voice/library',headers:{'x-test':'admin'}})).json();assert.equal(library.voices.length,0);assert.ok(deletes>=2);
  const video=await app.inject({url:job.url,headers:{'x-test':'admin'}});assert.equal(video.statusCode,200);assert.equal(video.headers['content-type'],'video/mp4');assert.ok(video.rawPayload.length>1000);
  assert.deepEqual(await readdir(join(data,'voice-work')),[]);
  assert.equal(library.jobs[0].voiceCleanup,'deleted');
  const removed=await app.inject({method:'DELETE',url:'/api/voice/jobs/'+job.id,headers:{'x-test':'admin'}});assert.equal(removed.statusCode,200);assert.equal((await app.inject({url:job.url,headers:{'x-test':'admin'}})).statusCode,404);assert.deepEqual(await readdir(join(data,'voice-videos')),[]);
  conversionFails=true;
  const failedVoice=(await app.inject({method:'POST',url:'/api/voice/library?name=Failed&mode=temporary&consent=true',headers:{'x-test':'admin','content-type':'multipart/form-data; boundary='+boundary},payload})).json();
  const failedJob=(await app.inject({method:'POST',url:'/api/voice/jobs',headers:{'x-test':'admin'},payload:{voiceId:failedVoice.id,recordingId:'recording'}})).json();
  let failed;for(let i=0;i<200;i++){failed=(await app.inject({url:'/api/voice/jobs/'+failedJob.id,headers:{'x-test':'admin'}})).json();if(failed.status==='failed'&&failed.voiceCleanup)break;await new Promise(r=>setTimeout(r,20))}
  assert.equal(failed.status,'failed');assert.equal(failed.voiceCleanup,'deleted');assert.equal((await app.inject({url:'/api/voice/library',headers:{'x-test':'admin'}})).json().voices.length,0);

 }finally{await app.close();globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.ELEVENLABS_API_KEY;else process.env.ELEVENLABS_API_KEY=oldKey;await rm(data,{recursive:true,force:true})}
});
