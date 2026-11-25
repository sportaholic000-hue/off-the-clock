// Every live harness service through the website and through a caller with a
// blocked number (November 25, 2026, overnight). Website: prepare intake and
// submit; the customer's price (or, on a partial quote for an unpriced extra,
// the priced part) equals the engine's customer price. Blocked number: the
// caller gives a callback number, is quoted the engine's price, and the
// booking is confirmed (Neon v49 NEW-2/NEW-3 class). Same answers and
// exclusions as phoneFlowEveryService.spec.mjs.
import '../pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {voiceCallFixture,ADDRESS} from '../audit-neon-v49/voiceCallFixture.mjs';
import {baseServices} from '../invariants/harness.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {submitQuote} from '../../server/src/quoteDoneRoutes.js';
import {loadPricebook} from '../../server/priceBookService.js';
import {publish,fixture as webFixture,date,db as webDb} from '../quoteDeliveryBatch20261015Fixture.mjs';
import {after} from 'node:test';
const cleanup=[],webBase=webFixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);after(()=>{for(const fn of cleanup.reverse())fn();});
const EXTRA={'core-fence':{postalCode:'E2L 4L1'},'INTERIOR_PAINTING-installed-control':{ceilingSurfaceCondition:'fair',trimCoats:2,trimSurfaceCondition:'good'}};
const EXCLUDED=new Set(['core-roof','INTERIOR_PAINTING-itemized-control','EXTERIOR_PAINTING-itemized-control']);
const rows=[];
const ALL=baseServices();
test('the excluded services still exist',()=>{for(const id of EXCLUDED)assert.ok(ALL.some(b=>b.id===id),id);});
for(const base0 of ALL.filter(b=>!EXCLUDED.has(b.id)))test(base0.id,async t=>{
  const base=structuredClone(base0);Object.assign(base.f.customerInputs,EXTRA[base.id]||{});const r={id:base.id};rows.push(r);
  {
    r.engine=sanitizeForCustomerVNext(generateQuoteVNext(structuredClone(base.f))).midEstimate;
    const f=voiceCallFixture(t,{serviceCents:base.f.ownerPricing,defaultsFull:{currency:'CAD',quoteTimeZone:'America/Moncton',...structuredClone(base.f.businessDefaults)}});
    // web: the published-owner fixture used by the delivery tests
    {const clean=structuredClone(base.f);delete clean.ownerPricing.zeroPricePolicy;delete clean.ownerPricing.dependentLineState;delete clean.ownerPricing.startingValueState;delete clean.ownerPricing.startingValueAdoptions;
     publish('synthetic-a',clean,{roofRuleMode:'new'});const service=loadPricebook('synthetic-a').services[0];
     webDb.prepare("INSERT OR IGNORE INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run('synthetic-a',service.id,date.quoteInstant);
     const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(base.f.customerInputs),customerFeeSelections:{},additionalWork:[],contact:{email:'caller@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
     const prepared=bridge.prepareApplicationIntake('synthetic-a',body,date);
     if(prepared.status!=='ready')r.web='prepare:'+prepared.status+' '+JSON.stringify(prepared.missingCustomerFields||prepared).slice(0,200);
     else{const resp=submitQuote('synthetic-a',{...body,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});const resp2=resp.response||{};r.webJunk=/\b(?:undefined|NaN)\b|\[object /.test(JSON.stringify(resp2));r.web=resp2.resultType==='PARTIAL_ESTIMATE_READY'?resp2.pricedEstimate?.midEstimate:resp2.midEstimate;r.webType=resp2.resultType;}}
    // withheld caller
    const invoke=f.call('anonymous');
    const match=await invoke('matchService',{query:f.serviceName});
    const ci=structuredClone(base.f.customerInputs),facts=ci.confirmedFacts||{};delete ci.confirmedFacts;
    const args={serviceHandle:match.serviceHandle,customerInputs:ci,customerConfirmed:true,additionalWork:[],callbackPhone:'+15065550199',productConfirmations:Object.fromEntries(Object.keys(facts).map(k=>[k,true]))};
    let q=await invoke('getQuote',args);
    for(let i=0;i<3&&q.status!=='quoted'&&q.questionContract?.fields?.some(x=>x.confirmationToken);i++){args.scopeConfirmations=Object.fromEntries(q.questionContract.fields.filter(x=>x.confirmationToken).map(x=>[x.field,x.confirmationToken]));q=await invoke('getQuote',args);}
    r.anon=q.status==='quoted'?q.midEstimate:'q:'+q.status+' '+JSON.stringify(q.followUps);
    if(q.status==='quoted'){
      const lead=await invoke('captureLead',{name:'Synthetic caller',phone:'+15065550199',address:{...ADDRESS,...(ci.postalCode?{postalCode:ci.postalCode}:{})}});
      const a=await invoke('checkAvailability',{quoteHandle:q.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-16',days:2}});
      const b=a.status==='available'?await invoke('bookAppointment',{slotHandle:a.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true}):a;
      r.anonBook=b.status;
    }
  }
  assert.equal(r.web,r.engine,JSON.stringify(r));assert.equal(r.webJunk,false,'missing value in the website text');assert.ok(['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(r.webType),r.webType);
  assert.equal(r.anon,r.engine,JSON.stringify(r));assert.equal(r.anonBook,'confirmed');
});
