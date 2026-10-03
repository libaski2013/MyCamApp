import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { randomUUID, timingSafeEqual, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const data = process.env.DATA_DIR || join(root, 'data');
const avatars = join(data, 'avatars');
const recordings = join(data, 'recordings');
const dbPath = join(data, 'state.json');
const allowedImages = {'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp'};
const allowedVideo = {'video/webm':'.webm','video/mp4':'.mp4'};
const allowedSettings = new Set(['mirror','overlaySize','overlayX','overlayY','cameraId','microphoneId','selectedAvatarId','background']);
const app = Fastify({logger:true, bodyLimit:20*1024*1024});
const workerUrl = process.env.GPU_WORKER_URL?.replace(/\/$/,'');
const workerToken = process.env.GPU_WORKER_TOKEN;
const studioKey = process.env.STUDIO_ACCESS_KEY;
const portraitEnabled = !!(workerUrl && workerToken && studioKey?.length>=24 && /^https:\/\//.test(workerUrl));
const portraitSessions = new Map();
app.addContentTypeParser('image/jpeg',{parseAs:'buffer',bodyLimit:512*1024},(req,body,done)=>done(null,body));
await Promise.all([mkdir(avatars,{recursive:true}),mkdir(recordings,{recursive:true})]);
let state;
try { state = JSON.parse(await readFile(dbPath,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; state = {avatars:[],recordings:[],settings:{mirror:true,overlaySize:35,overlayX:50,overlayY:50,background:'solid'}}; }
let pendingSave = Promise.resolve();
const save = () => { const snapshot=JSON.stringify(state,null,2); pendingSave=pendingSave.catch(()=>{}).then(async()=>{const path=dbPath+'.tmp';await writeFile(path,snapshot);await rename(path,dbPath)});return pendingSave; };
await app.register(multipart,{limits:{fileSize:100*1024*1024,files:1,fields:3}});
function safeId(id){ return /^[a-f0-9-]{36}$/.test(id); }
async function upload(req,reply,kind){
  const part=await req.file();
  if(!part) return reply.code(400).send({error:'Choose a file.'});
  const types=kind==='avatar'?allowedImages:allowedVideo;
  const max=kind==='avatar'?8*1024*1024:100*1024*1024;
  if(!types[part.mimetype]) return reply.code(415).send({error:'Unsupported media type.'});
  const chunks=[]; let length=0;
  try { for await(const chunk of part.file){ length+=chunk.length; if(length>max) return reply.code(413).send({error:'File too large.'}); chunks.push(chunk); } }
  catch { return reply.code(413).send({error:'File too large.'}); }
  const bytes=Buffer.concat(chunks);
  const imageOk=part.mimetype==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):part.mimetype==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')):part.mimetype==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':true;
  if(!imageOk) return reply.code(415).send({error:'Invalid image content.'});
  const id=randomUUID(), filename=id+types[part.mimetype];
  await writeFile(join(kind==='avatar'?avatars:recordings,filename),bytes,{flag:'wx'});
  const item={id,name:basename(part.filename||kind).slice(0,100),mime:part.mimetype,size:bytes.length,createdAt:new Date().toISOString(),url:`/api/${kind}s/${id}/file`};
  state[kind==='avatar'?'avatars':'recordings'].unshift(item); await save();
  return reply.code(201).send(item);
}
app.get('/api/health',async()=>({ok:true}));
app.get('/api/portrait/capabilities',async()=>({enabled:portraitEnabled,engine:portraitEnabled?'LivePortrait':null,scope:'face-and-head',reason:portraitEnabled?null:'Configure HTTPS GPU_WORKER_URL, GPU_WORKER_TOKEN and STUDIO_ACCESS_KEY (24+ characters) on the server.'}));
const sessionAge=30*24*60*60;
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const signSession=value=>createHmac('sha256',studioKey||'').update(value).digest('base64url');
function validSession(req){
  if(!studioKey||studioKey.length<24)return false;
  const raw=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('mycam_session='))?.slice(14)||'';
  const [expiry,nonce,signature]=raw.split('.');
  return /^\d+$/.test(expiry||'')&&Number(expiry)>Date.now()&&Number(expiry)<=Date.now()+sessionAge*1000&&!!nonce&&!!signature&&same(signature,signSession(expiry+'.'+nonce));
}
function authorized(req){return validSession(req)||!!(studioKey?.length>=24&&same(req.headers['x-studio-key']||'',studioKey))}
const cookieFlags=()=>'; Path=/; HttpOnly; SameSite=Strict'+(process.env.APP_ORIGIN?.startsWith('https:')||process.env.RAILWAY_PROJECT_ID?'; Secure':'');
app.get('/api/studio/session',async(req,reply)=>{reply.header('Cache-Control','no-store');return {authenticated:validSession(req)}});
app.post('/api/studio/session',async(req,reply)=>{
  reply.header('Cache-Control','no-store');
  if(!studioKey||studioKey.length<24||!same(req.headers['x-studio-key']||'',studioKey))return reply.code(401).send({error:'Enter the correct studio access key.'});
  const value=(Date.now()+sessionAge*1000)+'.'+randomUUID();
  reply.header('Set-Cookie','mycam_session='+value+'.'+signSession(value)+'; Max-Age='+sessionAge+cookieFlags());return {authenticated:true};
});
app.delete('/api/studio/session',async(req,reply)=>{reply.header('Set-Cookie','mycam_session=; Max-Age=0'+cookieFlags()).header('Cache-Control','no-store');return {authenticated:false}});
async function callWorker(path,method,body,timeout=20000){
  const response=await fetch(workerUrl+path,{method,headers:{Authorization:`Bearer ${workerToken}`,...(body?{'Content-Type':'image/jpeg'}:{})},body,signal:AbortSignal.timeout(timeout)});
  if(!response.ok){const detail=await response.text().catch(()=>"");throw new Error(`GPU worker ${response.status}: ${detail.slice(0,150)}`)}
  return response;
}
app.post('/api/portrait/sessions',async(req,reply)=>{
  if(!portraitEnabled)return reply.code(503).send({error:'GPU portrait worker is not configured.'});
  if(!authorized(req))return reply.code(401).send({error:'Enter the studio access key.'});
  const id=req.headers['x-avatar-id'];
  const item=state.avatars.find(v=>v.id===id);
  if(!item||!safeId(id))return reply.code(404).send({error:'Choose a saved portrait first.'});
  if(!Buffer.isBuffer(req.body)||req.body.length>512*1024)return reply.code(413).send({error:'Send a cropped JPEG portrait under 512 KB.'});
  const now=Date.now();for(const [key,value] of portraitSessions)if(now-value.last>300000)portraitSessions.delete(key);
  if(portraitSessions.size>=8)return reply.code(429).send({error:'Too many active portrait sessions.'});
  try{
    const result=await (await callWorker('/sessions','POST',req.body,60000)).json();
    const token=randomUUID();portraitSessions.set(token,{remote:result.sessionId,last:now,busy:false});
    return {sessionId:token};
  }catch(e){req.log.error(e);return reply.code(502).send({error:'GPU portrait preparation failed: '+e.message})}
});
app.post('/api/portrait/sessions/:token/frame',async(req,reply)=>{
  if(!authorized(req))return reply.code(401).send({error:'Invalid studio access key.'});
  const session=portraitSessions.get(req.params.token);
  if(!session||Date.now()-session.last>300000)return reply.code(404).send({error:'Portrait session expired. Start it again.'});
  if(!Buffer.isBuffer(req.body)||req.body.length>512*1024)return reply.code(413).send({error:'Send a JPEG camera frame under 512 KB.'});
  if(session.busy)return reply.code(429).send({error:'Previous frame is still rendering.'});
  session.busy=true;session.last=Date.now();
  try{const response=await callWorker(`/sessions/${encodeURIComponent(session.remote)}/frame`,'POST',req.body);
    reply.header('Content-Type','image/jpeg').header('Cache-Control','no-store');return reply.send(Buffer.from(await response.arrayBuffer()));
  }catch(e){req.log.error(e);return reply.code(502).send({error:'GPU frame failed: '+e.message})}
  finally{session.busy=false}
});
app.delete('/api/portrait/sessions/:token',async(req,reply)=>{
  if(!authorized(req))return reply.code(401).send({error:'Invalid studio access key.'});
  const session=portraitSessions.get(req.params.token);portraitSessions.delete(req.params.token);
  if(session&&portraitEnabled)await callWorker(`/sessions/${encodeURIComponent(session.remote)}`,'DELETE',undefined,5000).catch(()=>{});
  return {ok:true};
});
const decartModel = process.env.DECART_MODEL || 'lucy-2.5';
const decartEnabled = !!(process.env.DECART_API_KEY && studioKey?.length >= 24);
const tokenRequests = new Map();
app.get('/api/transform/capabilities',async()=>({enabled:decartEnabled,model:decartModel,reason:decartEnabled?null:'Set DECART_API_KEY and STUDIO_ACCESS_KEY (24+ characters) in Railway.'}));
app.post('/api/transform/token',async(req,reply)=>{
  reply.header('Cache-Control','no-store');
  if(!decartEnabled)return reply.code(503).send({error:'Live transformation is not configured. Set DECART_API_KEY and STUDIO_ACCESS_KEY in Railway.'});
  if(!authorized(req))return reply.code(401).send({error:'Enter the correct studio access key.'});
  const now=Date.now();for(const [ip,times] of tokenRequests){const recent=times.filter(t=>now-t<60000);if(recent.length)tokenRequests.set(ip,recent);else tokenRequests.delete(ip)}
  const attempts=tokenRequests.get(req.ip)||[];
  if(attempts.length>=5)return reply.code(429).send({error:'Too many starts. Wait one minute.'});
  attempts.push(now);tokenRequests.set(req.ip,attempts);
  try{
    const {createDecartClient}=await import('@decartai/sdk');
    const client=createDecartClient({apiKey:process.env.DECART_API_KEY});
    const origin=process.env.APP_ORIGIN || (req.headers.origin ? new URL(req.headers.origin).origin : undefined);
    const token=await client.tokens.create({expiresIn:120,allowedModels:[decartModel],...(origin?{allowedOrigins:[origin]}:{}),constraints:{realtime:{maxSessionDuration:300}}});
    return {apiKey:token.apiKey,expiresAt:token.expiresAt,model:decartModel,maxSessionDuration:300};
  }catch{return reply.code(502).send({error:'Decart could not create a session. Check the API key, model access and credits in the Decart dashboard.'})}
});
app.get('/api/state',async()=>state);
app.patch('/api/settings',async(req,reply)=>{const body=req.body;if(!body||typeof body!=='object'||Array.isArray(body)) return reply.code(400).send({error:'Invalid settings'});for(const [key,value] of Object.entries(body)){if(!allowedSettings.has(key))return reply.code(400).send({error:`Unknown setting: ${key}`});if(['overlaySize','overlayX','overlayY'].includes(key)&&(!Number.isFinite(value)||value<0||value>100))return reply.code(400).send({error:`Invalid ${key}`});if(key==='background'&&!['original','blur','solid'].includes(value))return reply.code(400).send({error:'Invalid background'});if(key==='mirror'&&typeof value!=='boolean')return reply.code(400).send({error:'Invalid mirror'});if(['cameraId','microphoneId','selectedAvatarId'].includes(key)&&typeof value!=='string')return reply.code(400).send({error:`Invalid ${key}`});}Object.assign(state.settings,body);await save();return state.settings;});
app.post('/api/avatars',async(req,reply)=>upload(req,reply,'avatar'));
app.post('/api/recordings',async(req,reply)=>upload(req,reply,'recording'));
for(const [kind,dir,key] of [['avatars',avatars,'avatars'],['recordings',recordings,'recordings']]){
 app.get(`/api/${kind}`,async()=>state[key]);
 app.get(`/api/${kind}/:id/file`,async(req,reply)=>{const item=state[key].find(v=>v.id===req.params.id);if(!item||!safeId(item.id))return reply.code(404).send({error:'Not found'});const path=join(dir,item.id+(item.mime==='image/jpeg'?'.jpg':item.mime==='image/png'?'.png':item.mime==='image/webp'?'.webp':item.mime==='video/mp4'?'.mp4':'.webm'));try {const file=await open(path,'r');reply.header('Content-Type',item.mime).header('Content-Disposition',`inline; filename="${item.id}${extname(path)}"`).header('Cache-Control','private, max-age=3600');return reply.send(file.createReadStream());}catch{return reply.code(404).send({error:'Not found'});}});
 app.delete(`/api/${kind}/:id`,async(req,reply)=>{const index=state[key].findIndex(v=>v.id===req.params.id);if(index<0)return reply.code(404).send({error:'Not found'});const item=state[key].splice(index,1)[0];const ext=item.mime==='image/jpeg'?'.jpg':item.mime==='image/png'?'.png':item.mime==='image/webp'?'.webp':item.mime==='video/mp4'?'.mp4':'.webm';await unlink(join(dir,item.id+ext)).catch(()=>{});if(kind==='avatars'&&state.settings.selectedAvatarId===item.id)state.settings.selectedAvatarId='';await save();return {ok:true};});
}
await app.register(staticPlugin,{root:join(root,'public'),prefix:'/'});
app.get('/',async(req,reply)=>reply.sendFile('index.html'));
if(process.env.NODE_ENV!=='test') await app.listen({port:Number(process.env.PORT)||3000,host:process.env.HOST||(process.env.RAILWAY_PROJECT_ID||process.env.RAILWAY_ENVIRONMENT_ID?'::':'127.0.0.1')});
export default app;
