import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
const [root,evidence,mode='after']=process.argv.slice(2),app=await startApplication(root,evidence,{port:4595,calendarFixture:true});
const db=new Database(path.join(evidence,'application.sqlite')),rows=[];
const provider=()=>JSON.parse(fs.readFileSync(path.join(evidence,'synthetic-calendar-provider.json'),'utf8'));
async function callback(state,extra=''){
 const url='/api/onboarding/calendar/google/callback?state='+encodeURIComponent(state)+'&code=SYNTHETIC-CODE'+extra;
 const r=await fetch(app.base+url,{redirect:'manual'}),text=await r.text();let body;try{body=JSON.parse(text);}catch{body=text;}
 const result={url,status:r.status,body,location:r.headers.get('location')};rows.push(result);return result;
}
try{
 const owner=await app.owner('calendar-oauth'),other=await app.owner('calendar-other');
 const start=await app.request('GET','/api/onboarding/calendar/google/start',undefined,owner.token);assert.equal(start.status,200);
 const state=new URL(start.result.authorizationUrl).searchParams.get('state');
 const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='calendarOAuthStates'").get();
 const first=await callback(state,'&ownerId='+other.id),second=await callback(state);
 const count=provider().calls.filter(x=>x.url==='https://oauth2.googleapis.com/token').length;
 assert.equal(first.status,302,JSON.stringify(first));
 if(mode==='before'){
  assert.equal(table,undefined);assert.equal(second.status,302);assert.equal(count,2);
  rows.push({defect:'A successful calendar authorization callback can be replayed and exchanges provider credentials twice',reproduced:true});
 }else{
  assert.ok(table);assert.equal(second.status,403);assert.equal(count,1);
  const digest=crypto.createHash('sha256').update(state).digest('hex'),stored=db.prepare('SELECT * FROM calendarOAuthStates WHERE stateHash=?').get(digest);
  assert.equal(stored.ownerId,owner.id);assert.ok(stored.consumedAt);assert.equal(state.includes('.'),false);
  assert.equal(db.prepare('SELECT count(*) n FROM calendarConnections WHERE ownerId=?').get(other.id).n,0);
  await app.restart();assert.equal((await callback(state)).status,403);assert.equal(provider().calls.length,count);
  const next=await app.request('GET','/api/onboarding/calendar/google/start',undefined,owner.token),expired=new URL(next.result.authorizationUrl).searchParams.get('state');
  db.prepare('UPDATE calendarOAuthStates SET createdAt=?,expiresAt=? WHERE stateHash=?').run(Date.now()-1200000,Date.now()-600000,crypto.createHash('sha256').update(expired).digest('hex'));
  assert.equal((await callback(expired)).status,403);assert.equal((await callback('not-a-state')).status,403);assert.equal(provider().calls.length,count);
  rows.push({check:'one-use state survives restart; expired, malformed and foreign owner are blocked before provider writes',passed:true,stored});
 }
 const records={states:table?db.prepare('SELECT * FROM calendarOAuthStates').all():[],connections:db.prepare('SELECT * FROM calendarConnections').all(),profiles:db.prepare('SELECT ownerId,calendarJson FROM businessProfiles').all()};
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,mode,rows,records,provider:provider(),boundary:'Real application HTTP and SQLite; all provider fetches intercepted and synthetic. No external provider network traffic.'},null,2));console.log(JSON.stringify({passed:true,mode,checks:rows.length}));
}catch(error){fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,mode,rows,error:String(error.stack),provider:provider()},null,2));throw error;}
finally{db.close();await app.stop();}
