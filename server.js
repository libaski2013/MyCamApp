import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
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
