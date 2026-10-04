import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export async function registerCustomerPortal(app,{data,admin,catalogProvider}){
 const path=join(data,'customers.json');let store;try{store=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;store={users:[],sessions:[],requests:[]}}
 let queue=Promise.resolve();const save=()=>{const snapshot=JSON.stringify(store);queue=queue.catch(()=>{}).then(async()=>{await writeFile(path+'.tmp',snapshot,{mode:0o600});await rename(path+'.tmp',path)});return queue};
 const hash=t=>createHash('sha256').update(t).digest('hex');
 const flags='; Path=/; HttpOnly; SameSite=Lax'+(process.env.APP_ORIGIN?.startsWith('https:')||process.env.RAILWAY_PROJECT_ID?'; Secure':'');
 function user(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mycam_customer='))?.slice(15);const session=token&&store.sessions.find(s=>s.token===hash(token)&&s.expires>Date.now());return session&&store.users.find(u=>u.id===session.userId)}
 function publicUser(u){return {id:u.id,name:u.name,email:u.email,createdAt:u.createdAt,minutes:0,status:'registered',studioEnabled:false}}
 const catalog=[{id:'starter',minutes:5,ghs:175.65},{id:'creator',minutes:10,ghs:351.30},{id:'extended',minutes:30,ghs:1053.90}];
 const attempts=new Map();let registrations=0;
 app.addHook('preHandler',async(req,reply)=>{
  if(!req.url.startsWith('/api/customer/'))return;reply.header('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&process.env.APP_ORIGIN&&req.headers.origin!==new URL(process.env.APP_ORIGIN).origin)return reply.code(403).send({error:'Request origin is not allowed.'});
  if(req.url.endsWith('/signup')||req.url.endsWith('/login')){const current=Date.now();for(const [k,v] of attempts)if(v.until<current)attempts.delete(k);const key=req.ip,record=attempts.get(key)||{count:0,until:current+600000};record.count++;attempts.set(key,record);if(record.count>10)return reply.code(429).send({error:'Too many attempts. Please wait ten minutes.'})}
 });
 app.get('/api/customer/catalog',async()=>({packages:catalogProvider?catalogProvider():catalog,currency:'GHS',estimated:true,checkoutEnabled:false,message:'Registration is open. Paid sessions are not on sale yet; no payment will be collected.'}));
 app.get('/api/customer/me',async req=>{const u=user(req);return {customer:u?publicUser(u):null,requests:u?store.requests.filter(r=>r.userId===u.id).map(r=>({id:r.id,packageId:r.packageId,createdAt:r.createdAt,status:r.status})):[]}});
 async function signIn(u,reply){store.sessions=store.sessions.filter(s=>s.expires>Date.now());const token=randomBytes(32).toString('base64url');store.sessions.push({token:hash(token),userId:u.id,expires:Date.now()+7*86400000});await save();reply.header('Set-Cookie','mycam_customer='+token+'; Max-Age=604800'+flags);return {customer:publicUser(u)}}
 app.post('/api/customer/signup',{bodyLimit:8192},async(req,reply)=>{
  const name=String(req.body?.name||'').trim().slice(0,80),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(!name||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>128)return reply.code(400).send({error:'Enter your name, valid email and a password of 12–128 characters.'});
  if(registrations>=4)return reply.code(429).send({error:'Registration is busy. Please retry shortly.'});registrations++;
  try{const salt=randomBytes(16).toString('hex'),passwordHash=(await scrypt(password,salt,64)).toString('hex');if(store.users.some(u=>u.email===email))return reply.code(409).send({error:'This email is already registered. Sign in instead.'});
   const u={id:randomUUID(),name,email,salt,passwordHash,createdAt:new Date().toISOString()};store.users.push(u);return reply.code(201).send(await signIn(u,reply));
  }finally{registrations--}
 });
 app.post('/api/customer/login',{bodyLimit:8192},async(req,reply)=>{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');if(password.length>128)return reply.code(401).send({error:'Email or password is incorrect.'});const u=store.users.find(u=>u.email===email),salt=u?.salt||'dummy-salt-for-login';const candidate=await scrypt(password,salt,64);if(!u||!timingSafeEqual(candidate,Buffer.from(u.passwordHash,'hex')))return reply.code(401).send({error:'Email or password is incorrect.'});return signIn(u,reply)});
 app.post('/api/customer/logout',async(req,reply)=>{const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mycam_customer='))?.slice(15);if(token){store.sessions=store.sessions.filter(s=>s.token!==hash(token));await save()}reply.header('Set-Cookie','mycam_customer=; Max-Age=0'+flags);return {ok:true}});
 app.post('/api/customer/reservations',async(req,reply)=>{const u=user(req);if(!u)return reply.code(401).send({error:'Sign in first.'});if(!catalog.some(p=>p.id===req.body?.packageId))return reply.code(400).send({error:'Choose a valid package.'});if(store.requests.some(r=>r.userId===u.id&&r.packageId===req.body.packageId&&r.status==='requested'))return {message:'Your interest in this package is already registered. No payment has been collected.'};store.requests.push({id:randomUUID(),userId:u.id,packageId:req.body.packageId,status:'requested',createdAt:new Date().toISOString()});await save();return {message:'Package interest registered. No payment has been collected; the price is an estimate.'}});
 app.get('/api/customer/admin',async(req,reply)=>{if(!admin(req))return reply.code(401).send({error:'Admin sign-in required.'});return {customers:store.users.map(publicUser),requests:store.requests}});
 app.get('/home',async(req,reply)=>reply.sendFile('home.html'));
 app.get('/portal',async(req,reply)=>reply.sendFile('portal.html'));
 app.get('/studio',async(req,reply)=>admin(req)?reply.sendFile('index.html'):reply.redirect('/portal?studio=1'));
}
