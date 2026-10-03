import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.NODE_ENV='test';process.env.DATA_DIR=await mkdtemp(join(tmpdir(),'mycam-test-'));
process.env.DECART_API_KEY='test-server-secret';process.env.STUDIO_ACCESS_KEY='test-studio-key-with-32-characters';
process.env.APP_ORIGIN='https://mycamapp-production.up.railway.app';
const {default:app}=await import('../server.js');
test('live transformation protects permanent credentials and scopes browser tokens',async()=>{
  const capability=await app.inject('/api/transform/capabilities');assert.equal(capability.json().enabled,true);assert.ok(!capability.body.includes('test-server-secret'));
  const denied=await app.inject({method:'POST',url:'/api/transform/token'});assert.equal(denied.statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/studio/session',headers:{'x-studio-key':'wrong'}})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/studio/session',headers:{'x-studio-key':process.env.STUDIO_ACCESS_KEY}});
  assert.equal(login.statusCode,200);const cookie=login.headers['set-cookie'].split(';')[0];
  assert.match(login.headers['set-cookie'],/HttpOnly/);assert.match(login.headers['set-cookie'],/Secure/);assert.ok(!cookie.includes(process.env.STUDIO_ACCESS_KEY));
  assert.equal((await app.inject({url:'/api/studio/session',headers:{cookie}})).json().authenticated,true);
  assert.equal((await app.inject({url:'/api/studio/session',headers:{cookie:cookie+'bad'}})).json().authenticated,false);
  assert.match((await app.inject({method:'DELETE',url:'/api/studio/session'})).headers['set-cookie'],/Max-Age=0/);
  const oldFetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async(url,options)=>{requests++;assert.ok(String(url).endsWith('/v1/client/tokens'));const settings=JSON.parse(options.body);assert.deepEqual(settings.allowedModels,['lucy-2.5']);assert.equal(settings.constraints.realtime.maxSessionDuration,300);assert.deepEqual(settings.allowedOrigins,[process.env.APP_ORIGIN]);return new Response(JSON.stringify({apiKey:'temporary-browser-token',expiresAt:'2030-01-01T00:00:00Z'}),{status:200})};
  try{
    const request={method:'POST',url:'/api/transform/token',headers:{cookie}};
    for(let i=0;i<5;i++){const response=await app.inject(request);assert.equal(response.statusCode,200);assert.equal(response.json().apiKey,'temporary-browser-token');assert.ok(!response.body.includes(process.env.DECART_API_KEY));assert.equal(response.headers['cache-control'],'no-store')}
    assert.equal((await app.inject(request)).statusCode,429);assert.equal(requests,5);
  }finally{globalThis.fetch=oldFetch;await app.close();await rm(process.env.DATA_DIR,{recursive:true,force:true})}
});
