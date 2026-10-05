import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {dollarsToCents,centsToDollars} from '../server/priceBookService.js';

// Expected dollar amounts written by hand before these money tests run:
// - Every representative unit rate uses $1.2345 and must store as 123.45 cents.
// - Every representative fixed amount uses $12.34 and must store as 1,234 cents.
// - The installed gate price uses $600.00 and must store as 60,000 cents.
// - The package-cost scope uses $12.34 and must store as 1,234 cents.
// - Nested debris disposal uses $12.34 and must store as 1,234 cents.

function nestedValue(depth,value) {
  let result=value;
  for(let level=0;level<Math.max(1,depth);level+=1)result={['synthetic_'+level]:result};
  return result;
}
function leaves(value) {
  if(value&&typeof value==='object'&&!Array.isArray(value))return Object.values(value).flatMap(leaves);
  return [value];
}
function expectedAmount(kind) {
  return kind==='fixed_amount'?{dollars:12.34,cents:1234}:{dollars:1.2345,cents:123.45};
}

test('metadata sweep round-trips every exposed service money field at base and tier boundaries',()=>{
  let fieldsChecked=0;
  for(const serviceMeta of applicationMetadata().services) {
    for(const field of serviceMeta.fields.filter(candidate=>candidate.money===true)) {
      const expected=expectedAmount(field.moneyKind);
      const value=field.type==='json'?nestedValue(field.tree?.depth||1,expected.dollars):expected.dollars;
      const pricing={
        ...(serviceMeta.serviceType==='CUSTOM'?{unit:'per_hour',customPricingMode:'fixed',customChargeClassification:'labor'}:{}),
        [field.field]:value
      };
      const service={serviceType:serviceMeta.serviceType,pricing,tiers:[{name:'Synthetic tier',overrides:{[field.field]:structuredClone(value)}}]};
      const converted=dollarsToCents(service);
      assert.deepEqual(leaves(converted.pricing[field.field]),leaves(value).map(()=>expected.cents),serviceMeta.serviceType+'.'+field.field+' base');
      assert.deepEqual(leaves(converted.tiers[0].overrides[field.field]),leaves(value).map(()=>expected.cents),serviceMeta.serviceType+'.'+field.field+' tier');
      assert.deepEqual(centsToDollars(converted),service,serviceMeta.serviceType+'.'+field.field+' round trip');
      fieldsChecked+=1;
    }
  }
  assert.ok(fieldsChecked>50,'expected a broad metadata sweep, checked '+fieldsChecked);
});

test('dynamic offering prices round-trip unit and fixed money at base and tier boundaries',()=>{
  const service={
    serviceType:'FENCING_INSTALL',
    pricing:{
      offeringMode:'itemized',
      offeringDetails:{description:'Synthetic fence',fenceType:'wood',fenceHeight:6,terrainSlope:'flat',postFootingDescription:'Synthetic footing',gates:{double_drive:{widthLF:10,description:'Synthetic gate',postsAndFootingsIncluded:false}}},
      offeringRates:{fenceLaborPerLF:1.2345,postMaterialEach:12.34,gate_double_drive:600}
    },
    tiers:[{name:'Synthetic tier',overrides:{offeringRates:{fenceLaborPerLF:1.2345,postMaterialEach:12.34,gate_double_drive:600}}}]
  };
  const converted=dollarsToCents(service);
  assert.deepEqual(converted.pricing.offeringRates,{fenceLaborPerLF:123.45,postMaterialEach:1234,gate_double_drive:60000});
  assert.deepEqual(converted.tiers[0].overrides.offeringRates,{fenceLaborPerLF:123.45,postMaterialEach:1234,gate_double_drive:60000});
  assert.deepEqual(centsToDollars(converted),service);
});

test('dynamic scope prices round-trip unit and package fixed money',()=>{
  const concrete={
    serviceType:'CONCRETE_PATIO_SLAB',
    pricing:{
      scopeDetails:{demolition:{description:'Synthetic demolition',mode:'itemized',category:'removal',maximumThickness:6,reinforcement:'none',accessDifficulty:'easy',disposalIncluded:true}},
      scopeRates:{demolition_removal:1.2345,demolition_disposal:2.3456}
    },
    tiers:[{name:'Synthetic tier',overrides:{scopeRates:{demolition_removal:1.2345,demolition_disposal:2.3456}}}]
  };
  const concreteCents=dollarsToCents(concrete);
  assert.deepEqual(concreteCents.pricing.scopeRates,{demolition_removal:123.45,demolition_disposal:234.56});
  assert.deepEqual(concreteCents.tiers[0].overrides.scopeRates,{demolition_removal:123.45,demolition_disposal:234.56});
  assert.deepEqual(centsToDollars(concreteCents),concrete);

  const flooring={serviceType:'FLOORING_INSTALL',pricing:{
    scopeDetails:{floor_underlayment_laminate:{description:'Synthetic underlayment',mode:'package_cost',productKey:'synthetic_underlayment',coverage:100,wastePercent:10}},
    scopeRates:{floor_underlayment_laminate:12.34}
  }};
  const flooringCents=dollarsToCents(flooring);
  assert.equal(flooringCents.pricing.scopeRates.floor_underlayment_laminate,1234);
  assert.deepEqual(centsToDollars(flooringCents),flooring);
});

test('nested mixed-value maps convert only their declared money leaves',()=>{
  const service={serviceType:'LANDSCAPING_CLEANUP',pricing:{debrisPricing:{light:{laborMultiplier:1.2,disposalFlat:12.34}}}};
  const converted=dollarsToCents(service);
  assert.equal(converted.pricing.debrisPricing.light.laborMultiplier,1.2);
  assert.equal(converted.pricing.debrisPricing.light.disposalFlat,1234);
  assert.deepEqual(centsToDollars(converted),service);
});
