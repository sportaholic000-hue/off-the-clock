import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {quoteEmailFixture} from './quoteEmailFixture.mjs';
import {createQuoteEmailProvider} from '../server/src/quoteEmailProvider.js';
import {installQuoteEmailRoutes} from '../server/src/quoteEmailRoutes.js';
const env={ALLOW_PROVIDER_WRITES:'true',EMAIL_DELIVERY_ENABLED:'true',EMAIL_PROVIDER:'resend',RESEND_API_KEY:'SYNTHETIC_NEVER_LIVE',EMAIL_FROM:'quotes@example.invalid'};
const message={from:'"Synthetic Business" <quotes@example.invalid>',to:'caller@example.invalid',replyTo:'owner@example.invalid',subject:'Synthetic quote',text:'[SYNTHETIC] $100 CAD. Only measured work.',idempotencyKey:'quote-email/SYNTHETIC'};
test('Quote provider uses the frozen name, reply-to, content and stable idempotency key',async()=>{
  const calls=[],p=createQuoteEmailProvider({environment:env,fetchClient:async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>({id:'SYNTHETIC-email'})};}});
  assert.deepEqual(await p.send(message),{accepted:true,id:'SYNTHETIC-email'});await p.read('SYNTHETIC-email');
  assert.deepEqual(JSON.parse(calls[0].body),{from:message.from,to:[message.to],reply_to:message.replyTo,subject:message.subject,text:message.text});assert.equal(calls[0].headers['Idempotency-Key'],message.idempotencyKey);assert.equal(calls[1].method,'GET');assert.equal(calls[1].url,'https://api.resend.com/emails/SYNTHETIC-email');
  for(const name of ['ALLOW_PROVIDER_WRITES','EMAIL_DELIVERY_ENABLED','EMAIL_PROVIDER','RESEND_API_KEY','EMAIL_FROM']){
    const disabled=createQuoteEmailProvider({environment:{...env,[name]:''},fetchClient:()=>{throw Error('Unexpected network');}});assert.equal(disabled.ready(),false);await assert.rejects(disabled.send(message));
  }
});
for(const status of [400,401,403,404,422,429,500])test('Quote provider classifies HTTP '+status+' safely',async()=>{
  const p=createQuoteEmailProvider({environment:env,fetchClient:async()=>({ok:false,status})});await assert.rejects(p.send(message),e=>{assert.equal(e.definitive,[400,401,403,404,422].includes(status));return true;});
});
test('Provider acceptance without an ID is never reported delivered',async()=>{
  const p=createQuoteEmailProvider({environment:env,fetchClient:async()=>({ok:true,json:async()=>({})})});await assert.rejects(p.send(message));
});
for(const mismatch of ['id','to','from','subject','none','bounced'])test('Delivery receipt binding and outcome: '+mismatch,async t=>{
  let sent,posts=0;const provider={send:async m=>{sent=m;posts++;return {accepted:true,id:'SYNTHETIC-receipt'};},read:async id=>{
    const r={id,to:[sent.to],from:sent.from,subject:sent.subject,last_event:mismatch==='bounced'?'bounced':'delivered'};
    if(['id','to','from','subject'].includes(mismatch))r[mismatch]=mismatch==='to'?['foreign@example.invalid']:'SYNTHETIC-wrong';return r;
  }};
  const f=quoteEmailFixture(t,{provider});await f.queue();await f.emailService().dispatchOnce();assert.equal(posts,1);
  assert.equal(f.rows()[0].status,mismatch==='none'?'DELIVERED':mismatch==='bounced'?'FAILED':'ACCEPTED');
  for(let i=0;i<10;i++){f.advance(60000);await f.emailService().dispatchOnce();}assert.equal(posts,1);if(!['none','bounced'].includes(mismatch))assert.equal(f.rows()[0].status,'REVIEW');
});
test('Private quote page is tenant scoped, unguessable, expires and escapes all content',async t=>{
  const f=quoteEmailFixture(t);f.db.prepare('UPDATE users SET businessName=? WHERE id=?').run('[SYNTHETIC] <script>alert(1)</script>',f.c.ownerId);
  const saved=await f.queue(),url=new URL(JSON.parse(f.rows()[0].messageJson).text.split('View your saved quote: ')[1]);
  const app=express();installQuoteEmailRoutes(app,{service:f.emailService()});const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));const base='http://127.0.0.1:'+server.address().port;
  const good=await fetch(base+url.pathname);assert.equal(good.status,200);assert.match(good.headers.get('cache-control'),/no-store/);assert.equal(good.headers.get('referrer-policy'),'no-referrer');assert.match(good.headers.get('content-security-policy'),/default-src 'none'/);const html=await good.text();assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|PRIVATE_RATE|caller@example.invalid/);assert.ok(html.includes('Access must be clear.'));
  for(const route of [url.pathname.replace('synthetic-a','synthetic-b'),url.pathname.slice(0,-1)+'!',url.pathname.replace(/[^/]+$/,'a'.repeat(43))]){const bad=await fetch(base+route+'?ownerId=synthetic-a');assert.equal(bad.status,404);assert.doesNotMatch(await bad.text(),/100|Synthetic Repairs|Access must/);}
  f.advance(30*86400000);assert.equal((await fetch(base+url.pathname)).status,404);
});
