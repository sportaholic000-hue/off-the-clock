import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';
for(const plan of ['Starter','Operator','QuoteDone'])test(`Starter lineup: ${plan} real phone boundary offers only entitled tools`,async t=>{
 let configuration;const f=await harness(t,{beforeInstall:({db})=>db.prepare('UPDATE users SET plan=? WHERE id=?').run(plan,'synthetic-a'),onConnect:input=>{configuration=input;}});
 const call=await f.connect();const text=JSON.stringify(configuration.config||configuration);
 const declarations=configuration.config.tools.flatMap(t=>t.functionDeclarations||[]).map(t=>t.name);
 assert.equal(declarations.includes('bookAppointment'),plan!=='Starter');assert.equal(declarations.includes('transferCall'),plan!=='Starter');assert.equal(declarations.includes('getQuote'),plan==='QuoteDone');
 if(plan==='Starter'){
  assert.match(text,/Do not offer to book or transfer/);assert.doesNotMatch(text,/Want me to book you in|want.*get you on the schedule|BOOKING CLOSE/);
  const lead=await f.tool(call.callback,'captureLead',{description:'[SYNTHETIC] Please book an appointment and transfer me',inquiryNumber:1});assert.equal(lead.status,'captured_address_required');
  assert.equal(f.writes.length,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM appointments').get().n,0);
 }
 // A plan change in a running session must be enforced before cached tool dispatch.
 f.db.prepare("UPDATE users SET plan='Starter' WHERE id=?").run(f.owner);
 for(const name of ['bookAppointment','transferCall','getQuote'].filter(name=>declarations.includes(name))){const result=await f.tool(call.callback,name,{});assert.equal(result.status,'needs_details');}
 assert.equal(f.writes.length,0);
 if(plan==='Starter'){call.callback.onmessage({toolCall:{functionCalls:[{id:'unavailable',name:'bookAppointment',args:{}}]}});await until(()=>f.errors.length>0||call.ws.readyState===3);assert.equal(f.writes.length,0);}
});
test('Starter lineup: pending warm transfer cannot connect after downgrade to Starter',async t=>{
 const f=await harness(t),call=await f.connect();await f.tool(call.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Please transfer my request'});
 const update=f.writes.find(w=>w[0]==='call')[2].twiml,accept=new URL(update.match(/<Number url="([^"]+)"/)[1]).pathname;
 f.db.prepare("UPDATE users SET plan='Starter' WHERE id=?").run(f.owner);
 const body={AccountSid:call.params.AccountSid,ParentCallSid:call.params.CallSid,CallSid:'CA'+'d'.repeat(32),From:call.params.To,To:'+19025550199',Direction:'outbound-dial',Digits:'1'};
 assert.equal(await (await f.post(accept,body)).text(),'<Response><Hangup/></Response>');
 assert.notEqual(f.db.prepare('SELECT outcome FROM calls WHERE ownerId=? AND callSid=?').get(f.owner,call.params.CallSid).outcome,'TRANSFER_CONNECTED');
});
