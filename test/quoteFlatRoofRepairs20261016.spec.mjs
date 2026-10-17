import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fixture,flatRoof,flatRepair} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {FLAT_ROOF_ITEMS,REPAIR_UNIT_FIELDS,repairUnitConfig} from '../server/quote-engine-vnext/flatRoofRepairPricing.js';
import {exactFromEvidence,exactToNumber} from '../server/quote-engine-vnext/exactMath.js';
import {customerFieldVisible} from '../server/scopeConfiguration.js';
import {convertPricebookMoney} from '../server/priceBookMoney.js';
import {applicationServiceDefinition,applicationMetadata,applicationStatus} from '../server/src/quoteDoneBridge.js';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {quoteEmailFixture,publish,webQuote,date} from './quoteDeliveryBatch20261015Fixture.mjs';

const total=q=>q.lineItems.reduce((sum,line)=>sum+line.amountCents,0);
const quote=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');return q;};
const portion=e=>exactToNumber(exactFromEvidence(e));
function pitched(){return fixture('ROOFING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:8}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:4000,medium:8000,large:16000}}}},{repairType:'shingle_patch',affectedArea:60,roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false});}
function siding(){return fixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{vinyl:{minor:{small:2,medium:4,large:8}}},materialAllowance:{vinyl:{minor:{small:5000,medium:10000,large:15000}}}},{sidingType:'vinyl',damageLevel:'minor',affectedArea:40,stories:1});}
function units(f,unit,rate,minimum,firstArea,share=60){
  const p=f.ownerPricing.pricing,c=f.customerInputs,m=c.roofType||c.membraneType||c.sidingType,r=c.repairType||c.damageLevel;
  p.repairPricingUnit={[m]:{[r]:unit}};p.repairUnitPrice={[m]:{[r]:rate}};
  p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:share};
  if(unit==='square_feet'){p.repairAreaMinimum={[m]:{[r]:minimum}};p.repairFirstAreaSqft={[m]:{[r]:firstArea}};p.installedLaborPercent['repairAreaMinimum.'+m+'.'+r]=share;}
  return f;
}

// All expectations below were written before the first execution of this file.
test('flat-roof optional items extend exactly; installed deck splits 60/40',()=>{
  // Base:1000*500+1000*1.10*700+1000*200=1,470,000c.
  // Extras:160*1200=192000,2*35000=70000,4*5000=20000,
  // 2*22000=44000,6*9500=57000. Sum=383000;total=1,853,000.
  // Deck:57000*.60=34200labor;57000*.40=22800material.
  const f=flatRoof();Object.assign(f.ownerPricing.pricing,{flatRoofEdgeMetalPerLF:1200,flatRoofCurbEach:35000,flatRoofPenetrationEach:5000,flatRoofDrainEach:22000,flatRoofDeckPerSheet:9500,flatRoofDeckPriceBasis:'installed',installedLaborPercent:{flatRoofDeckPerSheet:60}});
  Object.assign(f.customerInputs,{edgeMetalLF:160,curbCount:2,penetrationCount:4,drainCount:2,deckSheets:6});
  const q=quote(f);
  for(const [name,cents] of [['Perimeter edge metal or coping',192000],['Curbs',70000],['Pipe flashings and other penetrations',20000],['Drains',44000],['Deck replacement',57000]])assert.equal(q.lineItems.find(l=>l.name===name).amountCents,cents);
  assert.equal(total(q),1853000);
  const deck=q.lineItems.find(l=>l.name==='Deck replacement');assert.equal(portion(deck.installedLaborExactCents),34200);assert.equal(portion(deck.installedMaterialExactCents),22800);
});

test('flat deck blank basis is material only; installed requires its labor share',()=>{
  // Material-only6*9500=57000 adds to1470000 =>1527000.
  // Installed without a labor percentage reviews; no inferred labor share.
  const f=flatRoof();f.ownerPricing.pricing.flatRoofDeckPerSheet=9500;f.customerInputs.deckSheets=6;
  const q=quote(f);assert.equal(total(q),1527000);assert.equal(q.lineItems.find(l=>l.name==='Deck replacement').category,'material');
  f.ownerPricing.pricing.flatRoofDeckPriceBasis='installed';const result=generateQuoteVNext(f);assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(result.missingOwnerFields.includes('installedLaborPercent.flatRoofDeckPerSheet'));
});

test('flat no prices asks no extra question; residential, commercial and omitted answers keep base cents',()=>{
  // All three saved-input variants:500000+770000+200000=1470000.
  for(const building of [undefined,'residential','commercial']){
    const f=flatRoof();if(building===undefined)delete f.customerInputs.buildingType;else f.customerInputs.buildingType=building;
    for(const blank of [undefined,null,'']){
      for(const item of FLAT_ROOF_ITEMS)f.ownerPricing.pricing[item.rate]=blank;
      const definition=applicationServiceDefinition(f.ownerPricing),voice=voiceQuestionContract(f.ownerPricing,definition).fields;
      for(const field of ['buildingType',...FLAT_ROOF_ITEMS.map(i=>i.field)]){assert.equal(definition.customerFields.some(q=>q.name===field),false);assert.equal(voice.some(q=>q.field===field),false);}
      assert.equal(total(quote(f)),1470000);
    }
  }
});

test('priced flat questions have identical widget and voice labels and units',()=>{
  // Exactly five new quantities when all five prices are present; zero counts
  // add nothing. No building-type question in either channel.
  const f=flatRoof();for(const item of FLAT_ROOF_ITEMS)f.ownerPricing.pricing[item.rate]=100;
  const d=applicationServiceDefinition(f.ownerPricing),v=voiceQuestionContract(f.ownerPricing,d).fields;
  for(const item of FLAT_ROOF_ITEMS){const a=d.customerFields.find(q=>q.name===item.field),b=v.find(q=>q.field===item.field);assert.equal(a.label,b.label);assert.equal(a.unit,item.unit);assert.equal(b.unit,item.unit);f.customerInputs[item.field]=0;}
  assert.equal(total(quote(f)),1470000);
});

test('flat area repair minimum and decimal extra area match handwritten cents and maximum',()=>{
  // 5<=10 =>25000;80.01-10=70.01;70.01*1200=84012;
  // 25000+84012=109012. Above owner max100 =>review.
  const f=units(flatRepair(),'square_feet',1200,25000,10);
  for(const [area,cents] of [[5,25000],[80.01,109012]]){f.customerInputs.affectedArea=area;assert.equal(total(quote(f)),cents);}
  f.ownerPricing.pricing.largeRepairMaxSqft=100;f.customerInputs.affectedArea=100.01;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('flat seam length and penetration count use their installed units',()=>{
  // 30LF*900=27000;3boots*8500=25500. A missing selected quantity
  // reviews instead of substituting affected area or the legacy band.
  const seam=units(flatRepair(),'linear_feet',900);seam.customerInputs.repairLengthLF=30;assert.equal(total(quote(seam)),27000);
  delete seam.customerInputs.repairLengthLF;assert.equal(generateQuoteVNext(seam).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const boots=flatRepair();boots.customerInputs.repairType='pipe_boot';const id=randomUUID();boots.ownerPricing.knownOfferings.repairType.pipe_boot=id;boots.customerInputs.confirmedFacts.repairType={status:'identified',field:'repairType',value:'pipe_boot',offeringId:id};units(boots,'each',8500);boots.customerInputs.repairItemCount=3;assert.equal(total(quote(boots)),25500);
  boots.customerInputs.repairItemCount=3.5;assert.equal(generateQuoteVNext(boots).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('pitched shingle patch and siding panel area prices replace bands only for that type',()=>{
  // Roof:30000+(60-25)*400=44000. Siding:20000+(40-20)*900=38000.
  assert.equal(total(quote(units(pitched(),'square_feet',400,30000,25))),44000);
  assert.equal(total(quote(units(siding(),'square_feet',900,20000,20))),38000);
});

test('repair pitch, stories and access adjust only installed labor; materials tax uses remaining share',()=>{
  // Roof44000 with60%labor,1.25pitch*1.10stories =>36300labor+
  // 17600material=53900;10%materialstax1760=>55660.
  // Flat27000 with60%labor*1.30access+40%material=31860.
  // Siding38000 with60%labor*1.10stories+40%material=40280.
  const f=units(pitched(),'square_feet',400,30000,25);Object.assign(f.customerInputs,{pitch:'steep',stories:2});
  let q=quote(f);assert.equal(total(q),53900);assert.equal(q.lineItems.reduce((n,l)=>n+portion(l.installedLaborExactCents),0),36300);
  f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;q=quote(f);assert.equal(q.midEstimate,556.60);
  const flat=units(flatRepair(),'linear_feet',900);Object.assign(flat.customerInputs,{repairLengthLF:30,accessDifficulty:'difficult'});assert.equal(total(quote(flat)),31860);
  const side=units(siding(),'square_feet',900,20000,20);side.customerInputs.stories=2;assert.equal(total(quote(side)),40280);
});

test('repair question visibility follows the selected material and repair unit in both channels',()=>{
  // Length question visible forLF, count for each, neither forarea/bands.
  for(const [unit,field] of [['linear_feet','repairLengthLF'],['each','repairItemCount'],['square_feet',null]]){
    const f=units(flatRepair(),unit,900,25000,10),d=applicationServiceDefinition(f.ownerPricing),v=voiceQuestionContract(f.ownerPricing,d,f.customerInputs).fields;
    for(const name of ['repairLengthLF','repairItemCount']){
      const a=d.customerFields.find(q=>q.name===name),b=v.find(q=>q.field===name);
      assert.equal(Boolean(a&&customerFieldVisible(a,f.customerInputs)),name===field);assert.equal(Boolean(b&&customerFieldVisible(b,f.customerInputs)),name===field);
    }
  }
});

test('unit-only repair services activate without retaining obsolete bands',async t=>{
  // A fully priced60sqft roof at44000c needs neither hourly price nor
  // hour/material band maps. All activation quantities use the configuredunit.
  const f=units(pitched(),'square_feet',400,30000,25);
  for(const name of ['laborHourlyRate','repairHours','repairMaterialAllowance'])delete f.ownerPricing.pricing[name];
  assert.equal(total(quote(f)),44000);
  const h=quoteEmailFixture(t),saved=publish(h.c.ownerId,f);
  const status=applicationStatus(saved.service,saved.book,date);
  assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));
});

test('blank unit prices keep every legacy band calculation, independent of optional unit selection',()=>{
  // Roof bands:2/4/8h*$100+40/80/160=>24000/48000/96000.
  // Flat:3/5/8h*$100+60/90/140=>36000/59000/94000.
  // Siding:2/4/8h*$100+50/100/150=>25000/50000/95000.
  for(const [make,areas,cents] of [[pitched,[25,100,999999],[24000,48000,96000]],[flatRepair,[5,50,999999],[36000,59000,94000]],[siding,[5,50,999999],[25000,50000,95000]]])for(const blank of [undefined,null,''])for(let i=0;i<areas.length;i++){
    const f=make(),c=f.customerInputs,p=f.ownerPricing.pricing,m=c.roofType||c.membraneType||c.sidingType,r=c.repairType||c.damageLevel;c.affectedArea=areas[i];
    Object.assign(p,{repairUnitPrice:{[m]:{[r]:blank}},repairAreaMinimum:{[m]:{[r]:blank}},repairPricingUnit:{[m]:{[r]:'each'}}});
    assert.equal(repairUnitConfig(f.serviceType,c,p),null);assert.equal(total(quote(f)),cents[i]);
    assert.equal(applicationServiceDefinition(f.ownerPricing).customerFields.some(q=>['repairLengthLF','repairItemCount'].includes(q.name)),false);
  }
});

test('owner money roundtrip scales prices but never area, units or percentages; new fields start optional',()=>{
  // $250minimum=>$25000c;$12extra=>1200c;10sqft and60% unchanged.
  const pricing={repairPricingUnit:{epdm:{seam_patch:'square_feet'}},repairUnitPrice:{epdm:{seam_patch:12}},repairAreaMinimum:{epdm:{seam_patch:250}},repairFirstAreaSqft:{epdm:{seam_patch:10}},installedLaborPercent:{'repairUnitPrice.epdm.seam_patch':60,'repairAreaMinimum.epdm.seam_patch':60}};
  const book={services:[{serviceType:'FLAT_ROOF_REPAIR',pricing}]},c=convertPricebookMoney(book,'toCents');assert.equal(c.services[0].pricing.repairUnitPrice.epdm.seam_patch,1200);assert.equal(c.services[0].pricing.repairAreaMinimum.epdm.seam_patch,25000);assert.deepEqual(c.services[0].pricing.repairFirstAreaSqft,pricing.repairFirstAreaSqft);assert.deepEqual(convertPricebookMoney(c,'toDollars'),book);
  const metadata=applicationMetadata();const types=Array.isArray(metadata)?metadata:metadata.services;
  for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR'])for(const field of REPAIR_UNIT_FIELDS){const d=types.find(s=>s.serviceType===type).fields.find(f=>f.field===field);assert.equal(d.requiredAtBase,false);assert.equal(d.tree.depth,2);assert.equal(d.defaultValue,undefined);}
});

test('compiled voice removes flat building question and adds specific unit-repair instructions',()=>{
  // No residential/commercial question or buildingType slot; specific blocks
  // include valid approximate measurements and exactly the existing site line.
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  const result=compileVoiceSystemInstruction({guideText,business:{businessName:'[SYNTHETIC] Roofs',agentName:'Sam'},services:['FLAT_ROOF_REPLACEMENT','FLAT_ROOF_REPAIR'].map(serviceType=>({serviceType,serviceLabel:serviceType,active:true,status:'QUOTING LIVE',offerings:[]}))});
  const text=JSON.stringify(result);assert.doesNotMatch(text,/\[buildingType\]|house, a.*garage, or a commercial/);assert.match(text,/Flat-roof measurements/);assert.match(text,/Repair measurements/);assert.match(text,/This price is based on the measurements you gave us\. The business will confirm them on site\./);
});

test('phone caller-confirmed about 6 by 10 flat patch receives quote with on-site line',async t=>{
  // Caller confirms60sqft;25000+(60-10)*1200=85000c => $850.
  const f=units(flatRepair(),'square_feet',1200,25000,10);delete f.customerInputs.affectedArea;Object.assign(f.customerInputs,{repairAreaMethod:'dimensions',repairLengthFt:6,repairWidthFt:10});
  assert.equal(total(quote(f)),85000);
  const h=quoteEmailFixture(t);publish(h.c.ownerId,f);
  const match=await h.tool('matchService',{query:f.ownerPricing.service});assert.equal(match.status,'matched');
  const inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
  const result=await h.tool('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,callerMeasurementsEstimated:true,productConfirmations:{repairType:true,membraneType:true},additionalWork:[]});
  assert.equal(result.status,'quoted',JSON.stringify({result,internal:h.db.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId)}));assert.match(result.quoteNarration,/850/);assert.ok(result.quoteNarration.includes('This price is based on the measurements you gave us. The business will confirm them on site.'));
  const row=h.db.prepare('SELECT originalSubmissionJson FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);assert.equal(JSON.parse(row.originalSubmissionJson).customerInputs.repairLengthFt,6);assert.equal(JSON.parse(row.originalSubmissionJson).customerInputs.repairWidthFt,10);
  const w=webQuote(f);assert.equal(w.result.midEstimate,850);
});


test('derived repair areas cannot be tampered with and zero labor portions are explicit',()=>{
  // 6x10=60sqft;25000+50*1200=85000c. Changing width to11 only in
  // the saved normalized evidence must invalidate its customer projection.
  const f=units(flatRepair(),'square_feet',1200,25000,10,0);
  delete f.customerInputs.affectedArea;Object.assign(f.customerInputs,{repairAreaMethod:'dimensions',repairLengthFt:6,repairWidthFt:10,accessDifficulty:'difficult'});
  const q=quote(f);assert.equal(total(q),85000);
  const changed=structuredClone(q);changed.options[0].calculationRecord.normalizedCustomerInputs.repairWidthFt=11;
  assert.equal(sanitizeForCustomerVNext(changed).resultType,'ESTIMATE_REQUIRES_REVIEW');
  f.customerInputs.affectedArea=59;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});


test('unit pricing for one repair type leaves an unpriced sibling on its exact legacy band',()=>{
  // The configured seam price must not affect a second named patch. With
  // bands3/5/8h and6000/9000/14000c, a50sqftpatch remains59000c.
  const f=units(flatRepair(),'linear_feet',900),p=f.ownerPricing.pricing,c=f.customerInputs;
  p.patchRepairHours.epdm.patch={small:3,medium:5,large:8};p.patchMaterialAllowance.epdm.patch={small:6000,medium:9000,large:14000};
  c.repairType='patch';c.affectedArea=50;c.confirmedFacts.repairType={status:'identified',field:'repairType',value:'patch',offeringId:f.ownerPricing.knownOfferings.repairType.patch};
  assert.equal(total(quote(f)),59000);
});

test('all three repair services support length and count units with mandatory allocation and area limits',()=>{
  // Each service:30*900=27000c;3*8500=25500c. No labor percentage
  // reviews;area1000.01 above maximum1000 reviews even for an each charge.
  for(const make of [pitched,flatRepair,siding])for(const [unit,field,quantity,rate,expected] of [['linear_feet','repairLengthLF',30,900,27000],['each','repairItemCount',3,8500,25500]]){
    const f=units(make(),unit,rate);f.customerInputs[field]=quantity;assert.equal(total(quote(f)),expected);
    f.ownerPricing.pricing.largeRepairMaxSqft=1000;f.customerInputs.affectedArea=1000.01;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
    f.customerInputs.affectedArea=10;delete f.ownerPricing.pricing.installedLaborPercent;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  }
});


test('installed deck material remainder preserves the exact owner percentage',()=>{
  // Expected BEFORE execution:6*9500=57000c; labor99.99%=56994.3c;
  // material0.01%=5.7c exactly. No binary subtraction residue in evidence.
  const f=flatRoof();Object.assign(f.ownerPricing.pricing,{flatRoofDeckPerSheet:9500,flatRoofDeckPriceBasis:'installed',installedLaborPercent:{flatRoofDeckPerSheet:99.99}});f.customerInputs.deckSheets=6;
  const deck=quote(f).lineItems.find(l=>l.name==='Deck replacement');
  assert.equal(portion(deck.installedLaborExactCents),56994.3);assert.equal(portion(deck.installedMaterialExactCents),5.7);
});
