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
//   BLOCKED_QUOTES  A service blocked as NEEDS PRICING whose normal job quotes
//                   ready loses jobs for nothing (readiness disagrees with the
//                   real quote).
//
// Findings are returned, not thrown, so the runner can print every one.
import '../pricebookTestEnv.mjs';
import {cases,withLaneDAnswers} from '../../verification/engine-independent/fixtures.mjs';
import * as core from '../../server/quote-engine-vnext/tests/coreFixtures.mjs';
import {fenceFixture,fourTypes} from '../fenceLaneB20261016Fixture.mjs';
import {mowingFixture} from '../landscapeLaneB20261016Fixture.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const READY='INSTANT_ESTIMATE_READY',LIVE='QUOTING LIVE';

// Known-good base services: live, and their own job quotes ready.
export function baseServices(){
  const list=cases().map(c=>({id:c.id,f:withLaneDAnswers(c.input)}));
  const extra={'core-floor':()=>core.floor(),'core-roof':()=>core.roof(),'core-fence':()=>core.fence(),'core-cleanup':()=>core.cleanup(),'core-slab':()=>core.slab(),
    'fence-catalog-installed':()=>fenceFixture('installed'),'fence-catalog-itemized':()=>fenceFixture('itemized'),'fence-catalog-four-types':fourTypes,'mowing-lane':mowingFixture};
  for(const [id,make] of Object.entries(extra))list.push({id,f:make()});
  return list.filter(({f})=>{
    try{return vNextServiceStatus(f.ownerPricing,f.businessDefaults).status===LIVE&&generateQuoteVNext(structuredClone(f)).resultType===READY;}catch{return false;}
  });
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
  return fields;
}
// Coverage paths may be qualified by a fence catalog prefix; compare by suffix.
const covered=(field,disclosed)=>[...disclosed].some(d=>d===field||d.endsWith('.'+field)||field.endsWith('.'+d));

export function evaluate(m){
  let status,quote;
  try{status=vNextServiceStatus(m.f.ownerPricing,m.f.businessDefaults);}catch(error){return {findings:[{rule:'NO_THROW',where:'status',...m,detail:error.message}],outcome:{status:'THROWS'}};}
  try{quote=generateQuoteVNext(structuredClone(m.f));}catch(error){return {findings:[{rule:'NO_THROW',where:'quote',...m,detail:error.message}],outcome:{status:status.status,result:'THROWS'}};}
  const findings=[];
  if(status.status===LIVE&&quote.resultType!==READY){
    const owner=[...list(quote.missingOwnerFields),...list(quote.invalidOwnerFields)];
    const disclosed=disclosedFields(status),silent=owner.filter(f=>!covered(f,disclosed));
    if(silent.length)findings.push({rule:'SILENT_LIVE',...m,detail:'held for '+silent.join(', ')+' ('+quote.reviewReason+')'});
  }
  if(status.status!==LIVE&&quote.resultType===READY)
    findings.push({rule:'BLOCKED_QUOTES',...m,detail:'status '+status.status+': '+[...list(status.missingOwnerFields),...list(status.validationErrors)].slice(0,3).join(' | ')});
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
