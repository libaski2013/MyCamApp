import {readFile,writeFile,rename,mkdir,open} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function registerSiteContent(app,{data,admin,defaults}){
 const dir=join(data,'site-media'),path=join(data,'site-content.json');await mkdir(dir,{recursive:true});
 let content;try{content=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;content=structuredClone(defaults)}
 let queue=Promise.resolve();
 async function persist(next){queue=queue.catch(()=>{}).then(async()=>{await writeFile(path+'.tmp',JSON.stringify(next),{mode:0o600});await rename(path+'.tmp',path);content=next});await queue}
 app.addHook('preHandler',async(req,reply)=>{if(!req.url.startsWith('/api/site/'))return;reply.header('Cache-Control','no-store');if(req.method!=='GET'&&req.method!=='HEAD'){if(!admin(req))return reply.code(401).send({error:'Admin login required.'});if(req.headers.origin){const expected=process.env.APP_ORIGIN?new URL(process.env.APP_ORIGIN).origin:null;const origin=new URL(req.headers.origin);if(expected?origin.origin!==expected:origin.host!==req.headers.host)return reply.code(403).send({error:'Request origin is not allowed.'})}}});
 app.get('/api/site/content',async()=>content);
 app.put('/api/site/content',{bodyLimit:128*1024},async(req,reply)=>{
  const b=req.body;
  if(!b||!Array.isArray(b.texts)||b.texts.length!==defaults.texts.length||!Array.isArray(b.packages)||b.packages.length!==3||!b.videos)return reply.code(400).send({error:'Invalid site settings.'});
  const texts=[];for(const f of defaults.texts){const v=b.texts.find(x=>x.id===f.id);if(!v||typeof v.value!=='string'||v.value.length>4000)return reply.code(400).send({error:'Invalid text: '+f.label});texts.push({...f,value:v.value})}
  const packages=[];for(const original of defaults.packages){const p=b.packages.find(x=>x.id===original.id);if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||!Number.isInteger(p.minutes)||p.minutes<1||p.minutes>10000||!Number.isFinite(p.usd)||p.usd<0.01||p.usd>100000)return reply.code(400).send({error:'Each package needs a name, whole minutes and a positive USD price.'});packages.push({id:p.id,name:p.name.trim(),minutes:p.minutes,usd:Math.round(p.usd*100)/100})}
  const videos={};for(const slot of Object.keys(defaults.videos)){const v=b.videos[slot];if(typeof v!=='string'||!(v===''||v==='/media/mycam-intro.mp4'||/^\/api\/site\/media\/[a-f0-9-]{36}\.(mp4|webm)$/.test(v)))return reply.code(400).send({error:'Upload a video using this editor.'});videos[slot]=v}
  await persist({texts,packages,videos});return {ok:true};
 });
 app.post('/api/site/videos',async(req,reply)=>{
  const part=await req.file();if(!part)return reply.code(400).send({error:'Choose an MP4 or WebM video.'});
  const ext={'video/mp4':'.mp4','video/webm':'.webm'}[part.mimetype];if(!ext){part.file.resume();return reply.code(415).send({error:'Only MP4 and WebM videos are supported.'})}
  const bytes=await part.toBuffer();if(part.file.truncated)return reply.code(413).send({error:'Video must be under 100 MB.'});
  const valid=ext==='.mp4'?bytes.toString('ascii',4,8)==='ftyp':bytes.subarray(0,4).equals(Buffer.from('1a45dfa3','hex'));
  if(!valid)return reply.code(415).send({error:'This file is not a valid MP4 or WebM video.'});
  const file=randomUUID()+ext;await writeFile(join(dir,file),bytes,{flag:'wx'});return {url:'/api/site/media/'+file};
 });
 app.get('/api/site/media/:file',async(req,reply)=>{const name=req.params.file;if(!/^[a-f0-9-]{36}\.(mp4|webm)$/.test(name))return reply.code(404).send();let file;try{file=await open(join(dir,name),'r')}catch{return reply.code(404).send()}
  const size=(await file.stat()).size;reply.header('Content-Type',name.endsWith('.mp4')?'video/mp4':'video/webm').header('Accept-Ranges','bytes').header('Cache-Control','public,max-age=86400').header('X-Content-Type-Options','nosniff');
  if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);let start,end;if(match){start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));end=match[1]&&match[2]?Number(match[2]):size-1}if(!match||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){await file.close();return reply.code(416).header('Content-Range','bytes */'+size).send()}end=Math.min(end,size-1);reply.code(206).header('Content-Range',`bytes ${start}-${end}/${size}`).header('Content-Length',end-start+1);return reply.send(file.createReadStream({start,end}))}
  reply.header('Content-Length',size);return reply.send(file.createReadStream());
 });
 app.get('/admin',async(req,reply)=>reply.sendFile('site-admin.html'));
 return {get:()=>content};
}
