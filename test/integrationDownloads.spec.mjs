import test from 'node:test';
import assert from 'node:assert/strict';
import {api,setToken,getToken} from '../client/src/api.js';
import {downloadOwnerCsv} from '../client/src/integrationDownloads.js';
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
globalThis.window={dispatchEvent:()=>{}};
const token=(owner='a',expired=false,revision=0)=>'synthetic.'+Buffer.from(JSON.stringify({
  sub:owner,role:'owner',sid:owner.repeat(43),exp:Math.floor(Date.now()/1000)+(expired?-60:900),revision
})).toString('base64url')+'.signature';
const json=(status,payload)=>({ok:status>=200&&status<300,status,json:async()=>payload});
test('CSV blob request retains the current owner session and refreshes before download',async()=>{
  storage.clear();setToken(token('a',true));const fresh=token('a',false,1),blob=new Blob(['"synthetic.csv"']);const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return url==='/api/auth/refresh'
    ?json(200,{token:fresh}):{ok:true,status:200,blob:async()=>blob};};
  assert.equal(await api('/api/exports/leads',{format:'blob'}),blob);
  assert.equal(calls.length,2);assert.equal(calls[1].options.headers.authorization,'Bearer '+fresh);assert.equal(getToken(),fresh);
});
test('a CSV arriving after account switch cannot be downloaded into the new session',async()=>{
  storage.clear();setToken(token());let finish;globalThis.fetch=async()=>({ok:true,status:200,blob:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=api('/api/exports/leads',{format:'blob'});await new Promise(resolve=>setImmediate(resolve));
  const other=token('b');setToken(other);finish(new Blob(['owner a private rows']));
  await assert.rejects(pending,{code:'SESSION_CHANGED'});assert.equal(getToken(),other);
});
test('CSV errors still use protected JSON error/refresh handling, never an error file download',async()=>{
  storage.clear();setToken(token());let count=0;
  globalThis.fetch=async url=>url==='/api/auth/refresh'?json(200,{token:token('a',false,2)})
    :++count===1?json(401,{code:'SESSION_ACCESS_EXPIRED'}):json(403,{error:'Forbidden'});
  await assert.rejects(api('/api/exports/leads',{format:'blob'}),{status:403});assert.equal(count,2);
  await assert.rejects(downloadOwnerCsv('../../users'),/Export not found/);
});
