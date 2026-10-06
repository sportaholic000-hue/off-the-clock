import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {CREATE_TABLE_STATEMENTS,CREATE_INDEX_STATEMENTS} from '../server/src/schema.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {bookRevision,approveApplicationService} from '../server/src/quoteDoneBridge.js';
import {mowing} from '../verification/engine-independent/fixtures.mjs';
process.env.JWT_SECRET='synthetic-release-date-signing-key-not-for-production';
// Release spec expectations: 5,000 sqft x $0.02 = $100; October 10% => $110.
const west='2026-11-01T06:30:00.000Z',east='2026-09-30T15:30:00.000Z';
function setup(t,profile,instant,bookZone='Invalid/Book'){
 const database=new DatabaseSync(':memory:');t.after(()=>database.close());
 for(const sql of [...CREATE_TABLE_STATEMENTS,...CREATE_INDEX_STATEMENTS])database.exec(sql);
 const ownerId='[SYNTHETIC]-voice-date-'+randomUUID(),accountSid='AC'+'a'.repeat(32),callSid='CA'+'b'.repeat(32),from='+19025550100',to='+19025550101';
 database.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','Synthetic Date Co','QuoteDone','active',?,'owner',?)").run(ownerId,ownerId+'@example.invalid',profile,instant);
 database.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,transcriptJson,minutesBilled,createdAt,updatedAt) VALUES(?,?,?,?,?,?,'CONNECTED','[]',0,?,?)").run(randomUUID(),ownerId,callSid,accountSid,from,to,instant,instant);
 const f=mowing();delete f.ownerPricing.origin;f.ownerPricing.peakMonths=[10];f.ownerPricing.peakSurchargePercent=10;
 savePricebook(ownerId,{services:[f.ownerPricing],defaults:{currency:'CAD',...f.businessDefaults,quoteTimeZone:bookZone}});
 let book=loadPricebook(ownerId);approveApplicationService(ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:profile,quoteInstant:new Date(instant)});
 const context={ownerId,accountSid,callSid,from,to};
 const runtime=createVoiceToolRuntime({database,callContext:context,clock:()=>new Date(instant),handleSecret:'synthetic-date-secret'.padEnd(64,'x')});
 return {database,runtime,context,f};
}
for(const [label,profile,instant,bookZone,expected] of [
 ['west fallback','America/Los_Angeles',west,'Invalid/Book',110],
 ['east fallback','Asia/Tokyo',east,'Invalid/Book',110],
 ['UTC book overrides west','America/Los_Angeles',west,'UTC',100]
])test('release voice date: '+label+' quotes $'+expected+' using the runtime clock',async t=>{
 const h=setup(t,profile,instant,bookZone);
 const matched=await h.runtime.handlers.matchService({context:h.context,args:{query:h.f.ownerPricing.service}});
 assert.equal(matched.status,'matched',JSON.stringify(matched));
 const quoted=await h.runtime.handlers.getQuote({context:h.context,args:{serviceHandle:matched.serviceHandle,customerConfirmed:true,customerInputs:h.f.customerInputs}});
 assert.equal(quoted.status,'quoted',JSON.stringify(quoted));assert.equal(quoted.options[0].lowEstimate,expected);assert.equal(quoted.options[0].highEstimate,expected);
 const stored=h.database.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=?').get(h.context.ownerId);
 const outcome=JSON.parse(stored.internalOutcomeJson);
 assert.deepEqual(outcome.applicationOutcome.internalResult.calculationRecord.quoteDate,{timeZone:bookZone==='UTC'?'UTC':profile,quoteInstant:instant});
});
test('release voice date: profile changes immediately unpublish and restore seasonal service',async t=>{
 const h=setup(t,'America/Los_Angeles',west),match=()=>h.runtime.handlers.matchService({context:h.context,args:{query:h.f.ownerPricing.service}});
 assert.equal((await match()).status,'matched');
 h.database.prepare('UPDATE users SET timezone=? WHERE id=?').run('Invalid/Profile',h.context.ownerId);
 assert.equal((await match()).status,'needs_clarification');
 h.database.prepare('UPDATE users SET timezone=? WHERE id=?').run('America/Los_Angeles',h.context.ownerId);
 assert.equal((await match()).status,'matched');
});
