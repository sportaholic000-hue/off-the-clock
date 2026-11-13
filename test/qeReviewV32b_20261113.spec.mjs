// Audit of f7216ad1, item 3 gap: recovery keeps a service whole when the two
// sessions end on different text or true/false values anywhere inside it
// (nested settings and price options included), not only on metadata selects.
// Exceptions: the service and option names, free-text descriptions, offering
// identities, and the carpet unit, which keeps its own choice.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePricebook, sameConflictValue, RECEIPT_FIELDS, SERVICE_CHOICE_LABEL, CARPET_GROUP_LABEL} from '../client/src/pricebookConflict.js';
import {corpusInputs} from '../verification/engine-fingerprint/fingerprint.mjs';

const bridge=await import('../server/src/quoteDoneBridge.js');
const METADATA=bridge.applicationMetadata().services;
const book=s=>({services:[s],defaults:{},revision:1});
const IMMUTABLE=new Set(['id','serviceType','source',...RECEIPT_FIELDS,'__clientTempId','createdAt','updatedAt']);
const editable=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!IMMUTABLE.has(k)));
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const textFields=type=>new Set((METADATA.find(m=>m.serviceType===type)?.fields||[]).filter(f=>f.type==='text').map(f=>f.field));

// The two storage forms: settings under `pricing` (as frozen) or on the service itself.
function inForm(service,form){
  const s=structuredClone(service);
  if(form==='root'&&record(s.pricing)){const p=s.pricing;delete s.pricing;Object.assign(s,p);}
  return s;
}
const get=(o,path)=>path.reduce((v,k)=>v?.[k],o);
function set(o,path,value){let v=o;for(const k of path.slice(0,-1))v=v[k];v[path[path.length-1]]=value;}
// Written independently of the code: which leaves the owner rule excludes.
function excluded(path,value,type){
  const settings=path[0]==='pricing'?path.slice(1):path[0]==='tiers'?path.slice(3):path;
  const key=path[path.length-1];
  if(path[0]==='service'&&path.length===1)return 'service name';
  if(path[0]==='tiers'&&path[2]==='name')return 'option name';
  if(key==='description'||String(key).endsWith('Description')||(settings.length===1&&textFields(type).has(key)))return 'free-text description';
  if(settings.length===1&&key==='carpetPriceUnit')return 'carpet unit';
  if(settings[0]==='knownOfferings'&&UUID.test(value))return 'offering identity';
  return null;
}
function leaves(service){
  const out={text:[],number:[]};
  const walk=(v,path)=>{
    if(Array.isArray(v))v.forEach((x,i)=>walk(x,[...path,i]));
    else if(record(v))for(const[k,x]of Object.entries(v))walk(x,[...path,k]);
    else if(typeof v==='string'||typeof v==='boolean')out.text.push(path);
    else if(typeof v==='number')out.number.push(path);
  };
  for(const[k,v]of Object.entries(service))if(!IMMUTABLE.has(k))walk(v,[k]);
  return out;
}
// Every text/true-false value seen at each setting path, so a change is to a value owners use.
const INPUTS=corpusInputs().filter(r=>record(r.input?.ownerPricing));
const SEEN=new Map();
for(const r of INPUTS){const s=r.input.ownerPricing;for(const p of leaves(s).text){const k=s.serviceType+' '+JSON.stringify(p.filter(x=>typeof x!=='number'));const set=SEEN.get(k)||new Set();set.add(get(s,p));SEEN.set(k,set);}}
function changed(service,path){
  const v=get(service,path);
  if(typeof v==='boolean')return !v;
  const k=service.serviceType+' '+JSON.stringify(path.filter(x=>typeof x!=='number'));
  return [...(SEEN.get(k)||[])].find(x=>x!==v)??v+' [SYNTHETIC] changed';
}
// A number outside carpet prices, price options and lists (a list is one value).
const plainNumber=p=>!(p.includes('laborPerSqft')||p.includes('materialPerSqft'))&&p[0]!=='tiers'&&!p.some(x=>typeof x==='number');
// The number changed in the other session: the service's first number not inside a carpet price.
function numberEdit(service){
  const p=leaves(service).number.find(plainNumber);
  const s=structuredClone(service);
  if(p)set(s,p,get(s,p)+1);else{if(record(s.pricing))s.pricing.minimumJob=(s.pricing.minimumJob||0)+100;else s.minimumJob=(s.minimumJob||0)+100;}
  return {service:s,path:p||['minimumJob']};
}

const covered=new Map(),exceptions=new Map();
let checks=0;
test('v32b item 3: every text or true/false setting in every frozen input service, against a number in the same service: one whole service', ()=>{
  const failures=[];
  for(const r of INPUTS){
    const raw=r.input.ownerPricing;
    for(const form of ['pricing','root']){
      const start=inForm(raw,form);
      const {service:numbered}=numberEdit(start);
      for(const path of leaves(start).text){
        const value=get(start,path),reason=excluded(path,value,start.serviceType);
        const parts=path.filter(x=>typeof x!=='number'),label=start.serviceType+' '+(parts[0]==='pricing'?parts.slice(1):parts).join('.');
        if(reason){exceptions.set(label,reason);continue;}
        covered.set(label,(covered.get(label)||0)+1);
        const textual=structuredClone(start);set(textual,path,changed(start,path));
        for(const order of ['text-local','text-remote']){
          const [local,remote]=order==='text-local'?[textual,numbered]:[numbered,textual];
          const first=reconcilePricebook(book(start),book(local),book(remote),{},METADATA);
          const whole=first.conflicts.filter(c=>c.label===SERVICE_CHOICE_LABEL);
          if(first.conflicts.length!==1||whole.length!==1){failures.push(`${r.id} ${form} ${order} ${JSON.stringify(path)}: ${first.conflicts.length} conflicts, ${whole.length} whole-service`);continue;}
          for(const choice of ['local','remote']){
            checks++;
            const result=reconcilePricebook(book(start),book(local),book(remote),{[whole[0].key]:choice},METADATA);
            const kept=editable(result.draft.services[0]),expected=editable(choice==='local'?local:remote);
            if(!sameConflictValue(kept,expected)||result.unresolved.length)failures.push(`${r.id} ${form} ${order} ${choice} ${JSON.stringify(path)}: not one session's whole service`);
          }
        }
      }
    }
  }
  assert.deepEqual(failures.slice(0,20),[]);
  assert.ok(checks>0);
  console.log(`v32b covered: ${covered.size} settings, ${checks} whole-service checks (inputs x forms x orders x choices)`);
  console.log('v32b settings covered:\n'+[...covered.keys()].sort().join('\n'));
  console.log('v32b exceptions (merge as before):\n'+[...exceptions].sort().map(([k,v])=>k+' -> '+v).join('\n'));
});

test('v32b item 3: the exceptions and numbers-only sessions still merge field by field', ()=>{
  const failures=[];let merges=0;
  for(const r of INPUTS){
    for(const form of ['pricing','root']){
      const start=inForm(r.input.ownerPricing,form);
      const {service:numbered,path:numberPath}=numberEdit(start);
      // Numbers only: two different numbers in the same service.
      const other=leaves(start).number.find(p=>JSON.stringify(p)!==JSON.stringify(numberPath)&&plainNumber(p));
      const edits=[];
      if(other){const s=structuredClone(start);set(s,other,get(s,other)+2);edits.push(['number',other,s]);}
      for(const path of leaves(start).text){
        const reason=excluded(path,get(start,path),start.serviceType);
        if(!reason||reason==='carpet unit'||reason==='offering identity')continue;
        const s=structuredClone(start);set(s,path,changed(start,path));edits.push([reason,path,s]);
      }
      for(const [reason,path,edited] of edits)for(const order of ['edit-local','edit-remote']){
        const [local,remote]=order==='edit-local'?[edited,numbered]:[numbered,edited];
        const result=reconcilePricebook(book(start),book(local),book(remote),{},METADATA);merges++;
        const expected=structuredClone(numbered);set(expected,path,get(edited,path));
        if(result.conflicts.length||!sameConflictValue(editable(result.draft.services[0]),editable(expected)))failures.push(`${r.id} ${form} ${order} ${reason} ${JSON.stringify(path)}: ${result.conflicts.map(c=>c.label||c.key).join('; ')||'merged wrongly'}`);
      }
    }
  }
  assert.deepEqual(failures.slice(0,20),[]);
  assert.ok(merges>0);
  console.log(`v32b merges: ${merges} exception/number sessions merged field by field with no choice`);
});

// The two reported cases, worked by hand.
const REPAIR={id:'00000000-0000-4000-8000-0000000000a1',serviceType:'FLAT_ROOF_REPAIR',service:'[SYNTHETIC] Flat roof repair',
  pricing:{repairPricingUnit:{epdm:{seam_patch:'square_feet'}},repairUnitPrice:{epdm:{seam_patch:12}}}};
test('v32b item 3 reported: repair unit square_feet -> linear_feet against unit price 12 -> 15', ()=>{
  for(const form of ['pricing','root'])for(const order of ['unit-local','unit-remote']){
    const start=inForm(REPAIR,form),unit=structuredClone(start),price=structuredClone(start);
    (form==='root'?unit:unit.pricing).repairPricingUnit.epdm.seam_patch='linear_feet';
    (form==='root'?price:price.pricing).repairUnitPrice.epdm.seam_patch=15;
    const [l,r]=order==='unit-local'?[unit,price]:[price,unit];
    const first=reconcilePricebook(book(start),book(l),book(r),{},METADATA);
    assert.deepEqual(first.conflicts.map(c=>c.label),[SERVICE_CHOICE_LABEL]);
    const read=s=>{const p=form==='root'?s:s.pricing;return [p.repairPricingUnit.epdm.seam_patch,p.repairUnitPrice.epdm.seam_patch];};
    // Never linear_feet with 15: either linear_feet with 12 or square_feet with 15.
    assert.deepEqual(read(reconcilePricebook(book(start),book(l),book(r),{[first.conflicts[0].key]:'local'},METADATA).draft.services[0]),read(l));
    assert.deepEqual(read(reconcilePricebook(book(start),book(l),book(r),{[first.conflicts[0].key]:'remote'},METADATA).draft.services[0]),read(r));
    assert.notDeepEqual(read(first.draft.services[0]),['linear_feet',15]);
  }
});
const BASIS={id:'00000000-0000-4000-8000-0000000000a2',serviceType:'FLOORING_INSTALL',service:'[SYNTHETIC] Flooring',
  priceBasisByCategory:{labor:'sell_price',material:'cost'},pricing:{laborPerSqft:{tile:300},materialPerSqft:{tile:500}}};
test('v32b item 3 reported: material basis cost -> sell_price against a material price entered as cost 5 -> 7', ()=>{
  for(const form of ['pricing','root'])for(const order of ['basis-local','basis-remote']){
    const start=inForm(BASIS,form),basis=structuredClone(start),price=structuredClone(start);
    basis.priceBasisByCategory.material='sell_price';
    (form==='root'?price:price.pricing).materialPerSqft.tile=700;
    const [l,r]=order==='basis-local'?[basis,price]:[price,basis];
    const first=reconcilePricebook(book(start),book(l),book(r),{},METADATA);
    assert.deepEqual(first.conflicts.map(c=>c.label),[SERVICE_CHOICE_LABEL]);
    const read=s=>[s.priceBasisByCategory.material,(form==='root'?s:s.pricing).materialPerSqft.tile];
    for(const choice of ['local','remote'])assert.deepEqual(read(reconcilePricebook(book(start),book(l),book(r),{[first.conflicts[0].key]:choice},METADATA).draft.services[0]),read(choice==='local'?l:r));
    assert.notDeepEqual(read(first.draft.services[0]),['sell_price',700]);
  }
});
// Inside a price option: one session flips an option's own true/false setting, the other a base number.
test('v32b item 3: a true/false setting inside a price option against a base number', ()=>{
  const s={id:'00000000-0000-4000-8000-0000000000a3',serviceType:'FLOORING_INSTALL',service:'[SYNTHETIC] Flooring',pricing:{laborPerSqft:{laminate:300},minimumJob:20000},
    tiers:[{name:'Better',overrides:{laminateFloatConditions:{wood_not_on_concrete:true}}}]};
  for(const form of ['pricing','root']){
    const start=inForm(s,form),A=structuredClone(start),B=structuredClone(start);
    A.tiers[0].overrides.laminateFloatConditions.wood_not_on_concrete=false;
    (form==='root'?B:B.pricing).minimumJob=25000;
    for(const [l,r] of [[A,B],[B,A]]){
      const first=reconcilePricebook(book(start),book(l),book(r),{},METADATA);
      assert.deepEqual(first.conflicts.map(c=>c.label),[SERVICE_CHOICE_LABEL]);
      for(const choice of ['local','remote'])assert.ok(sameConflictValue(editable(reconcilePricebook(book(start),book(l),book(r),{[first.conflicts[0].key]:choice},METADATA).draft.services[0]),editable(choice==='local'?l:r)));
    }
  }
});
// The carpet unit keeps its own audited choice, not the whole-service one.
test('v32b item 3: the carpet unit against a carpet price keeps its own single choice', ()=>{
  const s={id:'00000000-0000-4000-8000-0000000000a4',serviceType:'FLOORING_INSTALL',service:'[SYNTHETIC] Carpet',pricing:{laborPerSqft:{carpet:300},materialPerSqft:{carpet:500}}};
  const A=structuredClone(s),B=structuredClone(s);A.pricing.carpetPriceUnit='square_yard';B.pricing.laborPerSqft.carpet=400;
  assert.deepEqual(reconcilePricebook(book(s),book(A),book(B),{},METADATA).conflicts.map(c=>c.label),[CARPET_GROUP_LABEL]);
});
