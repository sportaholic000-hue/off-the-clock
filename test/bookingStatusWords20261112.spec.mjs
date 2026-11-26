import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fixture} from './fixtures/bookingCalendar20261006.mjs';

// Every booking and appointment status the server can store is shown to the
// owner in plain words on the Calendar page, the Calls page, the Leads/Quotes
// booking links and the dashboard alert list. No stored code is printed.
// Stored appointment statuses (server writes): PENDING_PROVIDER (insert),
// PENDING_CONFIRMATION, CONFIRMED, CANCELLED, PROVIDER_FAILED, CONFLICTED;
// CONFIRMING is read as waiting by the server; status has no schema default
// (NULL). Preferred-time requests store REQUESTED.
// Expected words written before execution. Expected before the change: the
// Calendar page prints PENDING_PROVIDER, CONFIRMING, PROVIDER_FAILED,
// CONFLICTED and the missing status as stored, the Calls page and booking
// links print every stored code, and the dashboard shows no caller details.
const PENDING='Calendar confirmation is still pending. This appointment has not been confirmed.';
const APPOINTMENTS=[
  ['CONFIRMED','Confirmed',null],
  ['PENDING_PROVIDER','Pending confirmation',PENDING],
  ['PENDING_CONFIRMATION','Pending confirmation',PENDING],
  ['CONFIRMING','Pending confirmation',PENDING],
  ['CANCELLED','Cancelled',null],
  ['PROVIDER_FAILED','Not booked','The calendar never confirmed this booking, so it is not booked. Call the customer back to book a new time.'],
  ['CONFLICTED','Not booked','That time was no longer open when the calendar was checked, so it is not booked. Call the customer back to book a new time.'],
  [null,'Status unknown',null],
  ['SOME_FUTURE_STATUS','Status unknown',null]
];
const STORED=/\b(?:CONFIRMED|PENDING_PROVIDER|PENDING_CONFIRMATION|CONFIRMING|CANCELLED|PROVIDER_FAILED|CONFLICTED|REQUESTED|SOME_FUTURE_STATUS|site_visit_first|book_job)\b|\b[A-Z]{3,}(?:_[A-Z]+)+\b/;
const visible=html=>html.replace(/<[^>]+>/g,' ').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ');
const labels=html=>[...html.matchAll(/aria-label="([^"]*)"/g)].map(m=>m[1]).join(' | ');
const record={id:'synthetic-appointment',serviceType:null,bookingMode:'site_visit_first',tierChosen:null,customer:{name:'Sam Caller',phone:'+15065550123',email:null},
  location:{addressLine1:'1 Test Street',city:'Moncton',region:'NB',postalCode:'E1A 0A1',country:'CA'},
  startAtUtc:'2026-10-07T12:00:00.000Z',endAtUtc:'2026-10-07T12:45:00.000Z',timezone:'America/Moncton',source:null,change:null};

async function client(t){
  const vite=await createServer({root:fileURLToPath(new URL('../client',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  t.after(()=>vite.close());
  return name=>vite.ssrLoadModule(name);
}

test('Calendar page: every stored appointment status shows plain words and never the stored code',async t=>{
  const {RecordCard}=await (await client(t))('/src/calendar.jsx');
  for(const [status,label,note] of APPOINTMENTS){
    const html=renderToStaticMarkup(React.createElement(RecordCard,{record:{...record,status},timezone:'America/Moncton'}));
    const text=visible(html);
    assert.match(text,new RegExp('Sam Caller '+label+' '),String(status));
    assert.match(labels(html),new RegExp('^'+label+': Sam Caller'),String(status));
    if(note)assert.ok(text.includes(note),String(status)+' note');
    for(const [,,other] of APPOINTMENTS)if(other&&other!==note)assert.ok(!text.includes(other),String(status)+' has only its own note');
    assert.doesNotMatch(text,STORED,String(status));
    assert.doesNotMatch(labels(html),STORED,String(status));
  }
});

test('Calendar page: a requested time shows plain words',async t=>{
  const {RecordCard}=await (await client(t))('/src/calendar.jsx');
  for(const [status,label] of [['REQUESTED','Requested time'],[null,'Status unknown']]){
    const html=renderToStaticMarkup(React.createElement(RecordCard,{record:{...record,status,preferredWindows:[{date:'2026-10-07',timeOfDay:'morning'}],note:null},timezone:'America/Moncton',request:true}));
    assert.match(visible(html),new RegExp('Sam Caller '+label+' '));
    assert.doesNotMatch(visible(html),STORED);
    assert.doesNotMatch(labels(html),STORED);
  }
});

test('Calls page and booking links: stored booking statuses show the same plain words',async t=>{
  const f=fixture(t),load=await client(t);
  const {CallDetail}=await load('/src/calls.jsx'),{LeadLinks}=await load('/src/leadLinks.jsx');
  const detail=f.ownerCalls.detail({ownerId:'synthetic-a',id:'synthetic-a-call',role:'owner'});
  const bookings=APPOINTMENTS.map(([status],index)=>({...record,id:'synthetic-'+index,status,datetime:null,createdAt:'2026-10-06T12:00:00.000Z'}));
  const html=renderToStaticMarkup(React.createElement(CallDetail,{call:{...detail,bookings,
    bookingRequests:[{id:'synthetic-request',status:'REQUESTED',preferredWindows:[{date:'2026-10-07',timeOfDay:'morning'}],note:null,customer:record.customer,location:record.location}]},onRefresh:async()=>{}}));
  const calendar=visible(html.slice(html.indexOf('<h3>Calendar</h3>')));
  for(const [,label] of APPOINTMENTS)assert.ok(calendar.includes(' '+label+' '),label);
  assert.ok(calendar.includes(' Requested time '));
  assert.ok(calendar.includes(' Site visit '));
  assert.doesNotMatch(calendar,STORED);
  const links=visible(renderToStaticMarkup(React.createElement(LeadLinks,{row:{bookings}})));
  for(const [,label] of APPOINTMENTS)assert.ok(links.includes(label+' · '),label);
  assert.doesNotMatch(links,STORED);
});

test('Dashboard alert list shows the released booking in plain words with the caller details',async t=>{
  const {OwnerAlerts}=await (await client(t))('/src/ownerAlerts.jsx');
  const details=['The calendar never confirmed this booking, so it is not booked and the time was released.','Customer: Sam Caller','Phone: +15065550123',
    'Service: Cedar fence','Requested time: Wed, Oct 7, 2026, 9:00 – 9:45 AM ADT','Call the customer back to book a new time.'];
  const html=renderToStaticMarkup(React.createElement(OwnerAlerts,{alerts:[{id:'synthetic-alert',eventType:'booking.released',aggregateId:'synthetic-appointment',callId:null,
    status:'ACCEPTED',attemptCount:1,createdAt:'2026-10-06T12:00:00.000Z',seenAt:null,title:'Booking not confirmed — time released',details}],configured:true,canRetry:false}));
  const text=visible(html);
  assert.ok(text.includes('Booking not confirmed — time released · '));
  for(const line of details)assert.ok(text.includes(line),line);
  assert.ok(text.includes('Open calendar'));
  assert.doesNotMatch(text,STORED);
});
