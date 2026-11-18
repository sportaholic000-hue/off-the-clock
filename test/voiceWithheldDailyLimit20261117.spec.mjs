import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,env,FROM,until} from './voiceLifecycle20261006Fixture.mjs';
import {at} from './leadCaptureRepair20261006Fixture.mjs';
import {createBillingVoiceUsage} from '../server/src/billingVoiceUsage.js';
import {createOwnerCallService} from '../server/src/ownerCallService.js';
import {customerQuery} from '../server/src/customerIdentityService.js';

// Owner ruling 2026-11-17: callers with a hidden number must not share one
// daily limit. Twilio sends a withheld caller ID as fixed digits (ANONYMOUS
// +266696687, RESTRICTED +7378742833, UNAVAILABLE +86282452253, BLOCKED
// +2562533, UNKNOWN +8656696, EMPTY +464). Like "anonymous" today, they never
// count toward anyone's daily limit. A real number's limit, the blocklist and
// the calls-at-once limits are unchanged.
// HANDWRITTEN EXPECTATIONS, before execution:
// A. Eight different hidden-number callers (+266696687) each finish a real signed
//    HTTP/WebSocket call; every one of them, including the 7th and 8th, is
//    answered by the receptionist (<Stream>), never "You've reached us several times".
// B. With six answered calls already saved from each withheld form, a new call
//    from that form is answered; "anonymous" likewise.
// C. A real number with six answered calls today is still sent to capture with
//    "several times today"; six hidden-number calls do not count toward it.
// D. A blocklisted hidden-number entry still rejects that caller ID (blocklist unchanged).
// E. The calls-at-once limit still counts hidden-number calls.
// G. (2026-11-18) Each of the six withheld forms, with and without "+", is answered
//    through a complete signed call: getCustomerContext says the caller ID is
//    withheld and reveals no history, even though another caller with the same
//    digits saved a request earlier; two such callers stay two separate leads;
//    the backup capture and Twilio's completed-call report work for them; the
//    blocklist still only accepts real international numbers.
const limits={...env,VOICE_MAX_CONCURRENT:'100',VOICE_CALLER_DAILY_LIMIT:'6',VOICE_BREAKER_FAILURE_THRESHOLD:'3',VOICE_BREAKER_WINDOW_SECONDS:'60',VOICE_BREAKER_COOLDOWN_SECONDS:'30'};
const sid=n=>'CA'+n.toString(16).padStart(32,'0');
// Owner ruling 2026-11-18: every withheld form is answered the same way, including
// +2562533, +8656696 and +464, which are too short to be a phone number.
const WITHHELD=['+266696687','+7378742833','+86282452253','+2562533','+8656696','+464'];
const answered=r=>{assert.equal(r.status,200);assert.match(r.xml,/<Stream /);assert.doesNotMatch(r.xml,/several times today/);};
function history(f,phone,count=6){
  for(let i=0;i<count;i++)f.db.prepare("INSERT INTO calls(id,ownerId,callerNumber,status,duration,voiceAnsweredAt,createdAt) VALUES(?,?,?,'COMPLETED',60,?,?)").run('synthetic-history-'+phone+'-'+i,'synthetic-a',phone,at,at);
}

test('A: eight different hidden-number callers each reach the receptionist through the signed routes',async t=>{
  const h=await harness(t,{install:{env:limits}});
  for(let n=1;n<=8;n++){
    const c=await h.connect(n,'+266696687');answered(c);
    await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(n))?.status==='CONNECTED');
    c.ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:c.streamSid,stop:{accountSid:env.TWILIO_ACCOUNT_SID,callSid:sid(n)}}));
    await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(n))?.status==='COMPLETED');c.ws.close();
  }
  assert.equal(h.callbacks.length,8);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM calls WHERE ownerId=? AND failureCode='VOICE_CALLER_THROTTLED'").get(h.owner).n,0);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType='voice.caller_throttled'").get(h.owner).n,0);
});
test('B: every withheld caller ID form and "anonymous" stay answered after six calls today',async t=>{
  // More calls at once than the default five per business; that limit is tested in E.
  const h=await harness(t,{install:{env:{...limits,VOICE_MAX_CONCURRENT_PER_OWNER:'50'}},beforeInstall:f=>{for(const phone of [...WITHHELD,'anonymous'])history(f,phone);}});
  let n=100;for(const from of [...WITHHELD,'anonymous'])answered(await h.incoming(n++,from));
});
test('C: a real number keeps its own six-call limit, and hidden-number calls do not count toward it',async t=>{
  const h=await harness(t,{install:{env:limits},beforeInstall:f=>{history(f,'+266696687');history(f,'+7378742833');history(f,FROM,5);}});
  // Five answered calls today plus twelve hidden-number calls: the sixth call from the real number is answered.
  answered(await h.incoming(1,FROM));
  const r=await h.incoming(2,FROM);assert.doesNotMatch(r.xml,/<Stream /);assert.match(r.xml,/several times today/);
  assert.equal(h.db.prepare('SELECT failureCode FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(2)).failureCode,'VOICE_CALLER_THROTTLED');
  answered(await h.incoming(3,'+266696687'));answered(await h.incoming(4,'+19025550109'));
});
test('D: the blocklist is unchanged, including an owner-blocked hidden-number entry',async t=>{
  const h=await harness(t,{install:{env:limits},beforeInstall:f=>{
    for(const phone of ['+266696687',FROM])f.db.prepare("INSERT INTO callerBlocklist(ownerId,phoneNumber,createdAt) VALUES('synthetic-a',?,?)").run(phone,at);
  }});
  assert.match((await h.incoming(1,'+266696687')).xml,/<Reject /);
  assert.match((await h.incoming(2,FROM)).xml,/<Reject /);
  answered(await h.incoming(3,'+7378742833'));
});
test('E: hidden-number calls still count toward the calls-at-once limit',async t=>{
  const h=await harness(t,{install:{env:{...limits,VOICE_MAX_CONCURRENT:'3'}}});
  for(let n=1;n<=3;n++)answered(await h.incoming(n,'+266696687'));
  assert.doesNotMatch((await h.incoming(4,'+266696687')).xml,/<Stream /);
});
test('F: a real number sent to capture by the daily limit keeps that reason once its message is saved',async t=>{
  const h=await harness(t,{install:{env:limits},beforeInstall:f=>history(f,FROM)});
  const r=await h.incoming(1,FROM);assert.match(r.xml,/several times today/);
  const twiml=await (await h.post('/api/twilio/voice/capture',{...h.params(1,FROM),SpeechResult:'[SYNTHETIC] Please call me back.'})).text();
  assert.match(twiml,/Thank you. The business will follow up./);
  assert.deepEqual({...h.db.prepare('SELECT status,failureCode,outcome,minutesBilled FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(1))},
    {status:'COMPLETED',failureCode:'VOICE_CALLER_THROTTLED',outcome:'AI_FALLBACK',minutesBilled:0});
});

const WITHHELD_ALL=[...WITHHELD,...WITHHELD.map(phone=>phone.slice(1))];
for(const from of WITHHELD_ALL)test('G: withheld caller ID '+from+' is answered with no saved history and stays a separate caller',async t=>{
  const h=await harness(t,{install:{env:limits}});
  const first=await h.connect(1,from);answered(first);
  await h.tool(first.callback,'captureLead',{name:'[SYNTHETIC] First hidden caller',description:'[SYNTHETIC] private deck repair'});
  const second=await h.connect(2,from);answered(second);
  const history=await h.tool(second.callback,'getCustomerContext',{});
  assert.deepEqual(history,{status:'not_found',message:'Caller ID is withheld. Ask for contact details; do not look up anonymous caller history.'});
  assert.equal((await h.tool(second.callback,'getCustomerContext',{callerConfirmedIdentity:true})).status,'not_found');
  await h.tool(second.callback,'captureLead',{name:'[SYNTHETIC] Second hidden caller',description:'[SYNTHETIC] fence quote'});
  assert.equal(h.db.prepare('SELECT COUNT(DISTINCT customerName) n FROM leads WHERE ownerId=?').get(h.owner).n,2);
  // Each call is its own caller: two separate customer records, each with only its own name.
  const customers=h.db.prepare('SELECT id,name FROM customers WHERE ownerId=? ORDER BY name').all(h.owner).map(row=>({...row}));
  assert.equal(customers.length,2);assert.notEqual(customers[0].id,customers[1].id);
  assert.deepEqual(customers.map(row=>row.name),['[SYNTHETIC] First hidden caller','[SYNTHETIC] Second hidden caller']);
  // The backup capture and Twilio's completed-call report accept the same caller ID.
  const twiml=await (await h.post(second.fallback,second.params)).text();assert.match(twiml,/<Gather/);
  assert.match(await (await h.post('/api/twilio/voice/capture',{...second.params,SpeechResult:'[SYNTHETIC] Please call me back.'})).text(),/<Hangup\/>/);
  const meter=createBillingVoiceUsage({database:h.db,clock:()=>new Date(at)});
  assert.equal(meter.providerComplete({...second.params,CallStatus:'completed',CallDuration:'60'},{ownerId:h.owner}),0);
});
test('G: every withheld form keeps answering after six calls today and the blocklist still refuses them',async t=>{
  const h=await harness(t,{install:{env:{...limits,VOICE_MAX_CONCURRENT_PER_OWNER:'50'}},beforeInstall:f=>{for(const phone of WITHHELD_ALL)history(f,phone);}});
  let n=200;for(const from of WITHHELD_ALL)answered(await h.incoming(n++,from));
  const service=createOwnerCallService({ownerQuery:customerQuery(h.db)});
  for(const phoneNumber of ['+2562533','+8656696','+464','2562533'])assert.throws(()=>service.block({ownerId:h.owner,phoneNumber}),/international phone number/);
});
test('G: malformed caller IDs that only contain withheld digits are still refused',async t=>{
  const h=await harness(t,{install:{env:limits}});
  for(const [n,from] of [[1,'x464'],[2,'4 6 4'],[3,'+1464'],[4,'not a phone']])assert.equal((await h.incoming(n,from)).status,400);
});
