// Engine v29: the fixes agreed on the v28 review and on review findings R01–R15
// (R09 and R14 left as they are). Every expected amount below is worked by hand
// from the fixture's own prices in the comment beside it, not read back from
// the engine.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {mergePricingForValidationVNext} from '../server/quote-engine-vnext/pricingMerge.js';
import {exactCarpetConversion} from '../server/quote-engine-vnext/carpetUnitConversion.js';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';
import {inactiveQuantityAssumption,installedUnusedSettings} from '../server/quote-engine-vnext/surfacePricing.js';
import {BUILDING_AGE_FIELD,paintingJobInCanada} from '../server/quote-engine-vnext/buildingAgeRules.js';
import {installedLaborFactorPath,installedPriceDefinitions} from '../server/installedPriceConfiguration.js';
import {CLASS2_HELP} from '../server/priceBookCopy.js';
import {CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {ROOF_SLOPE_FIELD_COPY} from '../server/quote-engine-vnext/roofSlopeRules.js';
import {validateInterviewValue} from '../server/src/priceBookAI.js';
import {reconcilePricebook} from '../client/src/pricebookConflict.js';
import * as E from '../client/src/pricebookEditing.js';
import {fixture,flooring,flatRepair} from '../verification/engine-independent/fixtures.mjs';
import {explanationCases} from './customerExplanationFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';

const directory=mkdtempSync(join(tmpdir(),'otc-v29-'));
process.env.DATABASE_PATH=join(directory,'synthetic.sqlite');
const database=await import('../server/src/db.js');
database.migrate();
const {createInterviewDraft,saveInterviewDraft,getInterviewDraft}=await import('../server/src/onboardingService.js');

const ready=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason+' '+JSON.stringify([q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const review=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');return q;};
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const lines=q=>Object.fromEntries(q.options[0].lineItems.map(l=>[l.name,l.amountCents]));
const catalog=type=>structuredClone(explanationCases().find(r=>r.id==='catalog-'+type).input);
const scope=id=>structuredClone(measuredScopeCases().find(r=>r.id===id).input);

// ---- Frozen priced inputs (corpus-additions-20261112.json) ----
const corpus=Object.fromEntries(JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261112.json',import.meta.url),'utf8')).map(r=>[r.id,r.input]));
const PRICED={
  // 1,000 sq ft = 10 squares. Labor 10 x 50 = 500; field materials 10 x 1.10 x 100 = 1,100;
  // tear-off 10 x 20 = 200; underlayment 10 x 15 = 150; starter 100 LF x 1.10 x 1 = 110;
  // drip edge 100 x 1.10 x 2 = 220; ridge cap 20 x 1.10 x 3 = 66; decking 2 x 50 = 100.
  'v29:priced-roofing-earlier-rules':{'Roofing labor':50000,'Field materials':110000,'Tear-off':20000,'Underlayment':15000,'Starter strip':11000,'Drip edge':22000,'Ridge cap':6600,'Decking replacement':10000},
  // 20 squares, 7/12–9/12, two storeys, two layers, hip roof (October 16 rules).
  // Labor 20 x 200 = 4,000; storey 10% = 400; roof shape 20% = 800; steep install 20% = 800.
  // Tear-off 20 x 60 = 1,200; second layer x 0.70 = 840; storey 10% of each = 120 and 84.
  // Steep removal 26% of 1,200 = 312 and of 840 = 218.40. Disposal 20 x 30 per layer = 1,200;
  // steep disposal 26% of 600 per layer = 156 + 156. Field materials 20 x 1.15 x 150 = 3,450;
  // underlayment 20 x 20 = 400.
  'v29:priced-roofing-oct16-steep-two-story-two-layers':{'Roofing labor':400000,'Story labor adjustment':40000,'Roof-shape labor adjustment':80000,'Steep-pitch installation':80000,'Steep-pitch removal':31200,'Steep-pitch disposal':15600,'Steep-pitch additional-layer removal':21840,'Steep-pitch additional-layer disposal':15600,'Field materials':345000,'Tear-off':120000,'Additional-layer tear-off':84000,'Story tear-off adjustment':12000,'Additional-layer story adjustment':8400,'Underlayment':40000,'Roofing disposal':120000},
  // 50 x 10 ft at 4 in. Labor 500 x 6 = 3,000; concrete 500 x 4/324 x 1.10 x 180 = 1,222.22;
  // formwork 120 LF x 25 = 3,000; base 500 x 1.75 = 875; mesh 500 x 1.10 x 1.50 = 825.
  'v29:priced-driveway':{'Concrete labor':300000,'Ready-mix concrete':122222,'Formwork':300000,'Base preparation':87500,'Wire mesh reinforcement':82500},
  // Smooth adds 5% of slab labor (150); moderate access 1.10 on both: (3,000 + 150) x 1.10 = 3,465.
  // 5 in: 500 x 5/324 x 1.10 x 180 = 1,527.78.
  'v29:priced-driveway-moderate-smooth-5in':{'Concrete labor':346500,'Ready-mix concrete':152778,'Formwork':300000,'Base preparation':87500,'Wire mesh reinforcement':82500},
  // 1,000 sq ft vinyl: labor 1,000 x 4 = 4,000; materials 1,000 x 1.10 x 7 = 7,700.
  'v29:priced-siding':{'Siding labor':400000,'Siding materials':770000},
  // Fiber cement, three storeys: labor 1,000 x 5.50 x 1.20 = 6,600; materials 1,000 x 1.12 x 9 = 10,080.
  'v29:priced-siding-three-story-fiber-cement':{'Siding labor':660000,'Siding materials':1008000},
  // 20 x 10 ft at 4 in: labor 200 x 6 = 1,200; concrete 200 x 4/324 x 1.10 x 180 = 488.89;
  // formwork 60 LF x 25 = 1,500; base 200 x 1.75 = 350.
  'v29:priced-patio':{'Concrete labor':120000,'Ready-mix concrete':48889,'Formwork':150000,'Base preparation':35000},
  // Stamped adds 50% of slab labor (600); difficult access 1.25: (1,200 + 600) x 1.25 = 2,250.
  // Stamped materials 200 x 1.10 x 3 = 660.
  'v29:priced-patio-difficult-stamped':{'Concrete labor':225000,'Ready-mix concrete':48889,'Formwork':150000,'Base preparation':35000,'Stamped finish materials':66000},
  // 500 sq ft walls, two coats: labor 500 x 2 x 1 = 1,000; paint 500 x 2 x 0.30 x 1.10 = 330;
  // trim 200 LF x 1.25 = 250 labor and 200 x 0.50 x 1.10 = 110 materials.
  'v29:priced-interior-painting':{'Wall labor':100000,'Wall paint and materials':33000,'Trim labor':25000,'Trim materials':11000},
  // High walls 1.10 on wall and ceiling labor: 1,000 x 1.10 = 1,100; ceilings 200 x 2 x 1 x 1.10 = 440,
  // ceiling materials 200 x 2 x 0.30 x 1.10 = 132.
  'v29:priced-interior-painting-high-walls-ceilings':{'Wall labor':110000,'Wall paint and materials':33000,'Ceiling labor':44000,'Ceiling materials':13200,'Trim labor':25000,'Trim materials':11000},
  // 500 sq ft, three storeys 1.20 on labor: finish 500 x 2 x 1 x 1.20 = 1,200; primer 500 x 0.50 x 1.20 = 300;
  // prep 500 x 1 x 1.20 = 600. Materials with 10% waste: 330, 110, 110. Built 1978–1990 in the
  // United States under the 1978 policy: priced.
  'v29:priced-exterior-itemized-three-story-built-1985':{'Wall finish labor':120000,'Wall finish materials':33000,'Wall primer labor':30000,'Wall primer materials':11000,'Saved preparation labor for the defined condition':60000,'Saved preparation materials for the defined condition':11000},
  // 500 x 6 x (1 + 0.60 x 0.20) = 3,360.
  'v29:priced-exterior-installed-three-story':{'Painting including the defined coats, preparation and primer':336000},
  // 300 sq ft tile in 2 rooms: each room is 150 sq ft, one over the 149 small limit, so the small
  // band's boundary labor stays the minimum: 149 x 1.20 = 178.8 > 150 x 1.10 = 165, so
  // 2 x 178.8 x 3 = 1,072.80. Materials 300 x 1.12 x 5 = 1,680; removal 300 x 1 = 300; subfloor 30 x 2 = 60.
  'v29:priced-flooring-replacement':{'Flooring labor':107280,'Flooring materials':168000,'Existing flooring removal':30000,'Subfloor repair allowance':6000},
  // One 300 sq ft room, over the 299 medium limit: 299 x 1.10 = 328.9 > 300 x 1; diagonal 1.20:
  // 328.9 x 1.20 x 3 = 1,184.04. Materials 300 x (1.12 + 0.07) x 5 = 1,785.
  'v29:priced-flooring-replacement-diagonal-one-room':{'Flooring labor':118404,'Flooring materials':178500,'Existing flooring removal':30000,'Subfloor repair allowance':6000},
  // 1,000 sq ft: sod 1,000 x 1.05 x 0.75 = 787.50; labor 1,000 x 1.25 = 1,250; preparation 1,000 x 0.50 = 500.
  'v29:priced-sod':{'Sod material':78750,'Sod installation labor':125000,'Ground preparation':50000},
  // Moderate slope 1.15 and difficult access 1.25 on labor: 1,250 x 1.15 x 1.25 = 1,796.875 -> 1,796.88.
  'v29:priced-sod-moderate-slope-difficult-access':{'Sod material':78750,'Sod installation labor':179688,'Ground preparation':50000}
};
test('corpus: each frozen priced input prices every line as worked by hand',()=>{
  assert.equal(Object.keys(corpus).length,24);
  for(const [id,expected] of Object.entries(PRICED)){
    const q=ready(corpus[id]);
    assert.deepEqual(lines(q),expected,id);
    assert.equal(cents(q),Object.values(expected).reduce((a,b)=>a+b,0),id+' total');
  }
  // Two inputs for each of the eight services named in review.
  const types=Object.keys(PRICED).map(id=>corpus[id].serviceType);
  for(const type of ['ROOFING_REPLACEMENT','CONCRETE_DRIVEWAY','SIDING_REPLACEMENT','CONCRETE_PATIO_SLAB','INTERIOR_PAINTING','EXTERIOR_PAINTING','FLOORING_REPLACEMENT','LANDSCAPING_SOD'])assert.equal(types.filter(t=>t===type).length,2,type);
});

// ---- R08: installed scope prices take the labor adjustment on their labor share ----
test('R08: installed insulation, cover board, siding trim and exposed aggregate scale their labor share',()=>{
  // Access 1.50 at a 60% share: x (1 + 0.60 x 0.50) = x 1.30. Labor 5,000 x 1.50 = 7,500;
  // tear-off 2,000 x 1.50 = 3,000; insulation 1,600 x 1.30 = 2,080; cover board 600 x 1.30 = 780; membrane 7,700.
  assert.deepEqual(lines(ready(corpus['v29:flat-roof-installed-insulation-difficult-access'])),{'Flat roof labor':750000,'Tear-off':300000,'insulation installed price':208000,'coverboard installed price':78000,'Membrane':770000});
  // Three storeys 1.20: labor 4,000 x 1.20 = 4,800; trim 500 x (1 + 0.60 x 0.20) = 560.
  assert.deepEqual(lines(ready(corpus['v29:siding-installed-trim-three-story'])),{'Siding labor':480000,'Siding trim installation complete installed price':56000,'Siding materials':770000});
  // Access 1.50: labor 1,200 x 1.50 = 1,800; exposed aggregate 700 x 1.30 = 910.
  const exposed=lines(ready(corpus['v29:patio-installed-exposed-aggregate-difficult-access']));
  assert.equal(exposed['Concrete labor'],180000);assert.equal(exposed['Additional exposed-aggregate finishing complete installed price'],91000);
  // No share yet: the hard-access job goes to review and asks for it.
  assert.deepEqual(review(corpus['v29:flat-roof-installed-insulation-difficult-no-labor-share']).missingOwnerFields,['installedLaborPercent.scopeRates.insulation_installed']);
  assert.equal(installedLaborFactorPath('FLAT_ROOF_REPLACEMENT',{accessDifficulty:'moderate'},'scopeRates.coverboard_installed'),'accessMultiplier.moderate');
  assert.equal(installedLaborFactorPath('SIDING_REPLACEMENT',{stories:2},'scopeRates.siding_trim_installed'),'storyMultiplier.2');
  assert.equal(installedLaborFactorPath('CONCRETE_DRIVEWAY',{accessDifficulty:'easy'},'scopeRates.exposed_aggregate_installed'),'accessMultiplier.easy');
  assert.equal(installedLaborFactorPath('CONCRETE_PATIO_SLAB',{accessDifficulty:'easy'},'isolationJointPerLF'),null);
});
test('R08: the price book stays live without the share and lists the conditions that need it',()=>{
  for(const [id,selections] of [['commercial-installed',[{accessDifficulty:'moderate'},{accessDifficulty:'difficult'}]],['siding-trim-installed',[{stories:2},{stories:3}]],['exposed-installed',[{accessDifficulty:'moderate'},{accessDifficulty:'difficult'}]]]){
    const f=scope(id),s=vNextServiceStatus({...f.ownerPricing,serviceType:f.serviceType},f.businessDefaults);
    assert.equal(s.status,'QUOTING LIVE',id);
    assert.deepEqual(s.laborAdjustmentCoverage.map(row=>row.selection),selections,id);
    for(const row of s.laborAdjustmentCoverage)assert.match(row.message,/need review until you enter their labor portions/);
  }
});

// ---- R11: isolation joints under materials-only tax ----
test('R11: an isolation joint price is taxed on its materials share',()=>{
  // Taxed materials: ready-mix 488.89 + formwork 40 open LF x 25 = 1,000 + isolation 20 LF x 5 = 100 at 40% = 40.
  // Tax 10% x 1,528.89 = 152.89. Total 1,200 + 488.89 + 1,000 + 100 + 350 + 152.89 = 3,291.78.
  const q=ready(corpus['v29:patio-isolation-joints-materials-tax-share-40']);
  assert.equal(lines(q).Tax,15289);assert.equal(cents(q),329178);
  assert.deepEqual(review(corpus['v29:patio-isolation-joints-materials-tax-no-share']).missingOwnerFields,['installedMaterialsPercent.isolationJointPerLF']);
  assert.equal(installedPriceDefinitions('CONCRETE_PATIO_SLAB',{isolationJointPricing:'per_linear_foot',isolationJointPerLF:500}).isolationJointPerLF,'Isolation joints');
  assert.equal(installedPriceDefinitions('CONCRETE_PATIO_SLAB',{isolationJointPricing:'included'}).isolationJointPerLF,undefined);
});

// ---- R13: leveling area ----
test('R13: a leveling area larger than the floor is refused; equal is priced',()=>{
  // 200 sq ft tile: labor 200 x 3 x 1.10 = 660; materials 200 x 1.12 x 5 = 1,120; leveling 200 x 2 = 400.
  assert.deepEqual(lines(ready(corpus['v29:flooring-install-leveling-200-of-200-sqft'])),{'Flooring labor':66000,'Flooring materials':112000,'Floor leveling':40000});
  const q=review(corpus['v29:flooring-install-leveling-250-of-200-sqft']);
  assert.deepEqual(q.invalidCustomerFields,['floorLevelingSqft']);
  assert.deepEqual(q.validationMessages,['Floor leveling area cannot exceed the measured flooring area.']);
});

// ---- R10: busy-season charge ----
test('R10: the busy-season charge includes itemized overlay preparation labor',()=>{
  const f=scope('overlay-itemized');Object.assign(f.businessDefaults,{peakMonths:[1],peakSurchargePercent:10});f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=10;f.currentMonth=1;
  // 10% x (flooring labor 660 + overlay preparation 200 x 1 = 200) = 86.
  assert.equal(lines(ready(f))['Peak season adjustment'],8600);
});

// ---- R01–R03: carpet unit ----
function carpetBook(tierOverrides,pricing={}){
  const f=flooring('carpet',200);delete f.ownerPricing.pricing.perStepPrice;Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true});
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...pricing});
  f.ownerPricing.tiers=[{name:'Yard tier',overrides:tierOverrides}];return f;
}
test('R01: a tier on square yards reads inherited base carpet prices in yards, in either save order',()=>{
  // Base $3 and $5 per sq ft become $27 and $45 per sq yd in the tier.
  const merged=mergePricingForValidationVNext(carpetBook({}).ownerPricing.pricing,{carpetPriceUnit:'square_yard'});
  assert.deepEqual([merged.laborPerSqft.carpet,merged.materialPerSqft.carpet],[2700,4500]);
  // 200 sq ft = 22.2 sq yd: labor 22.2 x 27 x 1.10 = 660; materials 22.2 x 1.10 x 45 = 1,100 — the
  // same as 200 x 3 x 1.10 and 200 x 1.10 x 5.
  assert.deepEqual(lines(ready(carpetBook({carpetPriceUnit:'square_yard'}))),{'Flooring labor':66000,'Flooring materials':110000});
  // Prices first, then the tier unit set in the editor: the same prices and the same quote.
  const f=carpetBook({}),svc=E.editTierCarpetPriceUnit(f.ownerPricing,0,'square_yard');
  // v32 (owner ruling): nothing is copied into the tier; it reads the base in yards.
  assert.deepEqual(svc.tiers[0].overrides,{carpetPriceUnit:'square_yard'});
  assert.deepEqual(lines(ready({...f,ownerPricing:svc})),{'Flooring labor':66000,'Flooring materials':110000});
  // A yard price with no exact foot price ($28 / 9) is never rounded: the tier has no carpet labor price.
  const g=carpetBook({carpetPriceUnit:'square_foot'},{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2800},materialPerSqft:{carpet:4500}});
  const inexact=mergePricingForValidationVNext(g.ownerPricing.pricing,{carpetPriceUnit:'square_foot'});
  assert.equal(inexact.laborPerSqft.carpet,undefined);assert.equal(inexact.materialPerSqft.carpet,500);
  assert.ok(review(g).missingOwnerFields.includes('laborPerSqft.carpet'));
  assert.equal(exactCarpetConversion(2800,'square_yard','square_foot'),null);
  assert.equal(exactCarpetConversion(301,'square_foot','square_yard'),2709);
});
test('R02: conflict recovery keeps one session\'s carpet unit with that session\'s carpet prices',()=>{
  const service=(labor,material)=>{const s=structuredClone(flooring('carpet',200).ownerPricing);s.id='11111111-1111-4111-8111-111111111111';
    s.pricing.laborPerSqft={...s.pricing.laborPerSqft};s.pricing.materialPerSqft={...s.pricing.materialPerSqft};
    if(labor===undefined)delete s.pricing.laborPerSqft.carpet;else s.pricing.laborPerSqft.carpet=labor;
    if(material===undefined)delete s.pricing.materialPerSqft.carpet;else s.pricing.materialPerSqft.carpet=material;return s;};
  const book=s=>({services:[s],defaults:{},revision:1});
  const carpet=s=>[E.serviceFieldValue(s,'carpetPriceUnit')??'square_foot',E.serviceFieldValue(s,'laborPerSqft')?.carpet,E.serviceFieldValue(s,'materialPerSqft')?.carpet];
  // Local converts $3/$5 per sq ft to yards; remote changes material to $6 per sq ft.
  const base=service(300,500),local=E.editCarpetPriceUnit(base,'square_yard'),remote=E.editServiceField(base,'materialPerSqft',{...E.serviceFieldValue(base,'materialPerSqft'),carpet:600});
  const first=reconcilePricebook(book(base),book(local),book(remote));
  assert.equal(first.conflicts.length,1);assert.equal(first.conflicts[0].label,'Carpet price unit and carpet prices');
  const pick=choice=>reconcilePricebook(book(base),book(local),book(remote),{[first.conflicts[0].key]:choice}).draft.services[0];
  assert.deepEqual(carpet(pick('remote')),['square_foot',300,600]);
  assert.deepEqual(carpet(pick('local')),['square_yard',2700,4500]);
  // Local converts labor-only $3 to yards; remote adds material $5 per sq ft: one conflict, never $27 with $5.
  const b2=service(300,undefined),l2=E.editCarpetPriceUnit(b2,'square_yard'),r2=E.editServiceField(b2,'materialPerSqft',{...E.serviceFieldValue(b2,'materialPerSqft'),carpet:500});
  const second=reconcilePricebook(book(b2),book(l2),book(r2));
  assert.equal(second.conflicts.length,1);
  const merged=carpet(second.draft.services[0]);
  assert.ok(merged[0]==='square_foot'?merged[1]===300:merged[1]===2700,JSON.stringify(merged));
});
test('R03: changing the carpet unit in the interview converts saved carpet prices exactly or changes nothing',()=>{
  const owner='synthetic-v29-'+randomUUID();
  database.db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-12T00:00:00Z');
  const type='FLOORING_INSTALL';let d=createInterviewDraft(owner,{serviceTypes:[type]});
  d=saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{laborPerSqft:{carpet:3},materialPerSqft:{carpet:5}}},confirmedFields:{[type]:['laborPerSqft','materialPerSqft']}});
  // $3 and $5 per sq ft = $27 and $45 per sq yd; back again gives $3 and $5.
  d=saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{carpetPriceUnit:'square_yard'}}});
  assert.deepEqual([d.fields[type].laborPerSqft.carpet,d.fields[type].materialPerSqft.carpet],[27,45]);
  d=saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{carpetPriceUnit:'square_foot'}}});
  assert.deepEqual([d.fields[type].laborPerSqft.carpet,d.fields[type].materialPerSqft.carpet],[3,5]);
  assert.deepEqual(d.confirmedFields[type],['laborPerSqft','materialPerSqft']);
  // Prices sent with the unit are taken as given; the unsent one is converted ($45).
  d=saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{laborPerSqft:{carpet:30},carpetPriceUnit:'square_yard'}}});
  assert.deepEqual([d.fields[type].laborPerSqft.carpet,d.fields[type].materialPerSqft.carpet],[30,45]);
  // $30 per sq yd is $3.333… per sq ft: refused, nothing changed.
  const before=JSON.stringify(d.fields[type]);
  assert.throws(()=>saveInterviewDraft(owner,d.id,{revision:d.revision,fields:{[type]:{carpetPriceUnit:'square_foot'}}}),e=>e.statusCode===422&&/cannot be converted exactly/.test(e.message));
  assert.equal(JSON.stringify(getInterviewDraft(owner,d.id).fields[type]),before);
});

// ---- R04, R05: low-slope roofs ----
function slopeRoof(customer={},pricing={}){
  const product='asphalt_shingle';
  const p=Object.fromEntries(Object.entries({laborPerSquare:20000,materialCostPerSquare:15000,tearOffPerSquare:6000,underlaymentPerSquare:2000,underlaymentPriceBasis:'installed_area_sell_price'}).map(([k,v])=>[k,{[product]:v}]));
  const f=fixture('ROOFING_REPLACEMENT',{...p,disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,
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
test('R04: under NBC the owner\'s saved low-slope method is priced; blank is asked for (v31)',()=>{
  const low=pricing=>slopeRoof({pitchBand:'under_four',pitchRisePer12:3},{roofBuildingCode:'nbc',...pricing});
  // Base 20 squares: labor 4,000 + field materials 20 x 1.10 x 150 = 3,300 + tear-off 1,200 + underlayment 400 + disposal 600 = 9,500.
  // Self-adhered 20 x 45 = 900 replaces the 400 underlayment: 10,000.
  assert.equal(cents(ready(low({lowSlopeAssembly:'self_adhered_underlayment',selfAdheredUnderlaymentPerSquare:4500}))),1000000);
  // A second underlayment layer adds 20 x 20 = 400: 9,900.
  assert.equal(cents(ready(low({lowSlopeAssembly:'double_underlayment'}))),990000);
  // v31 (owner item 6): the cemented application is no longer assumed when blank; it is
  // a third choice. Chosen: NBC 9.26.8, 9,500 + extra shingles 1,100 + cement 240 + labor 600 = 11,440.
  const cemented={nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000};
  assert.equal(cents(ready(low({lowSlopeAssembly:'nbc_low_slope_application',...cemented}))),1144000);
  assert.deepEqual(review(low({lowSlopeAssembly:undefined,...cemented})).missingOwnerFields,['lowSlopeAssembly']);
  assert.match(ROOF_SLOPE_FIELD_COPY.lowSlopeAssembly.help,/Under the Canadian code \(NBC\) you can also choose the cemented low-slope application \(NBC 9\.26\.8\)/);
});
test('R05: a rise that contradicts the pitch answer is checked on every pitch method',()=>{
  for(const method of [{pitchMethod:'whole_roof',pitchBand:'up_to_six'},{pitchMethod:'area_by_pitch',pitchBand:undefined,pitchAreaUpTo6Sqft:2000},{pitchMethod:'not_sure',pitchBand:undefined}]){
    assert.match(review(slopeRoof({...method,pitchRisePer12:1},{unknownPitchBand:'up_to_six'})).reviewReason,/only on roofs of 2\/12 or steeper/,JSON.stringify(method));
    assert.equal(cents(ready(slopeRoof(method,{unknownPitchBand:'up_to_six'}))),950000);
  }
  assert.match(review(slopeRoof({pitchMethod:'area_by_pitch',pitchBand:undefined,pitchAreaUpTo6Sqft:2000,pitchRisePer12:3})).reviewReason,/below 4\/12/);
  assert.equal(cents(ready(slopeRoof({pitchMethod:'area_by_pitch',pitchBand:undefined,pitchAreaUpTo6Sqft:2000,pitchRisePer12:5}))),950000);
});

// ---- R06, R07: painting in Canada ----
test('R06/R07: the job\'s postal code decides the country; 1990 is in the older answer',()=>{
  const paint=(currency,postalCode,buildingAge)=>{const f=catalog('INTERIOR_PAINTING');delete f.ownerPricing.pricing.leadSafePainting;f.businessDefaults.currency=currency;if(postalCode)f.customerInputs.postalCode=postalCode;f.customerInputs.buildingAge=buildingAge;return f;};
  assert.match(review(paint('USD','V5K 0A1','1978_to_1989')).reviewReason,/older home can contain lead/);
  assert.equal(cents(ready(paint('CAD','98101','1978_to_1989'))),169000);
  assert.match(review(paint('CAD',null,'1978_to_1989')).reviewReason,/older home can contain lead/);
  assert.equal(cents(ready(paint('USD','V5K 0A1','1990_or_later'))),169000);
  assert.equal(paintingJobInCanada({postalCode:'v5k0a1'},{currency:'USD'}),true);
  assert.equal(paintingJobInCanada({},{currency:'USD'}),false);
  assert.deepEqual(BUILDING_AGE_FIELD.optionLabels,{before_1978:'Before 1978','1978_to_1989':'1978 to 1990','1990_or_later':'1991 or later',not_sure:'Not sure'});
});

// ---- R12: interview descriptions ----
test('R12: interview descriptions are accepted within their limit and trimmed',()=>{
  assert.equal(validateInterviewValue('CONCRETE_PATIO_SLAB','concreteMixDescription','  32 MPa, 5-8% air  '),'32 MPa, 5-8% air');
  for(const [value,message] of [['','enter a description'],[5,'enter a description'],['a<b','120 characters or fewer'],['x'.repeat(121),'120 characters or fewer']])
    assert.throws(()=>validateInterviewValue('CONCRETE_PATIO_SLAB','concreteMixDescription',value),e=>e.statusCode===422&&e.message.includes(message),String(value));
  assert.equal(validateInterviewValue('CONCRETE_PATIO_SLAB','concreteMixDescription','x'.repeat(120)),'x'.repeat(120));
});

// ---- R15 and Part 1: wording ----
test('R15: under installed pricing only the coat ratios are named as unused',()=>{
  const interior=inactiveQuantityAssumption('INTERIOR_PAINTING',{offeringMode:'installed'},'paintingSettings');
  assert.match(interior,/^The additional-coat labor ratios are saved, but not used by installed pricing/);
  assert.match(interior,/The wall-height bands are still used; edit them in the service fields above\.$/);
  assert.match(inactiveQuantityAssumption('EXTERIOR_PAINTING',{offeringMode:'installed'},'paintingSettings'),/The soffit price unit is still used; edit it in the service fields above\.$/);
  assert.equal(inactiveQuantityAssumption('INTERIOR_PAINTING',{offeringMode:'itemized'},'paintingSettings'),null);
  // The saved value shown under the notice lists only the ratios.
  assert.deepEqual(installedUnusedSettings('paintingSettings',{wallAdditionalCoatRatio:0.8,heightBands:{standardMaxFeet:10,highMaxFeet:14,vaultedMaxFeet:20}}),{wallAdditionalCoatRatio:0.8});
  assert.equal(installedUnusedSettings('paintingSettings',{heightBands:{standardMaxFeet:10,highMaxFeet:14,vaultedMaxFeet:20}}),undefined);
  // A 9 ft room on an installed offering is priced by the height bands: $4,320 at a 10 ft
  // standard limit and $4,579.20 at 8 ft, so the bands are used.
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING'])assert.match(CLASS2_HELP[type+'.paintingSettings'],/The coat ratios are not used by installed pricing\.$/);
});
test('Part 1: unit-priced repair help, the siding label and the installed scope help match the engine',()=>{
  for(const key of ['ROOFING_REPAIR.pitchMultiplier','ROOFING_REPAIR.storyMultiplier','FLAT_ROOF_REPAIR.accessMultiplier','SIDING_REPAIR.storyMultiplier'])
    assert.match(CLASS2_HELP[key],/at a 60% labor share and a factor of 2, a \$250 unit price becomes \$250 × \(1 \+ 0\.60 × 1\) = \$400/,key);
  assert.equal(CLASS2_DEFINITIONS.SIDING_REPLACEMENT.storyMultiplier.label,'Siding story labor multiplier');
  assert.match(CLASS2_HELP['FLAT_ROOF_REPLACEMENT.accessMultiplier'],/at a 60% labor share and 1\.5, a \$10,000 installed price becomes \$13,000/);
  assert.match(CLASS2_HELP['SIDING_REPLACEMENT.storyMultiplier'],/at a 60% labor share and 1\.20, a \$5,000 installed price becomes \$5,600/);
  assert.match(CLASS2_HELP['CONCRETE_PATIO_SLAB.accessMultiplier'],/at a 60% labor share and 1\.5, \$3,000 becomes \$3,900/);
  for(const key of ['FLAT_ROOF_REPLACEMENT.accessMultiplier','SIDING_REPLACEMENT.storyMultiplier','CONCRETE_DRIVEWAY.accessMultiplier'])assert.doesNotMatch(CLASS2_HELP[key],/installed (?:scope|trim|insulation and cover-board) prices?,? (?:and|are)/,key);
});
test('Part 1: the help examples price as stated',()=>{
  // A $250 unit price (25 LF at $10) at a 60% labor share: x (1 + 0.60 x (factor - 1)).
  const unit=(type,p,c,material,repair)=>{const f=fixture(type,{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,...p},c);const q=f.ownerPricing.pricing;
    q.repairPricingUnit={[material]:{[repair]:'linear_feet'}};q.repairUnitPrice={[material]:{[repair]:1000}};q.installedLaborPercent={['repairUnitPrice.'+material+'.'+repair]:60};f.customerInputs.repairLengthLF=25;return f;};
  const roof=(pitch,stories,steep,two)=>unit('ROOFING_REPAIR',{repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:8}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:4000,medium:8000,large:16000}}},pitchMultiplier:{low:1,medium:1,steep,very_steep:1.4},storyMultiplier:{1:1,2:two,3:1.2}},{repairType:'shingle_patch',affectedArea:60,roofType:'asphalt_shingle',pitch,stories,leakPresent:false},'asphalt_shingle','shingle_patch');
  const only=f=>{const all=Object.values(lines(ready(f)));assert.equal(all.length,1);return all[0];};
  // Factor 2 from pitch, or from storeys: $400. Steep 1.25 with two storeys 1.10 adds to 1.35: 250 x 1.21 = $302.50.
  assert.equal(only(roof('steep',1,2,1.1)),40000);
  assert.equal(only(roof('low',2,1.25,2)),40000);
  assert.equal(only(roof('steep',2,1.25,1.1)),30250);
  assert.equal(only(roof('low',1,1.25,1.1)),25000);
  const siding=stories=>unit('SIDING_REPAIR',{repairHours:{vinyl:{minor:{small:2,medium:4,large:8}}},materialAllowance:{vinyl:{minor:{small:5000,medium:10000,large:15000}}},storyMultiplier:{1:1,2:2,3:2.5}},{sidingType:'vinyl',damageLevel:'minor',affectedArea:40,stories},'vinyl','minor');
  assert.equal(only(siding(2)),40000);
  const flat=flatRepair(),fc=flat.customerInputs,fp=flat.ownerPricing.pricing;fc.accessDifficulty='difficult';fp.accessMultiplier={easy:1,moderate:1.15,difficult:2};
  fp.repairPricingUnit={[fc.membraneType]:{[fc.repairType]:'linear_feet'}};fp.repairUnitPrice={[fc.membraneType]:{[fc.repairType]:1000}};fp.installedLaborPercent={['repairUnitPrice.'+fc.membraneType+'.'+fc.repairType]:60};fc.repairLengthLF=25;
  assert.equal(only(flat),40000);
  // Installed scope examples: $10,000 and $3,000 at 1.5 and $5,000 at 1.20 with a 60% share.
  assert.equal(1000000*(1+0.6*0.5),1300000);assert.equal(300000*(1+0.6*0.5),390000);assert.equal(Math.round(500000*(1+0.6*0.2)),560000);
});
