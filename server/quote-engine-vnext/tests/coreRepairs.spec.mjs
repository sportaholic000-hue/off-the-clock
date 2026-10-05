import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext,vNextServiceStatus,getVNextPriceBookMetadata,mergePricingVNext} from '../index.js';
import {validateServiceRulesDetailed,validateOwnerPricing} from '../contracts.js';
import {scopeDefinitions} from '../../scopeConfiguration.js';
import {scopeLines} from '../scopePricing.js';
import {applicationQuoteMonth} from '../../src/quoteDate.js';
import {roof,select,paint,product,fence,cleanup,slab,demolition,includedFixture} from './coreFixtures.mjs';

// Dollar expectations written by hand before execution in CORE_FIXES_20261005.md.
const ready=(f,amount)=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.midEstimate,amount);return q;};

test('core 1: owner room-threshold copy uses inclusive maxima',()=>{
 const metadata=getVNextPriceBookMetadata();
 assert.doesNotMatch(JSON.stringify(metadata),/below the small threshold|Defaults: below 150|150 to under 300/);
 assert.match(JSON.stringify(metadata),/at or below the small|up to and including/);
});
test('core 3: included-price paths use recursive effective tier pricing ($1700)',()=>{
 const f=roof(2),p=f.ownerPricing.pricing;
 f.ownerPricing.priceBasisByCategory.material='cost';p.underlaymentPriceBasis.product_0='cost';
 p.scopeDetails={roof_underlayment_product_0:product('underlay',100)};
 f.ownerPricing.tiers=[{name:'Complete',overrides:{scopeDetails:{roof_underlayment_product_1:product('other',100)},scopeRates:{roof_underlayment_product_0:0,roof_underlayment_product_1:5000}}}];
 f.ownerPricing=includedFixture(f.ownerPricing,{'scopeRates.roof_underlayment_product_0':'materialCostPerSquare.product_0'});
 f.customerInputs.roofUnderlaymentScopeConfirmed=true;
 assert.deepEqual(validateServiceRulesDetailed(f.ownerPricing,f.serviceType),[]);
 ready(f,1700);
});
test('core 4: shared paint purchase retains ceiling covering identity ($350)',()=>{
 const f=paint(),p=f.ownerPricing.pricing;
 p.scopeDetails.paint_trim=product('trim',100);p.scopeRates.paint_trim=0;
 Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:100});
 f.ownerPricing=includedFixture(f.ownerPricing,{'scopeRates.paint_trim':'scopeRates.paint_ceiling'});
 ready(f,350);
});
test('core 5: an unallocated optional gate preserves no-gate quotes ($4160)',()=>{
 const f=fence();ready(f,4160);
 const s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
 assert.equal(s.status,'QUOTING LIVE',JSON.stringify(s));
 const coverage=s.scopeCoverage.find(r=>r.key==='gate_prices_walk');
 assert.equal(coverage.configurationComplete,false);
 assert.ok(coverage.variants.some(v=>v.missingFields.includes('installedMaterialsPercent.offeringRates.gate_walk')));
 f.customerInputs.gates={walk:1};assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
 f.ownerPricing.pricing.installedMaterialsPercent['offeringRates.gate_walk']=40;ready(f,4420);
});
test('core 6: activation retains original tier context and each option ($1710)',()=>{
 const f=roof(),p=f.ownerPricing.pricing;
 f.ownerPricing.knownOfferings.replacementRoofType.product_1='30000000-0000-4000-8000-000000000001';
 f.ownerPricing.tiers=[{name:'Basic',overrides:{}},{name:'Added product',overrides:{laborPerSquare:{product_1:5000},materialCostPerSquare:{product_1:10000},underlaymentPerSquare:{product_1:0},underlaymentPriceBasis:{product_1:'installed_area_sell_price'},installedLaborPercent:{'underlaymentPerSquare.product_1':0},installedMaterialsPercent:{'underlaymentPerSquare.product_1':100}}}];
 f.ownerPricing=includedFixture(f.ownerPricing,{'underlaymentPerSquare.product_1':'materialCostPerSquare.product_1'});
 const q=ready(f,1710);assert.equal(q.options.length,2);
 const s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
 assert.deepEqual(s.validTierNames,['Basic','Added product'],JSON.stringify(s));
});
test('core 7: cleanup disposal replaces an unselected common disposal fee ($120)',()=>{
 const f=cleanup();f.ownerPricing.feeRules.disposal='owner_selected';f.businessDefaults.disposalFee=9900;f.feeSelections={owner:{},customer:{}};
 ready(f,120);
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{ownerFeeSelections:{}}).status,'QUOTING LIVE');
});
test('core 7: named demolition scope can replace a missing common disposal choice ($440)',()=>{
 const f=slab(),p=f.ownerPricing.pricing;p.scopeDetails={demolition__2:demolition()};p.scopeRates={demolition__2_installed:200};
 f.ownerPricing.feeRules.disposal='owner_selected';f.businessDefaults.disposalFee=9900;f.feeSelections={owner:{},customer:{}};
 Object.assign(f.customerInputs,{demolitionNeeded:true,demolitionAreaSqft:100,demolitionThickness:4,demolitionReinforcement:'none',demolitionAccessDifficulty:'easy',demolitionScopeConfirmed:true});
 ready(f,440);
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{ownerFeeSelections:{}}).status,'QUOTING LIVE');
});
test('core 8: trim package coverage is linear in metadata and recorded purchases ($311)',()=>{
 const f=paint();f.customerInputs.ceilingsIncluded=false;delete f.customerInputs.ceilingAreaSqft;delete f.customerInputs.ceilingCoats;
 Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:101});
 f.ownerPricing.pricing.scopeDetails.paint_trim=product('trim',100);f.ownerPricing.pricing.scopeRates.paint_trim=3000;
 assert.equal(scopeDefinitions(f.serviceType,f.ownerPricing.pricing).paint_trim.fields.coverage.unit,'linear feet');
 const q=ready(f,311),rule=q.options[0].calculationRecord.ruleApplications.find(r=>r.name==='purchased_paint_trim');
 assert.equal(rule.inputs.quantityUnit,'linear feet');assert.equal(rule.result,2);
});
test('core 9: missing installed material shares prune large roof pair search',()=>{
 const f=roof(80,{shares:false});f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;
 const start=performance.now(),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:true}),elapsed=performance.now()-start;
 console.log(JSON.stringify({case:'installed material shares',products:80,elapsedMs:elapsed,status:s.status}));
 assert.equal(s.status,'NEEDS PRICING');assert.ok(s.missingOwnerFields.some(p=>p.startsWith('installedMaterialsPercent.')));
 assert.ok(elapsed<1500,`Status blocked for ${elapsed} ms`);
});
