import test from 'node:test';
import assert from 'node:assert/strict';
import {api,refreshSession,logout,getToken,getSessionKey,setToken} from '../client/src/api.js';
import {billingStorageKey} from '../client/src/billingTransport.js';
const memory=new Map(),events=[];
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
globalThis.window={dispatchEvent:event=>events.push(event.type)};
const token=(sub='a',sid='A'.repeat(43),expired=false,version=0)=>'synthetic.'+Buffer.from(JSON.stringify({sub,role:'owner',sid,exp:Math.floor(Date.now()/1000)+(expired?-60:900),version})).toString('base64url')+'.signature';
const response=(status,payload)=>({ok:status>=200&&status<300,status,json:async()=>payload});
function setup(){memory.clear();events.length=0;setToken(token());}
test('parallel requests share one refresh and retain exact mutation bodies/idempotency keys',async()=>{
  setup();const old=token('a','A'.repeat(43),true),fresh=token('a','A'.repeat(43),false,1);setToken(old);
  let requests=[],finish;
  globalThis.fetch=async(url,options)=>{requests.push({url,options});if(url==='/api/auth/refresh')return new Promise(resolve=>{finish=()=>resolve(response(200,{token:fresh}));});return response(200,{ok:true});};
  const pending=[api('/api/billing/checkout',{method:'POST',body:{plan:'QuoteDone',billingInterval:'monthly'},idempotencyKey:'SYNTHETIC-EXACT-RETRY'}),api('/api/auth/account')];
  await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.filter(x=>x.url==='/api/auth/refresh').length,1);finish();
  await Promise.all(pending);
  const checkout=requests.find(x=>x.url==='/api/billing/checkout');
  assert.equal(checkout.options.headers['Idempotency-Key'],'SYNTHETIC-EXACT-RETRY');
  assert.equal(checkout.options.body,JSON.stringify({plan:'QuoteDone',billingInterval:'monthly'}));
  assert.equal(checkout.options.headers.authorization,'Bearer '+fresh);assert.equal(getToken(),fresh);
});
test('one protected 401 retries after refresh; a provider 403 never triggers refresh',async()=>{
  setup();let requests=[],protectedCalls=0;const fresh=token('a','A'.repeat(43),false,2);
  globalThis.fetch=async(url)=>{requests.push(url);return url==='/api/auth/refresh'?response(200,{token:fresh}):response(++protectedCalls===1?401:200,{ok:true});};
  assert.deepEqual(await api('/api/private'),{ok:true});assert.equal(requests.filter(x=>x==='/api/auth/refresh').length,1);
  globalThis.fetch=async url=>{requests.push(url);return response(403,{error:'Forbidden'});};
  await assert.rejects(api('/api/private'),e=>e.status===403);
  assert.equal(requests.filter(x=>x==='/api/auth/refresh').length,1);
});
test('an in-flight refresh cannot replace a newly signed-in account or clear it after failure',async()=>{
  setup();let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
  const pending=refreshSession();setToken(token('b','B'.repeat(43)));
  finish(response(401,{error:'Invalid',code:'SESSION_INVALID'}));
  await assert.rejects(pending,e=>e.code==='SESSION_CHANGED');assert.equal(getSessionKey(),getSessionKey(token('b','B'.repeat(43))));
});
test('invalid session clears browser access, but a temporary refresh outage preserves it',async()=>{
  setup();const original=getToken();globalThis.fetch=async()=>response(503,{error:'Unavailable',code:'SESSION_STORE_UNAVAILABLE'});
  await assert.rejects(refreshSession(),e=>e.status===503);assert.equal(getToken(),original);
  globalThis.fetch=async()=>response(401,{error:'Please sign in again.',code:'SESSION_INVALID'});
  await assert.rejects(refreshSession(),e=>e.status===401);assert.equal(getToken(),null);assert.ok(events.includes('otc:session'));
});
test('a cross-tab rotation conflict retries with the current cookie without clearing the winning session',async()=>{
  setup();let count=0;const fresh=token('a','A'.repeat(43),false,3);
  globalThis.fetch=async()=>++count===1?response(409,{code:'SESSION_REFRESH_CONFLICT'}):response(200,{token:fresh});
  assert.equal(await refreshSession(),fresh);assert.equal(count,2);assert.equal(getToken(),fresh);
});
test('logout clears local access only after server acknowledgement, and preserves it on failure',async()=>{
  setup();let captured;globalThis.fetch=async(url,options)=>{captured={url,options};return response(503,{error:'Unavailable'});};
  await assert.rejects(logout(),e=>e.status===503);assert.ok(getToken());
  globalThis.fetch=async(url,options)=>{captured={url,options};return response(200,{ok:true});};
  await logout();assert.equal(getToken(),null);assert.equal(captured.url,'/api/auth/logout');assert.equal(captured.options.credentials,'include');
});
test('an old logout response cannot clear the new account credentials',async()=>{
  setup();let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
  const pending=logout();setToken(token('b','B'.repeat(43)));finish(response(200,{ok:true}));
  await pending;assert.equal(getSessionKey(),getSessionKey(token('b','B'.repeat(43))));
});
test('session/billing storage identity remains stable through access rotation and isolated between accounts and sign-ins',async()=>{
  setup();const a=token(),rotated=token('a','A'.repeat(43),false,4),nextSignIn=token('a','C'.repeat(43));
  assert.equal(getSessionKey(a),getSessionKey(rotated));assert.equal(await billingStorageKey(a),await billingStorageKey(rotated));
  assert.notEqual(await billingStorageKey(a),await billingStorageKey(nextSignIn));
  assert.notEqual(await billingStorageKey(a),await billingStorageKey(token('b','B'.repeat(43))));
});
test('public quote requests omit cookies and never refresh the owner session',async()=>{
  setup();let captured;globalThis.fetch=async(url,options)=>{captured={url,options};return response(401,{error:'Public quote unavailable'});};
  await assert.rejects(api('/api/public/quote/test',{auth:false}),e=>e.status===401);
  assert.equal(captured.options.credentials,'omit');assert.equal(captured.options.headers.authorization,undefined);assert.ok(getToken());
});
test('login waits for the tab refresh to finish before issuing a new cookie',async()=>{
  setup();let finish,requests=[];const fresh=token('a','A'.repeat(43),false,5);
  globalThis.fetch=async url=>{requests.push(url);return url==='/api/auth/refresh'?new Promise(resolve=>{finish=()=>resolve(response(200,{token:fresh}));}):response(200,{token:token('b','B'.repeat(43))});};
  const renewal=refreshSession(),login=api('/api/auth/login',{method:'POST',auth:false,body:{email:'b@example.invalid',password:'synthetic-password'}});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(requests,['/api/auth/refresh']);finish();await Promise.all([renewal,login]);
  assert.deepEqual(requests,['/api/auth/refresh','/api/auth/login']);
});
