import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import {fixture} from './helpers/usageFixture.mjs';
import {createAuthSessionService} from '../server/src/authSessionService.js';
import {requireAuth} from '../server/src/authMiddleware.js';
import {installUsageRoutes} from '../server/src/usageRoutes.js';

test('real owner HTTP routes select only the authenticated tenant; anonymous, staff and ingestion requests are denied',async t=>{
  const f=fixture();t.after(()=>f.database.close());f.owner('A');f.owner('B','QuoteDone');
  f.capture('A');f.capture('B',{plan:'QuoteDone'});f.report('A-call',60001);f.report('B-call',180000,{ownerId:'B'});
  f.database.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,role,createdAt) VALUES('staff','A','staff@fixture.invalid','unused','f','f','staff',?)").run(new Date(f.clock()).toISOString());
  const environment={NODE_ENV:'test',JWT_SECRET:'synthetic-usage-route-fixture-secret'};
  const sessions=createAuthSessionService(f.database,{environment,clock:()=>new Date(f.clock())});
  const token=id=>sessions.create(f.database.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
  const app=express();
  installUsageRoutes(app,{service:f.service,requireAuth:roles=>requireAuth(roles,{database:f.database,sessionService:sessions,
    verifyToken:(value,_secret,options)=>jwt.verify(value,environment.JWT_SECRET,{...options,clockTimestamp:Math.floor(f.clock()/1000)})})});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url='http://127.0.0.1:'+server.address().port;
  for(const [id,minutes,calls] of [['A',2,['A-call']],['B',3,['B-call']]]) {
    const headers={authorization:'Bearer '+token(id),'x-owner-id':id==='A'?'B':'A'};
    const response=await fetch(url+'/api/usage?ownerId='+(id==='A'?'B':'A'),{headers});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const usage=await response.json();assert.equal(usage.minutesUsed,minutes);
    const history=await (await fetch(url+'/api/usage/calls',{headers})).json();
    assert.deepEqual(history.calls.map(call=>call.callId),calls);
    assert.doesNotMatch(JSON.stringify({usage,history}),/passwordHash|stripeCustomerId|stripeSubscriptionId|paymentMethod|secret|sk_test/);
  }
  assert.equal((await fetch(url+'/api/usage')).status,401);
  assert.equal((await fetch(url+'/api/usage',{headers:{authorization:'Bearer '+token('staff')}})).status,403);
  assert.equal((await fetch(url+'/api/usage/calls',{headers:{authorization:'Bearer '+token('staff')}})).status,403);
  assert.equal((await fetch(url+'/api/usage',{method:'POST',headers:{authorization:'Bearer '+token('A')}})).status,404);
});

