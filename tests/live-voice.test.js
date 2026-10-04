import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {registerLiveVoices,validateLiveWav} from '../live-voice-service.js';
import {encodeWav,frameIndex} from '../public/live-voice-pcm.js';
const wav=()=>Buffer.from(encodeWav(new Float32Array(32000).fill(.1)));

test('PCM capture format and video frame timing reject invalid inputs',()=>{
 assert.equal(validateLiveWav(wav()),2);
 const bad=wav();bad.writeUInt32LE(48000,24);assert.throws(()=>validateLiveWav(bad));
 assert.throws(()=>validateLiveWav(Buffer.alloc(12)));
 assert.equal(frameIndex(-1,2,24),0);assert.equal(frameIndex(1,2,24),12);assert.equal(frameIndex(5,2,24),23);
});

test('live sessions serialize segments, restore saved voices and delete temporary voices',async()=>{
 const app=Fastify();let timestamp=1000000,deletes=0,calls=0;
 const voices=[{id:'saved',status:'ready'},{id:'temp',status:'ready',temporary:true,expiresAt:new Date(timestamp+3600000).toISOString()}];
 app.addHook('preHandler',async(req,reply)=>{if(req.headers['x-admin']!=='yes')return reply.code(401).send({error:'Admin required'})});
 await registerLiveVoices(app,{voices:()=>voices,persist:async()=>{},removeVoice:async v=>{deletes++;voices.splice(voices.indexOf(v),1);return true},convertAudio:async()=>{calls++;return Buffer.from('converted-audio')},now:()=>timestamp});
 const request=(method,url,payload,headers={})=>app.inject({method,url,payload,headers:{'x-admin':'yes',...headers}});
 try{
  assert.equal((await app.inject({method:'POST',url:'/api/voice/live/sessions',payload:{voiceId:'saved',consent:true}})).statusCode,401);
  const created=await request('POST','/api/voice/live/sessions',{voiceId:'saved',consent:true});assert.equal(created.statusCode,201);const id=created.json().id,base='/api/voice/live/sessions/'+id;
  assert.equal(voices[0].status,'busy');assert.equal((await request('POST','/api/voice/live/sessions',{voiceId:'temp',consent:true})).statusCode,409);
  const headers={'content-type':'audio/wav','x-voice-sequence':'0'};
  assert.equal((await request('POST',base+'/chunks',wav(),{...headers,'x-voice-sequence':'1'})).statusCode,409);
  const clip=await request('POST',base+'/chunks',wav(),headers);assert.equal(clip.statusCode,200);assert.equal(clip.body,'converted-audio');assert.equal(calls,1);
  assert.equal((await request('POST',base+'/chunks',wav(),headers)).statusCode,409);
  assert.equal((await request('DELETE',base)).json().voiceCleanup,'saved');assert.equal(voices[0].status,'ready');assert.equal(deletes,0);
  const temp=(await request('POST','/api/voice/live/sessions',{voiceId:'temp',consent:true})).json();
  assert.equal((await request('DELETE','/api/voice/live/sessions/'+temp.id)).json().voiceCleanup,'deleted');assert.equal(deletes,1);
  const expired=(await request('POST','/api/voice/live/sessions',{voiceId:'saved',consent:true})).json();timestamp+=300001;
  assert.equal((await request('POST','/api/voice/live/sessions/'+expired.id+'/heartbeat')).statusCode,410);
 }finally{await app.close()}
});

test('stopping live conversion cancels provider work before deleting temporary voice',async()=>{
 const app=Fastify();let entered,wasAborted=false,deleted=false;const started=new Promise(r=>{entered=r});const v={id:'temp',status:'ready',temporary:true,expiresAt:new Date(Date.now()+3600000).toISOString()};
 await registerLiveVoices(app,{voices:()=>[v],persist:async()=>{},removeVoice:async()=>{assert.ok(wasAborted);deleted=true;return true},convertAudio:async(_,__,signal)=>{entered();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{wasAborted=true;reject(Error('Stopped'))},{once:true}))}});
 try{
  const id=(await app.inject({method:'POST',url:'/api/voice/live/sessions',payload:{voiceId:'temp',consent:true}})).json().id,base='/api/voice/live/sessions/'+id;
  const converting=app.inject({method:'POST',url:base+'/chunks',payload:wav(),headers:{'content-type':'audio/wav','x-voice-sequence':'0'}});converting.then(()=>{});await started;
  assert.equal((await app.inject({method:'POST',url:base+'/chunks',payload:wav(),headers:{'content-type':'audio/wav','x-voice-sequence':'0'}})).statusCode,409);
  assert.equal((await app.inject({method:'DELETE',url:base})).json().voiceCleanup,'deleted');assert.ok(deleted);assert.equal((await converting).statusCode,502);
 }finally{await app.close()}
});
