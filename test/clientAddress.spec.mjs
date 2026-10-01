import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import express from 'express';
import Database from 'better-sqlite3';
import {configureClientAddress,normalizeIp} from '../server/src/clientAddress.js';
import {createAuthRateLimiter,installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {installLiveDemoRoutes} from '../server/src/demo/liveDemo.js';

const ORIGIN='https://www.offtheclockai.com';
async function harness(t,mode='railway') {
  const db=new Database(':memory:');installAuthLimitSchema(db);
  const limit=createAuthRateLimiter(db,{secret:'SYNTHETIC_PROXY_LIMIT_KEY_DO_NOT_USE'});
  const app=express();configureClientAddress(app,{mode});let mints=0,visitor='203.0.113.7';
  app.post('/limit',(req,res)=>res.status(limit.take('proxy-proof',req.ip,2)?200:429).json({ip:req.ip}));
  installLiveDemoRoutes(app,{db,env:{DEMO_ENABLED:'true',GEMINI_API_KEY:'SYNTHETIC_PROVIDER_KEY',DEMO_IP_SALT:'SYNTHETIC_SALT',DEMO_ALLOWED_ORIGINS:ORIGIN,DEMO_MAX_CONCURRENT:'50'},
    fetchImpl:async()=>({ok:true,json:async()=>({name:'auth_tokens/synthetic-'+(++mints)})})});
  const server=app.listen(0);await once(server,'listening');
  const edge=http.createServer((req,res)=>{
    // Simulate Railway's protected edge header and variable XFF internal hops.
    // Attacker-supplied X-Real-IP and XFF are replaced at this boundary.
    const headers={...req.headers,'x-real-ip':visitor,'x-forwarded-for':visitor+', 10.10.0.1, 10.10.0.2'};
    const upstream=http.request({hostname:'127.0.0.1',port:server.address().port,path:req.url,method:req.method,headers},reply=>{
      res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
    });
    upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
  });edge.listen(0);await once(edge,'listening');
  t.after(async()=>{await Promise.all([new Promise(resolve=>{edge.close(resolve);edge.closeAllConnections();}),new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})]);db.close();});
  const post=(route,spoof={})=>fetch('http://127.0.0.1:'+edge.address().port+route,{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json',...spoof},body:JSON.stringify({agent:'miles'})});
  return {post,visitor:value=>{visitor=value;},mints:()=>mints};
}
test('a simulated Railway edge gives auth and demo separate visitor allowances; spoofed headers cannot reset either',async t=>{
  const h=await harness(t);
  for(const forged of ['198.51.100.1','198.51.100.2']) {
    const headers={'x-forwarded-for':forged+', 9.9.9.9','x-real-ip':forged,forwarded:'for='+forged};
    const auth=await h.post('/limit',headers);assert.equal(auth.status,200);assert.equal((await auth.json()).ip,'203.0.113.7');
    assert.equal((await h.post('/api/demo/session',headers)).status,200);
  }
  const forged={'x-forwarded-for':'1.1.1.1, 2.2.2.2','x-real-ip':'3.3.3.3'};
  assert.equal((await h.post('/limit',forged)).status,429);
  const demo=await h.post('/api/demo/session',forged);assert.equal(demo.status,429);assert.equal((await demo.json()).error,'hourly');assert.equal(h.mints(),2);
  h.visitor('203.0.113.8');
  assert.equal((await h.post('/limit',forged)).status,200);
  assert.equal((await h.post('/api/demo/session',forged)).status,200);
});
test('direct mode ignores both forwarded address headers',async t=>{
  const h=await harness(t,'none');
  for(const visitor of ['203.0.113.1','203.0.113.2']) {
    h.visitor(visitor);assert.equal((await h.post('/limit')).status,200);assert.equal((await h.post('/api/demo/session')).status,200);
  }
  h.visitor('203.0.113.3');assert.equal((await h.post('/limit')).status,429);assert.equal((await h.post('/api/demo/session')).status,429);
});
test('missing or malformed edge identity falls back to one peer allowance rather than trusting XFF',async t=>{
  const h=await harness(t);
  for(const visitor of ['invalid','203.0.113.1, 203.0.113.2']) {
    h.visitor(visitor);assert.equal((await h.post('/limit',{'x-forwarded-for':'8.8.8.8'})).status,200);
  }
  h.visitor('');assert.equal((await h.post('/limit',{'x-forwarded-for':'9.9.9.9'})).status,429);
});
test('equivalent IPv6 and IPv4-mapped addresses cannot create extra identities',()=>{
  assert.equal(normalizeIp('2001:0DB8:0:0:0:0:0:1'),normalizeIp('2001:db8::1'));
  assert.equal(normalizeIp('::ffff:c000:201'),'192.0.2.1');
  assert.equal(normalizeIp('::ffff:192.0.2.1'),'192.0.2.1');
  for(const value of ['1.2.3.4:80','a','1.1.1.1, 2.2.2.2','fe80::1%eth0',null])assert.equal(normalizeIp(value),null);
});
