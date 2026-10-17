import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fixture,flooring} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {synchronizeStartingValuesVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';

// Literal expected values below are written before execution. Existing branch
// assertions are unchanged; these tests cover the new adoption boundary.
const paintGroup='painting_coats_20261017',floorGroup='flooring_patterns_20261017';
const historical=JSON.parse(readFileSync(new URL('./quoteStartingValues20261017Legacy.json',import.meta.url)));
function paint(){
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
  f.ownerPricing.priceBasisByCategory.material='sell_price';return f;
}
function mode(f,group,kind){
  const options={ownerId:f.ownerPricing.origin.ownerId,...(kind==='adopted'?{adoptGroups:[group]}:{newGroups:[group]})};
  f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,CLASS2_DEFINITIONS[f.serviceType],options);return f;
}
function ready(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;}
const amount=(q,path)=>q.lineItems.filter(l=>l.calculation.ratePath===path).map(l=>l.amountCents);
const sum=values=>values.reduce((a,b)=>a+b,0);

test('adopted wall, ceiling and trim ratios keep exact two-coat conversion and no primer defaults',()=>{
  // Walls/ceilings: 400*100*2/1.8, plus 0/1/2 additional coats at .8.
  // Trim: 100*200*2/1.33=30075.187...; each extra=9924.812... cents.
  for(const [coats,wall,trim,extras,legacyWall,legacyTrim] of [[1,44444,30075,0,40000,20000],[2,80000,40000,9925,80000,40000],[3,115555,49925,19850,120000,60000]]){
    const f=paint();Object.assign(f.ownerPricing.pricing,{ceilingLaborPerSqftPerCoat:100,ceilingMaterialPerSqftPerCoat:30,trimLaborPerLF:200,trimMaterialPerLF:30});
    Object.assign(f.customerInputs,{coats,ceilingsIncluded:true,ceilingAreaSqft:400,ceilingCoats:coats,ceilingSurfaceCondition:'good',trimIncluded:true,trimLengthLF:100,trimCoats:coats,trimSurfaceCondition:'good'});
    assert.equal(sum(amount(ready(f),'laborPerWallSqftPerCoat')),legacyWall);
    assert.equal(sum(amount(ready(f),'trimLaborPerLF')),legacyTrim);
    mode(f,paintGroup,'adopted');const q=ready(f);
    assert.equal(sum(amount(q,'laborPerWallSqftPerCoat')),wall);
    assert.equal(sum(amount(q,'ceilingLaborPerSqftPerCoat')),wall);
    assert.deepEqual(amount(q,'trimLaborPerLF'),extras?[30075,extras]:[30075]);
    assert.equal(sum(amount(q,'trimLaborPerLF')),trim);
    for(const key of ['primerAdditionalCoatRatio','ceilingPrimerAdditionalCoatRatio','trimPrimerAdditionalCoatRatio'])assert.equal(f.ownerPricing.pricing.paintingSettings[key],undefined);
  }
});

test('flooring adoption adds per-material waste, retains diagonal labor and separately prices herringbone',()=>{
  // Legacy diagonal material: 300*(1+.08+.07)*500=172500.
  // Adopted diagonal: 300*(1+.08+.04)=336; *500=168000.
  const f=flooring('vinyl_plank',300);f.customerInputs.layoutPattern='diagonal';
  assert.equal(sum(amount(ready(f),'materialPerSqft.vinyl_plank')),172500);
  assert.equal(sum(amount(ready(f),'laborPerSqft.vinyl_plank')),118800);
  mode(f,floorGroup,'adopted');let q=ready(f);
  assert.equal(sum(amount(q,'materialPerSqft.vinyl_plank')),168000);
  assert.equal(q.lineItems.find(l=>l.name==='Flooring materials').calculation.quantity,336);
  assert.equal(sum(amount(q,'laborPerSqft.vinyl_plank')),118800);
  assert.deepEqual(f.ownerPricing.pricing.diagonalWasteAdderByType,{laminate:.06,vinyl_plank:.04,hardwood:.07,tile:.03});
  assert.deepEqual(f.ownerPricing.pricing.herringboneWasteAdderByType,f.ownerPricing.pricing.diagonalWasteAdderByType);
  // 700/2=350 => room factor 1; labor 700*300*1.75=367500;
  // material 700*1.12=784; *500=392000.
  Object.assign(f.customerInputs,{sqft:700,roomCount:2,layoutPattern:'herringbone_or_chevron'});q=ready(f);
  assert.equal(sum(amount(q,'laborPerSqft.vinyl_plank')),367500);
  assert.equal(sum(amount(q,'materialPerSqft.vinyl_plank')),392000);
  assert.equal(q.lineItems.find(l=>l.name==='Flooring materials').calculation.quantity,784);
  const legacy=flooring('vinyl_plank',700);Object.assign(legacy.customerInputs,{roomCount:2,layoutPattern:'herringbone_or_chevron'});
  assert.equal(sum(amount(ready(legacy),'laborPerSqft.vinyl_plank')),252000);
});

test('new and adopted tile herringbone review until the owner supplies its own labor adjustment',()=>{
  for(const kind of ['new','adopted']){
    const f=flooring('tile',700);Object.assign(f.customerInputs,{roomCount:2,layoutPattern:'herringbone_or_chevron'});mode(f,floorGroup,kind);
    assert.equal(f.ownerPricing.pricing.herringboneLaborMultiplierByType.tile,undefined);
    assert.match(JSON.stringify(generateQuoteVNext(f)),/herringboneLaborMultiplierByType.tile/);
    f.ownerPricing.pricing.herringboneLaborMultiplierByType.tile=1.6;
    if(kind==='new')f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,CLASS2_DEFINITIONS[f.serviceType],{ownerId:f.ownerPricing.origin.ownerId,confirmPaths:['herringboneWasteAdderByType.tile']});
    assert.equal(sum(amount(ready(f),'laborPerSqft.tile')),336000); // 700*300*1.6
  }
});

test('new proposals include source and assumption; only used unconfirmed factors require review',()=>{
  const p=mode(paint(),paintGroup,'new');
  assert.match(JSON.stringify(generateQuoteVNext(p)),/startingValueState.paintingSettings.wallAdditionalCoatRatio/);
  p.ownerPricing=synchronizeStartingValuesVNext(p.ownerPricing,CLASS2_DEFINITIONS[p.serviceType],{ownerId:p.ownerPricing.origin.ownerId,confirmPaths:['paintingSettings.wallAdditionalCoatRatio']});
  assert.equal(sum(amount(ready(p),'laborPerWallSqftPerCoat')),80000);
  for(const row of Object.values(p.ownerPricing.startingValueState)){assert.ok(row.source.includes('https://'));assert.ok(row.assumption.length>40);}
  const f=mode(flooring('vinyl_plank',700),floorGroup,'new');ready(f); // straight uses none
  Object.assign(f.customerInputs,{roomCount:2,layoutPattern:'herringbone_or_chevron'});
  f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,CLASS2_DEFINITIONS[f.serviceType],{ownerId:f.ownerPricing.origin.ownerId,confirmPaths:['herringboneWasteAdderByType.vinyl_plank']});
  assert.match(JSON.stringify(generateQuoteVNext(f)),/startingValueState.herringboneLaborMultiplierByType.vinyl_plank/);
});

test('seven pre-change manual and AI books keep their pricing and approvals through read/save and adopt once',()=>{
  assert.equal(historical.sourceCommit,'308ddcf9168d03bc0798bfba850d732f5500cbea');
  assert.equal(Object.keys(historical.cases).length,7);
  for(const [name,item] of Object.entries(historical.cases)){
    const original=structuredClone(item.book),owner=original.ownerId,group=name.startsWith('painting')?paintGroup:floorGroup;
    savePricebook(owner,original);let book=loadPricebook(owner);
    assert.equal(bridge.applicationStatus(book.services[0],book).approvalCurrent,true,name+' baseline approval');
    const draft=bridge.readApplicationBook(owner);
    assert.ok(Object.values(draft.services[0].startingValueState||{}).every(row=>row.pendingAdoption===true));
    bridge.saveApplicationBook(owner,draft);book=loadPricebook(owner);
    assert.deepEqual(book.services[0].pricing,original.services[0].pricing,name+' read/save pricing');
    assert.equal(bridge.applicationStatus(book.services[0],book).approvalCurrent,true,name+' read/save approval');
    bridge.approveApplicationService(owner,book.services[0].id,{revision:bridge.bookRevision(book),adoptStartingValueGroup:group});
    book=loadPricebook(owner);const service=book.services[0];
    assert.equal(service.startingValueAdoptions[group].mode,'adopted');
    assert.ok(Object.values(service.startingValueState||{}).every(row=>row.confirmed===true&&!row.pendingAdoption));
    assert.equal(bridge.applicationStatus(service,book).approvalCurrent,true,name+' adopted approval');
    assert.equal(bridge.applicationStatus(service,book).status,'QUOTING LIVE',name+' live');
    for(const field of ['paintingSettings','diagonalWasteAdderByType','herringboneWasteAdderByType','herringboneLaborMultiplierByType','diagonalLaborMultiplierByType'])for(const [key,value] of Object.entries(original.services[0].pricing[field]||{}))assert.deepEqual(service.pricing[field][key],value,name+' preserves '+field+'.'+key);
  }
});

test('root and mirrored owner maps survive adoption; an explicit tier value is not a base proposal',()=>{
  for(const mirrored of [false,true]){
    const f=flooring('vinyl_plank',300);f.ownerPricing.diagonalWasteAdderByType={vinyl_plank:.05};
    if(mirrored)f.ownerPricing.pricing.diagonalWasteAdderByType={vinyl_plank:.05};
    mode(f,floorGroup,'adopted');assert.equal(f.ownerPricing.diagonalWasteAdderByType.vinyl_plank,.05);
    if(mirrored)assert.deepEqual(f.ownerPricing.diagonalWasteAdderByType,f.ownerPricing.pricing.diagonalWasteAdderByType);
    f.customerInputs.layoutPattern='diagonal';
    const owner=f.ownerPricing.origin.ownerId;savePricebook(owner,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'USD',quoteTimeZone:'UTC'}});
    let book=loadPricebook(owner);bridge.approveApplicationService(owner,f.ownerPricing.id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true});
    book=loadPricebook(owner);const q=bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:f.customerInputs},{ownerId:owner,preparingIntake:true}).internalResult;
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
    assert.equal(sum(amount(q,'materialPerSqft.vinyl_plank')),169500); //300*1.13*500
  }
  const p=mode(paint(),paintGroup,'new');p.ownerPricing.tiers=[{name:'Owner value',overrides:{paintingSettings:{wallAdditionalCoatRatio:.8}}}];
  assert.equal(sum(amount(ready(p),'laborPerWallSqftPerCoat')),80000);
});

test('application-created services stay unconfirmed after ordinary approval; explicit confirmation quotes with the on-site line',()=>{
  for(const [name,group,paths] of [['painting',paintGroup,['paintingSettings.wallAdditionalCoatRatio']],['flooring',floorGroup,['diagonalWasteAdderByType.vinyl_plank']]]){
    const old=structuredClone(historical.cases[name]),owner='synthetic-new-starting-'+randomUUID(),service=old.book.services[0];
    for(const key of ['origin','approvedValues','quoteDoneApproval','startingValueState','startingValueAdoptions'])delete service[key];
    if(name==='painting')Object.assign(service.pricing,{ceilingLaborPerSqftPerCoat:100,ceilingMaterialPerSqftPerCoat:30,trimLaborPerLF:200,trimMaterialPerLF:30});
    const draft=bridge.convertApplicationBook({services:[service],defaults:old.book.defaults},'toDollars');
    bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision});let book=loadPricebook(owner);
    bridge.approveApplicationService(owner,service.id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true});book=loadPricebook(owner);
    assert.equal(book.services[0].startingValueAdoptions[group].mode,'new');
    assert.ok(Object.values(book.services[0].startingValueState).every(row=>row.confirmed===false&&row.source&&row.assumption));
    const f={serviceType:service.serviceType,ownerPricing:book.services[0],businessDefaults:book.defaults,customerInputs:old.customerInputs,callerType:'owner',currentMonth:1};
    if(name==='flooring'){
      // Straight work uses no pattern proposal: 300*300*1.1 labor and
      // 300*1.08*500 material must quote before any pattern confirmation.
      const straight=bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:{...f.customerInputs,layoutPattern:'straight'}},{ownerId:owner,preparingIntake:true}).internalResult;
      assert.equal(straight.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(straight));
      assert.equal(sum(amount(straight,'laborPerSqft.vinyl_plank')),99000);
      assert.equal(sum(amount(straight,'materialPerSqft.vinyl_plank')),162000);
      assert.equal(bridge.applicationStatus(book.services[0],book).status,'QUOTING LIVE');
      f.customerInputs.layoutPattern='diagonal';
    }
    const before=bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:f.customerInputs},{ownerId:owner,preparingIntake:true}).internalResult;
    assert.equal(before.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(JSON.stringify(bridge.applicationStatus(book.services[0],book)),/startingValueState/);
    const shown=bridge.readApplicationBook(owner);shown.services[0].startingValueActions={confirmPaths:paths};bridge.saveApplicationBook(owner,shown);
    book=loadPricebook(owner);bridge.approveApplicationService(owner,service.id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true});
    book=loadPricebook(owner);const q=bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:f.customerInputs},{ownerId:owner,preparingIntake:true}).internalResult;
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
    if(name==='painting'){
      // Confirming walls alone allows 400*100*2 = 80000 labor cents.
      // Separately priced ceiling/trim work still reviews until its ratio is confirmed.
      assert.equal(sum(amount(q,'laborPerWallSqftPerCoat')),80000);
      for(const extra of [{ceilingsIncluded:true,ceilingAreaSqft:400,ceilingCoats:2,ceilingSurfaceCondition:'good'},{trimIncluded:true,trimLengthLF:100,trimCoats:2,trimSurfaceCondition:'good'}]){
        const pending=bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:{...f.customerInputs,...extra}},{ownerId:owner,preparingIntake:true}).internalResult;
        assert.equal(pending.resultType,'ESTIMATE_REQUIRES_REVIEW');
        assert.match(JSON.stringify(pending),/startingValueState.paintingSettings/);
      }
    }
    const voice=projectVoiceQuote(sanitizeForCustomerVNext(q),'synthetic-starting-voice',[],{callerMeasurementsEstimated:true});
    assert.ok(voice.voiceSummary.includes('This price is based on the measurements you gave us. The business will confirm them on site.'));
  }
});
