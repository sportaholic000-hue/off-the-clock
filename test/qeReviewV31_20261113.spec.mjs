// Engine v31: the eight items of the November 13 round. Expected amounts are
// worked by hand in the comments, from the fixture's own prices, before the run.
//
// Items 1-4 share one table: every combination of storage (prices under
// `pricing` / directly on the service), base unit, option unit (none / same as
// base / different), option prices (inherited / its own) and price set (exact /
// one $28 per square yard price), under every carpet action. Each book is quoted
// for the same 200 sq ft carpet job on the base and on the option, through the
// real editor functions (in dollars, as the editor holds them) and the real engine.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {exactCarpetConversion} from '../server/quote-engine-vnext/carpetUnitConversion.js';
import {convertPricebookMoney} from '../server/priceBookMoney.js';
import {jobTaxPercent,sampleTaxLocationCode} from '../server/taxJurisdiction.js';
import {paintingJobInCanada} from '../server/quote-engine-vnext/buildingAgeRules.js';
import {roofPitchInputs,roofLowSlopeMethod,ROOF_SLOPE_FIELD_COPY} from '../server/quote-engine-vnext/roofSlopeRules.js';
import {reconcilePricebook,CARPET_GROUP_LABEL} from '../client/src/pricebookConflict.js';
import * as E from '../client/src/pricebookEditing.js';
import {fixture,flooring} from '../verification/engine-independent/fixtures.mjs';

const directory=mkdtempSync(join(tmpdir(),'otc-v31-'));
process.env.DATABASE_PATH=join(directory,'synthetic.sqlite');
const database=await import('../server/src/db.js');
database.migrate();
const {createInterviewDraft,saveInterviewDraft,getInterviewDraft,saveJurisdictionProfile}=await import('../server/src/onboardingService.js');
const bridge=await import('../server/src/quoteDoneBridge.js');
const {registerQuoteDateDatabase}=await import('../server/src/quoteDate.js');

const FT='square_foot',YD='square_yard',other=u=>u===YD?FT:YD;
const CARPET=['carpetPriceUnit','laborPerSqft','materialPerSqft'];
const D=s=>convertPricebookMoney(s,'toDollars'),C=s=>convertPricebookMoney(s,'toCents');
const ready=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason+' '+JSON.stringify([q.missingOwnerFields,q.invalidCustomerFields,q.invalidOwnerFields]));return q;};
const review=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(q.options?.map(o=>o.midEstimate)));return q;};
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;

// ---------------------------------------------------------------------------
// Items 1-4: the carpet table
// ---------------------------------------------------------------------------
// 200 sq ft of carpet with an included pad. Labor and material are each taken
// on 200 x 1.10 = 220 sq ft (22.2 sq yd x 1.10): $3 + $5 per sq ft = 220 x 8 = $1,760.
function job(){
  const f=flooring('carpet',200);delete f.ownerPricing.pricing.perStepPrice;Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true});
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}});
  for(const k of CARPET)delete f.ownerPricing.pricing[k];
  return f;
}
const JOB=job();
// A carpet price in a unit, from its per-square-foot cents. The inexact set
// states every square-yard labor price as $28 (no exact per-foot price).
const priceIn=(unit,ftCents,inexact,field)=>unit===YD?(inexact&&field==='laborPerSqft'?2800:ftCents*9):ftCents;
// Base $3/$5 per sq ft ($27/$45 per sq yd); an option's own prices $4/$6 per sq ft ($36/$54 per sq yd).
function startBook({storage,base,option,prices,inexact}){
  const s=structuredClone(JOB.ownerPricing);
  const p={...(base===YD?{carpetPriceUnit:YD}:{}),laborPerSqft:{carpet:priceIn(base,300,inexact,'laborPerSqft')},materialPerSqft:{carpet:priceIn(base,500,inexact,'materialPerSqft')}};
  const optionUnit=option==='none'?base:option==='same'?base:other(base);
  const overrides={...(option==='none'?{}:{carpetPriceUnit:optionUnit}),...(prices==='own'?{laborPerSqft:{carpet:priceIn(optionUnit,400,inexact,'laborPerSqft')},materialPerSqft:{carpet:priceIn(optionUnit,600,inexact,'materialPerSqft')}}:{})};
  if(storage==='root')Object.assign(s,p);else Object.assign(s.pricing,p);
  s.tiers=[{name:'Option',overrides}];
  return D(s);
}
// The engine reads a service the way the bridge projects it: a price under
// `pricing` wins, otherwise the one stored on the service.
function engineService(dollars){
  const s=C(dollars),out={...s,pricing:{...E.servicePricing(s)}};
  for(const k of CARPET)delete out[k];
  for(const k of Object.keys(out.pricing))if(Object.hasOwn(s,k)&&!Object.hasOwn(s.pricing||{},k)&&!CARPET.includes(k))delete out[k];
  return out;
}
const quoteCache=new Map();
function quoteOf(ownerPricing){
  const key=JSON.stringify(ownerPricing);
  if(!quoteCache.has(key)){const q=generateQuoteVNext(structuredClone({...JOB,ownerPricing}));quoteCache.set(key,q.resultType==='INSTANT_ESTIMATE_READY'?q.options.map(o=>o.calculationRecord.scenarios.mid.finalTotalCents):'unpriced');}
  return quoteCache.get(key);
}
// [base quote, option quote] in cents, or 'unpriced'.
function quotes(dollars){
  const s=engineService(dollars);
  const base=quoteOf({...s,tiers:[]});
  const option=quoteOf(s);
  return [Array.isArray(base)?base[0]:base,Array.isArray(option)?option[0]:option];
}
// The meaning of a book: each carpet price the base and the option read, per
// square foot, worked out independently of the code under test.
function meaning(dollars){
  const p=E.servicePricing(C(dollars)),bu=p.carpetPriceUnit===YD?YD:FT,perFoot=(v,u)=>v===undefined?undefined:u===YD?v/9:v;
  const base=['laborPerSqft','materialPerSqft'].map(f=>perFoot(p[f]?.carpet,bu));
  const options=(C(dollars).tiers||[]).map(t=>{
    const o=t.overrides||{},ou=o.carpetPriceUnit===undefined?bu:o.carpetPriceUnit===YD?YD:FT;
    return ['laborPerSqft','materialPerSqft'].map(f=>{
      if(o[f]&&Object.hasOwn(o[f],'carpet'))return perFoot(o[f].carpet,ou);
      const inherited=p[f]?.carpet;if(inherited===undefined)return undefined;
      const v=exactCarpetConversion(inherited,bu,ou);return v===null?undefined:perFoot(v,ou);
    });
  });
  return [base,...options];
}
// Labor and material are each charged on 220 sq ft and rounded to the cent.
const expectedQuote=prices=>prices.some(v=>v===undefined)?'unpriced':prices.reduce((sum,v)=>sum+Math.round(220*v),0);
const expectedQuotes=dollars=>{const [base,option]=meaning(dollars);return [expectedQuote(base),expectedQuote(option)];};

const CASES=[];
for(const storage of ['pricing','root'])for(const base of [FT,YD])for(const option of ['none','same','different'])for(const prices of ['inherited','own'])for(const inexact of [false,true])
  CASES.push({storage,base,option,prices,inexact,name:`${storage}/${base}/option ${option}/${prices}/${inexact?'$28':'exact'}`});
const optionUnitOf=c=>c.option==='different'?other(c.base):c.base;

test('table: the engine quotes every starting book as worked by hand',()=>{
  // Spot values: $3+$5 per sq ft = $1,760; $4+$6 = 220 x 10 = $2,200; $28/yd labor = 220 x 28/9 = 684.44, + $5 material 1,100 = $1,784.44.
  const at=c=>quotes(startBook(c));
  assert.deepEqual(at({storage:'pricing',base:FT,option:'none',prices:'inherited',inexact:false}),[176000,176000]);
  assert.deepEqual(at({storage:'root',base:YD,option:'different',prices:'own',inexact:false}),[176000,220000]);
  assert.deepEqual(at({storage:'pricing',base:YD,option:'same',prices:'inherited',inexact:true}),[178444,178444]);
  // A sq ft option inheriting $28/yd has no exact labor price: it is not priced.
  assert.deepEqual(at({storage:'pricing',base:YD,option:'different',prices:'inherited',inexact:true}),[178444,'unpriced']);
  for(const c of CASES){const b=startBook(c);assert.deepEqual(quotes(b),expectedQuotes(b),c.name);}
});

// An action may refuse only when a price the book itself holds (not one an
// option inherits) has no exact value in the new unit.
function assertUnchanged(c,label,before,after){
  assert.ok(after,`${c.name}: ${label} was refused`);
  assert.deepEqual(quotes(after),quotes(before),`${c.name}: ${label} changed a quote`);
  assert.deepEqual(quotes(after),expectedQuotes(after),`${c.name}: ${label}`);
}

test('item 1: changing the base carpet unit never changes what the base or any option quotes',()=>{
  // The two cases from the report: $3/$5 per sq ft base, yard option inheriting:
  // $1,760 on both, before and after (it was $195.55); and the reverse (was $15,840).
  const a=startBook({storage:'pricing',base:FT,option:'different',prices:'inherited',inexact:false});
  assert.deepEqual(quotes(E.editCarpetPriceUnit(a,YD)),[176000,176000]);
  const b=startBook({storage:'pricing',base:YD,option:'different',prices:'inherited',inexact:false});
  assert.deepEqual(quotes(E.editCarpetPriceUnit(b,FT)),[176000,176000]);
  for(const c of CASES){
    const before=startBook(c),after=E.editCarpetPriceUnit(before,other(c.base));
    // Refused only when the base's own $28 per sq yd price, or an option's own
    // $28 per sq yd price in the base unit, would have to be restated per sq ft.
    const mustRefuse=c.inexact&&c.base===YD;
    if(mustRefuse){assert.equal(after,null,c.name);continue;}
    assertUnchanged(c,'base unit change',before,after);
    // And back again.
    assertUnchanged(c,'base unit change back',before,E.editCarpetPriceUnit(after,c.base));
  }
});

test('item 2: setting or removing an option\'s carpet unit never changes what that option quotes',()=>{
  // From the report: base $27/$45 per sq yd, option in sq ft with no prices: removing
  // the option unit keeps $1,760 (it was $15,840).
  const a=startBook({storage:'pricing',base:YD,option:'different',prices:'inherited',inexact:false});
  assert.deepEqual(quotes(E.editTierCarpetPriceUnit(a,0,undefined)),[176000,176000]);
  // Base $3/$5 per sq ft, option in sq yd: removal is not refused; nothing needs converting.
  const b=startBook({storage:'pricing',base:FT,option:'different',prices:'inherited',inexact:false});
  assert.deepEqual(quotes(E.editTierCarpetPriceUnit(b,0,undefined)),[176000,176000]);
  for(const c of CASES){
    const before=startBook(c),ownUnit=optionUnitOf(c);
    for(const unit of [FT,YD,undefined]){
      const after=E.editTierCarpetPriceUnit(before,0,unit),target=unit??c.base,label='option unit '+String(unit);
      // The option's own $28 per sq yd labor cannot be stated per sq ft.
      const ownInexact=c.prices==='own'&&c.inexact&&ownUnit===YD&&target===FT;
      // An option inheriting $28 per sq yd, moved to sq ft, would lose its labor
      // price: refused, so the option keeps its quote (see the report).
      const inheritedInexact=c.prices==='inherited'&&c.inexact&&c.base===YD&&ownUnit===YD&&target===FT;
      if(ownInexact||inheritedInexact){assert.equal(after,null,c.name+' '+label);continue;}
      assert.ok(after,`${c.name}: ${label} was refused`);
      const [baseBefore,optionBefore]=quotes(before),[baseAfter,optionAfter]=quotes(after);
      assert.equal(baseAfter,baseBefore,c.name+' '+label);
      // An option that had no exact price ($28 per sq yd read per sq ft) and is
      // put back on sq yd reads $28 directly: priced, never sent to review.
      if(optionBefore==='unpriced'&&target===YD)assert.equal(optionAfter,178444,c.name+' '+label);
      else assert.equal(optionAfter,optionBefore,c.name+' '+label);
      assert.deepEqual(quotes(after),expectedQuotes(after),c.name+' '+label);
    }
  }
});

test('items 1-2: adding base prices after the option exists, and editing one carpet price, read each price in the unit it was entered in',()=>{
  for(const c of CASES){
    const start=startBook(c),ownUnit=optionUnitOf(c);
    // Base prices added after the option exists: the base's own prices, entered in the base unit.
    let blank=start;for(const f of ['laborPerSqft','materialPerSqft'])blank=E.editServiceField(blank,f,undefined);
    const added=E.editServiceField(E.editServiceField(blank,'laborPerSqft',{carpet:c.base===YD?(c.inexact?28:27):3}),'materialPerSqft',{carpet:c.base===YD?45:5});
    assert.deepEqual(quotes(added),quotes(start),c.name+' base prices added after the option');
    // One price edited: base labor +$1 per sq ft ($9 per sq yd).
    const baseLabor=E.serviceFieldValue(start,'laborPerSqft').carpet;
    const edited=E.editServiceField(start,'laborPerSqft',{...E.serviceFieldValue(start,'laborPerSqft'),carpet:baseLabor+(c.base===YD?9:1)});
    const [base]=quotes(edited);
    // Base: (labor + 1) per sq ft adds 220 x $1 = $220.
    assert.equal(base,quotes(start)[0]+22000,c.name+' base labor edit');
    assert.deepEqual(quotes(edited),expectedQuotes(edited),c.name+' base labor edit');
    // The option's labor set to its own $5 per sq ft ($45 per sq yd), entered in the option's unit.
    const tiers=start.tiers.map(t=>({...t,overrides:{...t.overrides,laborPerSqft:{carpet:ownUnit===YD?45:5}}}));
    const optionEdited=E.editServiceTiers(start,tiers);
    assert.deepEqual(quotes(optionEdited),expectedQuotes(optionEdited),c.name+' option labor edit');
  }
});

// The interview has no price options; its carpet unit change converts the saved
// prices exactly or changes nothing.
test('items 1-4: changing the carpet unit in the interview keeps the quote',()=>{
  const owner='synthetic-v31-'+randomUUID();
  database.db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-13T00:00:00Z');
  const type='FLOORING_INSTALL';
  for(const base of [FT,YD])for(const inexact of [false,true]){
    let d=createInterviewDraft(owner,{serviceTypes:[type]});
    d=saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{carpetPriceUnit:base}}});
    d=saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{laborPerSqft:{carpet:base===YD?(inexact?28:27):3},materialPerSqft:{carpet:base===YD?45:5}}}});
    const asBook=fields=>{const s=structuredClone(D(JOB.ownerPricing));Object.assign(s.pricing,fields);return s;};
    const before=quotes(asBook(d.fields[type]));
    if(base===YD&&inexact){
      assert.throws(()=>saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{carpetPriceUnit:FT}}}),e=>e.statusCode===422);
      continue;
    }
    d=saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{carpetPriceUnit:other(base)}}});
    assert.deepEqual(quotes(asBook(d.fields[type])),before,base+' '+inexact);
  }
});

// ---- Conflict recovery ----
// Session actions. Unit actions never change what a quote means; price actions do.
const ACTIONS={
  baseUnit:(s,c)=>E.editCarpetPriceUnit(s,other(c.base)),
  optionUnit:(s,c)=>E.editTierCarpetPriceUnit(s,0,other(optionUnitOf(c))),
  removeOptionUnit:(s,c)=>c.option==='none'?null:E.editTierCarpetPriceUnit(s,0,undefined),
  baseLabor:s=>{const v=E.serviceFieldValue(s,'laborPerSqft');return E.editServiceField(s,'laborPerSqft',{...v,carpet:v.carpet+(E.serviceFieldValue(s,'carpetPriceUnit')===YD?9:1)});},
  baseMaterial:s=>{const v=E.serviceFieldValue(s,'materialPerSqft');return E.editServiceField(s,'materialPerSqft',{...v,carpet:v.carpet+(E.serviceFieldValue(s,'carpetPriceUnit')===YD?9:1)});},
  // The option's labor set to 27 in whatever unit that session's option reads (item 3's B).
  optionLabor27:s=>E.editServiceTiers(s,s.tiers.map(t=>({...t,overrides:{...t.overrides,laborPerSqft:{...(t.overrides.laborPerSqft||{}),carpet:27}}})))
};
const PAIRS=[['baseUnit','baseLabor'],['baseUnit','baseMaterial'],['baseUnit','optionLabor27'],['optionUnit','baseLabor'],['optionUnit','optionLabor27'],['removeOptionUnit','baseLabor'],['removeOptionUnit','optionLabor27'],['baseUnit','baseUnit'],['baseLabor','baseMaterial']];
const book=s=>({services:[s],defaults:{},revision:1});
const sameMeaning=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// What a session stored, per square yard (x 9 is always exact): the base unit and
// prices, and the option's own unit (or "follows" the base) and own prices (or "inherit").
function stored(dollars){
  const s=C(dollars),p=E.servicePricing(s),bu=p.carpetPriceUnit===YD?YD:FT,yd=(v,u)=>v===undefined?undefined:u===YD?v:v*9;
  const o=(s.tiers||[])[0]?.overrides||{},own=o.carpetPriceUnit!==undefined,ou=own?(o.carpetPriceUnit===YD?YD:FT):bu;
  const optionPrice=f=>o[f]&&Object.hasOwn(o[f],'carpet')?yd(o[f].carpet,ou):'inherit';
  return {baseUnit:bu,baseLabor:yd(p.laborPerSqft?.carpet,bu),baseMaterial:yd(p.materialPerSqft?.carpet,bu),optionUnit:own?ou:'follows',optionLabor:optionPrice('laborPerSqft'),optionMaterial:optionPrice('materialPerSqft')};
}
// The prices each quote reads from what is stored, per square foot (as meaning()).
function readFromStored(st){
  const ou=st.optionUnit==='follows'?st.baseUnit:st.optionUnit,base=[st.baseLabor,st.baseMaterial];
  const option=['optionLabor','optionMaterial'].map((k,i)=>{
    if(st[k]!=='inherit')return st[k]/9;
    if(base[i]===undefined)return undefined;
    const v=exactCarpetConversion(st.baseUnit===YD?base[i]:base[i]/9,st.baseUnit,ou);
    return v===null?undefined:ou===YD?v/9:v;
  });
  return [base.map(m=>m===undefined?undefined:m/9),option];
}
// Both sessions' changes kept: each stored setting from whichever session changed it.
function combined(start,local,remote){
  const s0=stored(start),sa=stored(local),sb=stored(remote),out={};
  for(const k of Object.keys(s0)){const v=s0[k],a=sa[k],b=sb[k];if(a===v)out[k]=b;else if(b===v||a===b)out[k]=a;else return null;}
  return readFromStored(out);
}
function* choiceSets(rows){
  const n=rows.length;
  for(let mask=0;mask<1<<n;mask++)yield Object.fromEntries(rows.map((row,i)=>[row.key,mask&1<<i?'local':'remote']));
}
function checkRecovery(c,start,A,B,label){
  for(const [local,remote,order] of [[A,B,'A local'],[B,A,'B local']]){
    const first=reconcilePricebook(book(start),book(local),book(remote));
    const carpetRows=first.conflicts.filter(row=>row.kind==='carpet'||row.path.some(p=>CARPET.includes(p))||row.path.at(-1)==='tiers');
    const want=combined(start,local,remote);
    const wantDefined=want!==null;
    // No choice shown: both sessions' carpet changes are kept, each read in the unit it was entered in.
    if(!carpetRows.length){
      assert.ok(wantDefined,`${c.name} ${label} ${order}: both sessions changed a carpet price and no choice was shown`);
      assert.deepEqual(meaning(first.draft.services[0]),want,`${c.name} ${label} ${order}: a carpet change was dropped or misread`);
      assert.deepEqual(quotes(first.draft.services[0]),[expectedQuote(want[0]),expectedQuote(want[1])],`${c.name} ${label} ${order}`);
      continue;
    }
    // A choice is shown: every answer ends on one session's carpet prices, or on both changes, never a mix.
    for(const choices of choiceSets(first.conflicts)){
      const merged=reconcilePricebook(book(start),book(local),book(remote),choices);
      assert.equal(merged.unresolved.length,0);
      const m=meaning(merged.draft.services[0]);
      assert.ok([meaning(local),meaning(remote),...(wantDefined?[want]:[])].some(x=>sameMeaning(x,m)),`${c.name} ${label} ${order} ${JSON.stringify(choices)}: ${JSON.stringify(m)}`);
      assert.deepEqual(quotes(merged.draft.services[0]),expectedQuotes(merged.draft.services[0]),`${c.name} ${label} ${order}`);
    }
  }
}
test('items 3-4: conflict recovery never drops a carpet change without a choice and never reads a price in another unit, in both storage forms',()=>{
  for(const c of CASES)for(const [a,b] of PAIRS){
    const start={...startBook(c)};
    const A=ACTIONS[a](start,c),B=ACTIONS[b](start,c);
    if(!A||!B)continue;// refused by the editor (an inexact own price): nothing to recover
    checkRecovery(c,start,A,B,a+' vs '+b);
  }
});

test('item 3: the reported case keeps both changes; B\'s $27 per sq ft option labor is $243 per sq yd',()=>{
  // Base $3/$5 per sq ft; option labor $3. A: base to sq yd (option labor $27 per sq yd).
  // B: option labor $27 per sq ft. B saves first, A recovers.
  for(const storage of ['pricing','root']){
    const s=startBook({storage,base:FT,option:'none',prices:'inherited',inexact:false});
    const start={...E.editServiceTiers(s,[{name:'Option',overrides:{laborPerSqft:{carpet:3}}}])};
    const A=E.editCarpetPriceUnit(start,YD),B=ACTIONS.optionLabor27(start);
    // B meant labor 220 x 27 + material 220 x 5 = 5,940 + 1,100 = $7,040 on the option.
    assert.deepEqual(quotes(B),[176000,704000]);
    const r=reconcilePricebook(book(start),book(A),book(B));
    const svc=r.draft.services[0];
    // Kept: A's unit and B's price. 22.2 sq yd x 1.10 x 243 = 5,940; + 1,100 = $7,040.
    assert.equal(E.serviceFieldValue(svc,'carpetPriceUnit'),YD,storage);
    assert.equal(svc.tiers[0].overrides.laborPerSqft.carpet,243,storage);
    assert.deepEqual(quotes(svc),[176000,704000],storage);
  }
});

test('item 4: a service with prices stored on it gets the single "Carpet price unit and carpet prices" choice',()=>{
  // $3/$5 per sq ft on the service. A: to sq yd ($27/$45). B: material $6 per sq ft.
  const start={...startBook({storage:'root',base:FT,option:'none',prices:'inherited',inexact:false}),tiers:[]};
  const A=E.editCarpetPriceUnit(start,YD),B=E.editServiceField(start,'materialPerSqft',{...E.serviceFieldValue(start,'materialPerSqft'),carpet:6});
  const first=reconcilePricebook(book(start),book(A),book(B));
  assert.equal(first.conflicts.length,1);assert.equal(first.conflicts[0].label,CARPET_GROUP_LABEL);
  const pick=choice=>quotes(reconcilePricebook(book(start),book(A),book(B),{[first.conflicts[0].key]:choice}).draft.services[0])[0];
  // Saved change: $3 + $6 = 220 x 9 = $1,980 (it was $806.67). Mine: $27/$45 per sq yd = $1,760.
  assert.equal(pick('remote'),198000);
  assert.equal(pick('local'),176000);
});

// ---- The real screens ----
const bundles=new Map();
async function render(entry,globals){
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  if(!bundles.has(entry))bundles.set(entry,await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-exports',setup(b){b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {TierBuilder,PricingContext};',loader:'jsx'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:entry}}));
  const output=bundles.get(entry);
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(Object.entries(globals).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('')+'window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(output.outputFiles[0].text);
  return w;
}
const until=async(cond,n=500)=>{for(let i=0;i<n&&!cond();i++)await new Promise(r=>setTimeout(r,10));};
const fromWindow=value=>JSON.parse(JSON.stringify(value));

test('item 2: removing an option\'s carpet unit on the real tier screen keeps the option\'s quote',async t=>{
  const meta=bridge.applicationMetadata().services.find(s=>s.serviceType==='FLOORING_INSTALL');
  const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TierBuilder,PricingContext} from './client/src/pricebook.jsx';import {offeringTierFields} from './client/src/offeringEditor.jsx';
    function App(){const [service,setService]=useState(window.initial);window.current=service;return <PricingContext.Provider value={service}><TierBuilder tiers={service.tiers} definitions={overrides=>offeringTierFields(window.meta,service,overrides)} onChange={tiers=>{const next={...service,tiers};window.current=next;setService(next);}}/></PricingContext.Provider>;}
    createRoot(document.getElementById('root')).render(<App/>);`;
  for(const c of CASES.filter(c=>c.option!=='none')){
    const before=startBook(c);
    const w=await render(entry,{initial:before,meta});t.after(()=>w.close());
    await until(()=>w.document.querySelectorAll('.override-row').length>0);
    const row=[...w.document.querySelectorAll('.override-row')].find(r=>r.querySelector('select')?.value==='carpetPriceUnit');
    assert.ok(row,c.name);
    row.querySelector('button[aria-label="Remove override"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,30));
    const after=fromWindow(w.current);
    // Refused only for the option's own $28 per sq yd labor moving to a sq ft base.
    if(c.prices==='own'&&c.inexact&&optionUnitOf(c)===YD&&c.base===FT){
      assert.match(w.document.body.textContent,/Carpet prices cannot be converted exactly to the new unit\. Nothing was changed\./,c.name);
      assert.deepEqual(after,fromWindow(before),c.name);continue;
    }
    assert.equal(Object.hasOwn(after.tiers[0].overrides,'carpetPriceUnit'),false,c.name);
    const [, optionBefore]=quotes(before),[, optionAfter]=quotes(after);
    if(optionBefore==='unpriced')assert.equal(optionAfter,178444,c.name);else assert.equal(optionAfter,optionBefore,c.name);
    w.close();
  }
});

const conflictEntry=`import React,{useMemo,useState} from 'react';import {createRoot} from 'react-dom/client';import {PricebookConflict} from './client/src/pricebookConflict.jsx';import {reconcilePricebook} from './client/src/pricebookConflict.js';
  function App(){const [choices,setChoices]=useState({});const merge=useMemo(()=>reconcilePricebook(window.base,window.local,window.remote,choices),[choices]);window.merge=merge;
    return <PricebookConflict state={{phase:'ready'}} merge={merge} metadata={window.metadata} onChoice={(key,value)=>setChoices(c=>({...c,[key]:value}))} onAccept={()=>{}} onEdit={()=>{}} onRetry={()=>{}} onDiscard={()=>{}}/>;}
  createRoot(document.getElementById('root')).render(<App/>);`;
async function recoverOnScreen(t,start,local,remote,pick){
  const metadata=bridge.applicationMetadata().services;
  const w=await render(conflictEntry,{base:book(start),local:book(local),remote:book(remote),metadata});t.after(()=>w.close());
  await until(()=>w.merge);
  const text=w.document.body.textContent;
  for(const fieldset of w.document.querySelectorAll('fieldset.conflict-choice')){
    const radio=[...fieldset.querySelectorAll('input[type=radio]')][pick==='local'?0:1];
    radio.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,20));
  }
  const merge=fromWindow(w.merge);w.close();
  return {text,merge};
}
test('items 3-4: conflict recovery through the real recovery screen, both save orders, each choice',async t=>{
  for(const storage of ['pricing','root'])for(const base of [FT,YD]){
    const c={storage,base,option:'none',prices:'inherited',inexact:false,name:storage+' '+base};
    const s=startBook(c);
    const start={...E.editServiceTiers(s,[{name:'Option',overrides:{laborPerSqft:{carpet:base===YD?27:3}}}])};
    for(const [a,b] of [['baseUnit','optionLabor27'],['baseUnit','baseMaterial'],['baseUnit','baseLabor']]){
      const A=ACTIONS[a](start,c),B=ACTIONS[b](start,c);
      for(const [local,remote] of [[A,B],[B,A]])for(const pick of ['local','remote']){
        const {merge}=await recoverOnScreen(t,start,local,remote,pick);
        assert.equal(merge.unresolved.length,0,c.name+' '+a+' '+b);
        const m=meaning(merge.draft.services[0]);
        const want=combined(start,local,remote);
        const options=[meaning(local),meaning(remote),...(want?[want]:[])];
        if(!merge.conflicts.length)assert.deepEqual(m,want,c.name+' '+a+' '+b);
        else assert.ok(options.some(x=>sameMeaning(x,m)),c.name+' '+a+' '+b+' '+pick);
        assert.deepEqual(quotes(merge.draft.services[0]),expectedQuotes(merge.draft.services[0]));
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Item 8: the recovery box states each side's carpet unit in the editor's wording
// ---------------------------------------------------------------------------
test('item 8: a square-yard side\'s carpet rows use the editor\'s per-square-yard wording',async t=>{
  for(const storage of ['pricing','root']){
    const start={...startBook({storage,base:FT,option:'none',prices:'inherited',inexact:false}),tiers:[]};
    // Your draft: material $6 per sq ft. Latest saved version: changed to sq yd ($27/$45).
    const mine=E.editServiceField(start,'materialPerSqft',{...E.serviceFieldValue(start,'materialPerSqft'),carpet:6}),saved=E.editCarpetPriceUnit(start,YD);
    const {text}=await recoverOnScreen(t,start,mine,saved,'remote');
    const savedSide=text.slice(text.indexOf('Latest saved version'));
    assert.match(savedSide,/Labor price by flooring type: per square foot, carpet per square yard · Carpet\$27/,storage);
    assert.match(savedSide,/Material price by flooring type: per square foot, carpet per square yard · Carpet\$45/,storage);
    assert.doesNotMatch(savedSide.split('Keep my change')[0],/Labor price per square foot by flooring type\.? · Carpet\$27/,storage);
    // The square-foot side keeps the square-foot wording.
    const draftSide=text.slice(text.indexOf('Your draft'),text.indexOf('Latest saved version'));
    assert.match(draftSide,/Material price per square foot by flooring type\.? · Carpet\$6/,storage);
    assert.doesNotMatch(draftSide,/carpet per square yard/,storage);
  }
});

// ---------------------------------------------------------------------------
// Item 5: the tax and lead-paint country comes from the job, then the business
// ---------------------------------------------------------------------------
test('item 5: the job\'s postal or ZIP code decides the tax country, whatever the currency',()=>{
  const defaults={taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,taxZones:[{name:'Manhattan',codes:'100',percent:8.875}],taxOutsideZones:'review'};
  // USD book, Toronto job: Ontario HST 13%.
  assert.deepEqual(jobTaxPercent('M5V 2T6',{...defaults,currency:'USD'}),{status:'ok',percent:13,place:'Ontario',province:'ON'});
  // CAD book, New York job: the owner's ZIP zone, 8.875%.
  assert.deepEqual(jobTaxPercent('10001',{...defaults,currency:'CAD'}),{status:'ok',percent:8.875,place:'Manhattan',zone:true});
  // Through the engine: a USD flooring book with a Canadian job is priced, not held.
  const f=flooring('tile',200);Object.assign(f.businessDefaults,{currency:'USD',...defaults});f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,labor:true,material:true};f.customerInputs.postalCode='M5V 2T6';
  // 178,000 before tax; 13% = 23,140: 201,140.
  assert.equal(cents(ready(f)),201140);
});
test('item 5: without a postal code the business country from onboarding decides, and the currency only when neither is known',()=>{
  // Painting, built 1978-1990, no postal code, no policy chosen: reviewed in Canada (Health
  // Canada 1990 line), priced in the United States (EPA 1978 line).
  assert.equal(paintingJobInCanada({},{currency:'USD',businessCountry:'CA'}),true);
  assert.equal(paintingJobInCanada({},{currency:'CAD',businessCountry:'US'}),false);
  assert.equal(paintingJobInCanada({},{currency:'USD'}),false);
  assert.equal(paintingJobInCanada({},{currency:'CAD'}),true);
  // A valid code still wins over the business country.
  assert.equal(paintingJobInCanada({postalCode:'10001'},{currency:'CAD',businessCountry:'CA'}),false);
  // The sample code for an activation check follows the business country too.
  assert.equal(sampleTaxLocationCode({currency:'USD',businessCountry:'CA'}),'K1A0B1');
  assert.equal(sampleTaxLocationCode({currency:'CAD',businessCountry:'US'}),'10001');
  const corpus=Object.fromEntries(JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261112b.json',import.meta.url),'utf8')).map(r=>[r.id,r.input]));
  const painting=(country,currency)=>{const f=structuredClone(corpus['v30:r06-usd-business-canadian-postal-code-1978-to-1990']);delete f.customerInputs.postalCode;f.businessDefaults.currency=currency;if(country)f.businessDefaults.businessCountry=country;return f;};
  assert.match(review(painting('CA','USD')).reviewReason,/^Paint in an older home can contain lead/);
  ready(painting('US','CAD'));
  ready(painting(undefined,'USD'));
  review(painting(undefined,'CAD'));
  // Anything but CA or US is refused as a business setting.
  const bad=painting('GB','USD');assert.ok(review(bad).invalidOwnerFields.includes('businessDefaults.businessCountry'),JSON.stringify(review(bad).invalidOwnerFields));
});
test('item 5: the application passes the onboarding country to the engine',()=>{
  const owner='synthetic-v31-'+randomUUID();
  database.db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-13T00:00:00Z');
  saveJurisdictionProfile(owner,{country:'CA',region:'ON'});
  registerQuoteDateDatabase(database.db);
  const f=flooring('tile',200),raw={...f.ownerPricing,id:randomUUID(),active:true};
  const result=bridge.calculateApplicationQuote({defaults:{...f.businessDefaults,currency:'USD'},services:[raw],revision:1},raw,{customerInputs:f.customerInputs,requestId:randomUUID()},{ownerId:owner,preparingIntake:true,quoteInstant:new Date('2026-01-05T12:00:00Z')});
  assert.equal(result.request.businessDefaults.businessCountry,'CA');
});

// ---------------------------------------------------------------------------
// Items 6 and 7: roofs
// ---------------------------------------------------------------------------
function slopeRoof(customer={},pricing={}){
  const product='asphalt_shingle';
  const p=Object.fromEntries(Object.entries({laborPerSquare:20000,materialCostPerSquare:15000,tearOffPerSquare:6000,underlaymentPerSquare:2000,underlaymentPriceBasis:'installed_area_sell_price'}).map(([k,v])=>[k,{[product]:v}]));
  const f=fixture('ROOFING_REPLACEMENT',{...p,disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,unknownPitchBand:'up_to_six',
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,...pricing},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:product,replacementRoofType:product,pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  for(const [k,v] of Object.entries(pricing))if(v===undefined)delete f.ownerPricing.pricing[k];
  for(const [k,v] of Object.entries(customer))if(v===undefined)delete f.customerInputs[k];
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  const facts={};
  for(const field of ['existingRoofType','replacementRoofType']){const id=randomUUID();f.ownerPricing.knownOfferings[field]={...f.ownerPricing.knownOfferings[field],[product]:id};facts[field]={status:'identified',field,value:product,offeringId:id};}
  f.customerInputs.confirmedFacts={...f.customerInputs.confirmedFacts,...facts};
  return f;
}
const CEMENTED={nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000};
test('item 6: under the Canadian code the low-slope method must be chosen; the cemented application is a third choice',()=>{
  const low=pricing=>slopeRoof({pitchBand:'under_four',pitchRisePer12:3},{roofBuildingCode:'nbc',...CEMENTED,...pricing});
  // Blank: no longer assumed. The owner is asked to choose, as under the US code.
  const blank=review(low({lowSlopeAssembly:undefined}));
  const usBlank=review(slopeRoof({pitchBand:'under_four',pitchRisePer12:3},{roofBuildingCode:'irc',lowSlopeAssembly:undefined}));
  assert.deepEqual([blank.reviewReason,blank.missingOwnerFields],[usBlank.reviewReason,usBlank.missingOwnerFields]);
  assert.deepEqual(blank.missingOwnerFields,['lowSlopeAssembly']);
  // Chosen: priced exactly as before. Base 9,500 + extra shingles 20 x 1.10 x 0.5 x 100 = 1,100 + cement 20 x 12 = 240 + labor 20 x 30 = 600 = 11,440.
  assert.equal(cents(ready(low({lowSlopeAssembly:'nbc_low_slope_application'}))),1144000);
  // The other two methods are unchanged: self-adhered 900 replaces the 400 underlayment = 10,000; double adds 400 = 9,900.
  assert.equal(cents(ready(low({lowSlopeAssembly:'self_adhered_underlayment',selfAdheredUnderlaymentPerSquare:4500}))),1000000);
  assert.equal(cents(ready(low({lowSlopeAssembly:'double_underlayment'}))),990000);
  assert.equal(roofLowSlopeMethod({replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchRisePer12:3},{roofBuildingCode:'nbc',roofProductClass:{asphalt_shingle:'asphalt_shingle'},roofProductMinSlope:{asphalt_shingle:2}}),'undecided');
  // The US code has no cemented application: that choice is refused there.
  const us=review(slopeRoof({pitchBand:'under_four',pitchRisePer12:3},{roofBuildingCode:'irc',...CEMENTED,lowSlopeAssembly:'nbc_low_slope_application'}));
  assert.ok(us.invalidOwnerFields.includes('lowSlopeAssembly'),JSON.stringify(us.invalidOwnerFields));
  // The editor offers the third choice, labelled for 3-tab shingles only.
  const field=bridge.applicationMetadata().services.find(s=>s.serviceType==='ROOFING_REPLACEMENT').fields.find(x=>x.field==='lowSlopeAssembly');
  assert.deepEqual(field.options,['double_underlayment','self_adhered_underlayment','nbc_low_slope_application']);
  assert.equal(field.optionLabels.nbc_low_slope_application,'Cemented low-slope application (NBC 9.26.8), for 3-tab shingles only');
  assert.doesNotMatch(ROOF_SLOPE_FIELD_COPY.lowSlopeAssembly.help,/left blank/);
});
test('item 7: Not sure with areas by pitch and no band or rise is priced as area by pitch',()=>{
  const areas={pitchAreaUpTo6Sqft:1000,pitchArea7To9Sqft:1000};
  assert.deepEqual(roofPitchInputs({pitchMethod:'not_sure',...areas}),{pitchMethod:'area_by_pitch',...areas});
  // As area by pitch: steep additions on 10 of the 20 squares: installation 20% of 2,000 = 400,
  // removal 26% of 600 = 156, disposal 26% of 300 = 78: 9,500 + 634 = 10,134 (it was 9,500 at the assumed band).
  const notSure=slopeRoof({pitchMethod:'not_sure',pitchBand:undefined,...areas});
  const byArea=slopeRoof({pitchMethod:'area_by_pitch',pitchBand:undefined,...areas});
  assert.equal(cents(ready(byArea)),1013400);
  assert.equal(cents(ready(notSure)),1013400);
  // Not sure alone, and Not sure with a band or rise, are unchanged.
  assert.deepEqual(roofPitchInputs({pitchMethod:'not_sure'}),{pitchMethod:'not_sure'});
  assert.deepEqual(roofPitchInputs({pitchMethod:'not_sure',pitchRisePer12:8,...areas}).pitchMethod,'whole_roof');
  assert.equal(cents(ready(slopeRoof({pitchMethod:'not_sure',pitchBand:undefined}))),950000);
});

// ---------------------------------------------------------------------------
// The frozen inputs added for this round (corpus-additions-20261113.json)
// ---------------------------------------------------------------------------
test('corpus: one or more frozen inputs for each item, as worked by hand',()=>{
  const rows=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261113.json',import.meta.url),'utf8'));
  const by=Object.fromEntries(rows.map(r=>[r.id,r.input]));
  assert.equal(rows.length,14);
  // Items 1, 2, 8: $3 + $5 per sq ft (or $27 + $45 per sq yd) on 220 sq ft = $1,760.
  for(const id of ['v31:item1-base-to-yard-yard-option-inherits','v31:item1-base-to-foot-foot-option-inherits','v31:item2-option-foot-unit-removed','v31:item8-square-yard-book-in-recovery-box'])assert.equal(cents(ready(by[id])),176000,id);
  // Item 3: option labor $243 per sq yd = $27 per sq ft: 5,940 + material 1,100 = $7,040.
  assert.equal(cents(ready(by['v31:item3-recovered-option-labor-per-foot-in-yard-book'])),704000);
  // Item 4: $3 + $6 per sq ft = 220 x 9 = $1,980.
  assert.equal(cents(ready(by['v31:item4-root-stored-saved-material-kept'])),198000);
  // Item 5: 178,000 + Ontario 13% = 201,140; 178,000 + Manhattan zone 8.875% (15,797.50, to the cent 15,798) = 193,798.
  assert.equal(cents(ready(by['v31:item5-usd-book-toronto-job-tax'])),201140);
  assert.equal(cents(ready(by['v31:item5-cad-book-new-york-job-tax'])),193798);
  assert.match(review(by['v31:item5-painting-no-postal-code-canadian-business-usd']).reviewReason,/^Paint in an older home can contain lead/);
  ready(by['v31:item5-painting-no-postal-code-us-business-cad']);
  // Item 6.
  assert.deepEqual(review(by['v31:item6-nbc-low-slope-method-blank']).missingOwnerFields,['lowSlopeAssembly']);
  assert.equal(cents(ready(by['v31:item6-nbc-cemented-application-chosen'])),1144000);
  assert.deepEqual(review(by['v31:item6-irc-cemented-application-refused']).invalidOwnerFields,['lowSlopeAssembly']);
  // Item 7: 9,500 + 634 = 10,134.
  assert.equal(cents(ready(by['v31:item7-not-sure-with-areas-by-pitch'])),1013400);
});
