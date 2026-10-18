import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ownerMoneyEntries,convertPricebookMoney} from '../server/priceBookMoney.js';
import {applyPriceMetadata,staleOwnerPrices,aiPlaceholderPrices} from '../server/priceMetadata.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {PAINTING_RATES,surfaceExtraDefinitions} from '../server/quote-engine-vnext/surfacePricing.js';
import {PAINTING_EXPECTED,SURFACES,F21_CASES,OLD,NOW,LATER,clock,setPath,getPath,keyFor,surfaceRows,metadataFixture,withControl,scopes,targetFor,pricesFor,noteFor,attachNotes} from '../verification/qe-agent2-price-metadata-20261018/fixtures.mjs';

const sorted=values=>[...values].sort();
const entryKey=entry=>keyFor(entry.scope,entry.path);
const staleKeys=service=>staleOwnerPrices(service,90,NOW).map(row=>row.displayPath);
const placeholderKeys=service=>aiPlaceholderPrices(service).map(row=>row.displayPath);
function saveReload(owner,book,instant){
  const saved=savePricebook(owner,book,{clock:clock(instant)}).pricebook;
  const loaded=loadPricebook(owner);
  assert.deepEqual(loaded,saved,'the actual file reload must match the save result');
  assert.deepEqual(JSON.parse(readFileSync(join(process.env.PRICEBOOK_PATH,owner+'.json'),'utf8')),saved);
  return loaded;
}
function assertClassifications(service,rows){
  const entries=ownerMoneyEntries(service);
  assert.equal(entries.length,rows.length*2,'base and explicit overrides only');
  assert.equal(new Set(entries.map(entryKey)).size,entries.length,'no duplicated leaves');
  for(const scope of scopes)for(const [path,category,kind,overrideBasis] of rows){
    const entry=entries.find(row=>row.scope===scope&&row.path===path);
    assert.ok(entry,scope+' '+path);
    assert.equal(entry.value,getPath(pricesFor(service,scope),path),path+' value');
    assert.equal(entry.kind,kind,path+' money kind');
    assert.equal(entry.category,category,path+' category');
    assert.equal(entry.material,category==='material',path+' material flag');
    assert.equal(entry.costBasis,(overrideBasis||service.priceBasisByCategory?.[category])==='cost',path+' effective basis');
    if(scope==='tier'){assert.equal(entry.tierIndex,0);assert.equal(entry.tierName,'[SYNTHETIC] Explicit tier');}
  }
}

test('Agent 2 F9 independent key inventory covers all painting and surface definitions',()=>{
  assert.equal(Object.keys(PAINTING_EXPECTED).length,14);
  assert.deepEqual(sorted(Object.keys(PAINTING_RATES)),sorted(Object.keys(PAINTING_EXPECTED)));
  for(const spec of SURFACES)assert.deepEqual(sorted(Object.keys(surfaceExtraDefinitions(spec.type,{sidingSettings:{soffitUnit:spec.unit}}))),sorted(Object.keys(spec.extras)));
});

const cases=[...SURFACES.map(spec=>({...spec,finding:'F9',rows:surfaceRows(spec)})),...F21_CASES.map(spec=>({...spec,finding:'F21'}))];
for(const spec of cases){
  const title=`Agent 2 ${spec.finding} ${spec.type} ${spec.unit||''}`.trim();
  const rows=withControl(spec,spec.rows);
  test(title+' classifies every base/tier leaf using the configured basis',()=>{
    const service=metadataFixture(spec,spec.rows);
    for(const basis of ['cost','sell_price',undefined]){
      service.priceBasisByCategory=Object.fromEntries(['material','labor','prep','addon'].map(category=>[category,basis]));
      assertClassifications(service,rows);
      const atRoot={...service,...service.pricing};delete atRoot.pricing;
      const byPath=(left,right)=>entryKey(left).localeCompare(entryKey(right));
      assert.deepEqual(ownerMoneyEntries(atRoot).sort(byPath),ownerMoneyEntries(service).sort(byPath),'legacy root pricing uses the same semantics');
    }
    // Only the relevant category controls cost basis; unrelated cost settings
    // cannot turn a selling labor/addon price into a cost.
    service.priceBasisByCategory={material:'cost',labor:'sell_price',prep:'cost',addon:'sell_price'};
    assertClassifications(service,rows);
    const dollars=convertPricebookMoney(service,'toDollars');
    assert.deepEqual(convertPricebookMoney(dollars,'toCents'),service,'dollar/cent conversion preserves the complete book');
  });

  test(title+' real save/reload retains notes and independently dates every changed leaf',()=>{
    const owner='qe-agent2-'+randomUUID();
    const input=attachNotes(metadataFixture(spec,spec.rows,'AI_SUGGESTED'),rows,'2099-01-01T00:00:00.000Z');
    let book=saveReload(owner,{services:[input],defaults:{}},OLD);
    const dates=new Map(scopes.flatMap(scope=>rows.map(([path])=>[keyFor(scope,path),OLD])));
    const placeholders=new Set(dates.keys());
    const check=()=>{
      const service=book.services[0];
      for(const scope of scopes)for(const [path] of rows){
        const key=keyFor(scope,path),metadata=targetFor(service,scope).priceMetadata?.[path];
        assert.ok(metadata,key+' metadata survived save/reload');
        assert.equal(metadata.changedAt,dates.get(key),key+' server date');
        assert.equal(metadata.sourceNote,noteFor(scope,path),key+' source');
        assert.equal(metadata.aiPlaceholder,placeholders.has(key),key+' AI provenance');
      }
      assert.deepEqual(placeholderKeys(service),sorted(placeholders));
      assert.equal(service.tiers[1].priceMetadata,undefined,'inherited prices acquire no tier dates');
    };
    check();
    book=saveReload(owner,book,NOW);check();
    // Confirmation is not an explicit adoption of an AI placeholder.
    book.services[0].confirmedFields={paintingRates:true,surfaceExtraRates:true};
    book=saveReload(owner,book,NOW);check();
    for(const scope of scopes)for(const [path] of spec.rows){
      const key=keyFor(scope,path),prices=pricesFor(book.services[0],scope),prior=getPath(prices,path);
      setPath(prices,path,prior+1);
      targetFor(book.services[0],scope).priceMetadata[path].changedAt='2099-01-01T00:00:00.000Z';
      book=saveReload(owner,book,scope==='service'?NOW:LATER);
      dates.set(key,scope==='service'?NOW:LATER);placeholders.delete(key);check();
      assert.equal(getPath(pricesFor(book.services[0],scope),path),prior+1,'the entered price is preserved');
    }
    // The ordinary material control never changes while every finding leaf does.
    assert.equal(book.services[0].priceMetadata[spec.control].changedAt,OLD);
    assert.equal(book.services[0].tiers[0].priceMetadata[spec.control].changedAt,OLD);
    assert.deepEqual(staleKeys(book.services[0]),sorted(scopes.map(scope=>keyFor(scope,spec.control))));
  });

  test(title+' unchanged legacy prices gain neither dates nor invented provenance',()=>{
    const owner='qe-agent2-legacy-'+randomUUID(),service=metadataFixture(spec,spec.rows);
    for(const scope of scopes)targetFor(service,scope).priceMetadata=Object.fromEntries(rows.filter((_,index)=>index%2===0).map(([path])=>[path,{sourceNote:noteFor(scope,path)}]));
    const legacy={ownerId:owner,services:[service],defaults:{}};
    writeFileSync(join(process.env.PRICEBOOK_PATH,owner+'.json'),JSON.stringify(legacy));
    const draft=loadPricebook(owner);
    // A client-supplied date still cannot refresh unchanged legacy prices.
    for(const scope of scopes)for(const [path] of rows)(targetFor(draft.services[0],scope).priceMetadata[path]??={}).changedAt=NOW;
    const loaded=saveReload(owner,draft,NOW);
    for(const scope of scopes)for(const [index,[path]] of rows.entries())assert.deepEqual(targetFor(loaded.services[0],scope).priceMetadata?.[path],index%2===0?{sourceNote:noteFor(scope,path)}:undefined,keyFor(scope,path));
    assert.deepEqual(placeholderKeys(loaded.services[0]),[]);
    assert.ok(staleOwnerPrices(loaded.services[0],90,NOW).every(row=>row.changedAt===null&&row.dateLabel==='Date not recorded'));
  });

  test(title+' freshness checks all leaves and respects selling-price exclusions',()=>{
    const service=attachNotes(metadataFixture(spec,spec.rows),rows,OLD);
    for(const basis of ['cost','sell_price',undefined]){
      service.priceBasisByCategory=Object.fromEntries(['material','labor','prep','addon'].map(category=>[category,basis]));
      const eligible=rows.filter(([,category,,overrideBasis])=>category==='material'||(overrideBasis||basis)==='cost');
      const expected=sorted(scopes.flatMap(scope=>eligible.map(([path])=>keyFor(scope,path))));
      assert.deepEqual(staleKeys(service),expected);
      for(const row of staleOwnerPrices(service,90,NOW)){
        assert.equal(row.changedAt,OLD);assert.equal(row.dateLabel,'July 10, 2026');
        assert.equal(row.sourceNote,noteFor(row.tierName?'tier':'service',row.path));
      }
      for(const scope of scopes)for(const [path] of eligible){
        const metadata=targetFor(service,scope).priceMetadata[path];
        metadata.changedAt='2026-07-20T12:00:00.000Z';
        assert.deepEqual(staleKeys(service),expected.filter(key=>key!==keyFor(scope,path)),'exactly 90 days is current');
        metadata.changedAt='2026-07-20T11:59:59.999Z';
        assert.deepEqual(staleKeys(service),expected,'one millisecond beyond threshold is stale');
        delete metadata.changedAt;
        assert.equal(staleOwnerPrices(service,90,NOW).find(row=>row.displayPath===keyFor(scope,path)).dateLabel,'Date not recorded');
        metadata.changedAt=OLD;
      }
    }
    for(const threshold of [undefined,null,''])assert.deepEqual(staleOwnerPrices(service,threshold,NOW),[]);
  });

  test(title+' AI adoption and source-note edits preserve every unchanged date',()=>{
    for(const source of ['AI_SUGGESTED','AI_INTERVIEW']){
      const original=applyPriceMetadata({services:[attachNotes(metadataFixture(spec,spec.rows,source),rows)]},{services:[]},OLD);
      const all=sorted(scopes.flatMap(scope=>rows.map(([path])=>keyFor(scope,path))));
      assert.deepEqual(placeholderKeys(original.services[0]),all);
      for(const scope of scopes)for(const [path] of spec.rows){
        const draft=structuredClone(original),key=keyFor(scope,path);
        const submitted=targetFor(draft.services[0],scope).priceMetadata[path];
        submitted.acceptedAsOwnerPrice=true;submitted.sourceNote='[SYNTHETIC] Owner note only';
        const next=applyPriceMetadata(draft,original,NOW).services[0];
        assert.deepEqual(placeholderKeys(next),all.filter(item=>item!==key));
        assert.equal(targetFor(next,scope).priceMetadata[path].changedAt,OLD);
        assert.equal(targetFor(next,scope).priceMetadata[path].sourceNote,'[SYNTHETIC] Owner note only');
        for(const side of scopes)for(const [other] of rows)assert.equal(getPath(pricesFor(next,side),other),getPath(pricesFor(original.services[0],side),other));
      }
    }
  });
}

test('Agent 2 F9 absent/unknown/nested dynamic leaves and non-money settings stay excluded',()=>{
  const service={serviceType:'INTERIOR_PAINTING',source:'AI_SUGGESTED',pricing:{paintingRates:{trimLaborPerLFPerCoat:0,trimMaterialPerLFPerCoat:null,trimPrimerLaborPerLFPerCoat:'',trimPrepLaborPerLF_good:{bad:1},unknown:300},surfaceExtraRates:{doorSides:0,doorFrames:undefined,windows:[],notADoor:300},paintingSettings:{trimPrimerCoats:1}},priceBasisByCategory:{labor:'cost',addon:'cost'}};
  assert.deepEqual(ownerMoneyEntries(service).map(row=>row.path),['paintingRates.trimLaborPerLFPerCoat','surfaceExtraRates.doorSides']);
  assert.deepEqual(placeholderKeys(service),['paintingRates.trimLaborPerLFPerCoat','surfaceExtraRates.doorSides']);
  assert.deepEqual(staleKeys(service),['paintingRates.trimLaborPerLFPerCoat']);
});

test('Agent 2 F9 reordered named tiers, removed prices and metadata views remain independent',()=>{
  const spec=SURFACES[0],rows=withControl(spec,surfaceRows(spec));
  const service=attachNotes(metadataFixture(spec,surfaceRows(spec),'AI_INTERVIEW'),rows);
  service.tiers[1]={name:'[SYNTHETIC] Second explicit tier',overrides:{surfaceExtraRates:{doorSides:4000}},priceMetadata:{'surfaceExtraRates.doorSides':{sourceNote:'[SYNTHETIC] Second tier'}}};
  const before=applyPriceMetadata({services:[service]},{services:[]},OLD);
  const draft=structuredClone(before);draft.services[0].tiers.reverse();
  delete draft.services[0].pricing.paintingRates.trimMaterialPerLFPerCoat;
  const next=applyPriceMetadata(draft,before,NOW).services[0];
  assert.equal(next.tiers[1].priceMetadata['surfaceExtraRates.doorSides'].sourceNote,noteFor('tier','surfaceExtraRates.doorSides'));
  assert.equal(next.tiers[0].priceMetadata['surfaceExtraRates.doorSides'].sourceNote,'[SYNTHETIC] Second tier');
  assert.equal(next.priceMetadata['paintingRates.trimMaterialPerLFPerCoat'],undefined);
  assert.equal(next.tiers[1].priceMetadata['paintingRates.trimMaterialPerLFPerCoat'].changedAt,OLD);
  const entry=ownerMoneyEntries(next).find(row=>row.scope==='service'&&row.path==='surfaceExtraRates.doorSides');
  entry.metadata.sourceNote='[SYNTHETIC] Mutated view';
  assert.equal(next.priceMetadata['surfaceExtraRates.doorSides'].sourceNote,noteFor('service','surfaceExtraRates.doorSides'));
});

test('Agent 2 F21 all placement methods use addon basis and quantity/minimum controls stay excluded',()=>{
  for(const type of ['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY']){
    const methods=['pump','conveyor','power_buggy','wheelbarrow'];
    const service={serviceType:type,pricing:{placementFlat:Object.fromEntries(methods.map(method=>[method,1234])),placementPerCubicYard:Object.fromEntries(methods.map(method=>[method,123.45])),minimumJob:500,baseDepthInches:4,baseCompactionAllowance:0.2,shortLoadThresholdCubicYards:5,controlJointSpacingFt:10},priceBasisByCategory:{material:'cost',labor:'cost',addon:'sell_price'}};
    const placement=ownerMoneyEntries(service).filter(row=>row.path.startsWith('placement'));
    assert.equal(placement.length,8);
    assert.ok(placement.every(row=>row.category==='addon'&&!row.material&&!row.costBasis));
    assert.deepEqual(staleKeys(service),[]);
    service.priceBasisByCategory.addon='cost';
    assert.deepEqual(staleKeys(service),sorted(methods.flatMap(method=>['placementFlat.'+method,'placementPerCubicYard.'+method])));
    assert.equal(ownerMoneyEntries(service).length,9,'the minimum is money; quantities are not');
  }
});
