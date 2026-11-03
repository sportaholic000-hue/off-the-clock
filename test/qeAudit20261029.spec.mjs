import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext,buildInternalLeadVNext} from '../server/quote-engine-vnext/engine.js';
import {vNextServiceStatus,quoteFromVNextPricebook} from '../server/quote-engine-vnext/priceBook.js';
import {fixture,concrete,mowing,custom,flatRoof} from '../verification/engine-independent/fixtures.mjs';
import {CLASS2_DEFAULTS_BY_SERVICE} from '../server/priceBookMetadata.js';
import {class2FieldCopy} from '../server/priceBookCopy.js';
import {checkStoredQuoteBookingTerms,storedQuoteValidityEndsAt} from '../server/src/quoteBookingTerms.js';
import {applyPriceMetadata,staleOwnerPrices} from '../server/priceMetadata.js';
import {roofSlopeRule,roofCodeMinimumSlope} from '../server/quote-engine-vnext/roofSlopeRules.js';

// Every expected value below was worked out by hand before the run.
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const lines=q=>q.options?.[0]?.lineItems||[];
const line=(q,name)=>lines(q).find(l=>l.name===name);
const CATEGORIES=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];

function slab(extra={}){
  const f=concrete();
  Object.assign(f.ownerPricing.pricing,{defaultSlabThicknessInches:5,defaultReinforcement:'rebar',newSlabBase:'included'});
  for(const k of ['thickness','reinforcement','baseNeeded'])delete f.customerInputs[k];
  Object.assign(f.customerInputs,extra);
  return f;
}
test('the owner slab specification is always used; a stale customer answer cannot thin the slab',()=>{
  // 20 x 10 at 5 in: 200 x 5/324 x 1.10 = 3.3951 yd x 18,000 = 61,111.11; labor 120,000;
  // formwork 60 LF x 2,500 = 150,000; rebar 220 x 200 = 44,000; base 200 x 175 = 35,000. 410,111.11.
  assert.equal(generateQuoteVNext(slab()).options[0].midEstimate,4101.11);
  assert.equal(generateQuoteVNext(slab({thickness:4,reinforcement:'none',baseNeeded:false})).options[0].midEstimate,4101.11);
});

function roof(customer={},pricing={}){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,...pricing},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  return f;
}
test('asphalt shingles below 2/12 go to review; 2/12 up to 4/12 adds a second underlayment layer',()=>{
  // 20 squares: labor 400,000 + material 20 x 1.10 x 15,000 = 330,000 + tear-off 120,000
  // + underlayment 40,000 + disposal 60,000 = 950,000.
  for(const rise of [0,1]){
    const q=generateQuoteVNext(roof({pitchRisePer12:rise}));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',String(rise));
    assert.match(q.reviewReason,/Asphalt shingles are installed only on roofs of 2\/12 or steeper/);
  }
  for(const rise of [2,3]){
    const q=generateQuoteVNext(roof({pitchRisePer12:rise}));
    assert.equal(cents(q),990000,String(rise));
    assert.equal(line(q,'Low-slope second underlayment layer').amountCents,40000);
  }
  for(const rise of [4,6])assert.equal(cents(generateQuoteVNext(roof({pitchRisePer12:rise}))),950000);
  // Without a rise, the low-slope band (under 4/12) sends shingle work to review; the walkable band quotes.
  const low=generateQuoteVNext(roof({pitchBand:'under_four'}));
  assert.equal(low.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.match(low.reviewReason,/below 4\/12/);
  assert.equal(cents(generateQuoteVNext(roof())),950000);
  assert.match(generateQuoteVNext(roof({pitchMethod:'area_by_pitch',pitchAreaUnder4Sqft:500,pitchAreaUpTo6Sqft:1500})).reviewReason,/below 4\/12/);
  // A 3/12 rise may be answered with either band.
  assert.equal(cents(generateQuoteVNext(roof({pitchBand:'under_four',pitchRisePer12:3}))),990000);
  // A steep band quotes.
  assert.equal(generateQuoteVNext(roof({pitchBand:'seven_to_nine'})).resultType,'INSTANT_ESTIMATE_READY');
  const live=roof();assert.equal(vNextServiceStatus(live.ownerPricing,live.businessDefaults).status,'QUOTING LIVE');
  // Code minimums by the owner's product type (IRC R905); a product name decides nothing.
  const classes={a:'asphalt_shingle',b:'slate',c:'wood_shake',d:'metal_shingle',e:'concrete_tile',f:'standing_seam_metal',g:'lapped_metal_panel',h:'lapped_metal_panel_sealed'};
  assert.deepEqual(Object.values(classes).map(cls=>roofCodeMinimumSlope('irc',cls)),[2,4,3,3,2.5,0.25,3,0.5]);
  // The rule also needs the manufacturer minimum the owner enters; the higher of the two governs.
  const p={roofBuildingCode:'irc',roofProductClass:{...classes,slate_look:undefined}};
  assert.deepEqual(['a','f','slate_look'].map(key=>roofSlopeRule(p,key)),[null,null,null]);
  p.roofProductMinSlope={a:2,f:3};
  assert.deepEqual(['a','f'].map(key=>roofSlopeRule(p,key).min),[2,3]);
});

test('a large two-storey footprint is confirmed as the ground floor only',()=>{
  const fp=(extra={})=>roof({roofSizeMethod:'footprint',roofSizeInput:2400,pitchRisePer12:6,stories:2,...extra},{storyMultiplier:{1:1,2:1.10,3:1.20}});
  assert.deepEqual(generateQuoteVNext(fp()).missingCustomerFields,['footprintGroundFloorOnly']);
  assert.equal(generateQuoteVNext(fp({footprintGroundFloorOnly:true})).resultType,'INSTANT_ESTIMATE_READY');
  const no=generateQuoteVNext(fp({footprintGroundFloorOnly:false}));
  assert.equal(no.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.match(no.validationMessages.join(' '),/ground-floor footprint only/);
  // 1,800 sq ft or less, or a one-storey house: not asked.
  assert.equal(generateQuoteVNext(fp({roofSizeInput:1800})).resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(generateQuoteVNext(fp({stories:1})).resultType,'INSTANT_ESTIMATE_READY');
});

function joints(inputs,own={}){
  const f=concrete();Object.assign(f.ownerPricing.pricing,{controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:100},own);
  for(const k of ['length','width'])delete f.customerInputs[k];Object.assign(f.customerInputs,inputs);
  return f;
}
test('control joints use a measured rectangle outline, record the panel rule, and respect NRMCA spacing',()=>{
  const derivation=q=>q.options[0].calculationRecord.quantityDerivations.find(d=>d.name==='controlJointLengthLF');
  // 40 x 10 at 10 ft: four 10 x 10 panels, 3 cuts x 10 ft = 30 LF, by dimensions or by outline.
  const byDims=generateQuoteVNext(joints({dimensionMethod:'exact',length:40,width:10}));
  const byOutline=generateQuoteVNext(joints({dimensionMethod:'measured_outline',outlinePoints:[{x:0,y:0},{x:40,y:0},{x:40,y:10},{x:0,y:10},{x:0,y:0}]}));
  assert.equal(line(byDims,'Saw-cut control joints').amountCents,3000);
  assert.equal(line(byOutline,'Saw-cut control joints').amountCents,3000);
  // 20 x 2: panels raised to 7 along the length (20/7 = 2.86 ft, within 1.5 x 2 ft): 6 cuts x 2 = 12 LF.
  const narrow=derivation(generateQuoteVNext(joints({dimensionMethod:'exact',length:20,width:2})));
  assert.deepEqual([narrow.inputs.panelsAlongLength,narrow.inputs.panelsAlongWidth,narrow.result],[7,1,12]);
  assert.match(narrow.formula,/^\(panelsAlongLength - 1\) \* width \+ \(panelsAlongWidth - 1\) \* length/);
  assert.equal((narrow.inputs.panelsAlongLength-1)*narrow.inputs.width+(narrow.inputs.panelsAlongWidth-1)*narrow.inputs.length,narrow.result);
  // 15 ft spacing: a 4-inch slab (12 ft limit) goes to review, a 5-inch slab (15 ft) quotes.
  assert.match(generateQuoteVNext(joints({dimensionMethod:'exact',length:20,width:20,thickness:4},{controlJointSpacingFt:15})).reviewReason,/wider than the 12 feet NRMCA allows for a 4-inch slab/);
  assert.equal(generateQuoteVNext(joints({dimensionMethod:'exact',length:20,width:20,thickness:5},{controlJointSpacingFt:15})).resultType,'INSTANT_ESTIMATE_READY');
  // Over 15 ft is not a valid owner setting.
  const wide=joints({dimensionMethod:'exact',length:20,width:20},{controlJointSpacingFt:100});
  assert.equal(vNextServiceStatus(wide.ownerPricing,wide.businessDefaults).status,'NEEDS PRICING');
  assert.ok(generateQuoteVNext(wide).invalidOwnerFields.includes('controlJointSpacingFt'));
});

test('earlier-rules roof metadata starts walkable pitch at 1.00 and waste help is in percent',()=>{
  assert.equal(CLASS2_DEFAULTS_BY_SERVICE.ROOFING_REPLACEMENT.pitchMultiplier.medium,1);
  assert.match(class2FieldCopy('ROOFING_REPLACEMENT','wasteModerate').help,/entered as a percent: 15 for 15%/);
});

function steepRoof(){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:30000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',stories:1,existingLayers:2,roofComplexity:'simple',serviceScope:'full',pitchMethod:'whole_roof',pitchBand:'seven_to_nine',workMonth:'january'});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  return f;
}
test('steep-roof disposal keeps its own category: no labor surcharge on disposal',()=>{
  // Labor 600,000 + steep install 120,000 + steep removal 31,200 + steep extra-layer removal 21,840
  // + tear-off 120,000 + extra-layer tear-off 84,000 = 977,040 of labor and removal labor.
  // Disposal 10,400 + 10,400 + 80,000, material 330,000 and underlayment 40,000 take no surcharge.
  const f=steepRoof();
  assert.equal(cents(generateQuoteVNext(f)),1447840);
  f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=10;
  const q=generateQuoteVNext(f);
  assert.equal(line(q,'Peak season adjustment').amountCents,97704);
  assert.equal(cents(q),1545544);
});

function taxed(f,taxable){
  f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=8;
  f.ownerPricing.taxabilityByCategory=Object.fromEntries(CATEGORIES.map(c=>[c,taxable]));
  return f;
}
test('a minimum-charge top-up is taxed exactly like labor under materials-only tax; a materials share follows the material tax setting',()=>{
  // $100 mowing labor, $200 minimum, every category taxable at 8%: the top-up is taxed like
  // labor, so the whole 200 is taxed: 200 + 16 = 216.
  let f=taxed(mowing(),true);f.ownerPricing.pricing.minimumServiceCharge=20000;
  assert.equal(cents(generateQuoteVNext(f)),21600);
  f=taxed(mowing(),false);f.ownerPricing.pricing.minimumServiceCharge=20000;
  assert.equal(cents(generateQuoteVNext(f)),20000);
  // $125 custom service, nothing taxable: a 40% materials share stays untaxed.
  f=taxed(custom(),false);f.ownerPricing.pricing.installedMaterialsPercent={price:40};
  assert.equal(cents(generateQuoteVNext(f)),12500);
  // Materials taxable: 125 x 40% x 8% = 4.00.
  f=taxed(custom(),false);f.ownerPricing.taxabilityByCategory.material=true;f.ownerPricing.pricing.installedMaterialsPercent={price:40};
  assert.equal(cents(generateQuoteVNext(f)),12900);
});

test('booking a job keeps the quoted price only while the quote is valid and in the same season pricing',()=>{
  const row=({validityDays,seasonActive})=>({resultJson:JSON.stringify({internalResult:{calculationRecord:{
    quoteDate:{timeZone:'UTC',quoteInstant:'2026-03-10T12:00:00.000Z'},
    financialInputs:{businessDefaults:validityDays?{quoteValidityDays:validityDays}:{}},
    scenarios:{mid:{seasonal:{percent:10,configuredMonths:[6,7,8],seasonActive}}}}}})});
  const at=(r,start,now='2026-03-11T00:00:00.000Z')=>checkStoredQuoteBookingTerms({quoteRow:r,startAtUtc:start,timeZone:'UTC',now:new Date(now)});
  // Off-season quote (September work): a September date keeps the price; a July date needs a new quote.
  assert.equal(at(row({seasonActive:false}),'2026-09-15T14:00:00.000Z').ok,true);
  assert.equal(at(row({seasonActive:false}),'2026-07-15T14:00:00.000Z').code,'REQUOTE_REQUIRED');
  // Busy-season quote: a July date keeps it; a September date needs a new (lower) quote.
  assert.equal(at(row({seasonActive:true}),'2026-07-15T14:00:00.000Z').ok,true);
  assert.equal(at(row({seasonActive:true}),'2026-09-15T14:00:00.000Z').code,'REQUOTE_REQUIRED');
  // A 1-day quote made March 10 is valid through March 11; booking on March 12 is refused.
  assert.equal(storedQuoteValidityEndsAt(row({validityDays:1,seasonActive:false})),Date.parse('2026-03-12T00:00:00.000Z'));
  assert.equal(at(row({validityDays:1,seasonActive:false}),'2026-09-15T14:00:00.000Z','2026-03-11T23:59:00.000Z').ok,true);
  assert.equal(at(row({validityDays:1,seasonActive:false}),'2026-09-15T14:00:00.000Z','2026-03-12T00:00:00.000Z').code,'QUOTE_EXPIRED');
});

test('room-by-room painting rejects whole-job door and window counts and discloses the opening allowance',()=>{
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,ceilingLaborPerSqftPerCoat:60,ceilingMaterialPerSqftPerCoat:20,minimumJob:0},
    {areaInputMethod:'room_dimensions',rooms:[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2}],wallHeight:'standard',surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingCoats:1,ceilingSurfaceCondition:'good',trimIncluded:false});
  f.ownerPricing.priceBasisByCategory.material='sell_price';
  const ok=generateQuoteVNext(f);
  assert.equal(ok.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(ok.validationMessages||ok.reviewReason));
  assert.ok(JSON.stringify(sanitizeForCustomerVNext(ok)).includes('Paint quantity allows 20 square feet for each door and 15 square feet for each window'));
  f.customerInputs.doorCount=10;
  const stale=generateQuoteVNext(f);
  assert.equal(stale.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.match((stale.validationMessages||[]).join(' ')+stale.reviewReason,/Count doors and windows in each room/);
});

test('the price-book quote helper accepts the trusted quote date for validity',()=>{
  const f=mowing();delete f.currentMonth;f.businessDefaults.quoteValidityDays=1;f.businessDefaults.quoteTimeZone='UTC';
  const request={pricebook:{services:[f.ownerPricing],defaults:f.businessDefaults},serviceType:f.serviceType,customerInputs:f.customerInputs,callerType:'owner'};
  assert.equal(quoteFromVNextPricebook(request).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const q=quoteFromVNextPricebook({...request,quoteDate:{timeZone:'UTC',quoteInstant:'2026-10-29T12:00:00.000Z'}});
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  assert.ok(JSON.stringify(q).includes('This quote is valid for 1 day, until October 30, 2026.'));
});

test('re-checking an unchanged price is a server-dated event that resets its age',()=>{
  const service={id:'svc-1',serviceType:'CONCRETE_PATIO_SLAB',pricing:{concreteCostPerCubicYard:18000},priceBasisByCategory:{material:'cost'}};
  const jan=applyPriceMetadata({services:[service]},null,'2026-01-01T00:00:00.000Z');
  const row=book=>book.services[0].priceMetadata?.concreteCostPerCubicYard;
  assert.equal(row(jan).changedAt,'2026-01-01T00:00:00.000Z');
  assert.equal(staleOwnerPrices(jan.services[0],30,new Date('2026-10-28T00:00:00.000Z')).length,1);
  // The owner re-checks the same $180 price on October 28; a client-supplied date is never trusted.
  const submitted=structuredClone(jan);submitted.services[0].priceMetadata.concreteCostPerCubicYard={...row(jan),reverified:true,verifiedAt:'2020-01-01T00:00:00.000Z'};
  const oct=applyPriceMetadata(submitted,jan,'2026-10-28T00:00:00.000Z');
  assert.equal(row(oct).changedAt,'2026-01-01T00:00:00.000Z');
  assert.equal(row(oct).verifiedAt,'2026-10-28T00:00:00.000Z');
  assert.deepEqual(staleOwnerPrices(oct.services[0],30,new Date('2026-11-01T00:00:00.000Z')),[]);
  // A later save without a re-check keeps the re-check date.
  assert.equal(row(applyPriceMetadata(structuredClone(oct),oct,'2026-11-15T00:00:00.000Z')).verifiedAt,'2026-10-28T00:00:00.000Z');
});

test('on the October 16 roofing rules a story or roof-shape factor below 1 is flagged in the price book',()=>{
  const f=roof({},{storyMultiplier:{1:1,2:0.9,3:1.20}});
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'NEEDS PRICING');
  assert.ok(status.invalidOwnerFields.includes('storyMultiplier.2'));
});

test('every flat-roof detail without its own price is quoted as included only when the owner says so',()=>{
  // With no answer, the quote never presents an unpriced detail as included, and the owner is asked.
  const f=flatRoof();delete f.ownerPricing.pricing.flatRoofItemBasis;
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'QUOTING LIVE');
  assert.ok(status.statusNotices.some(n=>/as confirmed and priced on site\. If your base roof price includes any of them/.test(n)));
  assert.ok(JSON.stringify(sanitizeForCustomerVNext(generateQuoteVNext(f))).includes('Not included; confirmed and priced on site: perimeter edge metal or coping, wall and parapet base flashing, pipe flashings and other penetrations, curbs, drains, deck replacement.'));
  f.ownerPricing.pricing.flatRoofItemBasis={flatRoofEdgeMetalPerLF:'included_in_base',flatRoofWallFlashingPerLF:'included_in_base',flatRoofPenetrationEach:'included_in_base',flatRoofCurbEach:'priced_on_site',flatRoofDrainEach:'included_in_base',flatRoofDeckPerSheet:'priced_on_site'};
  const q=generateQuoteVNext(f),text=JSON.stringify(sanitizeForCustomerVNext(q));
  // 1,000 sq ft: labor 500,000 + membrane 700,000 + tear-off 200,000 + insulation per the fixture = 1,470,000.
  assert.equal(cents(q),1470000);
  assert.ok(text.includes('Included in the roof price: perimeter edge metal or coping, wall and parapet base flashing, pipe flashings and other penetrations, drains.'));
  assert.ok(text.includes('Not included; confirmed and priced on site: curbs, deck replacement.'));
  // A separately priced detail is asked and never listed as included or on site.
  f.ownerPricing.pricing.flatRoofCurbEach=25000;f.customerInputs.curbCount=0;
  assert.ok(JSON.stringify(sanitizeForCustomerVNext(generateQuoteVNext(f))).includes('Not included; confirmed and priced on site: deck replacement.'));
});

test('every new review reason reaches the business as a lead with what to confirm',()=>{
  const outside=mowing();outside.ownerPricing.feeRules.travel='always';outside.businessDefaults.travelFee=2500;
  outside.businessDefaults.travelZones=[{name:'Core',codes:['E2L'],charge:0}];outside.customerInputs.postalCode='E3B 5A3';
  const cases=[
    ['shingles below 2/12',roof({pitchRisePer12:1})],
    ['low-slope band',roof({pitchBand:'under_four'})],
    ['low-slope area',roof({pitchMethod:'area_by_pitch',pitchAreaUnder4Sqft:500,pitchAreaUpTo6Sqft:1500})],
    ['joint spacing',joints({dimensionMethod:'exact',length:20,width:20,thickness:4},{controlJointSpacingFt:15})],
    ['outside travel areas',outside]
  ];
  for(const [label,f] of cases){
    const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',label);
    const lead=buildInternalLeadVNext({request:{serviceType:f.serviceType,ownerPricing:f.ownerPricing,customerInputs:f.customerInputs},internalResult:q});
    assert.equal(lead.quoteId,q.quoteId,label);
  }
  const zone=generateQuoteVNext(outside);
  assert.deepEqual(zone.ownerDecisionRequired.map(d=>[d.kind,d.path]),[['travel_outside_zones','businessDefaults.travelZones']]);
});
