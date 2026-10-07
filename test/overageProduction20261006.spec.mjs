import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {fixture,A,B} from './overageMinute20261006Fixture.mjs';
import {monthlyAnniversary} from '../server/src/billingUsagePolicy.js';
import {productionEnv} from './helpers/railwayEnv.mjs';

test('production dashboard returns persisted $0.35 owner usage, isolates tenants and hides billing from staff', {timeout:60000},async t=>{
  const volume=mkdtempSync(join(tmpdir(),'SYNTHETIC-overage-production-'));t.after(()=>rmSync(volume,{recursive:true,force:true}));
  const h=fixture(null,{filename:join(volume,'off-the-clock.sqlite')});const now=Math.floor(Date.now()/1000)*1000,start=new Date(now-2*86400000).toISOString();h.setTime(now);
  for(const owner of [A,B])h.activate(owner,{start,end:monthlyAnniversary(start,1),trial_end:Math.floor(Date.parse(start)/1000),trial_start:Math.floor(Date.parse(start)/1000)-14*86400});
  h.call(301*60,{at:start});h.db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,role,createdAt) VALUES('SYNTHETIC-staff',?,'staff@example.invalid','SYNTHETIC','Synthetic','Synthetic','staff',?)").run(A,start);h.close();
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const env={...process.env,...productionEnv(volume),PORT:String(port),DATABASE_PATH:'',PRICEBOOK_PATH:'',RAILWAY_ENVIRONMENT_ID:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_CALENDAR_REDIRECT_URI:'',ADMIN_EMAIL:'',ADMIN_PASSWORD_HASH:'',LOCAL_PREVIEW_MODE:'false',EMAIL_PROVIDER:'console'};
  delete env.NODE_TEST_CONTEXT;delete env.DEMO_TRUSTED_PROXY_HOPS;
  const child=fork('test/helpers/overageProductionFixture.mjs',[],{env,execArgv:[],stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill('SIGKILL');await ended;}});
  const ready=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('exit',()=>reject(Error(output)));setTimeout(()=>reject(Error('Synthetic production startup timed out: '+output)),20000).unref();});
  const read=async id=>{const response=await fetch('http://127.0.0.1:'+ready.port+'/api/dashboard',{headers:{authorization:'Bearer '+ready.tokens[id]}});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;};
  const a=await read(A),b=await read(B),staff=await read('SYNTHETIC-staff');assert.equal(a.minuteUsage.minutesUsed,301);assert.equal(a.minuteUsage.overageCents,35);assert.equal(a.minuteUsage.warnings.length,3);assert.equal(b.minuteUsage.minutesUsed,0);assert.equal(b.minuteUsage.overageCents,0);assert.equal(staff.minuteUsage,null);assert.equal(a.previewActivity,null);
  const ended=once(child,'exit');child.kill('SIGTERM');const [code]=await ended;assert.equal(code,0,output);
});
