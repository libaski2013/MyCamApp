import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerSiteContent} from '../site-content.js';
import {registerCustomerPortal} from '../customer-portal.js';
test('site editing requires admin, validates input, persists prices and serves video ranges',async()=>{
 const data=await mkdtemp(join(tmpdir(),'mycam-site-'));
 const defaults=JSON.parse(await readFile(new URL('../site-defaults.json',import.meta.url),'utf8'));
 const build=async()=>{const app=Fastify();await app.register(multipart,{limits:{fileSize:100*1024*1024}});const admin=req=>req.headers['x-studio-key']==='test-admin';const site=await registerSiteContent(app,{data,admin,defaults});await registerCustomerPortal(app,{data,admin,catalogProvider:()=>site.get().packages});return app};
 let app=await build();try{
 const headers={'x-studio-key':'test-admin'};
 const original=(await app.inject('/api/site/content')).json();assert.equal(original.packages[0].ghs,175.65);
 assert.equal((await app.inject({method:'PUT',url:'/api/site/content',payload:original})).statusCode,401);
 assert.equal((await app.inject({method:'PUT',url:'/api/site/content',headers:{...headers,origin:'https://evil.test'},payload:original})).statusCode,403);
 const edited=structuredClone(original);edited.packages[0].ghs=12.5;edited.packages[0].minutes=7;edited.texts[0].value='New heading <script> is plain text';
 assert.equal((await app.inject({method:'PUT',url:'/api/site/content',headers,payload:edited})).statusCode,200);
 assert.equal((await app.inject('/api/customer/catalog')).json().packages[0].ghs,12.5);
 assert.equal((await app.inject('/api/customer/catalog')).json().checkoutEnabled,false);
 const invalid=structuredClone(edited);invalid.videos.hero='https://evil.test/x.mp4';assert.equal((await app.inject({method:'PUT',url:'/api/site/content',headers,payload:invalid})).statusCode,400);
 const boundary='site-boundary',video=Buffer.from('000000186674797069736f6d00000000','hex');
 const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="intro.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),video,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 assert.equal((await app.inject({method:'POST',url:'/api/site/videos',headers:{'content-type':'multipart/form-data; boundary='+boundary},payload})).statusCode,401);
 const uploaded=await app.inject({method:'POST',url:'/api/site/videos',headers:{...headers,'content-type':'multipart/form-data; boundary='+boundary},payload});assert.equal(uploaded.statusCode,200);
 const range=await app.inject({url:uploaded.json().url,headers:{range:'bytes=4-7'}});assert.equal(range.statusCode,206);assert.equal(range.body,'ftyp');assert.equal(range.headers['content-range'],'bytes 4-7/16');
 assert.equal((await app.inject({url:uploaded.json().url,headers:{range:'bytes=1000-'}})).statusCode,416);
 await app.close();app=await build();assert.equal((await app.inject('/api/site/content')).json().packages[0].ghs,12.5);
 }finally{await app.close();await rm(data,{recursive:true,force:true})}
});
test('legacy USD prices convert to GHS once while preserving edited text',async()=>{
 const data=await mkdtemp(join(tmpdir(),'mycam-currency-'));
 const defaults=JSON.parse(await readFile(new URL('../site-defaults.json',import.meta.url),'utf8'));
 const {writeFile}=await import('node:fs/promises');const legacy=structuredClone(defaults);legacy.texts[0].value='My custom heading';legacy.packages=legacy.packages.map((p,i)=>{const {ghs,...rest}=p;return {...rest,usd:[15,30,90][i]}});delete legacy.currency;await writeFile(join(data,'site-content.json'),JSON.stringify(legacy));
 for(let n=0;n<2;n++){const app=Fastify();try{await registerSiteContent(app,{data,admin:()=>false,defaults});const c=(await app.inject('/api/site/content')).json();assert.equal(c.currency,'GHS');assert.deepEqual(c.packages.map(p=>p.ghs),[175.65,351.3,1053.9]);assert.equal(c.texts[0].value,'My custom heading');assert.equal(c.packages[0].usd,undefined)}finally{await app.close()}}
 await rm(data,{recursive:true,force:true});
});
