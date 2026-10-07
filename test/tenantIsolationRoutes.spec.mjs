import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {routeSourceInventory} from './helpers/tenantRouteInventory.mjs';
import crypto from 'node:crypto';
import twilio from 'twilio';
import Stripe from 'stripe';
import WebSocket from 'ws';
import {startTenantIsolation} from './helpers/tenantIsolationProcess.mjs';
import {ENGINE_VERSION} from '../server/src/quoteDoneBridge.js';
// Explicit reviewed inventory, never generated from the server during the test.
const matrix=JSON.parse(readFileSync(new URL('../verification/tenant-isolation-20261007/routes.json',import.meta.url)));
const reviewedMiddleware=JSON.parse(readFileSync(new URL('../verification/tenant-isolation-20261007/middleware.json',import.meta.url)));
const reviewedSources=JSON.parse(readFileSync(new URL('../verification/tenant-isolation-20261007/route-sources.json',import.meta.url)));
const serverRoot=fileURLToPath(new URL('../server/',import.meta.url));
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const genericId=uuid(999999);
function pathFor(route,tenant,{other=tenant,guess=false}={}) {
  const values={ownerId:other.owner,serviceId:other.service,id:route.includes('sms-status')?other.sms:route.includes('/transfer/')?other.transfer:route.includes('owner-alerts')?other.alert:route.includes('calls')?other.call:route.includes('deliveries')?other.delivery:other.lead,token:tenant.smsToken,draftId:other.draft,callSid:other.callSid,bookingIntentId:other.bookingIntentId,bookingToken:tenant.bookingToken,publicKey:tenant.publicKey,holdId:other.hold,confirmationId:other.confirmationId,nonce:tenant.nonce,kind:'leads'};
  return route.split(' ').slice(1).join(' ').replace(/:([A-Za-z]+)/g,(_,key)=>encodeURIComponent(guess&&!['publicKey','bookingToken','nonce','kind'].includes(key)?genericId:values[key])).replace(/^\*$/,'/dashboard').replace('/assets/*','/assets/tenant-isolation-missing.js');
}
function bodyFor(route,tenant,other=tenant) {
  if(route.includes('/quote/calculate')||route.endsWith('/public/quote/:publicKey'))return {...tenant.quoteBody,serviceId:other.service};
  if(route.endsWith('/prepare'))return {serviceId:other.service,customerInputs:tenant.quoteBody.customerInputs};
  if(route==='PATCH /api/leads/:id')return {status:'DISMISSED'};
  if(route.endsWith('/availability'))return {scopeConfirmation:'UNCHANGED'};
  if(route.endsWith('/holds'))return {slotId:'synthetic-invalid-slot'};
  if(route.endsWith('/confirm'))return {holdId:other.booking,confirmedSlotId:'synthetic-invalid-slot',explicitConfirmation:true,addressConfirmation:true,customer:{name:'[SYNTHETIC] Customer',email:'synthetic@example.invalid',phone:''},location:{addressLine1:'[SYNTHETIC] Address',addressLine2:'',city:'Halifax',region:'NS',postalCode:'B3H 0A1',country:'CA'}};
  if(route.endsWith('/preference'))return {scopeConfirmation:'UNCHANGED',preferredWindows:[{date:new Date(Date.now()+86400000).toISOString().slice(0,10),time:'09:00'}],customer:{name:'[SYNTHETIC] Customer',email:'synthetic@example.invalid',phone:''},location:{addressLine1:'[SYNTHETIC] Address',addressLine2:'',city:'Halifax',region:'NS',postalCode:'B3H 0A1',country:'CA'},note:''};
  if(route.includes('/booking/policies/'))return {bookingMode:'book_job',durationMinutes:60,enabled:true};
  if(route.includes('/services/')&&route.endsWith('/approve'))return {revision:other.bookRevision,confirmConfiguration:true,confirmLegacySettings:true};
  if(route==='POST /api/onboarding/knowledge-base')return {about:'[SYNTHETIC] Attack',hours:'Synthetic hours'};
  if(route==='POST /api/onboarding/voice')return {voiceId:'miles',agentName:'[SYNTHETIC] Agent',greeting:'[SYNTHETIC] Hello'};
  if(route==='POST /api/onboarding/calendar')return {skipped:true};
  if(route==='POST /api/onboarding/account')return {firstName:'[SYNTHETIC] Attack',businessName:'[SYNTHETIC] Attack'};
  if(route==='POST /api/onboarding/business-types')return {businessTypes:['LANDSCAPING_MOWING']};
  if(route==='POST /api/onboarding/phone/provision'||route==='POST /api/dev/preview/telephony')return {existingNumber:other.fallback};
  if(route==='POST /api/operator/toggle'||route==='POST /api/dev/preview/operator')return {enabled:false};
  if(route==='POST /api/quotedone/access')return {allowedOrigins:[tenant.origin]};
  if(route==='POST /api/business/jurisdiction')return {country:'CA',region:'NS'};
  if(route==='POST /api/pricebook/interview')return {serviceTypes:['LANDSCAPING_MOWING'],mode:'browser'};
  return {};
}
function noLeak(response,other,label) {
  const visible=response.text+JSON.stringify(response.headers||{});
  for(const forbidden of [other.owner,other.staff,other.password,other.passwordHash,other.callSid,other.email,'synthetic-'+other.label.toLowerCase()+'-staff@example.invalid','cus_synthetic_'+other.label,'sub_synthetic_'+other.label,'https://synthetic-'+other.label.toLowerCase()+'.example.invalid/hooks',...['owner','staff'].flatMap(role=>[other.auth[role].token,other.auth[role].cookie.split('=').at(-1)]),other.phone,other.fallback,other.publicKey,other.bookingToken,other.service,other.call,other.quote,other.lead,other.draft,other.booking,other.hold,other.delivery,other.confirmationId,other.bookingIntentId,other.transfer,other.sms,other.smsToken,other.smsProvider,'PRIVATE_'+other.label+'_'])assert.ok(!visible.includes(forbidden),label+' leaked '+forbidden+' in '+response.text.slice(0,1200));
}
function refused(response,label) {assert.ok(response.status>=400&&response.status<500,label+' was not refused: '+response.status+' '+response.text.slice(0,1200));}
const sanitized=r=>({status:r.status,text:r.text});
async function signedVoice(f,path,params,signature) {
  return f.request(path,{method:'POST',body:new URLSearchParams(params).toString(),headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature??twilio.getExpectedTwilioSignature(f.env.TWILIO_AUTH_TOKEN,f.origin+path,params)}});
}
async function wsDenied(f,tenant,other,{guessed=false,unsigned=false}={}) {
  const path='/api/twilio/voice/stream/'+(guessed?'x'.repeat(43):tenant.nonce);
  const signature=twilio.getExpectedTwilioSignature(f.env.TWILIO_AUTH_TOKEN,f.origin.replace('https:','wss:')+path,{});
  const ws=new WebSocket('ws://127.0.0.1:'+f.port+path,{headers:{...(unsigned?{}:{'x-twilio-signature':signature}),authorization:'Bearer '+tenant.auth.owner.token}});
  let handshakeHeaders={};
  ws.on('upgrade',response=>{handshakeHeaders=response.headers;});
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{ws.terminate();reject(Error('WS denial timed out'));},5000);
    ws.on('unexpected-response',(_req,res)=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{clearTimeout(timer);resolve({status:res.statusCode,text,headers:res.headers});});});
    ws.on('open',()=>{ // Upgrade alone never establishes call authorization; hostile start must close.
      ws.send(JSON.stringify({event:'start',sequenceNumber:'1',start:{accountSid:f.env.TWILIO_ACCOUNT_SID,callSid:other.callSid,streamSid:'MZ'+'c'.repeat(32),customParameters:{ownerId:other.owner,from:'+19025550000',to:other.phone},mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000,channels:1}}}));
      ws.on('close',(code,reason)=>{clearTimeout(timer);resolve({status:code===1000?200:403,text:reason.toString(),headers:handshakeHeaders});});
      ws.on('message',data=>{clearTimeout(timer);ws.terminate();reject(Error('WS leaked '+data));});
    });
    ws.on('error',error=>{clearTimeout(timer);reject(error);});
  });
}

for(const production of [false,true])test('synthetic full server tenant matrix ('+(production?'production':'development/preview')+')',{timeout:120000},async t=>{
  const f=await startTenantIsolation(t,{production});
  assert.equal(f.engineVersion,ENGINE_VERSION);
  const expected=matrix.filter(({route})=>production?!['GET /api/schema','POST /api/dev/preview/operator','POST /api/dev/preview/telephony'].includes(route):!['GET *','GET /widget.js','GET /widget-app.js','USE /assets/*'].includes(route)).map(row=>row.route).sort();
  const checkCoverage=routes=>assert.deepEqual(routes,expected);
  await t.test('every runtime registered route is covered; new and removed routes fail',()=>{checkCoverage(f.routes);assert.deepEqual(routeSourceInventory(serverRoot),reviewedSources,'Route source changed without explicit matrix review, including disabled feature branches');assert.deepEqual(f.middleware,reviewedMiddleware[production?'production':'preview'],'Global middleware changed without matrix review');});
  const A=f.tenants.A,B=f.tenants.B;
  for(const {route,policy} of matrix.filter(row=>expected.includes(row.route)))await t.test(route+' ['+policy+']',async()=>{
    const method=route.split(' ')[0],httpMethod=method==='USE'?'GET':method;
    const before=await f.rpc('snapshot',{owner:B.owner});
    if(['owner','team','admin'].includes(policy)) {
      if(httpMethod==='GET') {
        const ownRead=await f.request(pathFor(route,A),{token:A.auth.owner.token});
        noLeak(ownRead,B,route+' own read must never include B');
      }
      for(const [source,target] of [[A,B],[B,A]]) for(const role of ['owner','staff']) {
        const path=pathFor(route,source,{other:target});
        const r=await f.request(path+(path.includes('?')?'&':'?')+'ownerId='+target.owner,{method:httpMethod,token:source.auth[role].token,body:['GET','HEAD'].includes(httpMethod)?undefined:{...bodyFor(route,source,target),ownerId:target.owner},headers:{'Idempotency-Key':crypto.randomUUID()}});
        refused(r,route);noLeak(r,target,route);
        for(const selector of ['x-owner-id','x-tenant-id','x-business-id']) {
          const headerAttempt=await f.request(pathFor(route,source),{method:httpMethod,token:source.auth[role].token,body:['GET','HEAD'].includes(httpMethod)?undefined:bodyFor(route,source),headers:{[selector]:target.owner,'Idempotency-Key':crypto.randomUUID()}});
          refused(headerAttempt,route+' forged '+selector);noLeak(headerAttempt,target,route);
        }
        if(!['GET','HEAD'].includes(httpMethod))for(const selector of ['ownerId','tenantOwnerId','businessId']) {
          const bodyAttempt=await f.request(pathFor(route,source),{method:httpMethod,token:source.auth[role].token,body:{...bodyFor(route,source),[selector]:target.owner},headers:{'Idempotency-Key':crypto.randomUUID()}});
          refused(bodyAttempt,route+' forged body '+selector);noLeak(bodyAttempt,target,route);
        }
      }
      for(const role of ['owner','staff']) {
        const unsigned=await f.request(pathFor(route,A),{method:httpMethod,body:['GET','HEAD'].includes(httpMethod)?undefined:bodyFor(route,A)});
        assert.equal(unsigned.status,401,route+' unsigned '+role);
      }
      const staff=await f.request(pathFor(route,A),{method:httpMethod,token:A.auth.staff.token,body:['GET','HEAD'].includes(httpMethod)?undefined:bodyFor(route,A)});
      if(policy==='owner'||policy==='admin')assert.equal(staff.status,403,route+' staff');
      else {assert.notEqual(staff.status,401,route+' staff credential rejected');noLeak(staff,B,route+' own staff response');}
      if(policy==='owner'||policy==='admin') {
        const staffB=await f.request(pathFor(route,B),{method:httpMethod,token:B.auth.staff.token,body:['GET','HEAD'].includes(httpMethod)?undefined:bodyFor(route,B)});
        assert.equal(staffB.status,403,route+' B staff');
      }
      if(/:(?:id|draftId|callSid|ownerId|serviceId|bookingIntentId)\b/.test(route)) for(const role of ['owner','staff']) {
        const real=await f.request(pathFor(route,A,{other:B}),{method:httpMethod,token:A.auth[role].token,body:['GET','HEAD'].includes(httpMethod)?undefined:bodyFor(route,A,B),headers:{'Idempotency-Key':crypto.randomUUID()}});
        const guessed=await f.request(pathFor(route,A,{other:B,guess:true}),{method:httpMethod,token:A.auth[role].token,body:['GET','HEAD'].includes(httpMethod)?undefined:bodyFor(route,A,B),headers:{'Idempotency-Key':crypto.randomUUID()}});
        refused(real,route+' foreign ID');refused(guessed,route+' sequential guessed ID');noLeak(real,B,route);
        assert.deepEqual(sanitized(real),sanitized(guessed),route+' distinguishes a foreign ID from an absent ID');
      }
    }else if(policy==='widget') {
      for(const [source,target] of [[A,B],[B,A]]) {
        const path=pathFor(route,source)+'?ownerId='+target.owner;
        const r=await f.request(path,{method:httpMethod,token:source.auth.owner.token,body:httpMethod==='GET'?undefined:{...bodyFor(route,source,target),ownerId:target.owner},headers:{origin:source.origin}});refused(r,route);noLeak(r,target,route);
        const otherOrigin=await f.request(pathFor(route,source),{method:httpMethod,body:httpMethod==='GET'?undefined:bodyFor(route,source,target),headers:{origin:target.origin}});assert.equal(otherOrigin.status,403,route+' foreign widget origin');noLeak(otherOrigin,target,route);
        const guessed=await f.request(pathFor(route,source).replace(source.publicKey,'synthetic-guessed-key'),{method:httpMethod,body:httpMethod==='GET'?undefined:bodyFor(route,source,target),headers:{origin:source.origin}});assert.equal(guessed.status,404,route+' guessed public key');
        if(httpMethod==='POST') {
          const foreignService=await f.request(pathFor(route,source),{method:httpMethod,body:bodyFor(route,source,target),headers:{origin:source.origin}});
          const unknownService=await f.request(pathFor(route,source),{method:httpMethod,body:{...bodyFor(route,source,target),serviceId:genericId},headers:{origin:source.origin}});
          assert.equal(foreignService.status,404);assert.deepEqual(sanitized(foreignService),sanitized(unknownService));noLeak(foreignService,target,route);
        }
      }
    }else if(policy==='booking-capability') {
      const own=pathFor(route,A,{other:B});
      const cross=await f.request(own+'?ownerId='+B.owner,{method:httpMethod,body:httpMethod==='GET'?undefined:{...bodyFor(route,A,B),ownerId:B.owner},headers:{origin:A.origin,'Idempotency-Key':crypto.randomUUID()}});refused(cross,route);noLeak(cross,B,route);
      const wrongOrigin=await f.request(pathFor(route,B),{method:httpMethod,body:httpMethod==='GET'?undefined:bodyFor(route,A,B),headers:{origin:A.origin}});assert.equal(wrongOrigin.status,403,route+' other booking token');noLeak(wrongOrigin,B,route);
      const guess=await f.request(own.replace(A.bookingToken,'x'.repeat(43)),{method:httpMethod,body:httpMethod==='GET'?undefined:bodyFor(route,A,B),headers:{origin:A.origin}});assert.equal(guess.status,404,route+' guessed booking token');
      const wrongRecord=await f.request(own,{method:httpMethod,body:httpMethod==='GET'?undefined:bodyFor(route,A,B),headers:{origin:A.origin,'Idempotency-Key':crypto.randomUUID()}});
      // Availability has no foreign resource selector: the own token can read only A.
      if(!route.endsWith('/availability')&&!route.endsWith('/preference'))refused(wrongRecord,route+' foreign record');noLeak(wrongRecord,B,route);
      if(route.includes('/confirmations/')) {
        const absent=await f.request(own.replace(B.confirmationId,'synthetic-unknown-confirmation'),{headers:{origin:A.origin}});
        assert.deepEqual(sanitized(wrongRecord),sanitized(absent),route+' distinguishes B confirmation from an unknown confirmation');
      }
    }else if(policy==='stripe') {
      const stripe=new Stripe(f.env.STRIPE_SECRET_KEY);
      for(const [customer,subscription] of [[A,B],[B,A]]) {
        const event={id:'evt_synthetic_'+crypto.randomBytes(6).toString('hex'),type:'customer.subscription.updated',created:Math.floor(Date.now()/1000),data:{object:{id:'sub_synthetic_'+(subscription===B?'B':'A'),customer:'cus_synthetic_'+(customer===A?'A':'B'),status:'active',items:{data:[{price:{id:'price_synthetic_Q_month'}}]},metadata:{ownerId:subscription.owner,phoneNumber:subscription.phone}}}};
        const payload=JSON.stringify(event),signature=stripe.webhooks.generateTestHeaderString({payload,secret:f.env.STRIPE_WEBHOOK_SECRET});
        const r=await f.request('/api/stripe/webhook',{method:'POST',body:payload,headers:{'content-type':'application/json','Stripe-Signature':signature,authorization:'Bearer '+A.auth.owner.token}});
        assert.equal(r.status,500,route+' signed cross-account IDs');noLeak(r,B,route);assert.deepEqual(JSON.parse(r.text),{error:'Webhook processing failed.'});
      }
      const bad=await f.request('/api/stripe/webhook',{method:'POST',body:{},headers:{'Stripe-Signature':'invalid'}});assert.equal(bad.status,400);
    }else if(policy==='voice') {
      if(method==='WS') {for(const args of [{},{guessed:true},{unsigned:true}]){const r=await wsDenied(f,A,B,args);refused(r,route);noLeak(r,B,route);}}
      else {
        const path=pathFor(route,A),params={AccountSid:f.env.TWILIO_ACCOUNT_SID,CallSid:A.callSid,From:'+19025550000',To:B.phone,Direction:'inbound',CallStatus:'completed',CallDuration:'61',ParentCallSid:B.callSid,SpeechResult:'SYNTHETIC foreign capture',UnstableSpeechResult:'SYNTHETIC foreign capture'};
        const r=await signedVoice(f,path,params);refused(r,route+' signed A call naming B number');noLeak(r,B,route);
        const bad=await signedVoice(f,path,params,'invalid');assert.equal(bad.status,403,route+' bad signature');
        if(route.includes('/incoming')) {
          const unknown=await signedVoice(f,path,{...params,To:'+19025550999'});refused(unknown,route+' unknown number');noLeak(unknown,B,route);
          assert.deepEqual(sanitized(r),sanitized(unknown),route+' reveals whether the other number exists');
        }
      }
    }else if(policy==='quote-copy') {
      for(const [source,target] of [[A,B],[B,A]]) {
        const routePath=pathFor(route,source,{other:target});
        const r=await f.request(routePath,{token:source.auth.owner.token});assert.equal(r.status,404);noLeak(r,target,route+' foreign capability');
      }
    }else if(policy==='oauth-capability') {
      for(const state of [genericId,'x'.repeat(43)]) {
        const r=await f.request(pathFor(route,A)+'?code=SYNTHETIC&state='+state+'&ownerId='+B.owner,{token:A.auth.owner.token});refused(r,route);noLeak(r,B,route);
      }
    }else if(policy==='auth') {
      const path=pathFor(route,A);
      let body={email:B.email,password:A.password,ownerId:B.owner,token:genericId};
      if(route.includes('register'))body={email:B.email,password:A.password,firstName:'[SYNTHETIC] Attacker',businessName:'[SYNTHETIC] Attacker',plan:'Operator'};
      const r=await f.request(path+(method==='GET'?'?token='+genericId:''),{method:httpMethod,token:route==='POST /api/auth/logout'?'invalid-synthetic-access':A.auth.owner.token,body:method==='GET'?undefined:body,headers:{origin:f.origin,cookie:B.auth.owner.cookie}});
      if(!['POST /api/auth/forgot-password','POST /api/auth/resend-verification','POST /api/auth/logout','POST /api/auth/register'].includes(route))refused(r,route);noLeak(r,B,route);
      if(route==='POST /api/auth/register') {
        assert.deepEqual(sanitized(r),{status:202,text:JSON.stringify({ok:true})});
        const fresh={...body,email:'synthetic-new-'+crypto.randomUUID()+'@example.invalid'};
        const unknown=await f.request(path,{method:httpMethod,body:fresh,headers:{origin:f.origin}});
        assert.deepEqual(sanitized(r),sanitized(unknown),route+' reveals whether B email exists');
        assert.equal(r.headers['set-cookie'],undefined);assert.equal(unknown.headers['set-cookie'],undefined);
        const login=await f.request('/api/auth/login',{method:'POST',body:{email:fresh.email,password:fresh.password},headers:{origin:f.origin}});
        assert.equal(login.status,401);assert.deepEqual(JSON.parse(login.text),{error:'Invalid credentials'});
      }
      // Public recovery is deliberately generic; it changes neither B's password nor tenant data.
    }else {
      const path=pathFor(route,A)+'?ownerId='+B.owner;
      const r=await f.request(path,{method:httpMethod,token:A.auth.owner.token,body:['GET','OPTIONS'].includes(httpMethod)?undefined:{agent:'miles',ownerId:B.owner},headers:{origin:f.origin}});
      assert.ok(!r.text.includes('PRIVATE_B_'),route+' platform response leaked tenant data');
      if(route==='POST /api/demo/session')assert.equal(r.status,400,route+' arbitrary tenant data');
    }
    const after=await f.rpc('snapshot',{owner:B.owner});
    if(['POST /api/auth/forgot-password','POST /api/auth/resend-verification'].includes(route)) {
      // Only the intended email-link receipt may change. Passwords, sessions,
      // billing and every business table still have to remain byte-identical.
      delete before.rows.authTokens;delete after.rows.authTokens;
    }
    assert.deepEqual(after,before,route+' changed B');
  });
  await t.test('own reads work; counts do not include newly added B rows',async()=>{
    const ownRows=(await f.rpc('snapshot',{owner:A.owner})).rows;
    for(const role of ['owner','staff']) {
      const first=await f.request('/api/dashboard',{token:A.auth[role].token});assert.equal(first.status,200);const old=JSON.parse(first.text);assert.equal(old.callActivity.counts.calls,ownRows.calls.length);assert.equal(old.quoteRequestCount,ownRows.quoteRequests.length);
      await f.rpc('add-b-call');const second=await f.request('/api/dashboard',{token:A.auth[role].token});assert.equal(second.status,200);assert.equal(JSON.parse(second.text).callActivity.counts.calls,old.callActivity.counts.calls);assert.equal(JSON.parse(second.text).quoteRequestCount,old.quoteRequestCount);
    }
    for(const tenant of [A,B]) {
      const own=await f.request('/api/pricebook/'+tenant.owner,{token:tenant.auth.owner.token});assert.equal(own.status,200);assert.ok(own.text.includes(tenant.service));
      const catalog=await f.request('/api/public/quote/'+tenant.publicKey,{headers:{origin:tenant.origin}});assert.equal(catalog.status,200);assert.ok(catalog.text.includes(tenant.service));
      const confirmation=await f.request('/api/public/bookings/'+tenant.bookingToken+'/confirmations/'+tenant.confirmationId,{headers:{origin:tenant.origin}});assert.equal(confirmation.status,200);assert.ok(confirmation.text.includes(tenant.booking));
      const hooks=await f.request('/api/integrations/webhook',{token:tenant.auth.owner.token});assert.equal(hooks.status,200);assert.ok(hooks.text.includes(tenant.delivery));
      const rows=(await f.rpc('snapshot',{owner:tenant.owner})).rows;assert.ok(rows.bookingHolds.some(row=>row.id===tenant.hold));assert.ok(rows.webhookDeliveries.some(row=>row.id===tenant.delivery));
    }
  });
  await t.test('merged billing reads and exports remain tenant-scoped; only admin can read backup status',async()=>{
    for(const tenant of [A,B]) {
      const other=tenant===A?B:A;
      const state=await f.request('/api/billing/lifecycle',{token:tenant.auth.owner.token});assert.equal(state.status,200);noLeak(state,other,'own lifecycle');
      for(const kind of ['leads','quotes','calls']) {
        const own=await f.request('/api/billing/export/'+kind,{token:tenant.auth.owner.token});assert.equal(own.status,200);noLeak(own,other,'own '+kind+' export');
        const forged=await f.request('/api/billing/export/'+kind+'?ownerId='+other.owner,{token:tenant.auth.owner.token});assert.equal(forged.status,403);
      }
      assert.equal((await f.request('/api/admin/backups/offsite',{token:tenant.auth.owner.token})).status,403);
    }
    const login=await f.request('/api/admin/login',{method:'POST',body:{email:'synthetic-admin@example.invalid',password:'SYNTHETIC-admin-password'}});assert.equal(login.status,200);
    const status=await f.request('/api/admin/backups/offsite',{token:JSON.parse(login.text).token});assert.equal(status.status,503);assert.equal(JSON.parse(status.text).state,'NOT_CONFIGURED');assert.equal(status.headers['cache-control'],'no-store');
  });
  await t.test('attacks never reached an external provider',async()=>{const result=await f.rpc('network');assert.equal(result.blockedNetwork,0);assert.deepEqual(result.providerCalls,[]);});
  await t.test('coverage guard fails for an added route and an anonymously mounted router',async()=>{
    const added=await f.rpc('register-probe-route');assert.throws(()=>checkCoverage(added),{code:'ERR_ASSERTION'});
    const nested=await f.rpc('register-probe-router');assert.ok(nested.includes('POST /new'));assert.throws(()=>checkCoverage(nested),{code:'ERR_ASSERTION'});
    const probe=path.join(f.directory,'route-source-probe');mkdirSync(probe);assert.deepEqual(routeSourceInventory(probe),[]);
    writeFileSync(path.join(probe,'disabledRoute.js'),"if (process.env.SYNTHETIC_UNCONFIGURED_FEATURE === 'true') app.get('/api/synthetic-hidden-route', handler);\n");
    assert.equal(routeSourceInventory(probe)[0].file,'disabledRoute.js');assert.throws(()=>assert.deepEqual(routeSourceInventory(probe),[]),{code:'ERR_ASSERTION'});
  });
});
