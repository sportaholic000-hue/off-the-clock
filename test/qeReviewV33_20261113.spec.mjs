// Engine v33: three fixes on top of d0ad85f1. Expected amounts are worked by
// hand in the comments, from the fixture's own prices, before the run.
//
// Storage forms: a saved service keeps its prices under `pricing` or directly on
// the service. Engine-level checks read each form through the bridge's own
// projection (approvalContent), as readiness and quoting do.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';
import {sampleTaxLocationCode} from '../server/taxJurisdiction.js';
import {sampleCustomerCodeForZones} from '../server/travelZones.js';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import {fixture,flooring} from '../verification/engine-independent/fixtures.mjs';

const directory=mkdtempSync(join(tmpdir(),'otc-v33-'));
process.env.DATABASE_PATH=join(directory,'synthetic.sqlite');
process.env.PRICEBOOK_PATH=mkdtempSync(join(tmpdir(),'otc-v33-pb-'));
const database=await import('../server/src/db.js');
database.migrate();
const {saveJurisdictionProfile}=await import('../server/src/onboardingService.js');
const bridge=await import('../server/src/quoteDoneBridge.js');
const store=await import('../server/priceBookService.js');
const {registerQuoteDateDatabase}=await import('../server/src/quoteDate.js');
registerQuoteDateDatabase(database.db);
const {corpusInputs,engineResultCorpus}=await import('../verification/engine-fingerprint/fingerprint.mjs');

const WHEN={quoteInstant:new Date('2026-01-05T12:00:00Z')};
const cents=q=>q.options?.[0]?.calculationRecord.scenarios.mid.finalTotalCents;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
// Prices moved from `pricing` onto the service itself (the other storage form).
function rootForm(service){const s=structuredClone(service);if(record(s.pricing)){Object.assign(s,s.pricing);delete s.pricing;}return s;}
const inForm=(service,form)=>form==='root'?rootForm(service):structuredClone(service);
// What the engine receives for a saved service in either form.
// approvalContent leaves out the saved receipts; readiness and quoting keep them.
const RECEIPTS=['confirmedFields','approvedValues','startingValueState','dependentLineState'];
const engineService=(raw,defaults={})=>({...bridge.approvalContent(raw,{defaults,services:[raw]}).service,...Object.fromEntries(RECEIPTS.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,structuredClone(raw[k])])),active:true});

function owner(country){
  const id='synthetic-v33-'+randomUUID();
  database.db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-13T00:00:00Z');
  if(country)saveJurisdictionProfile(id,{country,region:country==='CA'?'ON':'NY'});
  return id;
}
// Saved, approved, active: the state a live service is in.
function savedService(id,raw,defaults){
  const service={...structuredClone(raw),active:true};delete service.origin;delete service.quoteDoneApproval;
  store.savePricebook(id,{services:[service],defaults});
  const saved=store.loadPricebook(id);
  bridge.approveApplicationService(id,saved.services[0].id,{revision:bridge.bookRevision(saved),confirmConfiguration:true,confirmLegacySettings:true});
  const book=store.loadPricebook(id);return {id,book,raw:book.services[0]};
}
const readiness=s=>bridge.cachedApplicationStatus(s.raw,s.book,WHEN);
const customerQuote=(s,inputs)=>bridge.calculateApplicationQuote(s.book,s.raw,{serviceId:s.raw.id,customerInputs:inputs},{ownerId:s.id,...WHEN}).internalResult;
const engineMessages=status=>[...new Set((status.ownerDiagnostics||[]).filter(d=>d.kind!=='approval_receipt').map(d=>d.message))];

// ---------------------------------------------------------------------------
// Fix 1: readiness reads the business country exactly as quoting does
// ---------------------------------------------------------------------------
// 200 sq ft of tile: labor 200 x 3 x 1.10 = 660 + material 200 x 1.12 x 5 = 1,120 = 1,780.00 before tax.
// Ontario 13% = 2,011.40; Manhattan zone 8.875% = 1,937.975, to the cent 1,937.98.
const OUTSIDE={CA:'Jobs outside Canada are priced by the business directly.',US:'Jobs outside the United States are priced by the business directly.'};
const OUTSIDE_ZONES='This job is outside the areas the business has set tax rates for; the business will confirm the tax.';
const NO_CODE='A postal or ZIP code is needed for the sales tax on this job.';
const TAX_BY_LOCATION={taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,taxOutsideZones:'review',provinceTaxPercent:{QC:14.975}};
const MANHATTAN={taxZones:[{name:'Manhattan',codes:'100',percent:8.875}]};
function tileService(){
  const f=flooring('tile',200),raw=structuredClone(f.ownerPricing);
  raw.taxabilityByCategory={...raw.taxabilityByCategory,labor:true,material:true};
  return {f,raw};
}
const LOCATIONS={'Canadian code (M5V 2T6, Toronto)':'M5V 2T6','US ZIP in a zone (10001)':'10001','US ZIP outside zones (98101)':'98101','none':undefined};
// The rule, written independently of the code: saved country first, the currency only when none is saved.
function expectedQuote(country,currency,code){
  const business=country||(currency==='USD'?'US':'CA');
  if(code===undefined)return 'review: '+NO_CODE;
  const job=/^[A-Z]/.test(code)?'CA':'US';
  if(job!==business)return 'review: '+OUTSIDE[business];
  if(code==='M5V 2T6')return 201140;
  if(code==='10001')return 193798;
  return 'review: '+OUTSIDE_ZONES;
}
const outcome=q=>q.resultType==='INSTANT_ESTIMATE_READY'?cents(q):'review: '+q.reviewReason;
export const FIX1_TABLE=[];

test('fix 1 reported: US business with CAD prices, New York customer; Canadian business with USD prices, Toronto customer',()=>{
  // A: saved country US, CAD prices, Manhattan zone. Before: NEEDS PRICING, "Jobs outside Canada ..."; New York job not active.
  {const {f,raw}=tileService(),s=savedService(owner('US'),raw,{...f.businessDefaults,currency:'CAD',...TAX_BY_LOCATION,...MANHATTAN});
   const st=readiness(s);assert.equal(st.status,'QUOTING LIVE',JSON.stringify(engineMessages(st)));
   assert.equal(outcome(customerQuote(s,{...f.customerInputs,postalCode:'10001'})),193798);}
  // B: saved country CA, USD prices, no ZIP zones. Before: NEEDS PRICING, outside the tax areas; Toronto job not active.
  {const {f,raw}=tileService(),s=savedService(owner('CA'),raw,{...f.businessDefaults,currency:'USD',...TAX_BY_LOCATION});
   const st=readiness(s);assert.equal(st.status,'QUOTING LIVE',JSON.stringify(engineMessages(st)));
   assert.equal(outcome(customerQuote(s,{...f.customerInputs,postalCode:'M5V 2T6'})),201140);}
});

test('fix 1: saved country x currency x job location, through readiness, preview and the customer quote',()=>{
  const failures=[];
  for(const country of ['CA','US',undefined])for(const currency of ['CAD','USD']){
    const {f,raw}=tileService(),s=savedService(owner(country),raw,{...f.businessDefaults,currency,...TAX_BY_LOCATION,...MANHATTAN});
    const st=readiness(s);
    if(st.status!=='QUOTING LIVE')failures.push(`${country||'none'}/${currency} readiness ${st.status} ${engineMessages(st).join(' | ')}`);
    const revision=bridge.readApplicationBook(s.id).revision;
    for(const [where,code] of Object.entries(LOCATIONS)){
      const inputs={...f.customerInputs};if(code!==undefined)inputs.postalCode=code;
      const quoted=outcome(customerQuote(s,inputs)),expected=expectedQuote(country,currency,code);
      const p=bridge.previewApplicationQuote(s.id,{revision,serviceId:s.raw.id,customerInputs:inputs},WHEN);
      const previewed=p.resultType==='INSTANT_ESTIMATE_READY'?Math.round(p.midEstimate*100):'review: '+p.reviewReason;
      FIX1_TABLE.push({country:country||'none',currency,where,readiness:st.status,quote:quoted,preview:previewed});
      if(quoted!==expected)failures.push(`${country||'none'}/${currency}/${where}: quote ${quoted}, expected ${expected}`);
      if(previewed!==quoted)failures.push(`${country||'none'}/${currency}/${where}: preview ${previewed} differs from quote ${quoted}`);
    }
    // Readiness and quoting agree: live, and a job in the business's own country quotes.
    const own=(country||(currency==='USD'?'US':'CA'))==='US'?'10001':'M5V 2T6';
    const ownQuote=customerQuote(s,{...f.customerInputs,postalCode:own});
    if((st.status==='QUOTING LIVE')!==(ownQuote.resultType==='INSTANT_ESTIMATE_READY'))failures.push(`${country||'none'}/${currency}: readiness ${st.status} but own-country quote ${ownQuote.resultType}`);
  }
  console.log('v33 fix 1 table:\n'+FIX1_TABLE.map(r=>[r.country,r.currency,r.where,r.readiness,'quote '+r.quote,'preview '+r.preview].join(' | ')).join('\n'));
  assert.deepEqual(failures,[]);
});

// Every service type, both storage forms: turning on tax by job location never
// blocks a business in its own country, and quoting agrees with readiness.
const ROWS=corpusInputs(),RESULTS=new Map(engineResultCorpus(ROWS).map(r=>[r.id,r]));
const LIVE_INPUTS=['case:mowing-control','case:flat-repair-control','case:custom-flat','case:flat-roof-residential-control','case:FENCING_INSTALL-installed-control','case:FENCING_REPLACEMENT-installed-control','geometry:repair-area-0102','explanation:catalog-LANDSCAPING_CLEANUP','explanation:catalog-LANDSCAPING_PLANTING','geometry:repair-area-0126','explanation:scope-floor-carpet-installed','geometry:floor-carton-0021','geometry:mulch-increment-0072','audit-20261104:joints-excluded-unpriced','audit-20261105:wall-all-openings','v24:exterior-itemized-retained-component-prices','v27:sod-topsoil-increment-whole-yard','v29:priced-roofing-earlier-rules','v29:priced-driveway','v29:priced-siding'];
test('fix 1: every service type, both storage forms, every saved country x currency: readiness and quoting agree',()=>{
  const failures=[],covered=new Set();let checks=0;
  for(const id of LIVE_INPUTS){
    const row=ROWS.find(r=>r.id===id);assert.ok(row,id);assert.equal(RESULTS.get(id).resultType,'INSTANT_ESTIMATE_READY',id);
    const input=row.input;covered.add(input.serviceType);
    for(const form of ['pricing','root'])for(const country of ['CA','US',undefined])for(const currency of ['CAD','USD']){
      const raw=inForm(input.ownerPricing,form);raw.taxabilityByCategory=Object.fromEntries(Object.keys(raw.taxabilityByCategory||{labor:1}).map(k=>[k,true]));
      const base={...input.businessDefaults,currency};delete base.businessCountry;
      const plain=savedService(owner(country),raw,{...base,taxMode:'TAX_ALL',taxPercent:5}),located=savedService(owner(country),raw,{...base,...TAX_BY_LOCATION,...MANHATTAN});
      const before=readiness(plain),after=readiness(located);checks++;
      const tag=`${id} ${form} ${country||'none'}/${currency}`;
      if(after.status!==before.status)failures.push(`${tag}: tax by location ${after.status} (${engineMessages(after).join(' | ')}), business rate ${before.status}`);
      const business=country||(currency==='USD'?'US':'CA'),own=business==='US'?'10001':'M5V 2T6',foreign=business==='US'?'M5V 2T6':'10001';
      const ownQuote=customerQuote(located,{...input.customerInputs,postalCode:own}),foreignQuote=customerQuote(located,{...input.customerInputs,postalCode:foreign});
      if((after.status==='QUOTING LIVE')!==(ownQuote.resultType==='INSTANT_ESTIMATE_READY'))failures.push(`${tag}: readiness ${after.status}, own-country quote ${ownQuote.resultType} ${ownQuote.reviewReason||''}`);
      if(after.status==='QUOTING LIVE'&&foreignQuote.reviewReason!==OUTSIDE[business])failures.push(`${tag}: other-country quote ${foreignQuote.resultType} ${foreignQuote.reviewReason||''}`);
    }
  }
  console.log(`v33 fix 1 service types: ${covered.size} (${[...covered].join(', ')}), ${checks} readiness pairs`);
  assert.equal(covered.size,20);
  assert.deepEqual(failures.slice(0,20),[]);
});

test('fix 1: the readiness cache key includes the saved country',()=>{
  // Canadian business, USD prices, no ZIP zones: live. Saving US as the country makes the
  // sample job a US ZIP outside every zone, so readiness must change without a price-book save.
  const id=owner('CA'),{f,raw}=tileService(),s=savedService(id,raw,{...f.businessDefaults,currency:'USD',...TAX_BY_LOCATION});
  assert.equal(readiness(s).status,'QUOTING LIVE');
  saveJurisdictionProfile(id,{country:'US',region:'NY'});
  const changed=readiness(s);
  assert.equal(changed.status,'NEEDS PRICING');assert.ok(engineMessages(changed).includes(OUTSIDE_ZONES),JSON.stringify(engineMessages(changed)));
  saveJurisdictionProfile(id,{country:'CA',region:'ON'});
  assert.equal(readiness(s).status,'QUOTING LIVE');
});

test('fix 1: the sample job location is in the business own country',()=>{
  // Tax zones are US ZIP codes: only a US business samples one.
  assert.equal(sampleTaxLocationCode({currency:'USD',...MANHATTAN}),'10001');
  assert.equal(sampleTaxLocationCode({currency:'CAD',businessCountry:'US',...MANHATTAN}),'10001');
  assert.equal(sampleTaxLocationCode({currency:'CAD',...MANHATTAN}),'K1A0B1');
  assert.equal(sampleTaxLocationCode({currency:'USD',businessCountry:'CA',...MANHATTAN}),'K1A0B1');
  assert.equal(sampleTaxLocationCode({currency:'USD'}),'10001');
  assert.equal(sampleTaxLocationCode({currency:'CAD'}),'K1A0B1');
  // Travel zones: a code in the business's own country first, else the first usable entry.
  const zones=[{codes:'100'},{codes:'M5V'}];
  assert.equal(sampleCustomerCodeForZones(zones,'CA'),'M5V1A1');
  assert.equal(sampleCustomerCodeForZones(zones,'US'),'10001');
  assert.equal(sampleCustomerCodeForZones(zones),'10001');
  assert.equal(sampleCustomerCodeForZones([{codes:'100'}],'CA'),'10001');
});

// ---------------------------------------------------------------------------
// Fix 2: planting takes the mulch order increment the mulching service has
// ---------------------------------------------------------------------------
const PLANTING=ROWS.find(r=>r.id==='explanation:catalog-LANDSCAPING_PLANTING').input;
// One small plant on a clean bed, so the only mulch lines are the ones under test.
// Plant labor 10.00 + allowance 5.00 = 15.00.
function planting({mulch=true,yards=1.1,increment,form='pricing'}={}){
  const f=structuredClone(PLANTING);
  Object.assign(f.customerInputs,{plantsBySize:{small:1,medium:0,large:0},bedCondition:'clean',mulchNeeded:mulch});delete f.customerInputs.bedSqft;
  if(mulch)Object.assign(f.customerInputs,{mulchYards:yards,mulchType:'brown'});else{delete f.customerInputs.mulchYards;delete f.customerInputs.mulchType;delete f.customerInputs.confirmedFacts?.mulchType;}
  Object.assign(f.ownerPricing.pricing,{mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:3000});
  if(increment!==undefined)f.ownerPricing.pricing.mulchOrderIncrementCubicYards={brown:increment};
  return {...f,ownerPricing:engineService(inForm(f.ownerPricing,form),f.businessDefaults)};
}
const lineCents=(q,name)=>q.options?.[0]?.lineItems?.find(l=>l.name===name)?.amountCents;
test('fix 2 reported: 1.1 cubic yards at $50 material and $30 installation, half-yard increment',()=>{
  for(const form of ['pricing','root']){
    // Blank: material 1.1 x 50 = 55.00, installation 1.1 x 30 = 33.00, as today.
    const blank=generateQuoteVNext(planting({form}));assert.equal(blank.resultType,'INSTANT_ESTIMATE_READY',blank.reviewReason);
    assert.deepEqual([lineCents(blank,'Mulch material'),lineCents(blank,'Mulch installation labor')],[5500,3300]);
    // Half yard: material on 1.5 yd = 75.00; installation still 1.1 yd = 33.00. Before: refused as unsupported.
    const half=generateQuoteVNext(planting({increment:0.5,form}));assert.equal(half.resultType,'INSTANT_ESTIMATE_READY',half.reviewReason+' '+JSON.stringify(half.invalidOwnerFields));
    assert.deepEqual([lineCents(half,'Mulch material'),lineCents(half,'Mulch installation labor')],[7500,3300]);
    assert.equal(cents(half)-cents(blank),2000);
  }
});
test('fix 2: planting with and without mulch, with and without the increment, on and off the increment, both forms',()=>{
  const failures=[];let checks=0;
  for(const form of ['pricing','root'])for(const increment of [undefined,0.5,1,0.25])for(const yards of [0.5,1,1.1,1.5,2,2.25,3.75]){
    // Material on ceil(yards / increment) x increment (yards when blank) at 50.00; installation on yards at 30.00.
    const ordered=increment===undefined?yards:Math.ceil(yards/increment-1e-9)*increment;
    const q=generateQuoteVNext(planting({yards,increment,form}));checks++;
    const got=[q.resultType,lineCents(q,'Mulch material'),lineCents(q,'Mulch installation labor')],want=['INSTANT_ESTIMATE_READY',Math.round(ordered*5000),Math.round(yards*3000)];
    if(JSON.stringify(got)!==JSON.stringify(want))failures.push(`${form} increment ${increment} yards ${yards}: ${JSON.stringify(got)} expected ${JSON.stringify(want)} ${q.reviewReason||''}`);
  }
  // Without mulch the increment changes nothing: 15.00 either way.
  for(const form of ['pricing','root'])for(const increment of [undefined,0.5]){
    const q=generateQuoteVNext(planting({mulch:false,increment,form}));checks++;
    if(q.resultType!=='INSTANT_ESTIMATE_READY'||cents(q)!==cents(generateQuoteVNext(planting({mulch:false,form})))||lineCents(q,'Mulch material')!==undefined)failures.push(`${form} no mulch increment ${increment}: ${q.resultType} ${cents(q)}`);
  }
  console.log(`v33 fix 2: ${checks} planting quotes`);
  assert.deepEqual(failures,[]);
});
test('fix 2: same validation, editor field and wording as the mulching service',()=>{
  const mulchRow=ROWS.find(r=>r.id==='geometry:mulch-increment-0072').input;
  const messages=(input,value)=>{const s=structuredClone(input.ownerPricing);s.pricing.mulchOrderIncrementCubicYards=value;
    return vNextServiceStatus(s,input.businessDefaults).ownerDiagnostics.filter(d=>d.path.startsWith('mulchOrderIncrementCubicYards')&&d.type!=='missing').map(d=>[d.type,d.path,d.message]);};
  // Value checks are the same. (The mulching service also asks for a missing increment under
  // its package-purchase rule; planting does not, so a blank increment prices as today.)
  for(const bad of [{brown:0},{brown:-1},{brown:'half'},'0.5',[0.5],{not_a_mulch:1}]){
    const m=messages(mulchRow,bad),p=messages(PLANTING,bad);
    if(!Object.hasOwn(bad,'not_a_mulch'))assert.ok(m.length>0,JSON.stringify(bad));
    assert.deepEqual(p,m,JSON.stringify(bad));
  }
  assert.deepEqual(messages(PLANTING,{brown:0.5}),[]);
  const meta=bridge.applicationMetadata().services,field=type=>meta.find(s=>s.serviceType===type).fields.find(f=>f.field==='mulchOrderIncrementCubicYards');
  assert.ok(field('LANDSCAPING_PLANTING'),'planting editor offers the increment');
  const {interviewPriority:a,...plant}=field('LANDSCAPING_PLANTING'),{interviewPriority:b,...mulch}=field('LANDSCAPING_MULCH');
  assert.deepEqual(plant,mulch);
  // A blank increment adds no notice to planting (the mulching service's package notice is not copied).
  const status=vNextServiceStatus(PLANTING.ownerPricing,PLANTING.businessDefaults);
  assert.ok(!(status.statusNotices||[]).some(n=>/Mulch is priced by the exact cubic yard/.test(n)));
  // Saved through the real bridge in either form, the increment reaches the quote.
  for(const form of ['pricing','root']){
    const f=structuredClone(PLANTING),raw=inForm({...f.ownerPricing,pricing:{...f.ownerPricing.pricing,mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:3000,mulchOrderIncrementCubicYards:{brown:0.5}}},form);
    const s=savedService(owner('CA'),raw,{...f.businessDefaults,currency:'CAD'});
    assert.equal(readiness(s).status,'QUOTING LIVE',JSON.stringify(engineMessages(readiness(s))));
    const inputs={...f.customerInputs,plantsBySize:{small:1,medium:0,large:0},bedCondition:'clean',mulchNeeded:true,mulchYards:1.1,mulchType:'brown'};delete inputs.bedSqft;
    const q=customerQuote(s,inputs);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
    assert.deepEqual([lineCents(q,'Mulch material'),lineCents(q,'Mulch installation labor')],[7500,3300]);
  }
});

// ---------------------------------------------------------------------------
// Fix 3: "Eave protection required: yes" holds on the cemented low-slope method
// ---------------------------------------------------------------------------
const EAVE_MESSAGE='Eave protection (ice and water barrier) is required on this roof, but none was measured. The business will measure it before quoting.';
const CEMENTED={nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000,selfAdheredUnderlaymentPerSquare:4500};
const band=rise=>rise<4?'under_four':rise<=6?'up_to_six':rise<=9?'seven_to_nine':'ten_to_twelve';
// A 2,000 sq ft asphalt roof with ice and water barrier priced and measured separately
// (itemized accessories), the setup in which a measured zero means none.
function itemizedRoof({code,method,eave,measured,rise,form='pricing'}){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},
    underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,minimumJob:0,
    accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:400,
    valleyPerLF:600,stepFlashingPerLF:800,pipeJackEach:4500,ridgeVentPerLF:900,roofBuildingCode:code,lowSlopeAssembly:method,...CEMENTED},
   {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:band(rise),pitchRisePer12:rise,
    stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',iceWaterBarrierLengthLF:measured,valleyLengthLF:0,stepFlashingLengthLF:0,pipeJackCount:0,ridgeVentLengthLF:0,
    starterLengthLF:0,dripEdgeLengthLF:0,ridgeCapLengthLF:0});
  if(eave===undefined)delete f.ownerPricing.pricing.eaveProtectionRequired;else f.ownerPricing.pricing.eaveProtectionRequired=eave;
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  Object.assign(f.ownerPricing.pricing,{pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70});
  const dependent=roofFlashingVentDefinitionVNext('asphalt_shingle');
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[dependent],{ownerId:f.ownerPricing.origin.ownerId,reenteredIds:[dependent.id],confirmIds:[dependent.id],now:'2026-10-29T12:00:00.000Z'});
  return {...f,ownerPricing:engineService(inForm(f.ownerPricing,form),f.businessDefaults)};
}
test('fix 3 reported: NBC, cemented method, eave protection yes, 3/12, none measured',()=>{
  for(const form of ['pricing','root']){
    // Before: quoted 11,440.00. Base 9,500 + extra shingles 1,100 + cement 240 + labor 600 = 11,440.00.
    const yes=generateQuoteVNext(itemizedRoof({code:'nbc',method:'nbc_low_slope_application',eave:'yes',measured:0,rise:3,form}));
    assert.equal(yes.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(yes.reviewReason,EAVE_MESSAGE);
    // No: priced as before.
    assert.equal(cents(generateQuoteVNext(itemizedRoof({code:'nbc',method:'nbc_low_slope_application',eave:'no',measured:0,rise:3,form}))),1144000);
  }
});
test('fix 3: every low-slope method x eave answer x measured x slope 2/12-12/12 x building code, both forms',()=>{
  const failures=[],counts={};let checks=0;
  for(const form of ['pricing','root'])for(const code of ['nbc','irc'])for(const method of ['double_underlayment','self_adhered_underlayment','nbc_low_slope_application'])
  for(const eave of ['yes','no',undefined])for(const measured of [0,40])for(let rise=2;rise<=12;rise++){
    const q=generateQuoteVNext(itemizedRoof({code,method,eave,measured,rise,form}));checks++;
    // The rule, written independently: the cemented method is refused under the US code;
    // a blank answer is asked for; yes with none measured goes to review unless the code
    // exempts 8/12 and steeper (NBC) or a self-adhered membrane covers a 2/12-4/12 roof.
    const low=rise<4;
    let want;
    if(code==='irc'&&method==='nbc_low_slope_application')want='refused';
    else if(eave===undefined)want='asked';
    else if(eave==='yes'&&measured===0&&!(code==='nbc'&&rise>=8)&&!(low&&method==='self_adhered_underlayment'))want='eave review';
    else want='priced';
    const got=q.resultType==='INSTANT_ESTIMATE_READY'?'priced':(q.invalidOwnerFields||[]).includes('lowSlopeAssembly')?'refused':q.reviewReason===EAVE_MESSAGE?'eave review':(q.missingOwnerFields||[]).includes('eaveProtectionRequired')?'asked':'other: '+q.reviewReason+' '+JSON.stringify([q.invalidOwnerFields,q.missingOwnerFields]);
    counts[want]=(counts[want]||0)+1;
    // Under the US code a saved cemented choice and a missing eave barrier are both reasons for
    // review; the engine names the eave barrier first (unchanged by this fix). Nothing is priced.
    const either=want==='refused'&&eave==='yes'&&measured===0&&got==='eave review';
    if(got!==want&&!either)failures.push(`${form} ${code} ${method} eave=${eave} measured=${measured} ${rise}/12: ${got}, expected ${want}`);
    // Yes on an exempt roof prices exactly as no.
    if(want==='priced'&&eave==='yes'&&measured===0&&cents(q)!==cents(generateQuoteVNext(itemizedRoof({code,method,eave:'no',measured,rise,form}))))failures.push(`${form} ${code} ${method} ${rise}/12: exempt yes differs from no`);
  }
  console.log(`v33 fix 3: ${checks} roofs, ${JSON.stringify(counts)}`);
  assert.deepEqual(failures.slice(0,30),[]);
});

// Frozen inputs for v33, worked by hand: tile 1,780.00 + 8.875% = 1,937.98, + 13% = 2,011.40;
// planting 15.00 plants + mulch material (1.5 yd x 50 = 75.00 | 1.1 yd x 50 = 55.00) + installation
// (1.1 yd x 30 = 33.00 | 1.5 yd x 30 = 45.00); roof 11,440.00, + 40 LF x 4.00 = 11,600.00.
test('v33 frozen inputs',()=>{
  const rows=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261113c.json',import.meta.url),'utf8'));
  const got=Object.fromEntries(rows.map(r=>{const q=generateQuoteVNext(structuredClone(r.input));return [r.id,q.resultType==='INSTANT_ESTIMATE_READY'?cents(q):q.reviewReason];}));
  assert.deepEqual(got,{
    'v33:fix1-us-business-cad-book-new-york-job':193798,
    'v33:fix1-ca-business-usd-book-no-zones-toronto-job':201140,
    'v33:fix2-planting-half-yard-increment-off-increment':12300,
    'v33:fix2-planting-half-yard-increment-on-increment':13500,
    'v33:fix2-planting-blank-increment':10300,
    'v33:fix3-nbc-cemented-eave-yes-none-measured':EAVE_MESSAGE,
    'v33:fix3-nbc-cemented-eave-yes-measured':1160000,
    'v33:fix3-nbc-cemented-eave-no-none-measured':1144000});
});
