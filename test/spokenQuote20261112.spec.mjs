import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {compileVoiceSystemInstruction,transcriptionNoticeKind,VOICE_GUIDE_SERVICE_TYPES} from '../server/src/voice/voicePromptCompiler.js';
import {phone,quoteEmailFixture,publicCopy} from './quoteDeliveryBatch20261015Fixture.mjs';
import {roofFixture} from '../verification/qe-roof-underlayment-20261018/roof-fixture.mjs';
import {fenceFixture} from './fenceLaneB20261016Fixture.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {fixtureFor} from '../verification/qe-concrete-base-scope-20261018/fixtures.mjs';
import {mowing,custom} from '../verification/engine-independent/fixtures.mjs';

// Owner request 2026-11-12: callers hear a short spoken price, not the written
// quote. Expected sentences are the owner's own wording, written before running.
// Synthetic price books only; nothing calls the live voice or the website demo.
const MEASURED="That's based on the measurements you gave me, and it gets confirmed on site before any work starts.";
const UNMEASURED='It gets confirmed on site before any work starts.';
const OPTIONS='It all gets confirmed on site before any work starts.';
const OPTIONS_ESTIMATED="That's all based on the measurements you gave me, and it all gets confirmed on site before any work starts.";
const HANDLE='h'.repeat(43);
const TAX='Includes applicable tax.',PLUS='Tax excluded; added to the invoice.',NONE='No tax added.';
function quote({options,taxTreatment=TAX,currency='CAD',priceDrivers=[],skippedAddons=[],...rest}){
  const priced=options.map(([tierName,lowEstimate,highEstimate=lowEstimate,optionSkipped=skippedAddons])=>({tierName,lowEstimate,midEstimate:lowEstimate,highEstimate,taxTreatment,currency,priceDrivers,skippedAddons:optionSkipped,disclaimer:'[SYNTHETIC] Written qualification.'}));
  return {resultType:'INSTANT_ESTIMATE_READY',lowEstimate:priced[0].lowEstimate,midEstimate:priced[0].midEstimate,highEstimate:priced[0].highEstimate,currency,taxTreatment,priceDrivers,skippedAddons:[],options:priced,disclaimer:'[SYNTHETIC] Written qualification.',...rest};
}
const spoken=(response,options={})=>projectVoiceToolResult('getQuote',projectVoiceQuote(response,HANDLE,[],{businessCurrency:'CAD',measured:true,...options})).spokenQuote;
const dollars=value=>'$'+new Intl.NumberFormat('en-US',{minimumFractionDigits:Number.isInteger(value)?0:2,maximumFractionDigits:2}).format(value);
const said=text=>text.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)||[];
function engineAmounts(result){
  const ranges=[...(result.options?.length?result.options:[result]),...(result.options||[]).map(option=>option.firstVisit).filter(Boolean),...(result.firstVisit?[result.firstVisit]:[])];
  return new Set(ranges.flatMap(range=>[range.lowEstimate,range.highEstimate]).map(dollars));
}
function amountsMatch(result){
  const allowed=engineAmounts(result),heard=said(result.spokenQuote.spokenPrice);
  assert.ok(heard.length>0,'a price is spoken');
  for(const amount of heard)assert.ok(allowed.has(amount),amount+' is one of the engine amounts '+[...allowed].join(', '));
  for(const option of result.options?.length?result.options:[result])for(const value of [option.lowEstimate,option.highEstimate])assert.ok(heard.includes(dollars(value)),dollars(value)+' is spoken');
}

test('spokenPrice: one amount, tax included, no currency code for the business default',()=>{
  const result=spoken(quote({options:[[null,4370]]}));
  assert.equal(result.spokenPrice,"For that, you're looking at $4,370, tax included. "+MEASURED);
  assert.doesNotMatch(result.spokenPrice,/ to |CAD|USD/);
});

test('spokenPrice: a range plus tax, and a no-tax quote says no tax is added',()=>{
  assert.equal(spoken(quote({options:[[null,1200,1450.5]],taxTreatment:PLUS})).spokenPrice,"For that, you're looking at $1,200 to $1,450.50, plus tax. "+MEASURED);
  assert.equal(spoken(quote({options:[[null,4250]],taxTreatment:NONE})).spokenPrice,"For that, you're looking at $4,250, with no tax added. "+MEASURED);
});

test('spokenPrice: two options with tax included and three options plus tax',()=>{
  assert.equal(spoken(quote({options:[['Basic',126.5],['Premium',184]]})).spokenPrice,
    'I can do that two ways. Basic is $126.50 and Premium is $184, both with tax included. '+OPTIONS);
  assert.equal(spoken(quote({options:[['Good',900,1000],['Better',1100,1250.25],['Best',1400,1600]],taxTreatment:PLUS})).spokenPrice,
    'I can do that three ways. Good is $900 to $1,000, Better is $1,100 to $1,250.25 and Best is $1,400 to $1,600, all plus tax. '+OPTIONS);
});

test('spokenPrice: caller estimates, measurement-free work and another currency',()=>{
  assert.equal(spoken(quote({options:[['Basic',126.5],['Premium',184]]}),{callerMeasurementsEstimated:true}).spokenPrice,
    'I can do that two ways. Basic is $126.50 and Premium is $184, both with tax included. '+OPTIONS_ESTIMATED);
  assert.equal(spoken(quote({options:[[null,4370]]}),{callerMeasurementsEstimated:true,measured:false}).spokenPrice,"For that, you're looking at $4,370, tax included. "+MEASURED);
  assert.equal(spoken(quote({options:[[null,125]]}),{measured:false}).spokenPrice,"For that, you're looking at $125, tax included. "+UNMEASURED);
  assert.equal(spoken(quote({options:[[null,4370]],currency:'USD'})).spokenPrice,"For that, you're looking at $4,370, tax included. That's in US dollars. "+MEASURED);
  assert.equal(spoken(quote({options:[['Basic',126.5],['Premium',184]],currency:'USD'})).spokenPrice,'I can do that two ways. Basic is $126.50 and Premium is $184, both with tax included. Those are in US dollars. '+OPTIONS);
});

test('spokenExclusions only when the quote leaves something out',()=>{
  assert.equal(spoken(quote({options:[[null,4370]]})).spokenExclusions,undefined);
  assert.equal(spoken(quote({options:[[null,4370]],skippedAddons:['Base gravel material','Power washing']})).spokenExclusions,
    "Just so you know, that doesn't include base gravel material and power washing.");
  assert.equal(spoken(quote({options:[['Gravel only',9234.5,9234.5,['Base excavation and grading labor']],['Both components',10062.5,10062.5,[]]]})).spokenExclusions,
    "Just so you know, Gravel only doesn't include base excavation and grading labor.");
  const partial={resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:quote({options:[[null,100]]}),additionalWork:[{source:'additionalWork[0]',description:'[SYNTHETIC] caller words about a stump'}],additionalWorkStatus:'ON_SITE_ESTIMATE_REQUIRED'};
  const result=spoken(partial);
  assert.equal(result.spokenExclusions,"Just so you know, that doesn't include the other work you mentioned.");
  assert.doesNotMatch(JSON.stringify(result),/stump/);
});

test('spokenDrivers uses at most two of the quote priceDrivers',()=>{
  const four=['600 measured square feet at 4 inches thick','100 measured linear feet of formwork','Concrete mix: test mix','broom finish'];
  assert.equal(spoken(quote({options:[[null,1]],priceDrivers:four})).spokenDrivers,'The biggest factors are 600 measured square feet at 4 inches thick and 100 measured linear feet of formwork.');
  assert.equal(spoken(quote({options:[[null,1]],priceDrivers:['Measured roof area: 21.21 roofing squares']})).spokenDrivers,'The biggest factor is measured roof area: 21.21 roofing squares.');
  assert.equal(spoken(quote({options:[[null,1]],priceDrivers:['Any additional decking is priced per sheet and confirmed on site.','1 existing layer']})).spokenDrivers,'The biggest factor is 1 existing layer.');
  assert.equal(spoken(quote({options:[[null,1]]})).spokenDrivers,undefined);
});

// Real quote path: real engine, real voice runtime and dispatcher, synthetic books.
const withTax=f=>{Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:15});return f;};
const REAL={
  'roofing replacement':()=>{const f=withTax(roofFixture({customer:{serviceScope:'full'}}));delete f.ownerPricing.startingValueAdoptions;return [f,{applicationOptions:{roofRuleMode:'new'}}];},
  'fence install':()=>{const f=fenceFixture('installed');Object.assign(f.customerInputs,{linearFeet:100,lfMethod:'exact',gates:{walk:1}});return [f,{}];},
  'interior painting':()=>[withTax(offeringFixture('INTERIOR_PAINTING','installed')),{}],
  'interior painting range':()=>{const f=withTax(offeringFixture('INTERIOR_PAINTING','installed'));f.businessDefaults.rangeBufferPercent=10;return [f,{}];},
  'concrete driveway':()=>[withTax(fixtureFor('CONCRETE_DRIVEWAY','both')),{}],
  'concrete driveway, base labor unpriced':()=>[withTax(fixtureFor('CONCRETE_DRIVEWAY','gravel')),{}],
  'concrete driveway, three options':()=>[withTax(fixtureFor('CONCRETE_DRIVEWAY','options')),{}],
  'mowing, two options':()=>{const f=withTax(mowing());f.ownerPricing.tiers=[{name:'Standard',overrides:{}},{name:'Premium',overrides:{mowingBaseRatePerSqft:3}}];return [f,{}];},
  'custom fixed visit':()=>[custom(),{}],
};
const taxWords={[TAX]:'tax included',[NONE]:'with no tax added'},groupTaxWords={[TAX]:'with tax included',[NONE]:'with no tax added'};
for(const [name,make] of Object.entries(REAL))test('real quote path: '+name+' returns spokenQuote from the engine fields',async t=>{
  const [f,options]=make(),h=quoteEmailFixture(t),{result}=await phone(h,f,options);
  assert.equal(result.status,'quoted',JSON.stringify(result));
  assert.ok(result.spokenQuote,'getQuote returns spokenQuote');
  assert.deepEqual(Object.keys(result.spokenQuote).filter(key=>!['spokenPrice','spokenExclusions','spokenDrivers'].includes(key)),[]);
  amountsMatch(result);
  const many=result.options.length>1,first=result.options[0];
  assert.doesNotMatch(result.spokenQuote.spokenPrice,/CAD|USD|Customer confirmed|quantity unit|preliminary estimate|Priced scope/);
  if(!many){
    const range=first.lowEstimate===first.highEstimate?dollars(first.lowEstimate):dollars(first.lowEstimate)+' to '+dollars(first.highEstimate);
    const unit=first.priceUnit&&first.priceUnit!=='per job'?' '+first.priceUnit:'';
    assert.equal(result.spokenQuote.spokenPrice,"For that, you're looking at "+range+unit+', '+taxWords[result.taxTreatment]+'. '+(f.serviceType==='CUSTOM'?UNMEASURED:MEASURED));
  }else{
    assert.ok(result.spokenQuote.spokenPrice.startsWith('I can do that '+(result.options.length===2?'two':'three')+' ways. '));
    for(const option of result.options)assert.ok(result.spokenQuote.spokenPrice.includes(option.tierName+' is '+dollars(option.lowEstimate)));
    assert.ok(result.spokenQuote.spokenPrice.endsWith((result.options.length===2?'both ':'all ')+groupTaxWords[result.taxTreatment]+'. '+OPTIONS));
  }
  const excluded=[...new Set([...result.skippedAddons,...result.options.flatMap(option=>option.skippedAddons)])];
  if(excluded.length){for(const item of excluded)assert.match(result.spokenQuote.spokenExclusions,new RegExp(item.slice(1).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}
  else assert.equal(result.spokenQuote.spokenExclusions,undefined);
  const drivers=result.priceDrivers.filter(value=>!/[.!?;]$/.test(value)).slice(0,2);
  if(drivers.length)for(const driver of drivers)assert.ok(result.spokenQuote.spokenDrivers.includes(driver.slice(1)),driver);
  else assert.equal(result.spokenQuote.spokenDrivers,undefined);
  // The full written quote is unchanged and still returned for the email.
  assert.ok(result.quoteNarration.startsWith(result.voiceSummary));
});

test('the quote email still carries the complete quoteNarration, not the spoken price',async t=>{
  const h=quoteEmailFixture(t),p=await phone(h,withTax(fixtureFor('CONCRETE_DRIVEWAY','options')));
  assert.equal(p.result.status,'quoted');
  const prepared=await h.tool('prepareQuoteEmail',{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'});
  await h.tool('sendQuoteEmail',{emailConfirmationHandle:prepared.emailConfirmationHandle,customerConfirmed:true});
  await h.emailService().dispatchOnce();assert.equal(h.sends(),1);
  const {copy,message}=publicCopy(h.emailService(),h.rows()[0]);
  assert.equal(copy.narration,p.result.quoteNarration);
  assert.ok(message.text.includes(p.result.quoteNarration));
  assert.ok(p.result.quoteNarration.includes('Includes applicable tax. Prices are in Canadian dollars (CAD).'));
  assert.equal(message.text.includes(p.result.spokenQuote.spokenPrice),false);
});

const GUIDE=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const PLANS={starter:{booking:false,transfer:false,phoneQuoting:false},operator:{booking:true,transfer:true,phoneQuoting:false},quoteDone:{booking:true,transfer:true,phoneQuoting:true}};
function compile(plan,notice){
  const capabilities=PLANS[plan];
  const services=capabilities.phoneQuoting?VOICE_GUIDE_SERVICE_TYPES.map(serviceType=>({serviceType,serviceLabel:'[SYNTHETIC] '+serviceType.toLowerCase().replaceAll('_',' '),active:true,status:'QUOTING LIVE',offerings:[]})):[];
  return compileVoiceSystemInstruction({guideText:GUIDE,business:{businessName:'[SYNTHETIC] Harbour Services',agentName:'Nova'},services,capabilities,transcriptionNotice:transcriptionNoticeKind(notice,capabilities)});
}
test('QuoteDone instructions use spokenPrice instead of reading quoteNarration',()=>{
  const text=compile('quoteDone',false),flat=text.replace(/\s+/g,' ');
  assert.equal(flat.includes('Read quoteNarration exactly'),false);
  assert.equal(flat.includes("you're looking at $X to $Y. The big factors are"),false);
  assert.ok(flat.includes('Present a getQuote price by saying spokenQuote.spokenPrice exactly as written; never change, round, combine or add an amount'));
  assert.ok(flat.includes('Never read quoteNarration aloud; it is the written copy.'));
  assert.ok(flat.includes('When spokenQuote.spokenExclusions is present, say it right after the price.'));
  assert.ok(flat.includes('say spokenQuote.spokenDrivers only if the caller asks why it costs that much'));
  assert.ok(flat.includes('"Want me to email you a written copy with all the details?"'));
  assert.ok(flat.includes('"Which sounds better?"'));
});
test('Starter and Operator instructions are byte-for-byte unchanged',()=>{
  // SHA-256 of the compiled instructions at c84753f8, before this change.
  const before={starter:['26ab4834e89f24ccef6f60c9534c771e472af940531460119c0523a23afb07a1','23ba4a2b44ac47f09530292f41233b8005d1b57b42dc34b573b57f142acffc81'],
    operator:['833c57ccf1d2ab92bc803938505b0366d2fab5e4b3455a5c66eb1a762195d9b9','3e26fd959619ba6afe130685a785ba44c9610fc7e1cae5a4755f72d126778e06']};
  for(const [plan,digests] of Object.entries(before))[false,true].forEach((notice,index)=>{
    const text=compile(plan,notice);
    assert.equal(createHash('sha256').update(text).digest('hex'),digests[index],plan+' notice='+notice);
    assert.equal(text.includes('spokenQuote'),false);
  });
});
