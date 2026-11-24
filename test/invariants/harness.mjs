// Consistency harness (owner strategy, November 24, 2026).
//
// Instead of one test per fix, this checks rules that must hold for EVERY
// price book and job. It starts from known-good live services, breaks the price
// book one way at a time (each price removed, each price set to $0), and
// compares what the readiness check says with what a real quote does.
//
// Rules:
//   NO_THROW        Readiness and quoting never throw; bad data becomes review.
//   SILENT_LIVE     A LIVE service that holds a quote for a missing owner price
//                   must list that price in its owner coverage lists. Otherwise
//                   the owner believes it quotes and every such job is lost.
//   CUSTOMER_REFUSES  A quote the owner preview prices must reach the
//                   customer: the customer check must not turn it into review.
//   BLOCKED_QUOTES  A service blocked as NEEDS PRICING whose typical jobs all
//                   quote ready loses jobs for nothing (readiness disagrees
//                   with the real quote). See jobs() for what is typical.
//
// Findings are returned, not thrown, so the runner can print every one.
import '../pricebookTestEnv.mjs';
import {cases,withLaneDAnswers,fixture} from '../../verification/engine-independent/fixtures.mjs';
import {configuredScope} from '../measuredScopeFixtures.mjs';
import {floatingOverlay,concreteBaseIncluded,roofExcludingFlashingVents,roofRepairByArea} from '../audit-f1501ff/fixtures.mjs';
import * as core from '../../server/quote-engine-vnext/tests/coreFixtures.mjs';
import {fenceFixture,fourTypes} from '../fenceLaneB20261016Fixture.mjs';
import {mowingFixture} from '../landscapeLaneB20261016Fixture.mjs';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {fenceOfferingFromLegacy} from '../../server/quote-engine-vnext/fencePricing.js';
import {vNextServiceStatus,generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';
import {slopeRoof} from '../audit-f1501ff/roofFixture.mjs';

const READY='INSTANT_ESTIMATE_READY',LIVE='QUOTING LIVE';

// Known-good base services: live, and their own job quotes ready.
export function baseServices(){
  const list=cases().map(c=>({id:c.id,f:withLaneDAnswers(c.input)}));
  const extra={'core-floor':()=>core.floor(),'core-roof':()=>core.roof(),'core-fence':()=>core.fence(),'core-cleanup':()=>core.cleanup(),'core-slab':()=>core.slab(),
    // Audit #5a: US travel zones and tax zones that do not overlap; this
    // service never charges travel.
    'mowing-us-disjoint-zones':()=>{const f=mowingFixture();f.businessDefaults={...f.businessDefaults,businessCountry:'US',currency:'USD',taxMode:'TAX_ALL',taxPercent:8,taxByJobLocation:true,taxOutsideZones:'review',travelZones:[{name:'[SYNTHETIC] Downtown',codes:['98101'],charge:2500}],taxZones:[{name:'[SYNTHETIC] North',codes:['98201'],percent:8}]};f.ownerPricing.feeRules={...f.ownerPricing.feeRules,travel:'not_applicable'};f.customerInputs.postalCode='98201';return f;},
    // Audit #5e: low-slope 3/12 roof, underlayment by the roll, self-adhered.
    'roof-3-12-rolls-self-adhered':()=>{const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:50000},materialCostPerSquare:{asphalt_shingle:30000},tearOffPerSquare:{asphalt_shingle:10000},minimumJob:0,accessoryPricingMode:'per_square_allin',underlaymentPriceBasis:{asphalt_shingle:'cost'},lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:9000},
      {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'under_four',pitchRisePer12:3,stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
      f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
      return configuredScope(f,'roof_underlayment_asphalt_shingle',{mode:'package_cost',productKey:'roof_roll',coverage:500,wastePercent:10},{roof_underlayment_asphalt_shingle:15000},{});},
    // Audit #5c: floating vinyl plank kept over tile with an overlay price.
    'floor-floating-overlay':floatingOverlay,
    // Audit #5b: concrete base always included, no base-prep labor share.
    'concrete-base-included':concreteBaseIncluded,
    // Current roof rules, steep 7-9 pitch (audit #6 neighbourhood).
    'roof-steep-7-9':()=>slopeRoof({pitchBand:'seven_to_nine'}),
    // Audit #3: itemized accessories; base excludes flashing and vents.
    'roof-itemized-excludes-flashing':()=>roofExcludingFlashingVents(),
    // Audit #12: roof repair priced by area (unit price + first-area minimum).
    'roof-repair-by-area':()=>roofRepairByArea(),
    'fence-catalog-replacement':()=>catalogFrom(offeringFixture('FENCING_REPLACEMENT','installed')),
    'fence-catalog-installed':()=>fenceFixture('installed'),'fence-catalog-itemized':()=>fenceFixture('itemized'),'fence-catalog-four-types':fourTypes,'mowing-lane':mowingFixture};
  for(const [id,make] of Object.entries(extra))list.push({id,f:make()});
  return list.filter(({f})=>{
    try{return vNextServiceStatus(f.ownerPricing,f.businessDefaults).status===LIVE&&generateQuoteVNext(structuredClone(f)).resultType===READY;}catch{return false;}
  });
}

// The single fence offering of a fixture, saved as a one-type catalog (audit #4).
function catalogFrom(f){
  const p=f.ownerPricing.pricing,offer=fenceOfferingFromLegacy(p),{offeringMode,offeringDetails,offeringRates,...common}=p;
  f.ownerPricing.pricing={...common,fenceOfferings:{[offer.offeringDetails.fenceType]:offer}};f.customerInputs.fenceRunCount=1;
  return f;
}
// Customer jobs checked for each broken book. "main" jobs are typical jobs
// with no optional extras: a plain fence (no gate, no removal) and a roof at
// a standard 6/12 pitch. A service is "blocked for nothing" (BLOCKED_QUOTES)
// only when every main job quotes. Extra jobs (a gate, removal) use their
// own prices and feed SILENT_LIVE (audit #4).
export function jobs(m){
  const c=m.f.customerInputs,fence=String(m.f.serviceType).startsWith('FENCING_');
  const extras=fence&&(Object.values(c.gates||{}).some(n=>n>0)||c.oldFenceRemoval===true);
  const out=[{job:'',f:m.f,main:!extras}];
  if(fence){
    const gate=structuredClone(m.f);gate.customerInputs.gates={walk:1};if(JSON.stringify(c.gates)!==JSON.stringify({walk:1}))out.push({job:'gate',f:gate,main:false});
    if(m.f.serviceType==='FENCING_REPLACEMENT'){const r=structuredClone(m.f);Object.assign(r.customerInputs,{oldFenceRemoval:true,removalLengthLF:50});if(c.oldFenceRemoval!==true)out.push({job:'removal',f:r,main:false});}
    if(extras){const n=structuredClone(m.f);n.customerInputs.gates={};if(m.f.serviceType==='FENCING_REPLACEMENT'){n.customerInputs.oldFenceRemoval=false;delete n.customerInputs.removalLengthLF;}out.push({job:'plain',f:n,main:true});}
  }
  // A caller who is not sure of the pitch but says "it's steep" (audit #6).
  if(m.f.serviceType==='ROOFING_REPLACEMENT'&&c.pitchMethod==='whole_roof'&&c.pitchBand&&c.pitchBand!=='under_four'){
    const r=structuredClone(m.f);r.customerInputs.pitchMethod='not_sure';out.push({job:'not-sure-band',f:r,main:false});
  }
  if(m.f.serviceType==='ROOFING_REPLACEMENT'&&c.pitchBand==='under_four'){
    const r=structuredClone(m.f);Object.assign(r.customerInputs,{pitchBand:'up_to_six',pitchRisePer12:6});out.push({job:'6-12',f:r,main:true});
  }
  return out;
}

// Every numeric leaf under pricing: the owner-entered prices and factors.
export function numericPaths(value,prefix=[]){
  if(typeof value==='number')return [prefix];
  if(!value||typeof value!=='object'||Array.isArray(value))return [];
  return Object.entries(value).flatMap(([k,v])=>numericPaths(v,[...prefix,k]));
}
const getAt=(o,path)=>path.reduce((v,k)=>v?.[k],o);
function setAt(o,path,value){const parent=getAt(o,path.slice(0,-1));if(value===undefined)delete parent[path.at(-1)];else parent[path.at(-1)]=value;}

export function mutations(base){
  const out=[];
  for(const path of numericPaths(base.f.ownerPricing.pricing)){
    for(const [kind,value] of [['remove',undefined],['zero',0]]){
      if(kind==='zero'&&getAt(base.f.ownerPricing.pricing,path)===0)continue;
      const f=structuredClone(base.f);setAt(f.ownerPricing.pricing,path,value);
      out.push({id:base.id,kind,path:path.join('.'),f});
    }
  }
  return out;
}

const list=v=>Array.isArray(v)?v:[];
// Owner fields the readiness result discloses as limiting some requests.
export function disclosedFields(status){
  const fields=new Set();
  for(const row of list(status.scopeCoverage)){for(const v of list(row.variants))for(const m of list(v.missingFields))fields.add(m);for(const m of list(row.missingFields))fields.add(m);}
  for(const row of list(status.laborAdjustmentCoverage))for(const m of list(row.missingOwnerFields))fields.add(m);
  for(const row of list(status.productCoverage))for(const m of [...list(row.missingOwnerFields),...list(row.missingFields)])fields.add(m);
  // Withheld options and fence catalog rows the owner screen lists by name.
  for(const row of list(status.failedTierDiagnostics))if(row.tierName||row.variantLabel)for(const m of [...list(row.missingOwnerFields),...list(row.invalidOwnerFields)])fields.add(m);
  return fields;
}
// Coverage paths may be qualified by a fence catalog prefix; compare by suffix.
const covered=(field,disclosed)=>[...disclosed].some(d=>d===field||d.endsWith('.'+field)||field.endsWith('.'+d));

export function evaluate(m){
  let status;
  try{status=vNextServiceStatus(m.f.ownerPricing,m.f.businessDefaults);}catch(error){return {findings:[{rule:'NO_THROW',where:'status',...m,detail:error.message}],outcome:{status:'THROWS'}};}
  const findings=[],outcome={},main=[];
  for(const {job,f,main:isMain} of jobs(m)){
    const one=evaluateJob({...m,f,path:m.path+(job?'#'+job:'')},status);
    findings.push(...one.findings);
    if(isMain)main.push(one.outcome.result);
    if(!job)Object.assign(outcome,one.outcome);else outcome[job]=one.outcome.result+':'+(one.outcome.cents||[]).join('/');
  }
  if(status.status!==LIVE&&main.length&&main.every(result=>result===READY))
    findings.push({rule:'BLOCKED_QUOTES',...m,detail:'status '+status.status+': '+[...list(status.missingOwnerFields),...list(status.validationErrors)].slice(0,3).join(' | ')});
  return {findings,outcome};
}
function evaluateJob(m,status){
  let quote;
  try{quote=generateQuoteVNext(structuredClone(m.f));}catch(error){return {findings:[{rule:'NO_THROW',where:'quote',...m,detail:error.message}],outcome:{status:status.status,result:'THROWS'}};}
  const findings=[];
  if(quote.resultType===READY){
    let customer;try{customer=sanitizeForCustomerVNext(quote);}catch(error){customer={resultType:'THROWS',reviewReason:error.message};}
    if(customer.resultType!==READY)findings.push({rule:'CUSTOMER_REFUSES',...m,detail:'owner preview ready, customer '+customer.resultType+(customer.reviewReason?' ('+customer.reviewReason+')':'')});
  }
  if(status.status===LIVE&&quote.resultType!==READY){
    const owner=[...list(quote.missingOwnerFields),...list(quote.invalidOwnerFields)];
    const disclosed=disclosedFields(status),silent=owner.filter(f=>!covered(f,disclosed));
    if(silent.length)findings.push({rule:'SILENT_LIVE',...m,detail:'held for '+silent.join(', ')+' ('+quote.reviewReason+')'});
  }
  const options=Array.isArray(quote.options)?quote.options:[];
  return {findings,outcome:{status:status.status,result:quote.resultType,cents:options.map(o=>o?.calculationRecord?.scenarios?.mid?.finalTotalCents??null)}};
}
export const check=m=>evaluate(m).findings;


// Frozen outcomes: the result of every base service and every broken book.
// Any change to any outcome fails the gate until the snapshot is updated on
// purpose, with a recorded reason (test/invariants/update-snapshot.mjs).
export const outcomeKey=m=>m.id+'|'+m.kind+'|'+m.path;
export function runAll(){
  const bases=baseServices(),findings=[],outcomes={};
  for(const base of bases){
    for(const m of [{id:base.id,kind:'base',path:'',f:base.f},...mutations(base)]){
      const result=evaluate(m);
      for(const finding of result.findings)findings.push({rule:finding.rule,id:finding.id,kind:finding.kind,path:finding.path,serviceType:base.f.serviceType,detail:finding.detail});
      outcomes[outcomeKey(m)]=result.outcome;
    }
  }
  return {bases:bases.map(b=>b.id),findings,outcomes};
}
export const findingKey=f=>f.rule+'|'+f.id+'|'+f.kind+'|'+f.path;
