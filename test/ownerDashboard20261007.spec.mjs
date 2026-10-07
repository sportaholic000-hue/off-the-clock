import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownerCallFixture,at} from './helpers/ownerCallFixture.mjs';
import {fixture as bookingFixture} from './fixtures/bookingCalendar20261006.mjs';
import {createOwnerWorkflowService,ownerAmountCents} from '../server/src/ownerWorkflowService.js';
import {createOwnerReportService,savedQuoteValue} from '../server/src/ownerReportService.js';
import {localReportRange} from '../server/src/ownerReportTime.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {getVoiceToolDeclarations,validateVoiceToolCall} from '../server/src/voice/toolSchemas.js';
import {fixture as voiceFixture,secret as voiceSecret} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {existsSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

// Hand-written dollar oracles: EXPECTATIONS.md. All IDs, addresses, providers and data are synthetic.
const owner='synthetic-a',other='synthetic-b',now='2026-10-07T12:00:00.000Z';
const estimate={low:'100.10',high:'120.20',currency:'CAD',scope:'[SYNTHETIC] Gate labor only',qualifications:'[SYNTHETIC] Customer supplies materials',priceUnit:'per job',taxTreatment:'No tax added.'};
function fixture(t){const f=ownerCallFixture();t.after(()=>f.db.close());const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/);return f.db.prepare(sql);};
  const clock=()=>new Date(now);return {...f,ownerQuery,workflow:createOwnerWorkflowService({database:f.db,ownerQuery,clock}),reports:createOwnerReportService({ownerQuery,clock})};}
function action(f,kind,id,extra={}){const current=f.workflow.view(owner,kind,id);return f.workflow.act({ownerId:owner,actorId:owner,kind,id,body:{action:'CALL_BACK',version:current.workflow.version,idempotencyKey:randomUUID(),note:'[SYNTHETIC] Follow up about gate dimensions',...extra}});}
function priced(low=100.1,high=120.2,currency='CAD'){return {resultType:'INSTANT_ESTIMATE_READY',lowEstimate:low,highEstimate:high,currency,priceUnit:'per job',taxTreatment:'No tax added.'};}
function setQuote(f,id,result=priced(),extra={}){f.db.prepare('UPDATE quotes SET resultJson=?,status=?,serviceType=?,createdAt=? WHERE ownerId=? AND id=?').run(JSON.stringify({customerResult:result}),extra.status||'INSTANT',extra.serviceType||'Gate repair',extra.createdAt||at,owner,id);}
function addQuote(f,id,result=priced(),{callId=owner+'-call',status='INSTANT',createdAt=at,service='Gate repair'}={}){f.db.prepare('INSERT INTO quotes(id,ownerId,callId,serviceType,status,resultJson,createdAt) VALUES(?,?,?,?,?,?,?)').run(id,owner,callId,service,status,JSON.stringify({customerResult:result}),createdAt);}

test('owner review preserves original evidence, material qualifications and exact manual range; replay creates one quote',t=>{
  const f=fixture(t),id=owner+'-review',before=f.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=? AND id=?').get(owner,id).collectedInputsJson;
  const request={ownerId:owner,actorId:owner,kind:'leads',id,body:{action:'REVIEW',version:0,idempotencyKey:'synthetic-review',note:'[SYNTHETIC] Checked dimensions',estimate}};
  const one=f.workflow.act(request),two=f.workflow.act(request);assert.deepEqual(one,two);
  const quote=f.workflow.view(owner,'quotes',one.workflow.reviewedQuoteId);assert.equal(quote.result.lowEstimate,100.1);assert.equal(quote.result.highEstimate,120.2);assert.equal(quote.status,'INSTANT');assert.deepEqual(quote.result.materialQualifications,[estimate.qualifications]);
  assert.equal(f.db.prepare('SELECT collectedInputsJson FROM leads WHERE ownerId=? AND id=?').get(owner,id).collectedInputsJson,before);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM quotes WHERE ownerId=?').get(owner).n,2);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM voiceSmsDeliveries WHERE ownerId=?').get(owner).n,0);
  assert.equal(f.workflow.view(owner,'leads',id).customerInputs.height,4);
});
test('owner review uses the same corrected follow-up contact shown in Leads and Calls',t=>{
  const f=fixture(t),id=owner+'-lead';
  f.db.prepare('UPDATE bookingPreferences SET customerJson=?,locationJson=? WHERE ownerId=?').run(JSON.stringify({name:'[SYNTHETIC] corrected contact',email:'preferred@example.invalid'}),JSON.stringify({city:'[SYNTHETIC] Corrected site'}),owner);
  assert.equal(f.workflow.view(owner,'leads',id).contact.email,'preferred@example.invalid');
  const reviewed=action(f,'leads',id,{action:'REVIEW',estimate}),quote=f.workflow.view(owner,'quotes',reviewed.workflow.reviewedQuoteId);
  assert.equal(quote.contact.email,'preferred@example.invalid');assert.equal(quote.location.city,'[SYNTHETIC] Corrected site');
});
test('quote revision creates a separate receipt and preserves old qualifications; old quote is superseded',t=>{
  const f=fixture(t),id=owner+'-quote';setQuote(f,id,{...priced(),disclaimer:'[SYNTHETIC] Existing surface must be sound.',materialQualifications:['[SYNTHETIC] No replacement timber included.']});
  const before=f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(owner,id).resultJson;
  const reviewed=action(f,'quotes',id,{action:'REVIEW',estimate});const next=f.workflow.view(owner,'quotes',reviewed.workflow.reviewedQuoteId);
  assert.equal(reviewed.status,'SUPERSEDED');assert.match(next.result.disclaimer,/Existing surface/);assert.match(next.result.disclaimer,/No replacement timber/);assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(owner,id).resultJson,before);
  assert.throws(()=>action(f,'quotes',id,{action:'SENT',attested:true}),{statusCode:409});
});
test('optimistic revisions and idempotency keys reject stale or changed repeat actions without mutation',t=>{
  const f=fixture(t),id=owner+'-lead',body={action:'CALL_BACK',version:0,idempotencyKey:'synthetic-once',note:'[SYNTHETIC] Call after measuring'};
  const request={ownerId:owner,actorId:owner,kind:'leads',id,body};const first=f.workflow.act(request);assert.deepEqual(f.workflow.act(request),first);
  assert.throws(()=>f.workflow.act({...request,body:{...body,idempotencyKey:'synthetic-stale'}}),{statusCode:409});
  assert.throws(()=>f.workflow.act({...request,body:{...body,note:'[SYNTHETIC] Changed'}}),{statusCode:409});
  assert.equal(f.workflow.view(owner,'leads',id).workflow.history.length,1);
});
test('owner/staff and actor identity checks deny other tenant reads, edits and reviews',t=>{
  const f=fixture(t),body={action:'REVIEW',version:0,idempotencyKey:'synthetic-denied',note:'[SYNTHETIC] Review',estimate};
  for(const kind of ['leads','quotes']){const id=other+(kind==='leads'?'-lead':'-quote');assert.throws(()=>f.workflow.view(owner,kind,id),{statusCode:404});assert.throws(()=>f.workflow.act({ownerId:owner,actorId:owner,kind,id,body}),{statusCode:404});}
  for(const actorId of [other,'missing'])assert.throws(()=>f.workflow.act({ownerId:owner,actorId,kind:'leads',id:owner+'-lead',body}),{statusCode:403});
  assert.throws(()=>f.workflow.act({ownerId:owner,actorId:'synthetic-staff',role:'staff',kind:'leads',id:owner+'-lead',body}),{statusCode:403});
  assert.equal(f.workflow.act({ownerId:owner,actorId:'synthetic-staff',role:'staff',kind:'leads',id:owner+'-lead',body:{...body,action:'CALL_BACK',estimate:undefined}}).workflow.version,1);
  assert.equal(f.workflow.view(owner,'leads',owner+'-lead','staff').internal,undefined);
});
test('follow-up deadlines, completion, dismissal and reopening are durable and do not claim a booking',t=>{
  const f=fixture(t),id=owner+'-lead';const saved=action(f,'leads',id,{action:'BOOK',dueAt:'2026-10-08T12:00:00.000Z'});
  assert.equal(saved.status,'CAPTURED');assert.equal(saved.workflow.followUpStatus,'OPEN');assert.equal(f.reports.report({ownerId:owner,query:{period:'all'}}).followUp.open,1);
  action(f,'leads',id,{action:'COMPLETE_FOLLOW_UP'});assert.equal(f.reports.report({ownerId:owner}).followUp.open,0);
  action(f,'leads',id,{action:'DISMISS'});assert.equal(action(f,'leads',id,{action:'REOPEN'}).status,'NEEDS REVIEW');
  assert.throws(()=>action(f,'leads',id,{action:'CALL_BACK',dueAt:at}),{statusCode:400});
});
test('progression requires actual-event attestation, selected tier and exact final invoice; no automatic delivery',t=>{
  const f=fixture(t),id=owner+'-quote';setQuote(f,id,{...priced(),options:[{...priced(),tierName:'Basic'},{...priced(200.2,240.4),tierName:'Plus'}]});
  const before=f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(owner,id).resultJson;
  assert.throws(()=>action(f,'quotes',id,{action:'ACCEPTED',attested:true}),{statusCode:409});
  assert.throws(()=>action(f,'quotes',id,{action:'SENT'}),{statusCode:400});
  action(f,'quotes',id,{action:'SENT',attested:true});action(f,'quotes',id,{action:'VIEWED',attested:true});
  assert.throws(()=>action(f,'quotes',id,{action:'ACCEPTED',attested:true,tierName:'Missing'}),{statusCode:400});
  action(f,'quotes',id,{action:'ACCEPTED',attested:true,tierName:'Plus'});action(f,'quotes',id,{action:'INVOICED',attested:true,invoiceAmount:'110.15'});
  const row=f.db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(owner,id);assert.equal(row.finalInvoiceAmount,11015);assert.equal(row.resultJson,before);
  const report=f.reports.report({ownerId:owner,query:{period:'all'}});assert.equal(report.values.invoiced[0].low,'110.15');assert.equal(report.counts.invoices,1);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM voiceSmsDeliveries WHERE ownerId=?').get(owner).n,0);
});
for(const value of ['-1','1.001','1e2','Infinity','NaN',' 1','1 ',1,null,{},'99999999999.99'])test('owner monetary boundary rejects '+JSON.stringify(value),()=>assert.throws(()=>ownerAmountCents(value),{statusCode:400}));
test('owner money preserves cent boundaries and maximum supported amount',()=>{assert.equal(ownerAmountCents('0.01'),1);assert.equal(ownerAmountCents('100.10'),10010);assert.equal(ownerAmountCents('9999999999.99'),999999999999);});
test('review failure rolls back new receipt, status, action history and owner alert together',t=>{
  const f=fixture(t),id=owner+'-lead';const before=f.db.prepare('SELECT COUNT(*) AS n FROM ownerAlerts WHERE ownerId=?').get(owner).n;
  f.db.exec("CREATE TRIGGER synthetic_workflow_abort BEFORE INSERT ON ownerRecordEvents BEGIN SELECT RAISE(ABORT,'SYNTHETIC_WRITE_FAILURE'); END");
  assert.throws(()=>action(f,'leads',id,{action:'REVIEW',estimate}),/SYNTHETIC_WRITE_FAILURE/);
  assert.equal(f.workflow.view(owner,'leads',id).status,'CAPTURED');assert.equal(f.workflow.view(owner,'leads',id).workflow.version,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM quotes WHERE ownerId=?').get(owner).n,1);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM ownerAlerts WHERE ownerId=?').get(owner).n,before);
});
test('report sums exact cents and separates currencies, excludes partial and unit-only receipts',t=>{
  const f=fixture(t);setQuote(f,owner+'-quote');addQuote(f,'synthetic-second',priced(200.2,240.4));addQuote(f,'synthetic-usd',priced(50.05,50.05,'USD'));
  addQuote(f,'synthetic-partial',{resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:priced()});addQuote(f,'synthetic-unit',{...priced(),priceUnit:'per square foot'});
  const report=f.reports.report({ownerId:owner,query:{period:'all'}});assert.deepEqual(report.values.quoted.map(g=>[g.currency,g.low,g.high]),[['CAD','300.30','360.60'],['USD','50.05','50.05']]);
  assert.equal(report.excludedValues.quoted.partial_scope,1);assert.equal(report.excludedValues.quoted.unit_price,1);assert.doesNotMatch(JSON.stringify(report),/synthetic-b|221.23/);
});
test('tier envelope is not a sum and a selected tier is exact',()=>{
  const row={resultJson:JSON.stringify({customerResult:{...priced(),options:[{...priced(),tierName:'Basic'},{...priced(200.2,240.4),tierName:'Plus'}]}})};
  assert.equal(savedQuoteValue(row).low,10010n);assert.equal(savedQuoteValue(row).high,24040n);assert.equal(savedQuoteValue(row,'Plus').low,20020n);assert.equal(savedQuoteValue(row,'Plus').high,24040n);assert.equal(savedQuoteValue(row,'Missing').excluded,'unknown_tier');
});
test('bad receipts and unknown currencies never become zero-valued valid estimates',()=>{
  for(const result of [null,{},priced(Infinity),priced(-1),priced(2,1),priced(1,2,'BAD'),{...priced(),options:[null]},{...priced(),options:{}},{...priced(),options:[]},{...priced(),taxTreatment:{private:'synthetic'}}]){const value=savedQuoteValue({resultJson:JSON.stringify({customerResult:result})});assert.ok(value.excluded);}
});
test('booked value excludes site visits and foreign joins; one quote booked twice contributes once',t=>{
  const f=fixture(t);setQuote(f,owner+'-quote');f.db.prepare("UPDATE appointments SET bookingMode='book_job' WHERE ownerId=?").run(owner);
  f.db.prepare("INSERT INTO appointments(id,ownerId,quoteId,status,bookingMode,createdAt) VALUES('synthetic-duplicate',?,?,'CONFIRMED','book_job',?)").run(owner,owner+'-quote',at);
  const report=f.reports.report({ownerId:owner,query:{period:'all'}});assert.equal(report.values.booked.length,1);assert.equal(report.values.booked[0].low,'100.10');assert.equal(report.excludedValues.booked.duplicate_quote_booking,1);assert.equal(report.excludedValues.booked.unpriced,2);
  f.db.prepare("UPDATE appointments SET bookingMode='site_visit_first' WHERE ownerId=? AND quoteId=?").run(owner,owner+'-quote');assert.equal(f.reports.report({ownerId:owner,query:{period:'all'}}).values.booked.length,0);
});
test('periods use owner timezone and include both DST repeated hours with exclusive end',t=>{
  const range=localReportRange({period:'custom',fromDate:'2026-11-01',toDate:'2026-11-01'},'America/Moncton');assert.equal(range.startAtUtc,'2026-11-01T03:00:00.000Z');assert.equal(range.endAtUtc,'2026-11-02T04:00:00.000Z');
  const f=fixture(t);f.db.prepare('UPDATE users SET timezone=? WHERE id=? AND ownerId IS NULL').run('America/Moncton',owner);
  for(const [id,date] of [['before','2026-11-01T02:59:59.999Z'],['start',range.startAtUtc],['early-repeat','2026-11-01T04:30:00.000Z'],['late-repeat','2026-11-01T05:30:00.000Z'],['end',range.endAtUtc]])f.db.prepare('INSERT INTO calls(id,ownerId,createdAt) VALUES(?,?,?)').run('synthetic-'+id,owner,date);
  const report=f.reports.report({ownerId:owner,query:{period:'custom',fromDate:'2026-11-01',toDate:'2026-11-01'}});assert.equal(report.counts.calls,3);assert.equal(report.afterHours.unknown,3);
  const calls=f.service.list({ownerId:owner,query:{fromDate:'2026-11-01',toDate:'2026-11-01'}});assert.equal(calls.total,3);
});
test('after-hours uses validated structured hours, closed days and exact opening/closing boundaries',t=>{
  const f=fixture(t);const hours=Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,day==='tue'?[{start:'09:00',end:'17:00'}]:[]]));
  f.reports.saveHours(owner,{weeklyHours:hours,revision:0});
  for(const [id,time] of [['before','08:59'],['open','09:00'],['inside','16:59'],['close','17:00']])f.db.prepare('INSERT INTO calls(id,ownerId,createdAt) VALUES(?,?,?)').run('synthetic-hours-'+id,owner,'2026-10-06T'+time+':00.000Z');
  const report=f.reports.report({ownerId:owner,query:{period:'all'}});assert.equal(report.afterHours.duringHours,2);assert.equal(report.afterHours.count,5);assert.equal(report.afterHours.unknown,0);
  assert.equal(f.reports.report({ownerId:other,query:{period:'all'}}).afterHours.unknown,3);
  assert.throws(()=>f.reports.saveHours(owner,{weeklyHours:hours,revision:0}),{statusCode:409});
  for(const bad of [{}, {...hours,tue:[{start:'17:00',end:'09:00'}]},{...hours,tue:[{start:'09:00',end:'12:00'},{start:'11:00',end:'17:00'}]}])assert.throws(()=>f.reports.saveHours(owner,{weeklyHours:bad,revision:1}),{statusCode:400});
});
test('report periods and call filters reject arrays, malformed dates, SQL-shaped values and tenant overrides',t=>{
  const f=fixture(t);
  for(const query of [{period:['all']},{period:'custom',fromDate:'2026-02-30',toDate:'2026-03-01'},{period:'custom',fromDate:'2020-01-01',toDate:'2026-01-01'},{period:'today',ownerId:other}])assert.throws(()=>f.reports.report({ownerId:owner,query}),{statusCode:400});
  for(const query of [{search:['gate']},{status:{}},{spam:'no'},{fromDate:'2026-10-01'},{search:'x'.repeat(201)}])assert.throws(()=>f.service.list({ownerId:owner,query}),{statusCode:400});
  assert.equal(f.service.list({ownerId:owner,query:{search:"' OR 1=1 --"}}).total,0);assert.equal(f.service.list({ownerId:owner,query:{search:'%'}}).total,0);
});
test('call search composes status, outcome, service, spam and date before deterministic pagination',t=>{
  const f=fixture(t);f.db.prepare("UPDATE calls SET outcome='QUOTED',spamFiltered=1 WHERE ownerId=? AND id=?").run(owner,owner+'-call');
  assert.equal(f.service.list({ownerId:owner,query:{search:'gate'}}).total,0);
  const query={search:'gate',status:'COMPLETED',outcome:'QUOTED',service:'CUSTOM',spam:'only',fromDate:'2026-10-06',toDate:'2026-10-06'};
  const page=f.service.list({ownerId:owner,query,limit:1});assert.equal(page.total,1);assert.equal(page.nextOffset,null);assert.equal(page.spamCount,1);
  assert.equal(f.service.list({ownerId:owner,query:{...query,offset:'1'}}).calls.length,0);
  f.db.prepare('INSERT INTO transcriptTurns(id,ownerId,callId,sequence,role,text,createdAt) VALUES(?,?,?,?,?,?,?)').run('synthetic-search-turn',owner,owner+'-fallback',1,'caller','[SYNTHETIC] cedar hinge',at);
  assert.equal(f.service.list({ownerId:owner,query:{search:'cedar hinge'}}).calls[0].id,owner+'-fallback');
});
test('service funnel counts distinct calls, cumulative stages, booked jobs and conversion percentages',t=>{
  const f=fixture(t);setQuote(f,owner+'-quote');f.db.prepare("UPDATE leads SET describedService='Gate repair' WHERE ownerId=?").run(owner);
  f.db.prepare("UPDATE appointments SET bookingMode='book_job' WHERE ownerId=? AND quoteId=?").run(owner,owner+'-quote');
  action(f,'quotes',owner+'-quote',{action:'SENT',attested:true});action(f,'quotes',owner+'-quote',{action:'ACCEPTED',attested:true});action(f,'quotes',owner+'-quote',{action:'INVOICED',attested:true,invoiceAmount:'110.15'});
  const funnel=f.reports.report({ownerId:owner,query:{period:'all'}}).funnel.find(row=>row.service==='Gate repair');
  assert.deepEqual([funnel.calls,funnel.quoted,funnel.booked,funnel.invoiced],[2,1,1,1]);assert.deepEqual([funnel.callsToQuoted,funnel.quotedToBooked,funnel.bookedToInvoiced],[50,100,100]);
});
test('booking alert snapshots the confirmed slot, survives migration and never queues for pending/failed appointments',t=>{
  const f=fixture(t);const rows=()=>f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='booking.confirmed' AND aggregateId=?").all(owner,owner+'-lead-booking');
  assert.equal(rows().length,0);f.db.prepare("UPDATE appointments SET status='FAILED' WHERE ownerId=? AND id=?").run(owner,owner+'-lead-booking');assert.equal(rows().length,0);
  f.db.prepare("UPDATE appointments SET status='CONFIRMED',confirmedAt=? WHERE ownerId=? AND id=?").run(now,owner,owner+'-lead-booking');const saved=rows()[0];assert.equal(JSON.parse(saved.sourceJson).start,'2026-10-09T09:00:00.000Z');
  f.db.prepare('UPDATE appointments SET startAtUtc=? WHERE ownerId=? AND id=?').run('2026-10-10T09:00:00.000Z',owner,owner+'-lead-booking');migrateDatabase(f.db);assert.equal(rows().length,1);assert.equal(rows()[0].sourceJson,saved.sourceJson);
});
test('booking alert email retries only owner recipient with identical key and payload after a lost response',async t=>{
  const f=bookingFixture(t),{i,held}=await f.ready();await f.booking.confirm(f.request(i,held));
  f.db.prepare("UPDATE ownerAlerts SET status='ACCEPTED' WHERE ownerId=? AND eventType<>'booking.confirmed'").run(owner);
  let current=f.clock().getTime(),attempt=0;const messages=[],worker=createOwnerAlertService({database:f.db,clock:()=>current,ready:()=>true,environment:{EMAIL_FROM:'[SYNTHETIC] owner@example.invalid'},send:async message=>{messages.push(message);if(attempt++===0)throw Error('SYNTHETIC_RESPONSE_LOST');return {accepted:true,id:'SYNTHETIC_OWNER_EMAIL'};}});
  await worker.processOne(owner);current+=1001;await worker.processOne(owner);await worker.processOne(owner);
  assert.equal(messages.length,2);assert.deepEqual(messages[0],messages[1]);assert.equal(messages[0].to,'synthetic-a@example.invalid');assert.doesNotMatch(messages[0].to,/booking@/);
});
test('confirmed booking transaction rolls back when durable owner alert cannot be inserted',t=>{
  const f=fixture(t);f.db.exec("CREATE TRIGGER synthetic_booking_alert_failure BEFORE INSERT ON ownerAlerts WHEN NEW.eventType='booking.confirmed' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_ALERT_FAILURE'); END");
  assert.throws(()=>f.db.prepare("UPDATE appointments SET status='CONFIRMED' WHERE ownerId=? AND id=?").run(owner,owner+'-lead-booking'),/SYNTHETIC_ALERT_FAILURE/);
  assert.equal(f.db.prepare('SELECT status FROM appointments WHERE ownerId=? AND id=?').get(owner,owner+'-lead-booking').status,'PENDING_CONFIRMATION');
});
test('production policy exposes no SMS tool and no provider exists to send even with credentials',async()=>{
  assert.equal(getVoiceToolDeclarations().some(tool=>tool.name==='sendSms'),false);
  for(const template of ['quote','booking','callback','reminder'])assert.throws(()=>validateVoiceToolCall('sendSms',{template,recordHandle:'a'.repeat(40)}),{code:'UNKNOWN_VOICE_TOOL'});
  for(const file of ['voiceSmsService.js','voiceSmsProvider.js'])assert.equal(existsSync(new URL('../server/src/'+file,import.meta.url)),false);
});
test('caller message policy rejects an attempted tool and cancels old queued work without calling a provider',async t=>{
  const f=voiceFixture(t),context=f.context();let attempts=0;
  const runtime=createVoiceToolRuntime({database:f.db,callContext:context,handleSecret:voiceSecret,providers:{sendSms:async()=>{attempts++;throw Error('MUST_NOT_SEND');}}});
  assert.equal(runtime.handlers.sendSms,undefined);assert.equal(attempts,0);
  f.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES('synthetic-queued-sms',?,'voice.sms_requested','synthetic-lead',?,'PENDING',?,?)").run(context.ownerId,JSON.stringify({callSid:context.callSid,recordType:'lead'}),at,at);
  migrateDatabase(f.db);
  assert.equal(attempts,0);
  const row=f.db.prepare('SELECT status,lastErrorCode FROM voiceSmsDeliveries WHERE ownerId=? AND id=?').get(context.ownerId,'synthetic-queued-sms');
  assert.deepEqual(row,{status:'CANCELLED',lastErrorCode:'CHANNEL_REMOVED'});
});
test('owner report, filters and action UI render actual saved data, qualified money and safe transcripts',async t=>{
  const f=fixture(t);setQuote(f,owner+'-quote');action(f,'leads',owner+'-lead',{action:'CALL_BACK'});
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());
  const {ReportView}=await vite.ssrLoadModule('/src/reports.jsx'),{CallFilters,transcriptText}=await vite.ssrLoadModule('/src/calls.jsx');
  const html=renderToStaticMarkup(React.createElement(ReportView,{report:f.reports.report({ownerId:owner,query:{period:'all'}})}));
  for(const text of ['CAD $100.10','120.20','Service funnel','AFTER-HOURS CALLS','Open follow-up','No tax added.'])assert.ok(html.includes(text),text);
  assert.doesNotMatch(html,/synthetic-b|undefined/);
  const filters=renderToStaticMarkup(React.createElement(CallFilters,{value:{},choices:{statuses:['COMPLETED'],outcomes:['QUOTED'],services:['Gate repair']}}));for(const text of ['Search calls','Status','Outcome','Service','Spam','From date','Through date'])assert.ok(filters.includes(text));
  assert.match(transcriptText({id:'synthetic',createdAt:at,transcript:[{role:'caller',text:'<script>synthetic</script>'}]}),/<script>synthetic<\/script>/); // text, never executable markup
});
