import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';
import {customerHistory} from '../server/src/customerHistoryService.js';
import * as identity from '../server/src/customerIdentityService.js';
const identityPhone=(...args)=>{assert.equal(typeof identity.identityPhone,'function','identityPhone is exported');return identity.identityPhone(...args);};

// Website phone numbers typed without "+" are recognised when that person calls.
// Real server, real public quote route, real schema, real customerHistory.
//
// HANDWRITTEN EXPECTATIONS, before execution. Owner A is in Canada (businessProfiles.country 'CA').
// 1. Website requests typed as "(506) 555-1234", "506-555-1234", "15065551234" and "+1 506 555 1234"
//    are stored on the lead as +15065551234 and resolve to ONE customer, +15065551234.
// 2. "555-1234" (7 digits) and "266696687" (Twilio's ANONYMOUS caller ID digits) are stored exactly
//    as typed, create no customer and match no caller.
//    (Each is a request needing review, so its typed format is visible in its description;
//    one more instant estimate is typed as "(506) 555-1234".)
// 3. A caller from +15065551234 gets that customer, the five website requests as open leads,
//    the five as quote requests and the one instant estimate; nothing else.
// 4. A withheld caller (+266696687 or 266696687, also RESTRICTED 7378742833 / +7378742833 and
//    UNAVAILABLE 86282452253) gets no customer, no lead, no quote, no request and no previous call,
//    even though another withheld call and a website request typed 266696687 exist.
// 5. A lead saved before this change with "(506) 555-9876" still matches a caller from +15065559876.
// 6. Owner B never sees owner A's records for the same number. With no country saved, B's own
//    "(506) 555-1234" lead does not match; once B is in Canada it matches B's lead only.
// 7. A business outside Canada/US ('GB') never reads a number typed without "+" as North American.
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
async function setup(t){
  const s=await application(t);
  s.db.prepare("UPDATE users SET plan='QuoteDone' WHERE id='synthetic-a'").run();
  const book=await s.request('/api/pricebook/synthetic-a');assert.equal(book.status,200,JSON.stringify(book));
  const serviceId=randomUUID();
  const saved=await s.request('/api/pricebook/save',{method:'POST',body:{...book.body,
    defaults:{currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(false),peakMonths:[],peakSurchargePercent:0},
    services:[{id:serviceId,serviceType:'CUSTOM',service:'Synthetic visit',source:'MANUAL',active:true,
      feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),
      pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},tiers:[]}]}});
  assert.equal(saved.status,200,JSON.stringify(saved));
  const approved=await s.request('/api/pricebook/services/'+serviceId+'/approve',{method:'POST',body:{revision:saved.body.revision,confirmConfiguration:true}});
  assert.equal(approved.status,200,JSON.stringify(approved));
  // A description that differs from the saved offering makes a request for review (its own label);
  // the saved offering's own name gives an instant estimate.
  const submit=(phone,label)=>s.request('/api/public/quote/synthetic-a',{method:'POST',publicRequest:true,body:{requestId:randomUUID(),serviceId,serviceRequest:label?'[SYNTHETIC] website request typed as '+label:'Synthetic visit',customerInputs:{service:'Synthetic visit',serviceConfirmed:true,unit:'flat'},contact:{email:randomUUID()+'@example.invalid',phone}}});
  return {...s,submit};
}
const NANP=['(506) 555-1234','506-555-1234','15065551234','+1 506 555 1234'];
const NEVER=['555-1234','266696687'];
const history=(s,ownerId,from)=>customerHistory(s.db,{ownerId,from,callSid:'CA'+randomUUID().replace(/-/g,'')},{now:s.clock().getTime()});
const words=h=>({customer:h.customer?.phoneE164??null,leads:h.openLeads.map(l=>l.description).sort(),requests:h.quoteRequests.map(r=>r.description).sort(),quotes:h.recentQuotes.length,previousCall:Boolean(h.previousCall),appointments:h.appointments.length});
const typed=list=>list.map(p=>'[SYNTHETIC] website request typed as '+p).sort();

test('identity rules: North American numbers without "+" only for Canada/US businesses; withheld caller IDs never',()=>{
  for(const country of ['CA','US'])for(const [input,expected] of [
    ['(506) 555-1234','+15065551234'],['506-555-1234','+15065551234'],['5065551234','+15065551234'],['15065551234','+15065551234'],
    ['1 (506) 555-1234','+15065551234'],['+1 506 555 1234','+15065551234'],['+15065551234','+15065551234'],['+44 20 7946 0958','+442079460958'],
    ['555-1234',null],['25065551234',null],['(106) 555-1234',null],['(506) 155-1234',null],['(911) 555-1234',null],['(506) 911-1234',null],['506 555 1234 ext 2',null],
    ['266696687',null],['+266696687',null],['7378742833',null],['+7378742833',null],['737-874-2833',null],['86282452253',null],['+86282452253',null],['2562533',null],['8656696',null],['464',null],
    ['anonymous',null],['',null],[null,null],[5065551234,null]
  ])assert.equal(identityPhone(input,country),expected,`${country} ${JSON.stringify(input)}`);
  for(const country of [null,'','GB','FR','ca'])for(const input of ['(506) 555-1234','5065551234','15065551234'])assert.equal(identityPhone(input,country),null,`${country} ${input}`);
  assert.equal(identityPhone('+1 506 555 1234',null),'+15065551234');
  assert.equal(identityPhone('+266696687',null),null);
});

test('website numbers typed without "+" are recognised when that person calls; withheld and short numbers never match; owners stay separate',{timeout:60000},async t=>{
  const s=await setup(t);
  for(const owner of ['synthetic-a','synthetic-b'])s.db.prepare('UPDATE businessProfiles SET country=? WHERE ownerId=?').run(owner==='synthetic-a'?'CA':null,owner);
  const responses=[];for(const phone of [...NANP,...NEVER])responses.push(await s.submit(phone,phone));
  responses.push(await s.submit('(506) 555-1234',null));
  assert.deepEqual(responses.map(r=>r.status),Array(7).fill(201),JSON.stringify(responses.map(r=>r.body)));
  assert.deepEqual(responses.map(r=>r.body.resultType),[...Array(6).fill('ESTIMATE_REQUIRES_REVIEW'),'INSTANT_ESTIMATE_READY']);
  // 1-2: storage. Leads page phone, Customers page phone.
  const leads=s.db.prepare("SELECT describedService,callerNumber,collectedInputsJson FROM leads WHERE ownerId='synthetic-a' ORDER BY createdAt,rowid").all();
  assert.deepEqual(leads.map(l=>l.callerNumber),['+15065551234','+15065551234','+15065551234','+15065551234','555-1234','266696687','+15065551234']);
  const customers=s.db.prepare("SELECT id,phoneE164 FROM customers WHERE ownerId='synthetic-a'").all();
  assert.deepEqual(customers.map(c=>c.phoneE164),['+15065551234']);
  const id=customers[0]?.id;assert.deepEqual(leads.map(l=>JSON.parse(l.collectedInputsJson).customerId),[id,id,id,id,null,null,id]);
  // The submitted receipt keeps exactly what the visitor typed.
  assert.deepEqual(leads.map(l=>JSON.parse(l.collectedInputsJson).originalSubmission.contact.phone),[...NANP,...NEVER,'(506) 555-1234']);
  const api=(await s.request('/api/leads')).body.leads;
  assert.deepEqual(api.map(l=>l.callerNumber).sort(),['+15065551234','+15065551234','+15065551234','+15065551234','+15065551234','266696687','555-1234']);
  // 3: the returning caller.
  const a=words(history(s,'synthetic-a','+15065551234'));
  const five=[...typed(NANP),'Synthetic visit'].sort();
  assert.deepEqual(a,{customer:'+15065551234',leads:five,requests:five,quotes:1,previousCall:false,appointments:0});
  // 4: withheld callers. Another withheld call happened earlier today.
  s.db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,transcriptJson,createdAt) VALUES('SYNTHETIC-withheld','synthetic-a','CA'||lower(hex(randomblob(16))),?,'+266696687','+15065550101','COMPLETED','[{\"role\":\"caller\",\"text\":\"[SYNTHETIC] private words\"}]',?)").run('AC'+'a'.repeat(32),new Date(s.clock().getTime()-3600000).toISOString());
  s.db.prepare("INSERT INTO customers(id,ownerId,phoneE164,name,createdAt) VALUES('SYNTHETIC-shared-withheld','synthetic-a','+266696687','[SYNTHETIC] Someone else',?)").run(s.clock().toISOString());
  for(const from of ['+266696687','266696687','7378742833','+7378742833','86282452253','+86282452253','anonymous','5551234','555-1234'])
    assert.deepEqual(words(history(s,'synthetic-a',from)),{customer:null,leads:[],requests:[],quotes:0,previousCall:false,appointments:0},from);
  // 5: a lead stored before this change keeps its raw text and still matches.
  s.db.prepare("INSERT INTO leads(id,ownerId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt) VALUES('SYNTHETIC-old-lead','synthetic-a',NULL,'(506) 555-9876','[SYNTHETIC] older website request','{}','quote_review','NEEDS REVIEW',?)").run(s.clock().toISOString());
  assert.deepEqual(words(history(s,'synthetic-a','+15065559876')).leads,['[SYNTHETIC] older website request']);
  // 6: owner B. Same number, B's own record, B's country not saved yet.
  s.db.prepare("INSERT INTO leads(id,ownerId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt) VALUES('SYNTHETIC-b-lead','synthetic-b',NULL,'(506) 555-1234','[SYNTHETIC] owner B request','{}','quote_review','NEEDS REVIEW',?)").run(s.clock().toISOString());
  assert.deepEqual(words(history(s,'synthetic-b','+15065551234')),{customer:null,leads:[],requests:[],quotes:0,previousCall:false,appointments:0});
  s.db.prepare("UPDATE businessProfiles SET country='CA' WHERE ownerId='synthetic-b'").run();
  assert.deepEqual(words(history(s,'synthetic-b','+15065551234')),{customer:null,leads:['[SYNTHETIC] owner B request'],requests:[],quotes:0,previousCall:false,appointments:0});
  assert.deepEqual(words(history(s,'synthetic-a','+15065551234')).leads,five);
  assert.deepEqual((await s.request('/api/leads',{owner:'synthetic-b'})).body.leads.map(l=>l.describedService),['[SYNTHETIC] owner B request']);
  // 7: outside Canada/US the same stored text matches nobody.
  s.db.prepare("UPDATE businessProfiles SET country='GB' WHERE ownerId='synthetic-b'").run();
  assert.deepEqual(words(history(s,'synthetic-b','+15065551234')).leads,[]);
});

// HANDWRITTEN EXPECTATIONS, before execution: two different callers whose caller ID is withheld
// arrive as the same digits (+266696687, Twilio's ANONYMOUS). The second caller's captured lead
// must not carry the first caller's name or email, the two get separate customer records, and
// the second caller's history shows nothing of the first. A real number still keeps one customer.
test('two withheld callers with the same digits stay two people in the receptionist capture path',async t=>{
  const {fixture}=await import('./leadCaptureRepair20261006Fixture.mjs');
  const f=fixture(t);f.db.prepare("UPDATE businessProfiles SET country='CA' WHERE ownerId='synthetic-a'").run();
  let serial=0;const call=from=>{const c={ownerId:'synthetic-a',callSid:'CA'+(++serial).toString(16).padStart(32,'0'),accountSid:'AC'+'a'.repeat(32),from,to:'+19025550101'};
    f.db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,transcriptJson,createdAt) VALUES(?,?,?,?,?,?,'CONNECTED','[]',?)").run(c.callSid,c.ownerId,c.callSid,c.accountSid,c.from,c.to,new Date().toISOString());return c;};
  for(const from of ['+266696687','+7378742833']){
    const first=call(from);await f.voice(first).tool('captureLead',{name:'[SYNTHETIC] First Private',email:'first@example.invalid'});
    const second=call(from);await f.voice(second).tool('captureLead',{description:'[SYNTHETIC] second caller request'});
    const [a]=f.lead(first),[b]=f.lead(second),ca=JSON.parse(a.collectedInputsJson),cb=JSON.parse(b.collectedInputsJson);
    assert.notEqual(cb.customerId,ca.customerId,from);
    assert.equal(cb.contact.name??null,null,from);assert.equal(cb.contact.email??null,null,from);
    const h=customerHistory(f.db,{ownerId:'synthetic-a',from,callSid:second.callSid});
    assert.deepEqual(words(h),{customer:null,leads:[],requests:[],quotes:0,previousCall:false,appointments:0},from);
  }
  const one=call('+15065550177');await f.voice(one).tool('captureLead',{name:'[SYNTHETIC] Known'});
  const two=call('+15065550177');await f.voice(two).tool('captureLead',{description:'[SYNTHETIC] back again'});
  assert.equal(JSON.parse(f.lead(two)[0].collectedInputsJson).customerId,JSON.parse(f.lead(one)[0].collectedInputsJson).customerId);
  assert.equal(JSON.parse(f.lead(two)[0].collectedInputsJson).contact.name,'[SYNTHETIC] Known');
});
