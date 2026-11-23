// November 23, 2026: follow-up repairs from Neon's re-check of e7f5dd5 (v45).
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {mowing,concrete,fixture} from '../verification/engine-independent/fixtures.mjs';
import {jobTaxPercent,quotedTaxRateAt,taxLocationDiagnostics,ZIP4_NEEDED_MESSAGE} from '../server/taxJurisdiction.js';
import {normalizePostalCode,isValidCustomerPostalCode,matchTravelZone,checkQuoteBookingPostalCode} from '../server/travelZones.js';
import {checkStoredQuoteBookingAddress} from '../server/src/quoteBookingLocation.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {surchargeLaborNotice,installedPricesWithoutLaborPortion,laborPortionReviewRows} from '../client/src/surchargeLaborNotice.js';
import {priceChoices} from '../client/src/pricebookReview.js';
import {reconcilePricebook} from '../client/src/pricebookConflict.js';
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {readFileSync} from 'node:fs';

const METADATA=bridge.applicationMetadata().services;
const metaFor=type=>METADATA.find(s=>s.serviceType===type);
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const mid=q=>q.options[0].calculationRecord.scenarios.mid;

const mowingWithTravel=()=>{const f=mowing();f.ownerPricing.feeRules={...f.ownerPricing.feeRules,travel:'always'};return f;};

// ---------------------------------------------------------------------------
// #1 Travel zones + ZIP+4 tax zones: activation picks a sample code that
// satisfies both instead of locking the service in NEEDS PRICING.
// ---------------------------------------------------------------------------
test('#1 US business with travel zones and ZIP+4 tax zones activates as QUOTING LIVE and quotes accurately',()=>{
  const baseDefaults={...mowing().businessDefaults,businessCountry:'US',currency:'USD',taxMode:'TAX_ALL',taxPercent:8,taxByJobLocation:true};
  const splitTaxZones=[{name:'[SYNTHETIC] Region',codes:['981'],percent:9},{name:'[SYNTHETIC] Split block',codes:['98101-1234'],percent:10.25}];

  // 3-digit travel zone covering the split ZIP (both with travel charged and travel not applicable).
  {
    const defaults={...baseDefaults,travelZones:[{name:'[SYNTHETIC] Seattle',codes:['981'],charge:2500}],taxZones:splitTaxZones};
    assert.equal(vNextServiceStatus(mowing().ownerPricing,defaults).status,'QUOTING LIVE');
    const f=mowingWithTravel();
    assert.equal(vNextServiceStatus(f.ownerPricing,defaults).status,'QUOTING LIVE');
    // 5,000 sq ft x 2c = 10,000 + 2,500 travel = 12,500; 10.25% tax = 1,281.25 -> 1,281; total 13,781.
    assert.equal(mid(ready({...f,businessDefaults:defaults,customerInputs:{...f.customerInputs,postalCode:'98101-1234'}})).finalTotalCents,13781);
    // Other ZIP+4 in 98101 gets 9%: 12,500 x 9% = 1,125; total 13,625.
    assert.equal(mid(ready({...f,businessDefaults:defaults,customerInputs:{...f.customerInputs,postalCode:'98101-5555'}})).finalTotalCents,13625);
    // Bare 5-digit 98101 still asks for ZIP+4.
    const bare=generateQuoteVNext({...f,businessDefaults:defaults,customerInputs:{...f.customerInputs,postalCode:'98101'}});
    assert.equal(bare.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(bare.reviewReason,ZIP4_NEEDED_MESSAGE);
  }

  // 5-digit travel zone covering the split ZIP.
  {
    const f=mowingWithTravel();
    const defaults={...baseDefaults,travelZones:[{name:'[SYNTHETIC] Downtown',codes:['98101'],charge:2500}],taxZones:[{name:'[SYNTHETIC] Downtown',codes:['98101'],percent:9.5},{name:'[SYNTHETIC] Split',codes:['98101-1234'],percent:10.25}]};
    assert.equal(vNextServiceStatus(f.ownerPricing,defaults).status,'QUOTING LIVE');
  }

  // Only a ZIP+4 tax zone with business_rate fallback outside zones.
  {
    const f=mowingWithTravel();
    const defaults={...baseDefaults,taxOutsideZones:'business_rate',travelZones:[{name:'[SYNTHETIC] Downtown',codes:['98101'],charge:2500}],taxZones:[{name:'[SYNTHETIC] Split',codes:['98101-1234'],percent:10.25}]};
    assert.equal(vNextServiceStatus(f.ownerPricing,defaults).status,'QUOTING LIVE');
  }

  // Disjoint travel and tax zones with review outside zones still needs pricing.
  {
    const f=mowingWithTravel();
    const defaults={...baseDefaults,taxOutsideZones:'review',travelZones:[{name:'[SYNTHETIC] Downtown',codes:['98101'],charge:2500}],taxZones:[{name:'[SYNTHETIC] North',codes:['98102'],percent:9.5}]};
    assert.equal(vNextServiceStatus(f.ownerPricing,defaults).status,'NEEDS PRICING');
  }

  // Canadian business with missing own-province rate in travel zone 1 still needs pricing (does not skip to zone 2).
  {
    const f=mowingWithTravel();
    const defaults={...mowing().businessDefaults,businessCountry:'CA',businessProvince:'BC',currency:'CAD',taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,travelZones:[{name:'[SYNTHETIC] Vancouver',codes:['V6B'],charge:2500},{name:'[SYNTHETIC] Ottawa',codes:['K1A'],charge:5000}]};
    const st=vNextServiceStatus(f.ownerPricing,defaults);
    assert.equal(st.status,'NEEDS PRICING');
    assert.ok(st.missingOwnerFields.includes('businessDefaults.provinceTaxPercent.BC'));
  }
});

// ---------------------------------------------------------------------------
// #2 Client surchargeLaborNotice & laborPortionReviewRows expand catalog fences
// (fenceOfferings and heightRows) like priceBook.js laborAdjustmentCoverage.
// ---------------------------------------------------------------------------
test('#2 catalog fences surface busy-season $0 surcharge notices and inline labor-portion warnings in UI',()=>{
  const f=fenceFixture('installed');
  delete f.ownerPricing.peakSurchargePercent;
  delete f.ownerPricing.peakMonths;
  const p=f.ownerPricing.pricing;
  p.installedLaborPercent={};
  for(const o of Object.values(p.fenceOfferings)){
    delete o.installedLaborPercent;
    for(const r of Object.values(o.heightRows))r.installedLaborPercent={};
  }
  p.terrainLaborMultiplier={flat:1,moderate:1.15,steep:1.3};
  const defaults={...f.businessDefaults,peakSurchargePercent:15,peakMonths:[6]};
  const fenceMeta=metaFor('FENCING_INSTALL');

  // Both 6 ft and 8 ft height rows (fence run + walk gate) appear in busy-season notice;
  // terrain-adjusted installed fence runs appear in inline labor-portion review rows.
  const notice=surchargeLaborNotice(f.ownerPricing,defaults);
  assert.ok(notice,'expected busy-season $0 notice for catalog fence');
  assert.equal(notice.percent,15);
  assert.equal(notice.prices.length,4);
  assert.ok(notice.prices.some(line=>/Installed fence.*wood · over 4 ft up to 6 ft/i.test(line)));
  assert.ok(notice.prices.some(line=>/Installed fence.*wood · over 6 ft up to 8 ft/i.test(line)));

  const reviewRows=laborPortionReviewRows(f.ownerPricing,fenceMeta);
  assert.equal(reviewRows.length,2);
  assert.ok(reviewRows.every(line=>/Terrain slope Moderate, Steep/.test(line)));
  assert.ok(reviewRows.some(line=>/wood · over 4 ft up to 6 ft/i.test(line)));
  assert.ok(reviewRows.some(line=>/wood · over 6 ft up to 8 ft/i.test(line)));

  // Entering 60% on the 6 ft row removes only the 6 ft fence run and gate when both are set.
  p.fenceOfferings.wood.heightRows.six.installedLaborPercent={'offeringRates.installedFencePerLF':60,'offeringRates.gate_walk':60};
  const afterSix=surchargeLaborNotice(f.ownerPricing,defaults);
  assert.equal(afterSix.prices.length,2);
  assert.ok(afterSix.prices.every(line=>/wood · over 6 ft up to 8 ft/i.test(line)));
  const reviewAfterSix=laborPortionReviewRows(f.ownerPricing,fenceMeta);
  assert.equal(reviewAfterSix.length,1);
  assert.match(reviewAfterSix[0],/wood · over 6 ft up to 8 ft/i);

  // Entering explicit 0 on the 8 ft row clears both notices.
  p.fenceOfferings.wood.heightRows.eight.installedLaborPercent={'offeringRates.installedFencePerLF':0,'offeringRates.gate_walk':0};
  assert.equal(surchargeLaborNotice(f.ownerPricing,defaults),null);
  assert.deepEqual(laborPortionReviewRows(f.ownerPricing,fenceMeta),[]);

  // Top-level heightRows (non-catalog) also expand cleanly.
  const heightOnly={
    serviceType:'FENCING_INSTALL',
    pricing:{
      offeringMode:'installed',
      offeringDetails:{fenceType:'cedar',description:'[SYNTHETIC] Cedar',postFootingDescription:'[SYNTHETIC] Concrete',gates:{}},
      terrainLaborMultiplier:{flat:1,moderate:1.15,steep:1.3},
      heightRows:{six:{exactHeight:6,postSpacingLF:8,offeringRates:{installedFencePerLF:4000}}}
    }
  };
  assert.equal(installedPricesWithoutLaborPortion(heightOnly).length,1);
  assert.match(installedPricesWithoutLaborPortion(heightOnly)[0],/\(6 ft\)/);
  assert.equal(laborPortionReviewRows(heightOnly,fenceMeta).length,1);

  // Half-edited catalog rows (missing height or overlapping) never throw in UI.
  const halfEdited={
    serviceType:'FENCING_INSTALL',
    pricing:{
      terrainLaborMultiplier:{flat:1,moderate:1.15,steep:1.3},
      fenceOfferings:{
        wood:{
          offeringMode:'installed',
          offeringDetails:{fenceType:'wood',gates:{}},
          heightRows:{
            draft:{offeringRates:{installedFencePerLF:4000}},
            dupA:{exactHeight:6,offeringRates:{installedFencePerLF:4000}},
            dupB:{exactHeight:6,offeringRates:{installedFencePerLF:4200}}
          }
        }
      }
    }
  };
  assert.doesNotThrow(()=>surchargeLaborNotice(halfEdited,defaults));
  assert.doesNotThrow(()=>laborPortionReviewRows(halfEdited,fenceMeta));
});

// ---------------------------------------------------------------------------
// #3 9-digit ZIP+4 normalization without hyphen or with space, and updated
// invalid-code messaging across engine, travel zones, tax zones and voice.
// ---------------------------------------------------------------------------
test('#3 9-digit ZIP+4 without hyphen or with space normalizes and quotes cleanly; invalid message mentions 9-digit ZIP',()=>{
  assert.equal(normalizePostalCode('981011234'),'98101-1234');
  assert.equal(normalizePostalCode('98101 1234'),'98101-1234');
  assert.equal(normalizePostalCode('98101 - 1234'),'98101-1234');
  assert.equal(isValidCustomerPostalCode('981011234'),true);
  assert.equal(isValidCustomerPostalCode('98101 1234'),true);
  assert.equal(isValidCustomerPostalCode('98101123'),false);
  assert.equal(isValidCustomerPostalCode('9810112345'),false);

  const defaults={
    ...mowing().businessDefaults,
    businessCountry:'US',currency:'USD',taxMode:'TAX_ALL',taxPercent:8,taxByJobLocation:true,
    travelZones:[{name:'[SYNTHETIC] Seattle',codes:['981'],charge:2500}],
    taxZones:[{name:'[SYNTHETIC] Region',codes:['981'],percent:9},{name:'[SYNTHETIC] Split',codes:['98101-1234'],percent:10.25}]
  };

  for(const raw of ['98101-1234','981011234','98101 1234']){
    assert.equal(jobTaxPercent(raw,defaults).percent,10.25,raw);
    assert.equal(matchTravelZone(raw,defaults.travelZones).status,'matched',raw);
    const f=mowingWithTravel();
    assert.equal(mid(ready({...f,businessDefaults:defaults,customerInputs:{...f.customerInputs,postalCode:raw}})).finalTotalCents,13781,raw);
    assert.equal(checkQuoteBookingPostalCode({quotedPostalCode:'98101-1234',bookingPostalCode:raw,travelZones:defaults.travelZones,quotedTravelCharge:2500}).ok,true,raw);
  }

  // Duplicate detection catches hyphenated + unhyphenated forms of the same ZIP+4.
  assert.equal(taxLocationDiagnostics({taxZones:[{name:'A',codes:['98101-1234'],percent:10},{name:'B',codes:['981011234'],percent:9}]})[0].message,'98101-1234 is already in another tax zone.');

  // Invalid-code messages mention 5-digit or 9-digit US ZIP code.
  const expectedInvalid='Enter a valid Canadian postal code or 5-digit or 9-digit US ZIP code.';
  assert.equal(jobTaxPercent('1234',defaults).message,expectedInvalid);
  assert.equal(matchTravelZone('1234',defaults.travelZones).message,expectedInvalid);
  const badQuote=generateQuoteVNext({...mowing(),businessDefaults:defaults,customerInputs:{...mowing().customerInputs,postalCode:'98101123'}});
  assert.equal(badQuote.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(badQuote.validationMessages[0],expectedInvalid);

  const def=bridge.applicationServiceDefinition(mowing().ownerPricing,{defaults});
  assert.deepEqual(bindVoiceQuoteInputs(mowing().ownerPricing,def,{customerInputs:{...mowing().customerInputs,postalCode:'981011234'}}).followUps,[]);
  const voiceBad=bindVoiceQuoteInputs(mowing().ownerPricing,def,{customerInputs:{...mowing().customerInputs,postalCode:'1234'}});
  assert.ok(voiceBad.followUps.some(m=>/5-digit or 9-digit US ZIP code/i.test(m)));
});

// ---------------------------------------------------------------------------
// #4 priceChoices() exposes paintingRates and all supported included-price
// money leaves without leaking non-money numeric fields.
// ---------------------------------------------------------------------------
test('#4 priceChoices includes paintingRates, shortLoadBands charges, debrisPricing disposalFlat, and never non-money fields',()=>{
  const paintPaths=priceChoices({
    serviceType:'INTERIOR_PAINTING',
    pricing:{offeringRates:{wallLaborPerSqftPerCoat:1.5},paintingRates:{trimPrimerLaborPerLFPerCoat:0,primerMaterialPerSqftPerCoat:0.4}},
    tiers:[{name:'Value',overrides:{paintingRates:{trimMaterialPerLFPerCoat:0}}}]
  },metaFor('INTERIOR_PAINTING')).map(r=>[r.path,r.option]);
  assert.ok(paintPaths.some(([p,o])=>p==='paintingRates.trimPrimerLaborPerLFPerCoat'&&o===null));
  assert.ok(paintPaths.some(([p,o])=>p==='paintingRates.primerMaterialPerSqftPerCoat'&&o===null));
  assert.ok(paintPaths.some(([p,o])=>p==='paintingRates.trimMaterialPerLFPerCoat'&&o==='Value'));

  const concretePaths=priceChoices({
    serviceType:'CONCRETE_DRIVEWAY',
    pricing:{placementFlat:{pump:0},placementPerCubicYard:{pump:25},shortLoadBands:{under_4:{maxCubicYards:4,charge:0}}}
  },metaFor('CONCRETE_DRIVEWAY')).map(r=>r.path);
  assert.ok(concretePaths.includes('placementFlat.pump'));
  assert.ok(concretePaths.includes('placementPerCubicYard.pump'));
  assert.ok(concretePaths.includes('shortLoadBands.under_4.charge'));
  assert.ok(!concretePaths.includes('shortLoadBands.under_4.maxCubicYards'));

  const cleanupPaths=priceChoices({
    serviceType:'LANDSCAPING_CLEANUP',
    pricing:{debrisPricing:{light:{laborMultiplier:1,sqftPerLoad:500,disposalFlat:0}}}
  },metaFor('LANDSCAPING_CLEANUP')).map(r=>r.path);
  assert.ok(cleanupPaths.includes('debrisPricing.light.disposalFlat'));
  assert.ok(!cleanupPaths.includes('debrisPricing.light.laborMultiplier'));
  assert.ok(!cleanupPaths.includes('debrisPricing.light.sqftPerLoad'));

  // Also works even when metadata omits money flags (e.g., partial/empty meta).
  const roofPaths=priceChoices({serviceType:'ROOFING_REPLACEMENT',pricing:{nbcLowSlopeShingleMaterialByProduct:{asphalt_shingle:0}}},{});
  assert.ok(roofPaths.some(r=>r.path==='nbcLowSlopeShingleMaterialByProduct.asphalt_shingle'));
  const repairPaths=priceChoices({serviceType:'ROOFING_REPAIR',pricing:{repairUnitPrice:{asphalt_shingle:{shingle_patch:0}},repairAreaMinimum:{asphalt_shingle:{shingle_patch:300}}}},{});
  assert.ok(repairPaths.some(r=>r.path==='repairUnitPrice.asphalt_shingle.shingle_patch'));
  assert.ok(repairPaths.some(r=>r.path==='repairAreaMinimum.asphalt_shingle.shingle_patch'));
});

// ---------------------------------------------------------------------------
// #5 0%-tax service quoted at a 5-digit ZIP inside a split ZIP+4 zone books
// cleanly at that same ZIP, and a non-zero service tax rate never hides a
// ZIP+4 rate split against the outside-zones fallback.
// ---------------------------------------------------------------------------
test('#5 zero-tax service books cleanly in split ZIP+4 zone; non-zero service tax rate catches ZIP+4 split',()=>{
  const baseDefaults={
    ...mowing().businessDefaults,
    businessCountry:'US',currency:'USD',taxMode:'TAX_ALL',taxPercent:8,taxByJobLocation:true
  };

  // 0% service tax rate quoted at bare 98101 inside split ZIP+4 zone -> books at 98101.
  for(const extra of [
    {taxZones:[{name:'[SYNTHETIC] Region',codes:['981'],percent:9},{name:'[SYNTHETIC] Split',codes:['98101-1234'],percent:10.25}]},
    {taxOutsideZones:'business_rate',taxZones:[{name:'[SYNTHETIC] Split',codes:['98101-1234'],percent:10.25}]}
  ]){
    const f=mowing();
    f.businessDefaults={...baseDefaults,...extra};
    f.ownerPricing.taxPercent=0;
    f.customerInputs.postalCode='98101';
    const q=ready(f);
    assert.equal(mid(q).finalTotalCents,10000);
    assert.deepEqual(quotedTaxRateAt('98101',f.businessDefaults,0),{status:'ok',percent:0});
    assert.equal(checkStoredQuoteBookingAddress({quoteRow:{resultJson:JSON.stringify(q)},bookingPostalCode:'98101'}).ok,true);
  }

  // Service rate 5%, business rate 8%, outside-zones uses business_rate, ZIP+4 zone at 8%:
  // 98101-1234 taxes at 8% while 98101-5555 taxes at 5%, so bare 98101 MUST ask for ZIP+4.
  {
    const f=mowing();
    f.businessDefaults={...baseDefaults,taxOutsideZones:'business_rate',taxZones:[{name:'[SYNTHETIC] Split',codes:['98101-1234'],percent:8}]};
    f.ownerPricing.taxPercent=5;
    assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
    const bare=generateQuoteVNext({...structuredClone(f),customerInputs:{...f.customerInputs,postalCode:'98101'}});
    assert.equal(bare.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(bare.reviewReason,ZIP4_NEEDED_MESSAGE);
    assert.equal(quotedTaxRateAt('98101',f.businessDefaults,5).status,'zip4_needed');
    assert.equal(mid(ready({...structuredClone(f),customerInputs:{...f.customerInputs,postalCode:'98101-1234'}})).finalTotalCents,10800);
    assert.equal(mid(ready({...structuredClone(f),customerInputs:{...f.customerInputs,postalCode:'98101-5555'}})).finalTotalCents,10500);
  }

  // Converse: service rate 5%, business rate 8%, ZIP+4 zone also 5% -> both halves are 5%, bare 98101 quotes 5% directly.
  {
    const f=mowing();
    f.businessDefaults={...baseDefaults,taxOutsideZones:'business_rate',taxZones:[{name:'[SYNTHETIC] Split',codes:['98101-1234'],percent:5}]};
    f.ownerPricing.taxPercent=5;
    assert.equal(mid(ready({...structuredClone(f),customerInputs:{...f.customerInputs,postalCode:'98101'}})).finalTotalCents,10500);
    assert.deepEqual(quotedTaxRateAt('98101',f.businessDefaults,5),{status:'ok',percent:5});
  }
});

// ---------------------------------------------------------------------------
// #6 Combined concrete Base preparation and sod Ground preparation surface in
// client surchargeLaborNotice and laborPortionReviewRows when missing labor share.
// ---------------------------------------------------------------------------
test('#6 concrete Base preparation and sod Ground preparation surface in UI labor notices until labor share is entered',()=>{
  // Concrete combined basePrepPerSqft without basePrepLaborPercent
  {
    const f=concrete();
    delete f.ownerPricing.peakSurchargePercent;delete f.ownerPricing.peakMonths;
    f.ownerPricing.pricing.basePrepPerSqft=200;
    delete f.ownerPricing.pricing.basePrepLaborPercent;
    f.ownerPricing.pricing.accessMultiplier={easy:1,moderate:1.2,difficult:1.4};
    const defaults={...f.businessDefaults,peakSurchargePercent:15,peakMonths:[6]};
    const notice=surchargeLaborNotice(f.ownerPricing,defaults);
    assert.ok(notice?.prices.includes('Base preparation'),JSON.stringify(notice));
    const rows=laborPortionReviewRows(f.ownerPricing,metaFor('CONCRETE_DRIVEWAY'));
    assert.ok(rows.some(r=>/^Base preparation: .*Moderate, Difficult/.test(r)),JSON.stringify(rows));

    // Explicit 0% clears both notices.
    f.ownerPricing.pricing.basePrepLaborPercent=0;
    assert.equal(surchargeLaborNotice(f.ownerPricing,defaults),null);
    assert.deepEqual(laborPortionReviewRows(f.ownerPricing,metaFor('CONCRETE_DRIVEWAY')),[]);
  }

  // Sod combined groundPrepPerSqft without groundPrepLaborPercent
  {
    const sod={
      serviceType:'LANDSCAPING_SOD',
      pricing:{
        sodMaterialPerSqft:80,sodInstallLaborPerSqft:70,groundPrepPerSqft:50,
        slopeMultiplier:{flat:1,moderate:1.15,steep:1.3},
        accessMultiplier:{easy:1,moderate:1.1,difficult:1.25}
      }
    };
    const defaults={peakSurchargePercent:15,peakMonths:[6]};
    const notice=surchargeLaborNotice(sod,defaults);
    assert.ok(notice?.prices.includes('Ground preparation'),JSON.stringify(notice));
    const rows=laborPortionReviewRows(sod,metaFor('LANDSCAPING_SOD'));
    assert.equal(rows.length,1);
    assert.match(rows[0],/^Ground preparation: .*Moderate, Steep.*Moderate, Difficult/);

    // Explicit 0% clears both notices.
    sod.pricing.groundPrepLaborPercent=0;
    assert.equal(surchargeLaborNotice(sod,defaults),null);
    assert.deepEqual(laborPortionReviewRows(sod,metaFor('LANDSCAPING_SOD')),[]);
  }
});

// ---------------------------------------------------------------------------
// #7 Conflict recovery: taxByJobLocation & taxOutsideZones are whole-defaults
// choices; renaming a fence catalog option is NOT a whole-service choice change.
// ---------------------------------------------------------------------------
test('#7 conflict recovery guards taxByJobLocation/taxOutsideZones and allows renaming fence catalog tiers cleanly',()=>{
  const svc={id:'11111111-1111-4111-8111-111111111111',serviceType:'CUSTOM',service:'[SYNTHETIC] Custom',tiers:[],pricing:{price:100}};
  const baseDefaults={markupMode:'markup',markupPercent:20,taxMode:'TAX_ALL',taxPercent:8,currency:'USD',taxByJobLocation:false,taxOutsideZones:'review'};
  const makeBook=defaults=>({services:[svc],revision:1,defaults});

  // Session A enables taxByJobLocation while Session B edits taxPercent -> whole-defaults choice conflict.
  const locA={...baseDefaults,taxByJobLocation:true,taxZones:[{name:'Seattle',codes:['981'],percent:10}]};
  const locB={...baseDefaults,taxPercent:5};
  const taxLocConflict=reconcilePricebook(makeBook(baseDefaults),makeBook(locA),makeBook(locB),{},METADATA);
  assert.equal(taxLocConflict.conflicts.length,1);
  assert.equal(taxLocConflict.conflicts[0].kind,'defaults');

  // Session A changes taxOutsideZones while Session B edits taxPercent -> whole-defaults choice conflict.
  const outA={...baseDefaults,taxOutsideZones:'business_rate'};
  const outConflict=reconcilePricebook(makeBook(baseDefaults),makeBook(outA),makeBook(locB),{},METADATA);
  assert.equal(outConflict.conflicts.length,1);
  assert.equal(outConflict.conflicts[0].kind,'defaults');

  // Renaming a fence catalog tier in Session A while Session B edits a different fence type merges cleanly.
  const f=fourTypes();
  const fenceSvc={...f.ownerPricing,id:'22222222-2222-4222-8222-222222222222'};
  const fenceBase={services:[fenceSvc],revision:1,defaults:f.businessDefaults};
  const fenceA=structuredClone(fenceBase);
  fenceA.services[0].pricing.fenceOfferings.aluminum.tiers[0].name='Standard Renamed';
  const fenceB=structuredClone(fenceBase);
  fenceB.services[0].pricing.fenceOfferings.wood.heightRows.six.offeringRates.installedFencePerLF=4500;
  const fenceMerged=reconcilePricebook(fenceBase,fenceA,fenceB,{},METADATA);
  assert.equal(fenceMerged.conflicts.length,0);
  assert.equal(fenceMerged.draft.services[0].pricing.fenceOfferings.aluminum.tiers[0].name,'Standard Renamed');
  assert.equal(fenceMerged.draft.services[0].pricing.fenceOfferings.wood.heightRows.six.offeringRates.installedFencePerLF,4500);
});

// ---------------------------------------------------------------------------
// #8 Tax location editor help copy accurately describes v45 ZIP+4 split prompt.
// ---------------------------------------------------------------------------
test('#8 taxLocationEditor help text accurately describes the ZIP+4 prompt rule',()=>{
  const src=readFileSync(new URL('../client/src/taxLocationEditor.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(src,/handled like a job outside every zone/);
  assert.match(src,/asked for their full 9-digit ZIP\+4 code/);
});
