import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,custom} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {generateQuoteVNext,validateCustomerInputs,SERVICE_TYPES} from '../server/quote-engine-vnext/index.js';
import {validateInterviewValue} from '../server/src/priceBookAI.js';
import {installedPriceDefinitions} from '../server/installedPriceConfiguration.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import * as onboarding from '../server/src/onboardingService.js';
import {db,migrate} from '../server/src/db.js';
import {loadPricebook} from '../server/priceBookService.js';

// Expected outcomes were written before the production repair:
// - explicitly supplied 100/100/20 LF produces 36,000 cents before waste,
//   39,600 after waste, and a 234,600-cent total.
// - 1.5 hours at a measured $0.035/hour is 5.25 cents and rounds to 5 cents.
// - a fixed $125 custom service remains exactly 12,500 cents regardless of
//   whether its identity is 1, 40, or 80 supported characters (owner ruling 2026-10-15).
const date={timeZone:'UTC',quoteInstant:'2026-10-15T12:00:00.000Z'};

migrate();

function insertOwner(prefix='owner-batch') {
  const owner=prefix+'-'+randomUUID(),now='2026-10-15T12:00:00.000Z';
  db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'UTC','owner',now);
  return owner;
}

function approvalInput(service) {
  const policy=service.zeroPricePolicy;
  return {
    confirmConfiguration:true,
    confirmLegacySettings:true,
    ...(policy?{zeroClassification:{
      freeCompleteService:policy.freeCompleteService,
      freeTiers:structuredClone(policy.freeTiers),
      includedPrices:structuredClone(policy.includedPrices)
    }}:{})
  };
}

function saveApproveQuote(input,prefix) {
  const owner=prefix+'-'+randomUUID();
  const service=structuredClone(input.ownerPricing);
  const approval=approvalInput(service);
  delete service.origin;
  delete service.approvedValues;
  delete service.quoteDoneApproval;
  delete service.zeroPricePolicy;
  const initial=bridge.readApplicationBook(owner);
  const converted=bridge.convertApplicationBook({
    services:[service],
    defaults:{currency:'USD',quoteTimeZone:'UTC',...input.businessDefaults}
  },'toDollars');
  bridge.saveApplicationBook(owner,{...converted,revision:initial.revision},date);
  let book=bridge.readApplicationBook(owner);
  bridge.approveApplicationService(owner,book.services[0].id,{...approval,revision:book.revision},date);
  book=bridge.readApplicationBook(owner);
  const stored=loadPricebook(owner),storedService=stored.services[0];
  const outcome=bridge.calculateApplicationQuote(stored,storedService,{
    customerInputs:input.customerInputs,customerFeeSelections:{}
  },{...date,preparingIntake:true});
  return {owner,book,stored,service:storedService,status:bridge.bookStatuses(stored,date)[0],outcome};
}

test('QE-008: allocation interview retains exact supported paths, empty maps, bounds, and totals',()=>{
  const pricing={
    underlaymentPerSquare:{product_0:1500},
    underlaymentPriceBasis:{product_0:'installed_area_sell_price'}
  };
  assert.deepEqual(Object.keys(installedPriceDefinitions('ROOFING_REPLACEMENT',pricing)),[
    'underlaymentPerSquare.product_0'
  ]);
  assert.deepEqual(
    validateInterviewValue('ROOFING_REPLACEMENT','installedLaborPercent',{
      'underlaymentPerSquare.product_0':40
    },pricing),
    {'underlaymentPerSquare.product_0':40}
  );
  assert.deepEqual(validateInterviewValue('ROOFING_REPLACEMENT','installedLaborPercent',{},pricing),{});
  assert.throws(()=>validateInterviewValue('ROOFING_REPLACEMENT','installedLaborPercent',{
    'underlaymentPerSquare.product_0':101
  },pricing),/0 to 100|percentage/i);
  assert.throws(()=>validateInterviewValue('ROOFING_REPLACEMENT','installedMaterialsPercent',{
    'underlaymentPerSquare.product_0':70
  },{...pricing,installedLaborPercent:{'underlaymentPerSquare.product_0':40}}),/total more than 100|100%/i);
  for(const unsafe of ['underlaymentPerSquare.not_configured','__proto__.polluted','scopeRates.a.b']) {
    assert.throws(()=>validateInterviewValue('ROOFING_REPLACEMENT','installedLaborPercent',{[unsafe]:50},pricing),/unsupported|supported installed price/i,unsafe);
  }
});

test('QE-008: both explicit empty allocation answers validate across all 20 service types',()=>{
  assert.equal(SERVICE_TYPES.length,20);
  for(const type of SERVICE_TYPES) {
    for(const field of ['installedLaborPercent','installedMaterialsPercent']) {
      assert.deepEqual(validateInterviewValue(type,field,{},{}),{},type+' '+field);
    }
  }
});

test('QE-008: allocation metadata declares an exact pricing-path domain without product-name normalization',()=>{
  const metadata=bridge.applicationMetadata();
  assert.equal(metadata.services.length,20);
  for(const service of metadata.services) {
    for(const field of ['installedLaborPercent','installedMaterialsPercent']) {
      // Offering services keep allocation questions in the guided-interview
      // collection so they do not become ordinary required price-book rows.
      // The exact path contract must nevertheless be present once, and only
      // once, across the public metadata for every service.
      const definitions=[...(service.fields||[]),...(service.interviewFields||[])]
        .filter(item=>item.field===field);
      assert.equal(definitions.length,1,service.serviceType+' '+field+' definition count');
      const [definition]=definitions;
      assert.ok(definition,service.serviceType+' '+field);
      assert.equal(definition.tree?.keyDomain,'installed_price_paths',service.serviceType+' '+field);
      assert.equal(definition.tree?.allowEmpty,true,service.serviceType+' '+field);
      assert.equal(definition.shapedKeys,undefined,service.serviceType+' '+field);
    }
  }
});

test('QE-008: exact allocation paths and explicit empty answers survive draft persistence and resume',()=>{
  const owner=insertOwner('qe008-resume'),original=onboarding.createInterviewDraft(owner,{mode:'browser',serviceTypes:['ROOFING_REPLACEMENT']});
  const path='underlaymentPerSquare.product_0';
  const saved=onboarding.saveInterviewDraft(owner,original.id,{
    revision:original.revision,
    fields:{ROOFING_REPLACEMENT:{
      underlaymentPerSquare:{product_0:15},
      underlaymentPriceBasis:{product_0:'installed_area_sell_price'},
      installedLaborPercent:{[path]:40},installedMaterialsPercent:{[path]:60}
    }},
    confirmedFields:{ROOFING_REPLACEMENT:['underlaymentPerSquare','underlaymentPriceBasis','installedLaborPercent','installedMaterialsPercent']}
  });
  const resumed=onboarding.getInterviewDraft(owner,original.id);
  assert.deepEqual(resumed.fields.ROOFING_REPLACEMENT.installedLaborPercent,{[path]:40});
  assert.deepEqual(resumed.fields.ROOFING_REPLACEMENT.installedMaterialsPercent,{[path]:60});
  assert.deepEqual(resumed.confirmedFields.ROOFING_REPLACEMENT,saved.confirmedFields.ROOFING_REPLACEMENT);
  const emptied=onboarding.saveInterviewDraft(owner,original.id,{
    revision:resumed.revision,
    fields:{ROOFING_REPLACEMENT:{installedLaborPercent:{},installedMaterialsPercent:{}}},
    confirmedFields:{ROOFING_REPLACEMENT:['underlaymentPerSquare','underlaymentPriceBasis','installedLaborPercent','installedMaterialsPercent']}
  });
  assert.deepEqual(emptied.fields.ROOFING_REPLACEMENT.installedLaborPercent,{});
  assert.deepEqual(emptied.fields.ROOFING_REPLACEMENT.installedMaterialsPercent,{});
  assert.ok(emptied.confirmedFields.ROOFING_REPLACEMENT.includes('installedLaborPercent'));
  assert.ok(emptied.confirmedFields.ROOFING_REPLACEMENT.includes('installedMaterialsPercent'));
});

test('QE-008: atomic scope prices precede their exact allocations regardless of incoming key order',()=>{
  const service=structuredClone(measuredScopeCases().find(item=>item.id==='stairs-installed').input.ownerPricing);
  const owner=insertOwner('qe008-atomic-order');
  const original=onboarding.createInterviewDraft(owner,{mode:'browser',serviceTypes:[service.serviceType]});
  const pricing=service.pricing,path='scopeRates.stairs_installed';
  const saved=onboarding.saveInterviewDraft(owner,original.id,{
    revision:original.revision,
    fields:{[service.serviceType]:{
      // Deliberately allocation-first. Validation must use the complete
      // incoming configuration, not JavaScript object insertion order.
      installedLaborPercent:{[path]:65},
      installedMaterialsPercent:{[path]:35},
      scopeRates:{stairs_installed:pricing.scopeRates.stairs_installed},
      scopeDetails:{stairs:pricing.scopeDetails.stairs}
    }},
    confirmedFields:{[service.serviceType]:[
      'scopeDetails','scopeRates','installedLaborPercent','installedMaterialsPercent'
    ]}
  });
  assert.deepEqual(saved.fields[service.serviceType].installedLaborPercent,{[path]:65});
  assert.deepEqual(saved.fields[service.serviceType].installedMaterialsPercent,{[path]:35});
  assert.ok(saved.confirmedFields[service.serviceType].includes('installedLaborPercent'));
});

test('QE-010: custom unit context is applied before money validation regardless of object-key order',()=>{
  const owner=insertOwner('qe010-order');
  const original=onboarding.createInterviewDraft(owner,{mode:'browser',serviceTypes:['CUSTOM']});
  const first=onboarding.saveInterviewDraft(owner,original.id,{
    revision:original.revision,
    // Deliberately price-first: order must not decide its precision contract.
    fields:{CUSTOM:{price:0.035,unit:'per_hour',customPricingMode:'fixed',customChargeClassification:'labor',minimumJob:0}},
    confirmedFields:{CUSTOM:['price','unit','customPricingMode','customChargeClassification','minimumJob']}
  });
  assert.equal(first.fields.CUSTOM.price,0.035);
  assert.equal(first.fields.CUSTOM.unit,'per_hour');
  assert.ok(first.confirmedFields.CUSTOM.includes('price'));

  const second=onboarding.saveInterviewDraft(owner,original.id,{
    revision:first.revision,
    // Reverse order from the first update and change both values atomically.
    fields:{CUSTOM:{unit:'per_unit',price:12.34}},
    confirmedFields:{CUSTOM:['unit','price','customPricingMode','customChargeClassification','minimumJob']}
  });
  assert.equal(second.fields.CUSTOM.price,12.34);
  assert.ok(second.confirmedFields.CUSTOM.includes('price'));
});

test('QE-010: incompatible unit-only change is atomic and compatible semantic change clears stale price confirmation',()=>{
  const owner=insertOwner('qe010-confirmation');
  const original=onboarding.createInterviewDraft(owner,{mode:'browser',serviceTypes:['CUSTOM']});
  const measured=onboarding.saveInterviewDraft(owner,original.id,{
    revision:original.revision,
    fields:{CUSTOM:{unit:'per_hour',price:0.035,customPricingMode:'fixed',customChargeClassification:'labor',minimumJob:0}},
    confirmedFields:{CUSTOM:['unit','price','customPricingMode','customChargeClassification','minimumJob']}
  });
  assert.throws(()=>onboarding.saveInterviewDraft(owner,original.id,{
    revision:measured.revision,
    fields:{CUSTOM:{unit:'per_unit'}},
    confirmedFields:{CUSTOM:['unit','price','customPricingMode','customChargeClassification','minimumJob']}
  }),error=>error.statusCode===422&&/whole.cent|cent precision|fixed charge|per.unit/i.test(error.message));
  assert.deepEqual(onboarding.getInterviewDraft(owner,original.id),measured);

  const fixed=onboarding.saveInterviewDraft(owner,original.id,{
    revision:measured.revision,
    fields:{CUSTOM:{unit:'per_unit',price:12.34}},
    confirmedFields:{CUSTOM:['unit','price','customPricingMode','customChargeClassification','minimumJob']}
  });
  const changed=onboarding.saveInterviewDraft(owner,original.id,{
    revision:fixed.revision,
    fields:{CUSTOM:{unit:'per_hour'}},
    confirmedFields:{CUSTOM:['unit','price','customPricingMode','customChargeClassification','minimumJob']}
  });
  assert.equal(changed.fields.CUSTOM.price,12.34);
  assert.ok(!changed.confirmedFields.CUSTOM.includes('price'));
  assert.ok(changed.confirmedFields.CUSTOM.includes('unit'));
});

test('QE-010: a fractional measured custom rate retains exact arithmetic while fixed units retain whole-cent validation',()=>{
  const input=custom();
  input.ownerPricing.pricing={...input.ownerPricing.pricing,customPricingMode:'fixed',price:3.5,unit:'per_hour'};
  input.customerInputs={...input.customerInputs,unit:'per_hour',hours:1.5};
  const quote=generateQuoteVNext(input);
  assert.equal(quote.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(quote));
  // 3.5 cents/hour * 1.5 hours = 5.25 cents, rounded once at the line total.
  assert.equal(quote.options[0].calculationRecord.scenarios.mid.finalTotalCents,5);
  assert.equal(quote.options[0].lineItems[0].calculation.unroundedCents,5.25);
  const persisted=saveApproveQuote(input,'qe010-fractional');
  assert.equal(persisted.service.pricing.price,3.5);
  assert.equal(persisted.status.status,'QUOTING LIVE',JSON.stringify(persisted.status));
  assert.equal(persisted.outcome.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(persisted.outcome.internalResult));
  assert.equal(persisted.outcome.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,5);
  assert.throws(()=>validateInterviewValue('CUSTOM','price',0.035,{unit:'per_unit',customPricingMode:'fixed'}),/whole.cent|fixed charge/i);
});

function roofInput(customerOverrides={}) {
  const input=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:5000},
    materialCostPerSquare:{asphalt_shingle:10000},
    tearOffPerSquare:{asphalt_shingle:2000},
    underlaymentPerSquare:{asphalt_shingle:1500},
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},
    installedLaborPercent:{'underlaymentPerSquare.asphalt_shingle':0},
    installedMaterialsPercent:{'underlaymentPerSquare.asphalt_shingle':100},
    accessoryPricingMode:'itemized',
    materialAccessoryBasis:'excludes_itemized_accessories',
    starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300,minimumJob:0
  },{
    roofSizeMethod:'roof_measured',roofSizeInput:1000,
    existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',
    pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',
    ...customerOverrides
  });
  input.ownerPricing.priceBasisByCategory.material='sell_price';
  return input;
}

test('QE-009: itemized roofing retains its measured-length gate and honors exact supplied lengths',()=>{
  const absent=roofInput();
  const validation=validateCustomerInputs(absent.serviceType,absent.customerInputs,absent.ownerPricing.pricing,absent.ownerPricing);
  assert.equal(validation.ok,false,JSON.stringify(validation));
  assert.deepEqual(validation.missingCustomerFields,['starterLengthLF','dripEdgeLengthLF','ridgeCapLengthLF']);
  const blocked=generateQuoteVNext(absent);
  assert.equal(blocked.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(blocked));

  const exact=roofInput({starterLengthLF:100,dripEdgeLengthLF:100,ridgeCapLengthLF:20});
  const exactQuote=generateQuoteVNext(exact);
  assert.equal(exactQuote.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(exactQuote));
  // $1/ft starter + $2/ft drip edge + $3/ft ridge = $360; the
  // established 10% accessory waste makes $396, added to the $1,950 base.
  assert.equal(exactQuote.options[0].calculationRecord.scenarios.mid.finalTotalCents,234600);

  const zeroPhysicalScope=generateQuoteVNext(roofInput({starterLengthLF:0,dripEdgeLengthLF:0,ridgeCapLengthLF:0}));
  assert.equal(zeroPhysicalScope.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(zeroPhysicalScope));
  assert.equal(zeroPhysicalScope.options[0].calculationRecord.scenarios.mid.finalTotalCents,195000);

  const persisted=saveApproveQuote(exact,'qe009-roof');
  assert.equal(persisted.status.status,'QUOTING LIVE',JSON.stringify(persisted.status));
  assert.equal(persisted.outcome.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(persisted.outcome.internalResult));
  assert.equal(persisted.outcome.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,234600);
});

test('QE-009: all-in roofing activates and quotes without itemized declarations or accessory double charging',()=>{
  const input=roofInput(),pricing=input.ownerPricing.pricing;
  pricing.accessoryPricingMode='per_square_allin';
  for(const field of ['materialAccessoryBasis','starterPerLF','dripEdgePerLF','ridgeCapPerLF'])delete pricing[field];
  const observed=saveApproveQuote(input,'qe009-all-in');
  assert.equal(observed.status.status,'QUOTING LIVE',JSON.stringify(observed.status));
  assert.equal(observed.outcome.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,195000);
  const contradictory=structuredClone(input);
  contradictory.customerInputs.starterLengthLF=100;
  const validation=validateCustomerInputs(contradictory.serviceType,contradictory.customerInputs,pricing,contradictory.ownerPricing);
  assert.equal(validation.ok,false);
  assert.ok(validation.invalidCustomerFields.includes('starterLengthLF'));
});

test('QE-009: all-in interview review excludes itemized-only answers and mode changes invalidate dependent confirmations',()=>{
  const owner=insertOwner('qe009-draft');
  const original=onboarding.createInterviewDraft(owner,{mode:'browser',serviceTypes:['ROOFING_REPLACEMENT']});
  const allIn=onboarding.saveInterviewDraft(owner,original.id,{
    revision:original.revision,
    fields:{ROOFING_REPLACEMENT:{
      accessoryPricingMode:'per_square_allin',
      materialCostPerSquare:{asphalt_shingle:100},
      materialAccessoryBasis:'excludes_itemized_accessories',
      starterPerLF:1,dripEdgePerLF:2,ridgeCapPerLF:3
    }},
    confirmedFields:{ROOFING_REPLACEMENT:['accessoryPricingMode','materialCostPerSquare','materialAccessoryBasis','starterPerLF','dripEdgePerLF','ridgeCapPerLF']}
  });
  // Values remain recoverable in the draft when the owner switches back, but
  // inactive answers cannot materialize into the price book or stay confirmed.
  assert.equal(allIn.fields.ROOFING_REPLACEMENT.starterPerLF,1);
  assert.deepEqual(onboarding.draftReviewPayload(owner,original.id).services[0].fields,{
    accessoryPricingMode:'per_square_allin',
    materialCostPerSquare:{asphalt_shingle:100}
  });
  assert.deepEqual(allIn.confirmedFields.ROOFING_REPLACEMENT,['accessoryPricingMode','materialCostPerSquare']);

  const itemized=onboarding.saveInterviewDraft(owner,original.id,{
    revision:allIn.revision,
    fields:{ROOFING_REPLACEMENT:{accessoryPricingMode:'itemized'}},
    confirmedFields:{ROOFING_REPLACEMENT:[...allIn.confirmedFields.ROOFING_REPLACEMENT,'accessoryPricingMode']}
  });
  assert.ok(!itemized.confirmedFields.ROOFING_REPLACEMENT.includes('materialCostPerSquare'));
  const review=onboarding.draftReviewPayload(owner,original.id).services[0].fields;
  assert.equal(review.accessoryPricingMode,'itemized');
  assert.equal(review.materialAccessoryBasis,'excludes_itemized_accessories');
  assert.equal(review.starterPerLF,1);
});

function namedCustom(name) {
  const input=custom();
  input.ownerPricing.service=name;
  input.customerInputs.service=name;
  return input;
}

for(const [label,name] of [
  ['40 characters','C'.repeat(40)],
  ['80 characters','E'.repeat(80)],
  ['1 character','R'],
  ['Unicode identity','Réparation de façade 🏠']
]) test('QE-016: '+label+' saves, approves, reloads, and quotes without truncation',()=>{
  const observed=saveApproveQuote(namedCustom(name),'qe016-'+label.replaceAll(' ','-'));
  assert.equal(observed.service.service,name);
  assert.equal(observed.status.status,'QUOTING LIVE',JSON.stringify(observed.status));
  assert.equal(observed.outcome.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(observed.outcome.internalResult));
  assert.equal(observed.outcome.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,12500);
});

test('QE-016: 81-character custom identity is rejected specifically and never truncated',()=>{
  const input=namedCustom('X'.repeat(81));
  const customerValidation=validateCustomerInputs('CUSTOM',input.customerInputs,input.ownerPricing.pricing,input.ownerPricing);
  assert.equal(customerValidation.ok,false);
  assert.deepEqual(customerValidation.invalidCustomerFields,['service']);
  assert.match(customerValidation.validationMessages.join(' '),/1-80 characters/i);
  const owner='qe016-too-long-'+randomUUID();
  const initial=bridge.readApplicationBook(owner);
  const service=structuredClone(input.ownerPricing);
  delete service.origin;
  const converted=bridge.convertApplicationBook({services:[service],defaults:{currency:'USD',quoteTimeZone:'UTC',...input.businessDefaults}},'toDollars');
  assert.throws(()=>bridge.saveApplicationBook(owner,{...converted,revision:initial.revision},date),error=>
    error.statusCode===422&&error.message==='Enter a service name of 1–80 characters.');
  assert.equal(bridge.readApplicationBook(owner).services.length,0);
});
