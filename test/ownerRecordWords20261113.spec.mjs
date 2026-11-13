import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';

// Stored call, quote, lead, follow-up, staff, webhook, billing-notice and
// calendar-connection values are shown to the owner in plain words. Each known
// stored value maps to its words and an unknown value shows a plain fallback.
// Expected words written before execution. Expected before the change: the
// mapping tests fail (client/src/recordWords.js does not exist) and every page
// render prints stored codes (calls.jsx lines 84 and 90 among them); the staff
// view test passes before and after.
const STORED=/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b(?:INSTANT|PARTIAL|SENT|VIEWED|ACCEPTED|INVOICED|DISMISSED|SUPERSEDED|REVIEWED|NEW|CAPTURED|NEEDS REVIEW|OPEN|COMPLETED|CONNECTED|CONNECTING|TRANSFERRING|FALLBACK|RECOVERED|FAILED|INFO|LEAD|QUOTED|BOOKED|TRANSFERRED|SPAM|CALLBACK|COMPLAINT|PENDING|DELIVERING|DELIVERED|CANCELED|CUSTOM)\b/;
const visible=html=>html.replace(/<pre[\s\S]*?<\/pre>/g,' ').replace(/<[^>]+>/g,' ').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/\s+/g,' ');
async function client(t){
  const vite=await createServer({root:fileURLToPath(new URL('../client',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  t.after(()=>vite.close());
  return name=>vite.ssrLoadModule(name);
}
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

const CALL_STATUS={CONNECTING:'Connecting',CONNECTED:'In progress',TRANSFERRING:'Transferring to you',HUMAN_ROUTING:'Rang through to you',COMPLETED:'Completed',
  FALLBACK:'Taken as a message on the backup line',RECOVERED:'Stopped when the service restarted',FAILED:'Ended early'};
const CALL_OUTCOME={INFO:'Answered by the receptionist',LEAD:'Lead saved',QUOTED:'Quote given',QUOTE_REQUEST:'Quote requested',BOOKED:'Booked',TRANSFERRED:'Transferred to you',
  TRANSFER_CONNECTED:'Transferred to you',SPAM:'Marked as spam',SPAM_FILTERED:'Marked as spam',OPERATOR_OFF:'Rang through to you (answering was off)',AI_FALLBACK:'Taken as a message on the backup line',
  VOICE_DISABLED:'The receptionist was unavailable for this call.',RECEPTIONIST_ENDED_CALL:'The receptionist ended the call.'};
const TRANSPORT={RECEPTIONIST_ENDED_CALL:'The receptionist ended the call.',CALLER_SILENT:'The caller stayed silent.',TWILIO_STOP:'The phone call ended.',
  VOICE_TRANSPORT_CLOSED:'The phone connection closed.',FALLBACK_REQUEST_CAPTURED:'The caller left a request on the backup line.',
  GEMINI_SESSION_CLOSED:"The receptionist's connection closed unexpectedly.",TWILIO_SOCKET_CLOSED:'The phone connection closed unexpectedly.',
  APPLICATION_CLOSE:'The receptionist stopped when the service restarted.',SESSION_PERSISTENCE_FAILED:'The receptionist could not save the final call details.'};
const QUOTE_STATUS={INSTANT:'Priced instantly',PARTIAL:'Partly priced; the rest needs your review',INSTANT_ESTIMATE_READY:'Priced instantly',
  PARTIAL_ESTIMATE_READY:'Partly priced; the rest needs your review',ESTIMATE_REQUIRES_REVIEW:'Needs review',SENT:'Sent',VIEWED:'Viewed',ACCEPTED:'Accepted',
  INVOICED:'Invoiced',DISMISSED:'Dismissed',SUPERSEDED:'Replaced by a reviewed quote'};
const LEAD_STATUS={NEW:'New',CAPTURED:'Saved from a call','NEEDS REVIEW':'Needs review',DISMISSED:'Dismissed',REVIEWED:'Reviewed'};
const LEAD_TYPE={voice_lead:'Phone call',AI_FALLBACK:'Backup line message',quote_review:'Quote review',additional_work:'Additional work',widget_quote:'Website quote',CALLBACK:'Callback request',COMPLAINT:'Complaint'};
const URGENCY={active_leak:'Active leak',flooding:'Flooding',safety:'Safety issue',complaint:'Complaint'};
const ROLE={user:'Caller',caller:'Caller',model:'Receptionist',assistant:'Receptionist'};
const FOLLOW_UP={OPEN:'Open',COMPLETED:'Completed',DISMISSED:'Dismissed'};
const STAFF={active:'Active',pending:'Invitation sent',suspended:'Suspended'};
const WEBHOOK_EVENT={'lead.created':'New lead','quote.requested':'New quote request','appointment.booked':'Confirmed booking'};
const WEBHOOK_STATUS={PENDING:'Waiting to send',DELIVERING:'Sending',DELIVERED:'Delivered',FAILED:'Not delivered',CANCELED:'Cancelled'};
const WEBHOOK_ERROR={ACCOUNT_ACCESS_PAUSED:'Waiting for account access',WEBHOOK_DESTINATION_BLOCKED:'Your webhook address is not allowed.',
  WEBHOOK_DNS_FAILED:'Your webhook address could not be found.',WEBHOOK_DNS_TIMEOUT:'Looking up your webhook address took too long.',
  WEBHOOK_TIMEOUT:'Your system did not answer in time.',WEBHOOK_HTTP_FAILED:'Your system did not accept the delivery.',WEBHOOK_DELIVERY_FAILED:'The delivery could not be completed.'};
const CALENDAR={connected:'Connected',not_connected:'Not connected',skipped:'Skipped',pending_oauth:'Waiting for Google sign-in'};
const UNKNOWN='SOME_FUTURE_CODE';

test('every stored value maps to its words and an unknown value to the fallback',async t=>{
  const w=await (await client(t))('/src/recordWords.js');
  const check=(fn,map,fallback)=>{for(const [code,words] of Object.entries(map))assert.equal(w[fn](code),words,fn+' '+code);
    for(const unknown of [UNKNOWN,null,undefined])assert.equal(w[fn](unknown),fallback,fn+' unknown');};
  check('callStatusWords',CALL_STATUS,'Status unknown');
  check('callOutcomeWords',CALL_OUTCOME,'Outcome unknown');
  check('transportOutcomeWords',TRANSPORT,'Outcome unknown');
  check('quoteStatusWords',QUOTE_STATUS,'Status unknown');
  check('leadStatusWords',LEAD_STATUS,'Status unknown');
  check('leadTypeWords',LEAD_TYPE,'Type unknown');
  check('urgencyWords',URGENCY,'Urgent');
  check('transcriptRoleWords',ROLE,'Speaker');
  check('followUpStatusWords',FOLLOW_UP,'Status unknown');
  check('staffStatusWords',STAFF,'Status unknown');
  check('webhookEventWords',WEBHOOK_EVENT,'Other event');
  check('webhookStatusWords',WEBHOOK_STATUS,'Status unknown');
  check('webhookErrorWords',WEBHOOK_ERROR,'The delivery did not go through.');
  check('calendarConnectionWords',CALENDAR,'Status unknown');
  assert.equal(w.callResultWords({outcome:'QUOTED',status:'COMPLETED'}),'Quote given');
  assert.equal(w.callResultWords({outcome:null,status:'CONNECTED'}),'In progress');
  assert.equal(w.callResultWords({}),'Not recorded');
  for(const [code,words] of [['DISMISSED','Dismissed'],['INSTANT','Priced instantly'],['NEEDS REVIEW','Needs review'],['REVIEWED','Reviewed'],[null,'Not recorded'],[UNKNOWN,'Status unknown']])
    assert.equal(w.recordStageWords(code),words);
  for(const [code,words] of [['FENCING_INSTALL','Fencing install'],['CUSTOM','Custom'],['Gate repair','Gate repair'],[null,null]])assert.equal(w.serviceWords(code),words);
});

function callWith(detail){
  const quotes=Object.keys(QUOTE_STATUS).map((status,index)=>({...detail.quotes[0],id:'q'+index,status,serviceType:'FENCING_INSTALL'}));
  const leads=Object.keys(LEAD_STATUS).flatMap((status,i)=>Object.keys(LEAD_TYPE).map((type,j)=>({...detail.leads[0],id:'l'+i+'-'+j,status,type,urgency:null})));
  return {...detail,status:'COMPLETED',outcome:'QUOTED',transportOutcome:'RECEPTIONIST_ENDED_CALL',urgency:'active_leak',failureCode:null,
    transcript:[{role:'user',text:'[SYNTHETIC] Hello'},{role:'model',text:'[SYNTHETIC] Hi'}],quotes,leads};
}

test('Calls page: call, quote and lead fields show plain words and no stored code',async t=>{
  const {service}=ownerCallFixture(),load=await client(t);
  const {CallDetail,CallFeed,CallFilters,transcriptText}=await load('/src/calls.jsx');
  const call=callWith(service.detail({ownerId:'synthetic-a',id:'synthetic-a-call',role:'owner'}));
  const text=visible(render(CallDetail,{call,onRefresh:async()=>{}}).replace(/<details>[\s\S]*?<\/details>/g,' '));
  for(const words of ['Quote given','Completed','The receptionist ended the call.','Active leak','Caller: ','Receptionist: ','Fencing install'])assert.ok(text.includes(words),words);
  for(const words of Object.values(QUOTE_STATUS))assert.ok(text.includes(words+' · '),words);
  for(const status of Object.values(LEAD_STATUS))for(const type of Object.values(LEAD_TYPE))assert.ok(text.includes(status+' · '+type),status+' · '+type);
  assert.doesNotMatch(text,STORED);
  assert.match(transcriptText(call),/\n\nCaller: \[SYNTHETIC\] Hello\n\nReceptionist: \[SYNTHETIC\] Hi$/);
  // A failed call keeps its failure sentence and its labelled support code.
  const failed=visible(render(CallDetail,{call:{...call,status:'FALLBACK',outcome:'VOICE_DISABLED',failureCode:'VOICE_DISABLED'},onRefresh:async()=>{}}));
  assert.ok(failed.includes('The receptionist was unavailable for this call.'));
  assert.ok(failed.includes('Technical detail VOICE_DISABLED'));
  const feed=visible(render(CallFeed,{calls:[{id:'c1',createdAt:'2026-10-06T00:00:00.000Z',ownerTimezone:'UTC',duration:30,summaryText:'[SYNTHETIC] Call',outcome:'BOOKED',status:'COMPLETED',urgency:'flooding',spamFiltered:0}]}));
  assert.ok(feed.includes('Booked'));assert.ok(feed.includes('Urgency: Flooding'));assert.doesNotMatch(feed,STORED);
  const filters=render(CallFilters,{value:{},onChange:()=>{},onApply:()=>{},choices:{statuses:['COMPLETED','FALLBACK'],outcomes:['QUOTED','OPERATOR_OFF'],services:['FENCING_INSTALL']}});
  for(const [value,words] of [['COMPLETED','Completed'],['FALLBACK','Taken as a message on the backup line'],['QUOTED','Quote given'],['OPERATOR_OFF','Rang through to you (answering was off)'],['FENCING_INSTALL','Fencing install']])
    assert.ok(filters.includes(`<option value="${value}">${words.replace(/\(/g,'(')}</option>`),value);
});

test('Quotes and Leads pages: statuses, types and follow-up history show plain words',async t=>{
  const {service}=ownerCallFixture(),load=await client(t);
  const {QuoteRecordsList}=await load('/src/quotedone.jsx');
  const call=callWith(service.detail({ownerId:'synthetic-a',id:'synthetic-a-call',role:'owner'}));
  const strip=html=>visible(html.replace(/<details>[\s\S]*?<\/details>/g,' ').replace(/<select[\s\S]*?<\/select>/g,' '));
  const quotes=strip(render(QuoteRecordsList,{rows:call.quotes.map(row=>({...row,workflow:{version:1,followUpAction:'CALL_BACK',followUpStatus:'OPEN',history:[]}})),kind:'quotes'}));
  for(const words of Object.values(QUOTE_STATUS))assert.ok(quotes.includes(words+' · '),words);
  assert.ok(quotes.includes('Call back · Open'));
  assert.doesNotMatch(quotes,STORED);
  const leads=strip(render(QuoteRecordsList,{rows:call.leads.map(row=>({...row,workflow:{version:1,followUpAction:'BOOK',followUpStatus:'COMPLETED',history:[]}})),kind:'leads'}));
  for(const words of Object.values(LEAD_STATUS))assert.ok(leads.includes(words+' · '),words);
  assert.ok(leads.includes('Book · Completed'));
  assert.doesNotMatch(leads,STORED);
  const {OwnerRecordActions}=await load('/src/ownerRecordActions.jsx');
  const history=visible(render(OwnerRecordActions,{row:{id:'r',status:'SENT',workflow:{version:2,followUpAction:'CALL_BACK',followUpStatus:'DISMISSED',history:[
    {id:'h1',createdAt:'2026-10-06T00:00:00.000Z',action:'SENT',fromStatus:'INSTANT',toStatus:'SENT',note:'[SYNTHETIC] shared'},
    {id:'h2',createdAt:'2026-10-06T00:00:00.000Z',action:'FUTURE_ACTION',fromStatus:null,toStatus:UNKNOWN,note:'[SYNTHETIC] other'}]}},kind:'quotes'}).replace(/<select[\s\S]*?<\/select>/g,' '));
  assert.ok(history.includes('Call back · Dismissed'));
  assert.ok(history.includes('Record quote shared · Priced instantly → Sent'));
  assert.ok(history.includes('Other action · Not recorded → Status unknown'));
  assert.doesNotMatch(history,STORED);
});

test('Team, webhook deliveries, billing notices, dashboard calendar and reports show plain words',async t=>{
  const load=await client(t);
  const {TeamMembers}=await load('/src/team.jsx');
  const team=visible(render(TeamMembers,{staff:Object.keys(STAFF).concat(['retired']).map((status,i)=>({id:'s'+i,name:'[SYNTHETIC] Staff '+i,email:'s'+i+'@example.invalid',status,inviteStatus:status==='pending'?'pending':'accepted',reason:null})),busy:false,action:()=>{}}));
  for(const [i,words] of [...Object.values(STAFF),'Status unknown'].entries())assert.ok(team.includes('s'+i+'@example.invalid · '+words),words);
  assert.doesNotMatch(team,/· (active|pending|suspended|retired)\b/);
  const {RecentWebhookDeliveries,WebhookDeliveryHistory}=await load('/src/ownerIntegrations.jsx');
  const deliveries=Object.keys(WEBHOOK_STATUS).map((status,i)=>({id:'d'+i,eventType:Object.keys(WEBHOOK_EVENT)[i%3],status,attemptCount:1,lastHttpStatus:null,lastErrorCode:Object.keys(WEBHOOK_ERROR)[i]}));
  for(const html of [render(RecentWebhookDeliveries,{deliveries,busy:false,onRetry:()=>{}}),render(WebhookDeliveryHistory,{deliveries,busy:false,onRetry:()=>{}})]){
    const text=visible(html);
    for(const words of [...Object.values(WEBHOOK_STATUS),...Object.values(WEBHOOK_EVENT)])assert.ok(text.includes(words),words);
    assert.doesNotMatch(text,STORED);assert.doesNotMatch(text,/lead\.created|quote\.requested|appointment\.booked/);
  }
  assert.ok(visible(render(WebhookDeliveryHistory,{deliveries,busy:false,onRetry:()=>{}})).includes('Your webhook address is not allowed.'));
  const {BillingNotices}=await load('/src/billing.jsx');
  const notices=visible(render(BillingNotices,{notices:['PENDING','ACCEPTED','DELIVERED','BOUNCED','SUPPRESSED',null,UNKNOWN].map((emailStatus,i)=>({id:'n'+i,message:'[SYNTHETIC] notice '+i,emailStatus}))}));
  for(const words of ['Email: Sending','Email: Sent','Email: Delivered','Email: Email bounced','Email: Stopped','Email: Status unavailable'])assert.ok(notices.includes(words),words);
  assert.doesNotMatch(notices,STORED);
  const {calendarFact}=await load('/src/dashboard.jsx');
  for(const [code,words] of [...Object.entries(CALENDAR),[undefined,'Not connected'],[UNKNOWN,'Status unknown']])assert.equal(calendarFact(code),words.toUpperCase(),String(code));
  const {ReportView}=await load('/src/reports.jsx');
  const report={counts:{answered:0,calls:0,spam:0,quotes:0,bookings:0,billedMinutes:0},range:{fromDate:null,toDate:null,timezone:'UTC'},afterHours:{count:0,unknown:0,duringHours:0,basis:''},
    values:{quoted:[],booked:[],invoiced:[]},excludedValues:{quoted:{partial_scope:1,[UNKNOWN]:2},booked:{},invoiced:{}},funnel:[],followUp:{open:0,overdue:0,items:[]},jobMetrics:[],valueBasis:'',funnelBasis:''};
  const reportText=visible(render(ReportView,{report}));
  assert.ok(reportText.includes('Partial scope: 1 excluded'));assert.ok(reportText.includes('Other reason: 2 excluded'));
  // The report's counter labels are capitalised words (CALLS ANSWERED, SPAM); only stored codes are checked here.
  assert.doesNotMatch(reportText,/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/);
});

test('staff view is unchanged: same sections, labels and buttons; no owner-only parts',async t=>{
  const {service}=ownerCallFixture(),load=await client(t);
  const {CallDetail}=await load('/src/calls.jsx'),{QuoteRecordsList}=await load('/src/quotedone.jsx');
  const call=service.detail({ownerId:'synthetic-a',id:'synthetic-a-call',role:'staff'});
  const html=render(CallDetail,{call,onRefresh:async()=>{}});
  const tags=(pattern)=>[...html.matchAll(pattern)].map(m=>m[1].replace(/<[^>]+>/g,''));
  const headings=tags(/<h3>(.*?)<\/h3>/g);
  assert.deepEqual(headings.filter(h=>['Summary','Transcript','Quotes','Leads','Quote requests','Calendar'].includes(h)),['Summary','Transcript','Quotes','Leads','Quote requests','Calendar']);
  assert.equal(headings.length,11);
  assert.deepEqual(tags(/<dt>(.*?)<\/dt>/g),['Created','Status','Outcome','Duration','Billed minutes','Transport outcome','Call provider ID','Stream ID','Destination number','Urgency',
    'Gate width','Customer','Phone','Requested work','Start','End','Timezone','Booking mode','Tier chosen','Customer','Project location','Start','End','Timezone','Booking mode','Tier chosen','Customer','Project location','Customer','Project location']);
  // Alert rows are ordered by random ids at equal times, so compare the button set.
  assert.deepEqual(tags(/<button[^>]*>(?:<[^>]+>)*([^<]*)/g).filter(Boolean).sort(),['All alerts','All unresolved alerts','Calendar','Download transcript','Leads','Open call','Open call','Open call','Open call','Open call','Open confirmed booking','Print transcript / PDF','Quotes']);
  assert.doesNotMatch(html,/Owner-only calculation and request evidence|Mark as spam|Retry owner alert/);
  const quotes=render(QuoteRecordsList,{rows:call.quotes,kind:'quotes'}),leads=render(QuoteRecordsList,{rows:call.leads,kind:'leads'});
  for(const page of [quotes,leads])assert.doesNotMatch(page,/Owner-only calculation and request evidence|Job costs/);
});
