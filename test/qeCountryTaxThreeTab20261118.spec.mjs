// November 18, 2026 owner round (engine stays v35): two decided items.
// 1. A confirmed country change saves the sales tax confirmed with it; approvals
//    current just before the change stay current.
// 2. A warning lists cemented low-slope products with no 3-tab answer.
// Expected values are worked by hand in the comments before each run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';
import {mergePricingVNext} from '../server/quote-engine-vnext/pricingMerge.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {corpusInputs} from '../verification/engine-fingerprint/fingerprint.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {db,migrate} from '../server/src/db.js';
import {saveJurisdictionProfile,getBusinessProfile} from '../server/src/onboardingService.js';
import {registerQuoteDateDatabase} from '../server/src/quoteDate.js';
import {loadPricebook,savePricebook,pricebookDirectory} from '../server/priceBookService.js';
import {saveBusinessJurisdiction,countryChangeMessage} from '../server/src/businessCountry.js';
import {publish} from './quoteDeliveryBatch20261015Fixture.mjs';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import {countryChangeTaxPrefill,countryChangeTaxReady,countryChangeTaxBody,TAX_MODE_OPTIONS} from '../client/src/countryChangeTax.js';
import {cementedWithoutThreeTabProducts} from '../client/src/surchargeLaborNotice.js';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const root=fileURLToPath(new URL('..',import.meta.url));
const date={timeZone:'UTC',quoteInstant:'2026-10-15T12:00:00.000Z'};
migrate();registerQuoteDateDatabase(db);

test('the engine stays v35',()=>{assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261124-v48');});

// ---------------------------------------------------------------------------
// 1. Sales tax on a country change
// ---------------------------------------------------------------------------
function owner(country,region){
  const id='synthetic-v35tax-'+randomUUID();
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-18T00:00:00Z')").run(id,id+'@example.invalid');
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}','2026-11-18T00:00:00Z')").run(id);
  if(country)saveJurisdictionProfile(id,{country,region});
  return id;
}
// Materials marked taxable, so the materials-only mode taxes them (labor is not).
const F=flooring('tile',200);F.ownerPricing.taxabilityByCategory.material=true;
// The flooring job: labor 200 x 3.00 x 1.10 = 660.00; materials 200 x 1.12 x 5.00 = 1,120.00; 1,780.00 before tax.
const PRE_TAX=178000,MATERIALS=112000;
// A business with one flooring service, approved (or not) under `from`; from
// null: no country saved and an earlier receipt (no country recorded), which
// holds until a country is saved.
function business(from,approved){
  const id=owner(from?.[0],from?.[1]);publish(id,F);
  if(!from)db.prepare('UPDATE businessProfiles SET country=NULL,region=NULL WHERE ownerId=?').run(id);
  const book=loadPricebook(id);
  if(!approved)delete book.services[0].quoteDoneApproval;
  else if(!from)delete book.services[0].quoteDoneApproval.businessCountry;
  savePricebook(id,book);
  return id;
}
const approvedNow=id=>{const book=loadPricebook(id);return (book.services||[]).filter(raw=>raw.quoteDoneApproval).length?bridge.approvedServiceCount(book):0;};
const conflict=fn=>{try{fn();}catch(error){return error;}assert.fail('expected an error');};
const snapshot=id=>({file:readFileSync(resolve(pricebookDirectory(),id+'.json'),'utf8'),profile:(({country,region})=>({country,region}))(getBusinessProfile(id)||{})});
function quote(id){
  const book=loadPricebook(id),raw=book.services[0];
  const status=bridge.bookStatuses(book,date)[0];
  const result=bridge.calculateApplicationQuote(book,raw,{serviceId:raw.id,customerInputs:structuredClone(F.customerInputs)},{ownerId:id,...date});
  return {status,result,mid:result.internalResult.options?.[0]?.calculationRecord?.scenarios?.mid};
}
const NAMES={CA:'Canada',US:'the United States'};
// Each change, its preset prefill, the tax the owner confirms and the tax on the 1,780.00 job, worked by hand:
//   US/TX: no preset (blank). Entire job 8.25%: 1,780.00 x 0.0825 = 146.85 -> 1,926.85.
//   US/OR: preset no tax. No tax line: 0 -> 1,780.00.
//   CA/ON: preset entire job 13%. 1,780.00 x 0.13 = 231.40 -> 2,011.40.
//   CA/QC: preset entire job 14.975% (owner confirms it). Materials only 14.975%: 1,120.00 x 0.14975 = 167.72 -> 1,947.72.
//   first country US/TX: blank. Materials only 7%: 1,120.00 x 0.07 = 78.40 -> 1,858.40.
//   first country CA/AB: preset entire job 5%. 1,780.00 x 0.05 = 89.00 -> 1,869.00.
const CHANGES=[
  {from:['CA','ON'],to:['US','TX'],prefill:{taxMode:null,taxPercent:null},confirm:{taxMode:'TAX_ALL',taxPercent:'8.25'},saved:{taxMode:'TAX_ALL',taxPercent:8.25},taxCents:14685},
  {from:['CA','ON'],to:['US','OR'],prefill:{taxMode:'TAX_NONE',taxPercent:0},confirm:{taxMode:'TAX_NONE',taxPercent:'0'},saved:{taxMode:'TAX_NONE',taxPercent:0},taxCents:0},
  {from:['US','NY'],to:['CA','ON'],prefill:{taxMode:'TAX_ALL',taxPercent:13},confirm:{taxMode:'TAX_ALL',taxPercent:'13'},saved:{taxMode:'TAX_ALL',taxPercent:13},taxCents:23140},
  {from:['US','NY'],to:['CA','QC'],prefill:{taxMode:'TAX_ALL',taxPercent:14.975},confirm:{taxMode:'TAX_MATERIALS',taxPercent:'14.975'},saved:{taxMode:'TAX_MATERIALS',taxPercent:14.975},taxCents:16772},
  {from:null,to:['US','TX'],prefill:{taxMode:null,taxPercent:null},confirm:{taxMode:'TAX_MATERIALS',taxPercent:'7'},saved:{taxMode:'TAX_MATERIALS',taxPercent:7},taxCents:7840},
  {from:null,to:['CA','AB'],prefill:{taxMode:'TAX_ALL',taxPercent:5},confirm:{taxMode:'TAX_ALL',taxPercent:'5'},saved:{taxMode:'TAX_ALL',taxPercent:5},taxCents:8900}
];
assert.equal(MATERIALS*0.14975,16772);assert.equal(PRE_TAX*0.0825,14685);
const label=c=>`${c.from?c.from.join('/'):'no country'} -> ${c.to.join('/')}`;

test('1: with approved services, the confirmation asks for the new country\'s tax, prefilled from its preset or blank; confirming saves it and the approval stays current; the app quote charges it',()=>{
  for(const c of CHANGES){
    const id=business(c.from,true),[country,region]=c.to;
    assert.equal(approvedNow(id),1,label(c));
    const before=snapshot(id),receiptBefore=loadPricebook(id).services[0].quoteDoneApproval;
    // Asked first, whatever tax the first request carries (none here).
    const asked=conflict(()=>saveBusinessJurisdiction(id,{country,region}));
    const message=`Changing your country to ${NAMES[country]} changes how your quotes handle sales tax, which jobs are outside your country, and lead-paint screening on painting jobs. Your approved prices stay approved. Confirm your sales tax for ${NAMES[country]} below.`;
    assert.equal(asked.statusCode,409,label(c));assert.equal(asked.code,'COUNTRY_CHANGE_CONFIRMATION_REQUIRED',label(c));
    assert.equal(asked.message,message);assert.equal(countryChangeMessage(country),message);
    assert.deepEqual(asked.details.tax,c.prefill,label(c));
    assert.deepEqual(asked.details.countryChange,{from:c.from?.[0]??null,to:country,revision:bridge.bookRevision(loadPricebook(id))},label(c));
    assert.deepEqual(snapshot(id),before,'nothing changes while asking');
    // A confirmation without the tax is asked again; nothing changes.
    const noTax=conflict(()=>saveBusinessJurisdiction(id,{country,region,countryChange:asked.details.countryChange}));
    assert.equal(noTax.code,'COUNTRY_CHANGE_TAX_REQUIRED',label(c));assert.deepEqual(noTax.details,asked.details);assert.deepEqual(snapshot(id),before);
    const done=saveBusinessJurisdiction(id,{country,region,...c.confirm,countryChange:asked.details.countryChange});
    assert.equal(done.countryChanged,true);assert.equal(done.taxMode,c.saved.taxMode);assert.equal(done.taxPercent,c.saved.taxPercent);
    const book=loadPricebook(id);
    assert.equal(book.defaults.taxMode,c.saved.taxMode,label(c));assert.equal(book.defaults.taxPercent,c.saved.taxPercent,label(c));
    assert.deepEqual((({country,region})=>({country,region}))(getBusinessProfile(id)),{country,region});
    const receipt=book.services[0].quoteDoneApproval;
    assert.equal(receipt.businessCountry,country);
    // Only the business-defaults section of the receipt is re-stamped.
    for(const key of Object.keys(receiptBefore.sectionDigests||{}))if(key!=='businessDefaults')assert.equal(receipt.sectionDigests[key],receiptBefore.sectionDigests[key],key);
    assert.equal(receipt.approvedAt,receiptBefore.approvedAt);assert.equal(receipt.operationId,receiptBefore.operationId);
    const {status,result,mid}=quote(id);
    assert.equal(status.approvalCurrent,true,label(c)+': approval stays current');assert.equal(status.status,'QUOTING LIVE',label(c));
    assert.equal(result.internalResult.resultType,'INSTANT_ESTIMATE_READY',label(c));
    assert.equal(mid.tax.mode,c.saved.taxMode);assert.equal(mid.tax.percent,c.saved.taxPercent);
    assert.equal(mid.tax.taxCents,c.taxCents,label(c));assert.equal(mid.finalTotalCents,PRE_TAX+c.taxCents,label(c));
  }
});
test('1: with no approved services, the change saves the tax sent without asking; approving afterwards quotes at that rate',()=>{
  for(const c of CHANGES){
    const id=business(c.from,false),[country,region]=c.to;
    assert.equal(approvedNow(id),0);
    const done=saveBusinessJurisdiction(id,{country,region,...c.confirm});
    assert.equal(done.countryChanged,undefined);assert.equal(getBusinessProfile(id).country,country);
    const saved=loadPricebook(id).defaults;assert.equal(saved.taxMode,c.saved.taxMode);assert.equal(saved.taxPercent,c.saved.taxPercent);
    bridge.approveApplicationService(id,loadPricebook(id).services[0].id,{revision:bridge.readApplicationBook(id).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
    const {status,mid}=quote(id);
    assert.equal(status.status,'QUOTING LIVE',label(c));assert.equal(mid.tax.taxCents,c.taxCents,label(c));assert.equal(mid.finalTotalCents,PRE_TAX+c.taxCents,label(c));
  }
});
test('1: a stale confirmation and a failure between writes leave tax, profile, book and receipts unchanged, for each tax mode',()=>{
  for(const confirm of [{taxMode:'TAX_NONE',taxPercent:'0'},{taxMode:'TAX_MATERIALS',taxPercent:'7'},{taxMode:'TAX_ALL',taxPercent:'8.25'}]){
    const id=business(['CA','ON'],true);
    const before=snapshot(id),defaultsBefore=loadPricebook(id).defaults;
    const asked=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'TX'}));
    for(const wrong of [{...asked.details.countryChange,revision:'0'.repeat(64)},{...asked.details.countryChange,from:'US'},{...asked.details.countryChange,to:'CA'}]){
      const stale=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'TX',...confirm,countryChange:wrong}));
      assert.equal(stale.code,'COUNTRY_CHANGE_CONFIRMATION_STALE');assert.deepEqual(stale.details.tax,{taxMode:null,taxPercent:null});
      assert.deepEqual(snapshot(id),before,confirm.taxMode+' stale');
    }
    assert.throws(()=>saveBusinessJurisdiction(id,{country:'US',region:'TX',...confirm,countryChange:asked.details.countryChange},{afterBookWrite(){throw new Error('[SYNTHETIC] failure between writes');}}),/failure between writes/);
    assert.deepEqual(snapshot(id),before,confirm.taxMode+': book file byte for byte, profile country and region');
    const after=loadPricebook(id);assert.equal(after.defaults.taxMode,defaultsBefore.taxMode);assert.equal(after.defaults.taxPercent,defaultsBefore.taxPercent);
    assert.equal(after.services[0].quoteDoneApproval.businessCountry,'CA');assert.equal(bridge.bookStatuses(after,date)[0].approvalCurrent,true);
    // The same confirmation still works afterwards.
    saveBusinessJurisdiction(id,{country:'US',region:'TX',...confirm,countryChange:asked.details.countryChange});
    assert.equal(loadPricebook(id).defaults.taxMode,confirm.taxMode);assert.equal(bridge.bookStatuses(loadPricebook(id),date)[0].approvalCurrent,true);
  }
});
test('1: an approval already stale stays stale when the tax changes with the country; an invalid confirmed tax saves nothing',()=>{
  const id=business(['CA','ON'],true);
  // A second approved service, then edited so its approval is stale.
  let draft=bridge.readApplicationBook(id);const copy=structuredClone(draft.services[0]);copy.id=randomUUID();copy.source='MANUAL';
  for(const k of ['origin','quoteDoneApproval','approvedValues','zeroPricePolicy','startingValueState','startingValueAdoptions','dependentLineState','confirmedFields'])delete copy[k];
  bridge.saveApplicationBook(id,{...draft,services:[...draft.services,copy]},date);
  bridge.approveApplicationService(id,copy.id,{revision:bridge.readApplicationBook(id).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  draft=bridge.readApplicationBook(id);(draft.services[1].pricing||draft.services[1]).laborPerSqft.tile+=1;bridge.saveApplicationBook(id,draft,date);
  assert.deepEqual(bridge.bookStatuses(loadPricebook(id),date).map(s=>s.approvalCurrent),[true,false]);
  const asked=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'TX'}));
  const before=snapshot(id);
  for(const bad of [{taxMode:'TAX_ALL',taxPercent:''},{taxMode:'TAX_ALL',taxPercent:'0'},{taxMode:'TAX_ALL',taxPercent:'101'},{taxMode:'',taxPercent:'5'},{taxMode:'SOMETHING',taxPercent:'5'}]){
    const error=conflict(()=>saveBusinessJurisdiction(id,{country:'US',region:'TX',...bad,countryChange:asked.details.countryChange}));
    assert.equal(error.statusCode,400,JSON.stringify(bad));assert.deepEqual(snapshot(id),before,JSON.stringify(bad));
  }
  saveBusinessJurisdiction(id,{country:'US',region:'TX',taxMode:'TAX_ALL',taxPercent:'8.25',countryChange:asked.details.countryChange});
  const book=loadPricebook(id);
  assert.deepEqual(bridge.bookStatuses(book,date).map(s=>s.approvalCurrent),[true,false]);
  assert.deepEqual(book.services.map(s=>s.quoteDoneApproval.businessCountry),['US','CA']);
});
// The v29 roof (IRC, one asphalt product), published through the app.
// Fix B2 (Lane B, November 19, 2026): the frozen v29 roof prices 2 decking sheets as material only,
// which now needs its installation labor price (25.00 per sheet here).
const ROOF29=()=>{const f=structuredClone(corpusInputs().find(r=>r.id==='v29:priced-roofing-earlier-rules').input);f.ownerPricing.pricing.deckingLaborPerSheet=2500;return f;};
test('1: an approved roofing service stays approved through a country change that changes the tax',()=>{
  for(const roofRuleMode of ['legacy','new']){
    const id=owner('US','NY');publish(id,ROOF29(),{roofRuleMode});
    assert.equal(bridge.bookStatuses(loadPricebook(id),date)[0].approvalCurrent,true,roofRuleMode);
    const asked=conflict(()=>saveBusinessJurisdiction(id,{country:'CA',region:'ON'}));
    assert.deepEqual(asked.details.tax,{taxMode:'TAX_ALL',taxPercent:13});
    saveBusinessJurisdiction(id,{country:'CA',region:'ON',taxMode:'TAX_ALL',taxPercent:'13',countryChange:asked.details.countryChange});
    const book=loadPricebook(id);assert.equal(book.defaults.taxMode,'TAX_ALL');assert.equal(book.defaults.taxPercent,13);
    assert.equal(bridge.bookStatuses(book,date)[0].approvalCurrent,true,roofRuleMode);
  }
});

// The confirmation step in the browser: a bundle with a stub API, rendered in JSDOM.
async function renderer(t,entry){
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const out=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'api',setup(b){b.onResolve({filter:/^\.\/api\.js$/},()=>({path:'synthetic-api',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`export * from ${JSON.stringify(root+'client/src/api.js')};export async function api(path,options){return window.syntheticApi(path,options);}`,loader:'js',resolveDir:root}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:entry}});
  return setup=>{
    const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
    dom.window.structuredClone=x=>JSON.parse(JSON.stringify(x));setup(dom.window);dom.window.eval(out.outputFiles[0].text);return dom.window;
  };
}
// Values from the JSDOM window are another realm's objects: compared as plain data.
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=async(window,check)=>{for(let i=0;i<200&&!check();i++)await new Promise(r=>setTimeout(r,10));assert.ok(check(),'rendered');};
const choose=(window,element,value)=>{element.value=value;element.dispatchEvent(new window.Event('change',{bubbles:true}));};
const type=(window,element,value)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new window.Event('input',{bubbles:true}));};
const button=(window,text)=>[...window.document.querySelectorAll('button')].find(b=>b.textContent===text);

test('1: the confirmation shows the tax fields prefilled from the preset or blank, and sends the confirmed tax',async t=>{
  const open=await renderer(t,`import React from 'react';import {createRoot} from 'react-dom/client';import {CountryChangeConfirmation} from './client/src/businessCountryChange.jsx';
    createRoot(document.getElementById('root')).render(<CountryChangeConfirmation pending={window.pending} onConfirm={tax=>window.confirmed.push(tax)}/>);`);
  const pending=(country,tax)=>({countryChange:{from:'US',to:country,revision:'r'},message:countryChangeMessage(country),action:'Change country',tax});
  // Preset entire job 13%: prefilled, confirm enabled, sends it as shown.
  let w=open(win=>{win.pending=pending('CA',{taxMode:'TAX_ALL',taxPercent:13});win.confirmed=[];});
  await settle(w,()=>!!button(w,'Change country'));
  const doc=w.document,mode=()=>doc.querySelector('select[aria-label="Sales tax on customer invoices"]'),rate=()=>doc.querySelector('input[aria-label="Sales tax rate"]');
  assert.ok(doc.body.textContent.includes(countryChangeMessage('CA')));
  assert.ok(doc.body.textContent.includes('Sales tax on customer invoices'));assert.ok(doc.body.textContent.includes('Sales tax rate (%)'));
  assert.equal(mode().value,'TAX_ALL');assert.equal(rate().value,'13');assert.equal(button(w,'Change country').disabled,false);
  button(w,'Change country').click();await settle(w,()=>w.confirmed.length===1);
  assert.deepEqual(plain(w.confirmed[0]),{taxMode:'TAX_ALL',taxPercent:'13'});
  // No preset: blank, confirm disabled until a mode and a rate above 0 are filled.
  w=open(win=>{win.pending=pending('US',{taxMode:null,taxPercent:null});win.confirmed=[];});
  await settle(w,()=>!!button(w,'Change country'));
  const m=()=>w.document.querySelector('select[aria-label="Sales tax on customer invoices"]'),r=()=>w.document.querySelector('input[aria-label="Sales tax rate"]');
  assert.equal(m().value,'');assert.equal(r(),null);assert.equal(button(w,'Change country').disabled,true);
  choose(w,m(),'TAX_MATERIALS');await settle(w,()=>!!r());
  assert.equal(r().value,'');assert.equal(button(w,'Change country').disabled,true);
  type(w,r(),'0');await settle(w,()=>r().value==='0');assert.equal(button(w,'Change country').disabled,true);
  type(w,r(),'7');await settle(w,()=>!button(w,'Change country').disabled);
  button(w,'Change country').click();await settle(w,()=>w.confirmed.length===1);
  assert.deepEqual(plain(w.confirmed[0]),{taxMode:'TAX_MATERIALS',taxPercent:'7'});
  // No tax line: no rate field; sends 0.
  choose(w,m(),'TAX_NONE');await settle(w,()=>!r());
  button(w,'Change country').click();await settle(w,()=>w.confirmed.length===2);
  assert.deepEqual(plain(w.confirmed[1]),{taxMode:'TAX_NONE',taxPercent:'0'});
  // Preset no tax line (Oregon): prefilled, no rate field.
  w=open(win=>{win.pending=pending('US',{taxMode:'TAX_NONE',taxPercent:0});win.confirmed=[];});
  await settle(w,()=>!!button(w,'Change country'));
  assert.equal(w.document.querySelector('select[aria-label="Sales tax on customer invoices"]').value,'TAX_NONE');assert.equal(w.document.querySelector('input[aria-label="Sales tax rate"]'),null);
  assert.equal(button(w,'Change country').disabled,false);
});
test('1: the price-book prompt resends the confirmation with the confirmed tax, not its own',async t=>{
  const open=await renderer(t,`import React from 'react';import {createRoot} from 'react-dom/client';import {BusinessCountryPrompt} from './client/src/businessCountryChange.jsx';
    createRoot(document.getElementById('root')).render(<BusinessCountryPrompt defaults={{taxMode:'TAX_NONE',taxPercent:0}} onSaved={()=>{window.saved=true;}}/>);`);
  const details={countryChange:{from:null,to:'CA',revision:'r1'},message:countryChangeMessage('CA'),action:'Change country',tax:{taxMode:'TAX_ALL',taxPercent:13}};
  const w=open(win=>{win.calls=[];win.syntheticApi=async(path,options)=>{win.calls.push({path,body:options.body});if(win.calls.length===1)throw Object.assign(new Error(details.message),{status:409,code:'COUNTRY_CHANGE_CONFIRMATION_REQUIRED',details});return {};};});
  await settle(w,()=>!!w.document.querySelector('select[aria-label="Business country"]'));
  choose(w,w.document.querySelector('select[aria-label="Business country"]'),'CA');
  await settle(w,()=>!!w.document.querySelector('input[aria-label="Business region"]'));
  type(w,w.document.querySelector('input[aria-label="Business region"]'),'ON');
  await settle(w,()=>!button(w,'Save business country').disabled);
  button(w,'Save business country').click();
  await settle(w,()=>!!button(w,'Change country'));
  assert.deepEqual(plain(w.calls[0].body),{country:'CA',region:'ON',taxMode:'TAX_NONE',taxPercent:'0'});
  assert.equal(w.document.querySelector('select[aria-label="Sales tax on customer invoices"]').value,'TAX_ALL');
  button(w,'Change country').click();await settle(w,()=>w.saved===true);
  assert.deepEqual(plain(w.calls[1].body),{country:'CA',region:'ON',taxMode:'TAX_ALL',taxPercent:'13',countryChange:details.countryChange});
});
test('1: the onboarding step sends the confirmed tax with the confirmation; the keep-old-tax code is gone',async()=>{
  const onboarding=await readFile(new URL('../client/src/onboarding.jsx',import.meta.url),'utf8');
  assert.match(onboarding,/\.\.\.\(confirmation \? \{ countryChange:confirmation, \.\.\.confirmedTax \} : \{\}\)/);
  assert.match(onboarding,/<CountryChangeConfirmation pending=\{countryChange\} onConfirm=\{confirmedTax => save\(countryChange\.countryChange, confirmedTax\)\} \/>/);
  const server=await readFile(new URL('../server/src/businessCountry.js',import.meta.url),'utf8');
  assert.ok(!server.includes('saved tax mode and rate are kept'));assert.ok(!/approved\?\{\.\.\.\(book\.defaults/.test(server));
  const spec=await readFile(new URL('./qeOwnerRoundV35_20261118.spec.mjs',import.meta.url),'utf8');
  assert.ok(!spec.includes('taxBefore'),'the keep-old-tax test is removed');
});
test('1: the confirmation tax helpers',()=>{
  assert.deepEqual(TAX_MODE_OPTIONS.map(([v])=>v),['TAX_NONE','TAX_MATERIALS','TAX_ALL']);
  assert.deepEqual(countryChangeTaxPrefill({tax:{taxMode:'TAX_ALL',taxPercent:14.975}}),{taxMode:'TAX_ALL',taxPercent:'14.975'});
  assert.deepEqual(countryChangeTaxPrefill({tax:{taxMode:'TAX_NONE',taxPercent:0}}),{taxMode:'TAX_NONE',taxPercent:''});
  for(const pending of [{tax:{taxMode:null,taxPercent:null}},{},null,{tax:{taxMode:'OTHER',taxPercent:5}}])assert.deepEqual(countryChangeTaxPrefill(pending),{taxMode:'',taxPercent:''});
  for(const [tax,ready] of [[{taxMode:'',taxPercent:''},false],[{taxMode:'TAX_NONE',taxPercent:''},true],[{taxMode:'TAX_ALL',taxPercent:''},false],[{taxMode:'TAX_ALL',taxPercent:'0'},false],[{taxMode:'TAX_ALL',taxPercent:'100'},true],[{taxMode:'TAX_ALL',taxPercent:'100.5'},false],[{taxMode:'TAX_MATERIALS',taxPercent:'7'},true]])assert.equal(countryChangeTaxReady(tax),ready,JSON.stringify(tax));
  assert.deepEqual(countryChangeTaxBody({taxMode:'TAX_NONE',taxPercent:'9'}),{taxMode:'TAX_NONE',taxPercent:'0'});
});

// ---------------------------------------------------------------------------
// 2. Cemented low-slope products without a 3-tab answer
// ---------------------------------------------------------------------------
const ROOF=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261113c.json',import.meta.url),'utf8')).find(r=>r.id==='v33:fix3-nbc-cemented-eave-no-none-measured').input;
const LEGACY=['lowSlopeAssembly','nbcLowSlopeShingleFactor','nbcLowSlopeShingleMaterialPerSquare'];
// Two asphalt products, three_tab and laminate, each priced as the v33 roof's asphalt product.
function mixedRoof({code='nbc',methods={},threeTab={}}={}){
  const f=structuredClone(ROOF),p=f.ownerPricing.pricing;for(const k of LEGACY)delete p[k];
  p.roofBuildingCode=code;p.eaveProtectionRequired='no';p.selfAdheredUnderlaymentPerSquare=6000;
  // Fix B1 (Lane B, November 19, 2026): the frozen v33 roof is a full replacement measuring 0 starter
  // and 0 drip edge with accessories priced separately, which is now refused: 1 LF of each at 1.00.
  Object.assign(p,{starterPerLF:100,dripEdgePerLF:100});Object.assign(f.customerInputs,{starterLengthLF:1,dripEdgeLengthLF:1});
  for(const [key,value] of Object.entries(p))if(record(value)&&Object.hasOwn(value,'asphalt_shingle'))p[key]={three_tab:value.asphalt_shingle,laminate:value.asphalt_shingle};
  // An empty map is not saved (the editor removes it).
  delete p.lowSlopeAssemblyByProduct;delete p.roofProductThreeTab;
  if(Object.keys(methods).length)p.lowSlopeAssemblyByProduct=methods;if(Object.keys(threeTab).length)p.roofProductThreeTab=threeTab;
  p.nbcLowSlopeShingleFactorByProduct={three_tab:1.5,laminate:1.5};p.nbcLowSlopeShingleMaterialByProduct={three_tab:10000,laminate:10000};
  const offerings=f.ownerPricing.knownOfferings;for(const field of ['existingRoofType','replacementRoofType'])offerings[field]={three_tab:randomUUID(),laminate:randomUUID()};
  // The itemized flashing and vent lines are confirmed for each product, as in the v35 mixed book.
  const lines=['three_tab','laminate'].map(product=>roofFlashingVentDefinitionVNext(product));
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,lines,{ownerId:f.ownerPricing.origin.ownerId,reenteredIds:lines.map(d=>d.id),confirmIds:lines.map(d=>d.id),now:'2026-11-18T12:00:00.000Z'});
  return f;
}
function asProduct(f,product,rise){
  const g=structuredClone(f);Object.assign(g.customerInputs,{existingRoofType:product,replacementRoofType:product,pitchRisePer12:rise,pitchBand:rise<4?'under_four':'up_to_six'});
  for(const field of ['existingRoofType','replacementRoofType'])if(g.customerInputs.confirmedFacts?.[field])g.customerInputs.confirmedFacts[field]={...g.customerInputs.confirmedFacts[field],value:product,offeringId:g.ownerPricing.knownOfferings[field][product]};
  return g;
}
// Products the engine holds at 3/12 for a missing 3-tab answer, for the
// service as quoted: each price option (inheritance applied) when it has any,
// else the base prices.
const THREE_TAB_REVIEW='The cemented low-slope application is for 3-tab shingles only.';
function heldForThreeTab(f){
  const variants=(f.ownerPricing.tiers||[]).length?f.ownerPricing.tiers.map(tier=>{const g=structuredClone(f);g.ownerPricing.pricing=mergePricingVNext(f.ownerPricing.pricing,tier.overrides||{});delete g.ownerPricing.tiers;return g;}):[f];
  const held=new Set();
  for(const g of variants)for(const product of ['three_tab','laminate']){
    const q=generateQuoteVNext(asProduct(g,product,3));
    // Held as 'three_tab_unconfirmed' (templates.js): the 3-tab review message, on the 3-tab answer (blank) or the method (marked not 3-tab).
    if(q.resultType==='ESTIMATE_REQUIRES_REVIEW'&&JSON.stringify(q).includes(THREE_TAB_REVIEW)&&(q.missingOwnerFields||[]).some(path=>['roofProductThreeTab.'+product,'lowSlopeAssemblyByProduct.'+product].includes(path)))held.add(product.replace('_',' '));
  }
  return [...held].sort();
}
const warned=f=>cementedWithoutThreeTabProducts(f.ownerPricing).slice().sort();
const C='nbc_low_slope_application',D='double_underlayment',S='self_adhered_underlayment';

test('2: the warning lists exactly the products the engine holds for a 3-tab answer: yes, no and blank, every method, NBC and IRC, mixed books',()=>{
  let cases=0;
  for(const code of ['nbc','irc'])for(const a of [C,D,S,undefined])for(const b of [C,D,S,undefined])for(const ta of [true,false,undefined])for(const tb of [true,false,undefined]){
    const methods={},threeTab={};
    if(a)methods.three_tab=a;if(b)methods.laminate=b;if(ta!==undefined)threeTab.three_tab=ta;if(tb!==undefined)threeTab.laminate=tb;
    const f=mixedRoof({code,methods,threeTab});
    // Written before execution: listed exactly when the code is the NBC, the method is cemented and the product is not marked 3-tab.
    const expected=code!=='nbc'?[]:[['three_tab',a,ta],['laminate',b,tb]].filter(([,m,tt])=>m===C&&tt!==true).map(([p])=>p.replace('_',' ')).sort();
    const where=JSON.stringify({code,methods,threeTab});
    assert.deepEqual(warned(f),expected,where);
    if(code==='nbc')assert.deepEqual(heldForThreeTab(f),expected,'engine agrees: '+where);
    cases++;
  }
  console.log(`3-tab warning: ${cases} combinations`);
});
test('2: under the IRC the cemented method holds the roof whatever the 3-tab answer, so no 3-tab warning is shown',()=>{
  for(const tt of [true,false,undefined]){
    const f=mixedRoof({code:'irc',methods:{three_tab:C,laminate:D},threeTab:tt===undefined?{}:{three_tab:tt}});
    assert.deepEqual(warned(f),[]);
    const q=generateQuoteVNext(asProduct(f,'three_tab',3));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',String(tt));
    assert.ok(!(q.missingOwnerFields||[]).includes('roofProductThreeTab.three_tab'),String(tt));assert.ok(!JSON.stringify(q).includes(THREE_TAB_REVIEW),String(tt));
  }
});
test('2: a saved service-wide cemented choice counts for every asphalt product, as the engine reads it',()=>{
  const f=mixedRoof();const p=f.ownerPricing.pricing;delete p.lowSlopeAssemblyByProduct;p.lowSlopeAssembly=C;p.roofProductThreeTab={three_tab:true};
  // Written before execution: laminate (no answer) listed; three_tab (marked 3-tab) not.
  assert.deepEqual(warned(f),['laminate']);assert.deepEqual(heldForThreeTab(f),['laminate']);
  // A per-product choice wins over the service-wide one.
  p.lowSlopeAssemblyByProduct={laminate:D};assert.deepEqual(warned(f),[]);assert.deepEqual(heldForThreeTab(f),[]);
});
test('2: price options: the cemented choice in the base prices or in a price option, read after inheritance',()=>{
  const opt=(name,overrides)=>({id:randomUUID(),name,overrides});
  // Base cemented, no answer; one option inherits it, one marks the product 3-tab.
  let f=mixedRoof({methods:{three_tab:C,laminate:D}});f.ownerPricing.tiers=[opt('Good',{}),opt('Best',{roofProductThreeTab:{three_tab:true}})];
  assert.deepEqual(warned(f),['three tab']);assert.deepEqual(heldForThreeTab(f),['three tab']);
  // Every option answers it: the base value is never quoted, so nothing is listed.
  f.ownerPricing.tiers=[opt('Good',{roofProductThreeTab:{three_tab:true}}),opt('Best',{lowSlopeAssemblyByProduct:{three_tab:D}})];
  assert.deepEqual(warned(f),[]);assert.deepEqual(heldForThreeTab(f),[]);
  // The cemented choice made only in a price option, for the laminate (no answer).
  f=mixedRoof({methods:{three_tab:D,laminate:D}});f.ownerPricing.tiers=[opt('Good',{}),opt('Best',{lowSlopeAssemblyByProduct:{laminate:C}})];
  assert.deepEqual(warned(f),['laminate']);assert.deepEqual(heldForThreeTab(f),['laminate']);
  // That option also marks it not 3-tab: still listed. Marks it 3-tab: gone.
  f.ownerPricing.tiers[1].overrides.roofProductThreeTab={laminate:false};assert.deepEqual(warned(f),['laminate']);assert.deepEqual(heldForThreeTab(f),['laminate']);
  f.ownerPricing.tiers[1].overrides.roofProductThreeTab={laminate:true};assert.deepEqual(warned(f),[]);assert.deepEqual(heldForThreeTab(f),[]);
  // Base prices only (no options): the base is what is quoted.
  f=mixedRoof({methods:{three_tab:C,laminate:C},threeTab:{laminate:true}});assert.deepEqual(warned(f),['three tab']);assert.deepEqual(heldForThreeTab(f),['three tab']);
  // A product named with a leading digit reads as the owner typed it.
  const g=mixedRoof();g.ownerPricing.pricing.roofProductClass={n__332d746162:'asphalt_shingle'};g.ownerPricing.pricing.lowSlopeAssemblyByProduct={n__332d746162:C};g.ownerPricing.pricing.roofProductThreeTab={};
  assert.deepEqual(cementedWithoutThreeTabProducts(g.ownerPricing),['3-tab']);
  for(const other of [{serviceType:'FLOORING_INSTALL',pricing:{}},null,{}])assert.deepEqual(cementedWithoutThreeTabProducts(other),[]);
});
test('2: the warning shows in Quote configuration next to the labor-share warning; it does not take the service off quoting',async t=>{
  const open=await renderer(t,`import React from 'react';import {createRoot} from 'react-dom/client';import {ServiceRules} from './client/src/quoteDoneControls.jsx';
    createRoot(document.getElementById('root')).render(<ServiceRules service={window.service} meta={{customerFields:[]}} defaults={window.defaults} categories={[]} feeNames={[]} feeModes={[]} onService={()=>{}} onDefault={()=>{}}/>);`);
  const text='Until you answer whether these shingles are 3-tab, their roofs from 2/12 to under 4/12 go to you for review:';
  for(const [threeTab,shown] of [[{},true],[{laminate:false},true],[{laminate:true},false]]){
    const f=mixedRoof({methods:{three_tab:D,laminate:C},threeTab});
    const w=open(win=>{win.service=f.ownerPricing;win.defaults={...f.businessDefaults,currency:'CAD'};win.syntheticApi=async()=>({});});
    await settle(w,()=>w.document.body.textContent.includes('Optional busy-season labor surcharge'));
    const body=w.document.body.textContent;
    assert.equal(body.includes(text),shown,JSON.stringify(threeTab));
    if(shown){
      const notice=[...w.document.querySelectorAll('li')].map(li=>li.textContent);assert.ok(notice.includes('laminate'));assert.ok(!notice.includes('three tab'));
      assert.ok(body.indexOf(text)>body.indexOf('Optional busy-season labor surcharge'));
      assert.ok(body.indexOf(text)<body.indexOf('Business time zone for quotes'));
    }
  }
  const source=await readFile(new URL('../client/src/quoteDoneControls.jsx',import.meta.url),'utf8');
  assert.match(source,/<LaborPortionReviewNotice service=\{service\} meta=\{meta\}\/>\n  <ThreeTabReviewNotice service=\{service\}\/>/);
  // A warning only: a roofing service saved under the NBC with its asphalt product on the cemented
  // method and no 3-tab answer is approved and stays live; only its 2/12-4/12 roofs wait.
  const id=owner('CA','ON'),r=ROOF29(),p=r.ownerPricing.pricing;
  delete p.lowSlopeAssembly;
  Object.assign(p,{roofBuildingCode:'nbc',lowSlopeAssemblyByProduct:{asphalt_shingle:C},nbcLowSlopeShingleFactorByProduct:{asphalt_shingle:1.5},nbcLowSlopeShingleMaterialByProduct:{asphalt_shingle:10000},nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000});
  // publish() approves the service and asserts it is quoting live.
  const {book}=publish(id,r);
  const saved=bridge.readApplicationBook(id).services[0];assert.deepEqual(cementedWithoutThreeTabProducts(saved),['asphalt shingle']);
  assert.equal(bridge.bookStatuses(book,date)[0].status,'QUOTING LIVE');
  // Answering 3-tab removes the warning.
  const answered=bridge.readApplicationBook(id);(answered.services[0].pricing||answered.services[0]).roofProductThreeTab={asphalt_shingle:true};
  assert.deepEqual(cementedWithoutThreeTabProducts(answered.services[0]),[]);
});
