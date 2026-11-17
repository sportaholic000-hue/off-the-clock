import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,env,FROM,until} from './voiceLifecycle20261006Fixture.mjs';
import {at} from './leadCaptureRepair20261006Fixture.mjs';

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
const limits={...env,VOICE_MAX_CONCURRENT:'100',VOICE_CALLER_DAILY_LIMIT:'6',VOICE_BREAKER_FAILURE_THRESHOLD:'3',VOICE_BREAKER_WINDOW_SECONDS:'60',VOICE_BREAKER_COOLDOWN_SECONDS:'30'};
const sid=n=>'CA'+n.toString(16).padStart(32,'0');
// +2562533, +8656696 and +464 are too short to be a caller number and are refused
// by the incoming route before admission (unchanged), so they never reach the limit.
const WITHHELD=['+266696687','+7378742833','+86282452253'];
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
  const h=await harness(t,{install:{env:limits},beforeInstall:f=>{for(const phone of [...WITHHELD,'anonymous'])history(f,phone);}});
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
