import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fixture,at} from '../../test/leadCaptureRepair20261006Fixture.mjs';
import {createVoiceSmsService} from '../../server/src/voiceSmsService.js';
// EXPECTED.md predates this execution: concurrent processes plus restart must
// result in one provider message, one attempt and durable SENT state.
const directory=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-sms-process-')),cleanups=[],filename=path.join(directory,'synthetic.sqlite');
const f=fixture({after:fn=>cleanups.push(fn)},filename),c=f.context();let sends=0;
const server=createServer(async(req,res)=>{
  try{let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);assert.equal(input.to,c.from);assert.equal(input.ownerId,c.ownerId);assert.equal(input.eventId,'SYNTHETIC-process-sms');sends++;
    await new Promise(resolve=>setTimeout(resolve,100));res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'SENT',id:'SM'+'8'.repeat(32)}));
  }catch{res.statusCode=500;res.end('{}');}
});
try{
  const lead=await f.voice(c).tool('captureLead',{notes:'[SYNTHETIC] Process/restart follow-up'});
  createVoiceSmsService({database:f.db,ownerQuery:f.ownerQuery,clock:()=>Date.parse(at)}).enqueue({ownerId:c.ownerId,id:'SYNTHETIC-process-sms',callSid:c.callSid,recordType:'lead',recordId:f.lead(c)[0].id,
    request:{accountSid:c.accountSid,from:c.to,to:c.from,template:'callback',body:'[SYNTHETIC] Saved inquiry; callback not confirmed. Reply STOP to opt out.'}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const endpoint='http://127.0.0.1:'+server.address().port;
  async function worker(){const child=spawn(process.execPath,[new URL('../../test/ownerAlertsDelivery20261006ProcessWorker.mjs',import.meta.url).pathname,filename,endpoint,String(Date.parse(at))],{stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);const [code]=await once(child,'exit');assert.equal(code,0,error);return JSON.parse(output);}
  const concurrent=await Promise.all([worker(),worker()]),restart=await worker();
  const row=f.db.prepare('SELECT status,attemptCount FROM voiceSmsDeliveries WHERE ownerId=? AND id=?').get(c.ownerId,'SYNTHETIC-process-sms');assert.equal(sends,1);assert.deepEqual(row,{status:'SENT',attemptCount:1});assert.equal(restart.processed,0);
  console.log(JSON.stringify({experiment:'two concurrent processes plus a separate restarted process',providerSends:sends,concurrent,restart,stored:row},null,2));
}finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});for(const fn of cleanups.reverse())fn();rmSync(directory,{recursive:true,force:true});}
