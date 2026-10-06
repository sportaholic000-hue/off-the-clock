// Real dashboard hooks, actual local server reads, and synthetic SQLite writes.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import React from 'react';import {createServer} from 'vite';
import {createRequire} from 'node:module';
const rendererPath=process.env.AUDIT_RENDERER_PATH;
if(!rendererPath)throw Error('Set AUDIT_RENDERER_PATH to the scratch-installed react-test-renderer package path.');
const {create,act}=createRequire(import.meta.url)(rendererPath);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-live-dashboard-'));
Object.assign(process.env,{NODE_ENV:'test',PORT:'0',DATABASE_PATH:path.join(temporary,'synthetic.sqlite'),PRICEBOOK_PATH:path.join(temporary,'books'),APP_DATA_DIR:temporary,ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',GEMINI_API_KEY:'',PUBLIC_BASE_URL:'',LOCAL_PREVIEW_MODE:'false',JWT_SECRET:'SYNTHETIC_LIVE_VIEW_KEY_NEVER_LIVE'.padEnd(64,'x')});
const {db,migrate}=await import('../../server/src/db.js');migrate();
const owner='synthetic-live-owner',at=new Date().toISOString();
db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,'live@example.invalid','[SYNTHETIC]','Synthetic','Synthetic repairs','Operator','active','UTC','owner',?)").run(owner,at);
db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(owner,'cus_SYNTHETIC',at,at,at);db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(owner);
db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(owner,at);
function call(id,summary){db.prepare("INSERT INTO calls(id,ownerId,callerNumber,status,outcome,summaryText,transcriptJson,duration,createdAt) VALUES(?,?,'+19025550100','COMPLETED','LEAD',?,'[]',30,?)").run(id,owner,summary,at);}
call('synthetic-first','[SYNTHETIC] FIRST SAVED CALL');
const {createAuthSessionService}=await import('../../server/src/authSessionService.js'),token=createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(owner)).token;
const storage=new Map([['otc_token',token]]);globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
globalThis.window={location:{pathname:'/dashboard'},addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>{}};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {httpServer,lifecycle}=await import('../../server/src/server.js');const base='http://127.0.0.1:'+httpServer.address().port,nativeFetch=globalThis.fetch,requests=[];
globalThis.fetch=(url,options)=>{const route=new URL(String(url),'http://localhost').pathname;requests.push(route);return nativeFetch(base+route,options);};
const vite=await createServer({root:new URL('../../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});let mounted;
try{
 const {default:Dashboard}=await vite.ssrLoadModule('/src/dashboard.jsx');
 await act(async()=>{mounted=create(React.createElement(Dashboard));});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,150));});
 const initial=JSON.stringify(mounted.toJSON()),initialRequests=requests.length;
 call('synthetic-second','[SYNTHETIC] SECOND ARRIVING CALL');
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1000));});
 const after=JSON.stringify(mounted.toJSON()),response=await nativeFetch(base+'/api/calls',{headers:{authorization:'Bearer '+token}}),stored=await response.json();
 const result={id:'E41',expected:'An open dashboard receives a newly persisted call without reload (§5.7/§6.1).',meetsExpectation:after.includes('SECOND ARRIVING CALL'),actual:{initialFirstVisible:initial.includes('FIRST SAVED CALL'),newCallInBackend:stored.calls.some(call=>call.id==='synthetic-second'),newCallVisibleInMountedDashboard:after.includes('SECOND ARRIVING CALL'),additionalUiFetches:requests.length-initialRequests,initialFetches:requests}};
 fs.writeFileSync(new URL('./live-render-results.json',import.meta.url),JSON.stringify({auditedSha:'73c00622d6f2df31f57773b32e41355a7421f1a3',syntheticOnly:true,experiments:[result]},null,2)+'\n');console.log('E41',result.meetsExpectation?'PASS':'EXPECTATION MISMATCH');
}finally{if(mounted)await act(async()=>mounted.unmount());globalThis.fetch=nativeFetch;await vite.close();await lifecycle.shutdown({timeoutMs:3000,exit:()=>{}});fs.rmSync(temporary,{recursive:true,force:true});}
