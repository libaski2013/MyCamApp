import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {registerCustomerPortal} from '../customer-portal.js';
test('customer accounts protect passwords, persist login and register package interest without payment',async()=>{
 const data=await mkdtemp(join(tmpdir(),'mycam-customer-')),app=Fastify();await registerCustomerPortal(app,{data,admin:req=>req.headers['x-admin']==='yes'});
 try{
  const password='a-test-password-for-customer';
  assert.equal((await app.inject({method:'POST',url:'/api/customer/signup',payload:{name:'Ali',email:'ali@example.com',password:'short'}})).statusCode,400);
  const created=await app.inject({method:'POST',url:'/api/customer/signup',payload:{name:'Ali',email:'ALI@example.com',password}});assert.equal(created.statusCode,201);assert.equal(created.json().customer.email,'ali@example.com');assert.ok(!created.body.includes(password));
  const cookie=created.headers['set-cookie'].split(';')[0];assert.match(created.headers['set-cookie'],/HttpOnly/);
  const stored=await readFile(join(data,'customers.json'),'utf8');assert.ok(!stored.includes(password));assert.ok(!stored.includes(cookie.split('=')[1]));
  const me=(await app.inject({url:'/api/customer/me',headers:{cookie}})).json();assert.equal(me.customer.name,'Ali');assert.equal(me.customer.studioEnabled,false);
  assert.equal((await app.inject('/api/customer/admin')).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/customer/reservations',payload:{packageId:'starter'}})).statusCode,401);
  for(let i=0;i<2;i++)assert.equal((await app.inject({method:'POST',url:'/api/customer/reservations',headers:{cookie},payload:{packageId:'starter'}})).statusCode,200);
  assert.equal((await app.inject({url:'/api/customer/me',headers:{cookie}})).json().requests.length,1);
  assert.equal((await app.inject('/api/customer/catalog')).json().checkoutEnabled,false);
  assert.equal((await app.inject({url:'/studio',headers:{cookie}})).statusCode,302);
  assert.equal((await app.inject({method:'POST',url:'/api/customer/login',payload:{email:'ali@example.com',password:'wrong'}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/customer/login',payload:{email:'ali@example.com',password}})).statusCode,200);
  await app.inject({method:'POST',url:'/api/customer/logout',headers:{cookie},payload:{}});
  assert.equal((await app.inject({url:'/api/customer/me',headers:{cookie}})).json().customer,null);
 }finally{await app.close();await rm(data,{recursive:true,force:true})}
});
