import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {flooring,mowing} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {createQuoteEmailService} from '../server/src/quoteEmailService.js';
import {quoteEmailFixture,environment} from './quoteEmailFixture.mjs';
import {webQuote,publicCopy,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {ownerQuery} from '../server/src/db.js';

// Expected values, written before execution. A quote dated October 20, 2026
// (11:00 in America/Moncton, ADT) with 30-day validity states "until
// November 19, 2026". Atlantic daylight time ends November 1, 2026, so the end
// of November 19 in Moncton is 2026-11-20T04:00:00.000Z (midnight AST, UTC-4).
const QUOTED='2026-10-20T15:00:00.000Z',SENT=Date.parse('2026-10-25T15:00:00.000Z');
const VALID_THROUGH=Date.parse('2026-11-20T04:00:00.000Z'),DAY=24*60*60*1000;
const EXPIRED='This quote has expired. Create a new quote before emailing it.';
const STATEMENT='This quote is valid for 30 days, until November 19, 2026.';

function monctonQuote(days){
  const f=flooring('tile',200);
  f.businessDefaults.quoteTimeZone='America/Moncton';
  if(days===undefined)delete f.businessDefaults.quoteValidityDays;else f.businessDefaults.quoteValidityDays=days;
  f.quoteDate={timeZone:'America/Moncton',quoteInstant:QUOTED};f.currentMonth=10;
  const internalResult=generateQuoteVNext(f);
  assert.equal(internalResult.resultType,'INSTANT_ESTIMATE_READY');
  return {internalResult,customerResult:sanitizeForCustomerVNext(internalResult)};
}
function harness(t){
  const h=quoteEmailFixture(t);let now=SENT;
  const email=createQuoteEmailService({database:h.db,ownerQuery:h.ownerQuery,environment,clock:()=>now,
    provider:{send:async()=>({accepted:true,id:'SYNTHETIC-'+randomUUID()}),read:async id=>({id,last_event:'delivered'})}});
  function saved(days){
    const id='SYNTHETIC-quote-'+randomUUID(),outcome=monctonQuote(days);
    h.db.prepare("INSERT INTO quotes(id,ownerId,serviceType,resultJson,status,createdAt) VALUES(?,?,'FLOORING_INSTALL',?,'INSTANT',?)")
      .run(id,h.c.ownerId,JSON.stringify({originalSubmission:{contact:{email:'caller@example.invalid'}},...outcome}),QUOTED);
    return {id,outcome};
  }
  const send=id=>email.enqueueSavedQuote({ownerId:h.c.ownerId,quoteId:id,email:'caller@example.invalid',customerConfirmed:true});
  const row=id=>h.db.prepare('SELECT * FROM quoteEmailDeliveries WHERE ownerId=? AND recordId=?').get(h.c.ownerId,id);
  const opens=(token,at)=>{now=at;try{return !!email.publicQuote(h.c.ownerId,token);}catch(error){assert.equal(error.statusCode,404);return false;}};
  return {...h,email,saved,send,row,opens,at:value=>{now=value;}};
}
function tokenFor(email,row){return publicCopy(email,row).token;}

test('validity 30 days: link emailed October 25 opens through November 19 and is refused from November 20 (Moncton)',async t=>{
  const h=harness(t),{id,outcome}=h.saved(30);
  assert.ok(outcome.customerResult.disclaimer.includes(STATEMENT));
  assert.equal(h.send(id).status,'PENDING');
  const row=h.row(id);assert.equal(row.expiresAt,VALID_THROUGH);
  const token=tokenFor(h.email,row);
  assert.equal(h.opens(token,SENT),true);
  assert.equal(h.opens(token,Date.parse('2026-11-19T16:00:00.000Z')),true,'midday November 19 local');
  assert.equal(h.opens(token,VALID_THROUGH-1),true,'23:59:59.999 November 19 local');
  assert.equal(h.opens(token,VALID_THROUGH),false,'00:00 November 20 local');
  assert.equal(h.opens(token,Date.parse('2026-11-20T16:00:00.000Z')),false,'midday November 20 local');
});

test('validity 30 days: emailing on November 20 is refused with the expired notice and nothing is queued',async t=>{
  const h=harness(t),{id}=h.saved(30);
  for(const at of [VALID_THROUGH,Date.parse('2026-11-20T16:00:00.000Z')]){
    h.at(at);
    assert.throws(()=>h.send(id),error=>error.code==='QUOTE_VALIDITY_EXPIRED'&&error.statusCode===409&&error.message===EXPIRED);
    assert.equal(h.row(id),undefined);
  }
  // Late on the last valid day it is still sent, with the same validity end.
  h.at(VALID_THROUGH-60*1000);assert.equal(h.send(id).status,'PENDING');assert.equal(h.row(id).expiresAt,VALID_THROUGH);
});

test('validity blank: link emailed October 25 opens for 30 days after sending, as before',async t=>{
  const h=harness(t),{id,outcome}=h.saved(undefined);
  assert.doesNotMatch(outcome.customerResult.disclaimer,/quote is valid for/i);
  h.send(id);const row=h.row(id);assert.equal(row.expiresAt,SENT+30*DAY);
  const token=tokenFor(h.email,row);
  assert.equal(h.opens(token,SENT+30*DAY-1),true);
  assert.equal(h.opens(token,SENT+30*DAY),false);
});

test('a link issued before this change keeps its original expiry',async t=>{
  const h=harness(t),{id}=h.saved(30);
  // Issued October 21 under the old rule: 30 days after sending, past the validity end.
  const token=randomBytes(32).toString('base64url'),issued=Date.parse('2026-10-21T15:00:00.000Z'),at=new Date(issued).toISOString();
  h.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES(?,?,'quote.email_requested',?,'{}','DELIVERED',?,?)").run('SYNTHETIC-legacy',h.c.ownerId,id,at,at);
  h.db.prepare(`INSERT INTO quoteEmailDeliveries(id,ownerId,requestId,recordId,callSid,recipient,businessName,narration,messageJson,tokenHash,expiresAt,status,createdAt,updatedAt)
    VALUES('SYNTHETIC-legacy',?,?,?,'','caller@example.invalid','Synthetic','[SYNTHETIC] narration','{}',?,?,'DELIVERED',?,?)`)
    .run(h.c.ownerId,'saved-quote:'+id,id,createHash('sha256').update(token).digest('hex'),issued+30*DAY,at,at);
  assert.equal(h.opens(token,VALID_THROUGH+6*60*60*1000),true,'after the validity end, before the issued expiry');
  assert.equal(h.opens(token,issued+30*DAY-1),true);
  assert.equal(h.opens(token,issued+30*DAY),false);
  // Re-requesting the same saved quote returns the existing delivery unchanged.
  h.at(SENT);assert.equal(h.send(id).id,'SYNTHETIC-legacy');assert.equal(h.row(id).expiresAt,issued+30*DAY);
});

test('voice-confirmed email follows the stored validity and refuses after it ends',async t=>{
  const h=quoteEmailFixture(t),saved=h.savedQuote();
  h.db.prepare('UPDATE quoteSubmissions SET internalOutcomeJson=? WHERE ownerId=? AND requestId=?')
    .run(JSON.stringify({voiceVersion:1,applicationOutcome:monctonQuote(30)}),h.c.ownerId,saved.requestId);
  const confirmation=await h.tool('prepareQuoteEmail',{quoteHandle:saved.quoteHandle,email:'caller@example.invalid'});
  const expired=createQuoteEmailService({database:h.db,ownerQuery:h.ownerQuery,environment,clock:()=>VALID_THROUGH});
  const {ownerId,callSid}=h.c,candidate=h.db.prepare('SELECT * FROM quoteEmailRecipients WHERE ownerId=? AND requestId=?').get(ownerId,saved.requestId);
  assert.throws(()=>expired.enqueue({ownerId,requestId:saved.requestId,recordId:saved.recordId,callSid,email:candidate.email,version:candidate.version,customerConfirmed:true}),
    error=>error.code==='QUOTE_VALIDITY_EXPIRED');
  assert.equal(h.rows().length,0);
  const result=await h.tool('sendQuoteEmail',{emailConfirmationHandle:confirmation.emailConfirmationHandle,customerConfirmed:true});
  assert.equal(result.deliveryStatus,'PENDING');assert.equal(h.rows()[0].expiresAt,VALID_THROUGH);
});

test('voice-confirmed email with no stored validity keeps 30 days after sending',async t=>{
  const h=quoteEmailFixture(t),queued=await h.queue();
  assert.equal(queued.result.deliveryStatus,'PENDING');
  assert.equal(h.rows()[0].expiresAt,Date.parse('2026-10-06T12:00:00.000Z')+30*DAY);
});

test('widget-saved quote with validity: the actual submit path records the validity end the email link uses',async()=>{
  // Written before execution: quoted 2026-10-20T15:00Z in UTC with 30 days is
  // valid until November 19, 2026, so the link ends at 2026-11-20T00:00:00Z.
  const f=mowing();f.businessDefaults.quoteValidityDays=30;
  const h=webQuote(f,[],QUOTED);
  assert.match(h.result.options?.[0]?.disclaimer||h.result.disclaimer,/valid for 30 days, until November 19, 2026\./);
  const email=createQuoteEmailService({database:db,ownerQuery,environment,clock:()=>SENT,provider:{send:async()=>({accepted:true,id:'SYNTHETIC'}),read:async id=>({id})}});
  email.enqueueSavedQuote({ownerId:h.owner,quoteId:h.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  assert.equal(h.rows()[0].expiresAt,Date.parse('2026-11-20T00:00:00.000Z'));
});
