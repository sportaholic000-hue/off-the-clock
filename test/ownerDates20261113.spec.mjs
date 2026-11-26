import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';

// Every date and time an owner page prints is in the business time zone, in
// the Calls page format "YYYY-MM-DD, HH:MM ZONE" (date-only fields
// "YYYY-MM-DD"). A missing or invalid value reads "Not recorded".
// Expected values written before execution (America/Moncton: AST is UTC-4;
// ADT is UTC-3 until 2026-11-01 05:00 UTC). Expected before the change: every
// test fails except the staff-view test, which passes before and after.
const ZONE='America/Moncton';
const ISO=/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const visible=html=>html.replace(/<pre[\s\S]*?<\/pre>/g,' ').replace(/<[^>]+>/g,' ').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ');
async function client(t){
  const vite=await createServer({root:fileURLToPath(new URL('../client',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  t.after(()=>vite.close());
  return name=>vite.ssrLoadModule(name);
}
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const CASES=[
  ['2026-11-13T05:33:43.443Z','2026-11-13, 01:33 AST'],
  ['2026-11-13T03:10:00.000Z','2026-11-12, 23:10 AST'],
  ['2026-11-01T04:30:00.000Z','2026-11-01, 01:30 ADT'],
  ['2026-11-01T05:30:00.000Z','2026-11-01, 01:30 AST']
];

test('shared formatter: business-local date and time, DST and cross-midnight, words for missing or invalid',async t=>{
  const {callTime,clockTime,businessDay}=await (await client(t))('/src/callTime.js');
  for(const [value,expected] of CASES)assert.equal(callTime(value,ZONE),expected);
  assert.equal(callTime('2026-11-13T05:33:43.443Z'),'2026-11-13, 05:33 UTC');
  assert.equal(callTime('2026-11-13T05:33:43.443Z',null),'2026-11-13, 05:33 UTC');
  assert.equal(callTime('2026-11-13T05:33:43.443Z','Not/AZone'),'2026-11-13, 05:33 UTC');
  for(const bad of [null,undefined,'','not a date'])assert.equal(callTime(bad,ZONE),'Not recorded');
  assert.equal(clockTime('2026-10-07T12:45:00.000Z',ZONE),'09:45 ADT');
  assert.equal(businessDay('2026-11-13T03:10:00.000Z',ZONE),'2026-11-12');
  assert.equal(businessDay('bad',ZONE),'Not recorded');
});

test('Leads and Quotes records and their action history show business-local times; order unchanged',async t=>{
  const load=await client(t),{QuoteRecordsList}=await load('/src/quotedone.jsx');
  const workflow={version:2,timezone:ZONE,followUpAction:'CALL_BACK',followUpStatus:'OPEN',dueAt:'2026-11-14T03:10:00.000Z',history:[
    {id:'h1',createdAt:'2026-11-13T03:10:00.000Z',action:'CALL_BACK',fromStatus:'NEW',toStatus:'NEW',note:'[SYNTHETIC] note'}]};
  for(const kind of ['leads','quotes']){
    const rows=CASES.map(([createdAt],i)=>({id:kind+i,status:kind==='leads'?'CAPTURED':'INSTANT',createdAt,describedService:'[SYNTHETIC] Row '+i,workflow,contact:{},location:{}}));
    rows.push({id:kind+'-bad',status:kind==='leads'?'NEW':'SENT',createdAt:'not a date',describedService:'[SYNTHETIC] Row bad',workflow,contact:{},location:{}});
    const text=visible(render(QuoteRecordsList,{rows,kind}).replace(/<select[\s\S]*?<\/select>/g,' '));
    const status=kind==='leads'?'Saved from a call':'Priced instantly';
    for(const [,expected] of CASES)assert.ok(text.includes(status+' · '+expected),kind+' '+expected);
    assert.ok(text.includes(' · Not recorded'),kind+' invalid');
    assert.ok(text.includes('Call back · Open · 2026-11-13, 23:10 AST'),kind+' due');
    assert.ok(text.includes('2026-11-12, 23:10 AST · Call back'),kind+' history');
    assert.doesNotMatch(text,ISO);
    // Order: the server's order is kept, never re-sorted by the formatted text.
    const order=[...text.matchAll(/\[SYNTHETIC\] Row (\w+)/g)].map(m=>m[1]);
    assert.deepEqual(order,['0','1','2','3','bad']);
  }
});

test('alerts, delivery attempts, booking links, calendar, reports, minutes, billing, transcript and forwarding check',async t=>{
  const load=await client(t);
  const {OwnerAlerts}=await load('/src/ownerAlerts.jsx');
  const alert={id:'a',eventType:'lead.created',aggregateId:'x',status:'ACCEPTED',attemptCount:1,createdAt:'2026-11-13T03:10:00.000Z',seenAt:'2026-11-13T05:33:43.443Z',title:'New lead'};
  const zoned=visible(render(OwnerAlerts,{alerts:[alert],ownerTimezone:ZONE,configured:true,canRetry:false}));
  assert.ok(zoned.includes('2026-11-12, 23:10 AST · Attempts: 1'));assert.ok(zoned.includes('Reviewed in dashboard · 2026-11-13, 01:33 AST'));assert.doesNotMatch(zoned,ISO);
  const unzoned=visible(render(OwnerAlerts,{alerts:[alert],configured:true,canRetry:false}));
  assert.ok(unzoned.includes('2026-11-13, 03:10 UTC · Attempts: 1'));assert.doesNotMatch(unzoned,ISO);
  const {DeliveryActions}=await load('/src/deliveryActions.jsx');
  const delivery=visible(render(DeliveryActions,{actions:[{id:'d',eventType:'quote.email_requested',status:'ACCEPTED',createdAt:'2026-11-13T03:10:00.000Z',attemptCount:1}]}));
  assert.ok(delivery.includes('2026-11-13, 03:10 UTC'));assert.doesNotMatch(delivery,ISO);
  const {LeadLinks}=await load('/src/leadLinks.jsx');
  const links=visible(render(LeadLinks,{row:{bookings:[{id:'b',status:'CONFIRMED',startAtUtc:'2026-11-13T03:10:00.000Z',timezone:ZONE}]}}));
  assert.ok(links.includes('Confirmed · 2026-11-12, 23:10 AST'));
  const {RecordCard}=await load('/src/calendar.jsx');
  const card=visible(render(RecordCard,{record:{id:'r',status:'CONFIRMED',serviceType:null,bookingMode:'site_visit_first',customer:{name:'Sam'},location:{},startAtUtc:'2026-10-07T12:00:00.000Z',endAtUtc:'2026-10-07T12:45:00.000Z'},timezone:ZONE}));
  assert.ok(card.includes('2026-10-07, 09:00 ADT — 09:45 ADT'),card);
  const {ReportView}=await load('/src/reports.jsx');
  const report={counts:{answered:0,calls:0,spam:0,quotes:0,bookings:0,billedMinutes:0,seconds:0},range:{fromDate:null,toDate:null,timezone:ZONE},afterHours:{count:0,unknown:0,duringHours:0,basis:''},
    values:{quoted:[],booked:[],invoiced:[]},excludedValues:{quoted:{},booked:{},invoiced:{}},funnel:[],jobMetrics:[],valueBasis:'',funnelBasis:'',
    followUp:{open:2,overdue:0,items:[{kind:'leads',recordId:'r1',action:'BOOK',dueAt:'2026-11-13T03:10:00.000Z',note:'[SYNTHETIC] a'},{kind:'quotes',recordId:'r2',action:'CALL_BACK',dueAt:null,note:'[SYNTHETIC] b'}]}};
  const reportText=visible(render(ReportView,{report}));
  assert.ok(reportText.includes('Book · 2026-11-12, 23:10 AST · [SYNTHETIC] a'));assert.ok(reportText.includes('Call back · No deadline set · [SYNTHETIC] b'));assert.doesNotMatch(reportText,ISO);
  const {default:MinuteUsage}=await load('/src/minuteUsage.jsx');
  const minutes=visible(render(MinuteUsage,{timeZone:ZONE,usage:{status:'PAID',periodStartAt:'2026-11-01T02:30:00.000Z',periodEndAt:'2026-12-01T04:00:00.000Z',includedMinutes:300,minutesUsed:1,minutesLeft:299,overageCents:0,chargedCents:0,unchargedCents:0,
    pendingCharges:[{id:'p',startAt:'2026-10-01T03:00:00.000Z',endAt:'2026-11-01T02:30:00.000Z',amountCents:100,message:'[SYNTHETIC]'}]}}));
  assert.ok(minutes.includes('2026-10-31 to 2026-12-01 · 300 included minutes'),minutes);
  assert.ok(minutes.includes('2026-10-01 to 2026-10-31: $1.00.'),minutes);
  const {AnnualPaidThrough}=await load('/src/billing.jsx');
  assert.ok(visible(render(AnnualPaidThrough,{value:'2027-11-13T03:10:00.000Z',timeZone:ZONE})).includes('Annual service is paid through 2027-11-12.'));
  const {transcriptText}=await load('/src/calls.jsx');
  assert.equal(transcriptText({id:'c',callerNumber:'+15065550123',createdAt:'2026-11-13T03:10:00.000Z',ownerTimezone:ZONE,transcript:[]}).split('\n\n')[3],'2026-11-12, 23:10 AST');
  const {ForwardingArrival}=await load('/src/onboarding.jsx');
  const arrival=visible(render(ForwardingArrival,{arrival:{reachedAt:'2026-11-13T03:10:00.000Z',callerNumber:'+15065550123'},timeZone:ZONE}));
  assert.ok(arrival.includes('Reached 2026-11-12, 23:10 AST from +15065550123.'),arrival);
});

test('staff view of Leads and Quotes: same sections, labels and buttons; dates formatted',async t=>{
  const {service}=ownerCallFixture(),{QuoteRecordsList}=await (await client(t))('/src/quotedone.jsx');
  const call=service.detail({ownerId:'synthetic-a',id:'synthetic-a-call',role:'staff'});
  for(const [kind,rows] of [['quotes',call.quotes],['leads',call.leads]]){
    const html=render(QuoteRecordsList,{rows,kind});
    const tags=pattern=>[...html.matchAll(pattern)].map(m=>m[1].replace(/<[^>]+>/g,''));
    assert.deepEqual({h2:tags(/<h2>(.*?)<\/h2>/g).length,h3:tags(/<h3>(.*?)<\/h3>/g),dt:tags(/<dt>(.*?)<\/dt>/g),buttons:tags(/<button[^>]*>(?:<[^>]+>)*([^<]*)/g).filter(Boolean)},
      kind==='quotes'?STAFF_QUOTES:STAFF_LEADS,kind);
    assert.doesNotMatch(html,/Owner-only calculation and request evidence|Job costs/);
  }
});
// Captured from today's code for the staff record of the fixture call.
const STAFF_QUOTES={h2:2,h3:['Gate repair','Follow-up'],dt:['Customer','Phone','Email','Project location','Gate width'],buttons:['Calls','Save action']};
const STAFF_LEADS={h2:1,h3:['Follow-up'],dt:['Customer','Phone'],buttons:['Calls','Save action']};
