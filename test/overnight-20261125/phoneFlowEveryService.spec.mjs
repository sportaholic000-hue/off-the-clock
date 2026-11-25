// Every live harness service, end to end by phone (November 25, 2026,
// overnight; Neon's v49 re-audit found booking bugs no test reached): publish
// the service, then the real phone tools: matchService -> getQuote (product
// and scope confirmations) -> captureLead -> checkAvailability ->
// bookAppointment. The phone price must equal the engine's customer price for
// the same answers, and the booking must be confirmed.
// Answers the app asks that the engine fixture leaves out are given to both
// (EXTRA). Excluded, with the reason (the app holds them on purpose):
// - core-roof: an engine fixture on the old roof rules; publishing through the
//   app moves a roof to the current rules, which ask how the pitch is given.
// - INTERIOR/EXTERIOR_PAINTING-itemized-control: the app holds them as NEEDS
//   PRICING until the owner confirms the additional-coat starting values.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceCallFixture,ADDRESS} from '../audit-neon-v49/voiceCallFixture.mjs';
import {baseServices} from '../invariants/harness.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

const EXTRA={'core-fence':{postalCode:'E2L 4L1'},'INTERIOR_PAINTING-installed-control':{ceilingSurfaceCondition:'fair',trimCoats:2,trimSurfaceCondition:'good'}};
const EXCLUDED=new Set(['core-roof','INTERIOR_PAINTING-itemized-control','EXTERIOR_PAINTING-itemized-control']);
const bases=baseServices();
test('the excluded services still exist (the list cannot go stale)',()=>{for(const id of EXCLUDED)assert.ok(bases.some(b=>b.id===id),id);});
for(const base0 of bases.filter(b=>!EXCLUDED.has(b.id)))test('phone, quote to booking: '+base0.id,async t=>{
  const base=structuredClone(base0);Object.assign(base.f.customerInputs,EXTRA[base.id]||{});
  const engine=sanitizeForCustomerVNext(generateQuoteVNext(structuredClone(base.f)));
  assert.equal(engine.resultType,'INSTANT_ESTIMATE_READY');
  const f=voiceCallFixture(t,{serviceCents:base.f.ownerPricing,defaultsFull:{currency:'CAD',quoteTimeZone:'America/Moncton',...structuredClone(base.f.businessDefaults)}});
  const invoke=f.call('+15065550177');
  const match=await invoke('matchService',{query:f.serviceName});assert.equal(match.status,'matched',JSON.stringify(match));
  const ci=structuredClone(base.f.customerInputs),facts=ci.confirmedFacts||{};delete ci.confirmedFacts;
  const args={serviceHandle:match.serviceHandle,customerInputs:ci,customerConfirmed:true,additionalWork:[],productConfirmations:Object.fromEntries(Object.keys(facts).map(k=>[k,true]))};
  let q=await invoke('getQuote',args);
  for(let i=0;i<3&&q.status!=='quoted'&&q.questionContract?.fields?.some(x=>x.confirmationToken);i++){args.scopeConfirmations=Object.fromEntries(q.questionContract.fields.filter(x=>x.confirmationToken).map(x=>[x.field,x.confirmationToken]));q=await invoke('getQuote',args);}
  assert.equal(q.status,'quoted',JSON.stringify([q.status,q.followUps]));
  assert.equal(q.midEstimate,engine.midEstimate);
  assert.doesNotMatch(JSON.stringify(q),/\b(?:undefined|NaN)\b|\[object /);
  const lead=await invoke('captureLead',{name:'Synthetic caller',address:{...ADDRESS,...(ci.postalCode?{postalCode:ci.postalCode}:{})}});
  const a=await invoke('checkAvailability',{quoteHandle:q.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-16',days:2}});
  assert.equal(a.status,'available',JSON.stringify(a));
  const b=await invoke('bookAppointment',{slotHandle:a.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true});
  assert.equal(b.status,'confirmed',JSON.stringify(b));assert.equal(f.events.length,1);
});
