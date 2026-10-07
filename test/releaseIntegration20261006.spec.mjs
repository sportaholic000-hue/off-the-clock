import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceSessionStore} from '../server/src/voice/voicePersistence.js';
import {createBillingVoiceUsage} from '../server/src/billingVoiceUsage.js';
import {completeVoiceCall} from '../server/src/callSummaryService.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {harness,ACCOUNT,TO} from './voiceLifecycle20261006Fixture.mjs';

// Prewritten integration oracles: ceil(61 seconds / 60) = 2 minutes;
// fallback capture and restart remain zero billable minutes; summaries never
// reopen calls or invent facts. Anonymous callers never share customer history.
function setup(t){
  const f=fixture(t),context=f.context();let now=Date.parse(at);
  const clock=()=>new Date(now),store=createVoiceSessionStore({database:f.db,clock});
  const meter=createBillingVoiceUsage({database:f.db,clock});
  meter.start(context,context.callSid);
  const row=()=>f.db.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(context.ownerId,context.callSid);
  const metadata=()=>completeVoiceCall({database:f.db,ownerId:context.ownerId,callId:context.callSid,callSid:context.callSid,
    outcome:{status:'completed',reason:'TWILIO_STOP'},streamSid:null,duration:61,at:clock().toISOString(),preserveLifecycle:true});
  const receipt={AccountSid:context.accountSid,CallSid:context.callSid,From:context.from,To:context.to,Direction:'inbound',CallStatus:'completed',CallDuration:'61'};
  return {...f,context,store,meter,row,metadata,receipt,advance:()=>{now+=61000;}};
}
test('release: lifecycle capture, summary and metering all survive normal completion',t=>{
  const h=setup(t),words='[SYNTHETIC] Please repair the gate';
  h.db.prepare('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND callSid=?').run(JSON.stringify([{role:'user',text:words,final:true}]),h.context.ownerId,h.context.callSid);
  h.advance();h.store.finishCall({context:h.context,status:'COMPLETED',reason:'TWILIO_STOP',duration:61,finalizeMetadata:h.metadata});
  assert.equal(h.meter.finish(h.context,h.context.callSid),2);
  assert.equal(h.row().status,'COMPLETED');assert.equal(h.row().summaryText,'Caller: '+words);
  assert.equal(h.row().outcome,'LEAD');assert.equal(h.row().transportOutcome,'TWILIO_STOP');
  assert.equal(h.lead(h.context).length,1);assert.equal(h.meter.providerComplete(h.receipt),2);
});
test('release: summary persistence failure rolls back lifecycle and recovery lead together',t=>{
  const h=setup(t);h.db.exec("CREATE TRIGGER synthetic_summary_fail BEFORE UPDATE OF summaryText ON calls BEGIN SELECT RAISE(ABORT,'synthetic'); END");
  assert.throws(()=>h.store.finishCall({context:h.context,status:'FAILED',reason:'GEMINI_SESSION_CLOSED',finalizeMetadata:h.metadata}));
  assert.equal(h.row().status,'CONNECTED');assert.equal(h.lead(h.context).length,0);
  h.db.exec('DROP TRIGGER synthetic_summary_fail');
  h.store.finishCall({context:h.context,status:'FAILED',reason:'GEMINI_SESSION_CLOSED',finalizeMetadata:h.metadata});
  assert.equal(h.row().status,'FAILED');assert.equal(h.lead(h.context).length,1);
});
for(const operation of ['capture','restart'])test('release: fallback '+operation+' stays excluded after summary and signed duration receipt',t=>{
  const h=setup(t);h.advance();h.store.recordFallback({context:h.context,reason:'VOICE_SESSION_UNAVAILABLE'});
  h.metadata();assert.equal(h.row().status,'FALLBACK');assert.equal(h.meter.finish(h.context,h.context.callSid),0);
  h.store.appendFallbackText({context:h.context,text:'[SYNTHETIC] Keep these fallback words'});
  if(operation==='capture')h.store.finishCall({context:h.context,status:'COMPLETED',reason:'FALLBACK_REQUEST_CAPTURED',finalizeMetadata:h.metadata});
  else {h.store.recoverActiveCalls();h.metadata();}
  assert.equal(h.row().outcome,'AI_FALLBACK');assert.equal(h.meter.providerComplete(h.receipt),0);
  assert.equal(h.row().minutesBilled,0);assert.match(h.lead(h.context)[0].collectedInputsJson,/Keep these fallback words/);
});
test('release: summary enrichment cannot complete a transferring call',t=>{
  const h=setup(t);h.db.prepare("UPDATE calls SET status='TRANSFERRING' WHERE ownerId=? AND callSid=?").run(h.context.ownerId,h.context.callSid);
  h.store.finishCall({context:h.context,status:'COMPLETED',reason:'TWILIO_STOP',finalizeMetadata:h.metadata});
  assert.equal(h.row().status,'TRANSFERRING');assert.equal(h.row().completedAt,null);
});
test('release: accepted warm transfer keeps its confirmed outcome after media summary',async t=>{
  const h=await harness(t),call=await h.connect();
  await h.tool(call.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] Transfer request'});
  const twiml=h.writes.find(write=>write[0]==='call')[2].twiml;
  const accept=new URL(twiml.match(/<Number url="([^"]+)"/)[1]).pathname;
  const child={AccountSid:ACCOUNT,ParentCallSid:call.params.CallSid,CallSid:'CA'+'d'.repeat(32),From:TO,To:'+19025550199',Direction:'outbound-dial',Digits:'1'};
  assert.equal(await (await h.post(accept,child)).text(),'<Response/>');
  await h.runtime.close();
  const row=h.db.prepare('SELECT status,outcome,failureCode FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,call.params.CallSid);
  assert.equal(row.status,'COMPLETED');assert.equal(row.outcome,'TRANSFERRED');assert.equal(row.failureCode,null);
});
test('release: canonical customer lookup preserves isolated anonymous capture',async t=>{
  const h=fixture(t),ids=[];
  for(let i=0;i<2;i++){
    const context={...h.context(),from:'anonymous'};
    h.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND callSid=?').run(context.from,context.ownerId,context.callSid);
    const voice=h.voice(context);await voice.tool('captureLead',{notes:'[SYNTHETIC] private request '+i});
    ids.push(JSON.parse(h.lead(context)[0].collectedInputsJson).customerId);
    assert.equal((await voice.tool('getCustomerContext',{})).status,'not_found');
  }
  assert.equal(new Set(ids).size,2);
});
test('merged tenant binding accepts an anonymous caller and rejects changed caller, owner or destination',t=>{
  const h=setup(t),context={...h.context,from:'anonymous'};
  h.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND callSid=?').run(context.from,context.ownerId,context.callSid);
  assert.equal(h.store.validateIncomingCall({call:context}),true);
  assert.equal(h.store.validateCallBinding({context}),true);
  for(const patch of [{from:'+19025550999'},{to:'+19025550999'}])assert.equal(h.store.validateIncomingCall({call:{...context,...patch}}),false);
  for(const patch of [{from:'+19025550999'},{to:'+19025550999'},{ownerId:'SYNTHETIC-other-owner'}])assert.equal(h.store.validateCallBinding({context:{...context,...patch}}),false);
});
test('release: named contact and owner-only deadlines coexist once in prompt authority',()=>{
  const prompt=compileVoiceSystemInstruction({guideText:readFileSync(new URL('../specs/voice_quote_flows.md',import.meta.url),'utf8'),
    business:{businessName:'Synthetic Business',agentName:'Assistant'},services:[],
    knowledge:{reviewContact:{name:'Alex',role:'manager'},policies:'Callbacks within one business day.'}});
  assert.equal(prompt.split('Callback or quote deadline:').length-1,1);
  assert.match(prompt,/only if the owner explicitly set/);assert.match(prompt,/knowledge\.reviewContact/);
  assert.doesNotMatch(prompt,/\[owner\] means that businessName/);
});
