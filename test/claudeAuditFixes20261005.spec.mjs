import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICE_BASIS_CATEGORIES, TAXABILITY_CATEGORIES, generateQuoteVNext, sanitizeForCustomerVNext, vNextServiceStatus, withClass2Defaults } from '../server/quote-engine-vnext/index.js';
import { fixtureIdentity, fixtureOfferings, confirmedFixtureInputs } from './quoteEngineVNextFixtures.mjs';
import { scopeOverlapDiagnostics, scopeEntrySummary } from '../server/scopeConfiguration.js';
import { starterFields, validateStarterOutput } from '../server/src/priceBookAI.js';
import { validateInterviewConfiguration } from '../server/interviewConfiguration.js';
import { customerJobSummary } from '../server/src/quoteIntake.js';
import { applicationServiceDefinition, readApplicationBook, convertApplicationBook } from '../server/src/quoteDoneBridge.js';
import { validateBusinessDefaults } from '../server/quote-engine-vnext/contracts.js';

// Every expected amount below was calculated by hand before the code was run.
const cost = Object.fromEntries(PRICE_BASIS_CATEGORIES.map(c => [c, 'cost']));
const taxability = Object.fromEntries(TAXABILITY_CATEGORIES.map(c => [c, false]));
const defaults = { currency:'CAD', markupPercent:0, markupMode:'markup', overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0, taxMode:'TAX_NONE', taxPercent:0, rangeBufferPercent:10, markupApplies:Object.fromEntries(PRICE_BASIS_CATEGORIES.map(c => [c, true])), peakMonths:[], peakSurchargePercent:0 };
const service = (serviceType, pricing, extra = {}) => ({ ...fixtureIdentity('MANUAL', undefined, serviceType), knownOfferings: fixtureOfferings(serviceType), active:true, serviceType, service:serviceType, pricing: withClass2Defaults(serviceType, pricing), feeRules:{ travel:'not_applicable', disposal:'not_applicable', permit:'not_applicable', overhead:'not_applicable' }, priceBasisByCategory:cost, taxabilityByCategory:taxability, peakMonths:[], peakSurchargePercent:0, ...extra });
const quote = (serviceType, inputs, ownerPricing) => generateQuoteVNext({ serviceType, customerInputs: inputs, ownerPricing, businessDefaults: defaults, callerType:'owner', currentMonth:1 });
const amounts = result => Object.fromEntries(result.lineItems.map(line => [line.name, line.amountCents]));

test('requested insulation without an owner price gives a clear review reason instead of crashing', () => {
  const owner = service('FLAT_ROOF_REPLACEMENT', { laborPerSqft:{ epdm:500, tpo:500 }, membraneCostPerSqft:{ epdm:700, tpo:700 }, tearOffPerSqft:{ epdm:200, tpo:200 }, minimumJob:0 });
  const base = { roofSqft:1000, sqftMethod:'exact', membraneType:'epdm', replacementMembraneType:'tpo', existingLayers:1, accessDifficulty:'easy', serviceScope:'full', buildingType:'residential', coverboardNeeded:false, insulationNeeded:true };
  for (const inputs of [{ ...base, insulationAreaSqft:1000 }, base]) {
    const result = quote('FLAT_ROOF_REPLACEMENT', confirmedFixtureInputs(inputs), owner);
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.match(result.reviewReason, /has not set up insulation and coverboard pricing/);
    assert.ok(result.ownerDecisionRequired.some(item => item.kind === 'insulation_scope_contract'));
    assert.deepEqual(result.invalidCustomerFields, []);
  }
  const complete = quote('FLAT_ROOF_REPLACEMENT', confirmedFixtureInputs({ ...base, insulationAreaSqft:1000 }), owner);
  assert.equal(sanitizeForCustomerVNext(complete).customerMessage, 'We received your request. Someone will follow up to complete or verify the estimate.');
});

const demolition = (low, high) => ({ description:'[SYNTHETIC] Break out and haul existing slab', mode:'itemized', ...(low === undefined ? {} : { minimumThickness:low }), maximumThickness:high, reinforcement:'wire_mesh', accessDifficulty:'easy', disposalIncluded:true });

test('demolition thickness bands do not overlap and each band prices at its own rate', () => {
  assert.deepEqual(scopeOverlapDiagnostics('CONCRETE_DRIVEWAY', { scopeDetails:{ demolition:demolition(undefined, 4), demolition__2:demolition(4, 6) } }), []);
  assert.equal(scopeOverlapDiagnostics('CONCRETE_DRIVEWAY', { scopeDetails:{ demolition:demolition(undefined, 6), demolition__2:demolition(4, 8) } }).length, 1);
  const owner = service('CONCRETE_DRIVEWAY', { laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:300, minimumJob:0, scopeDetails:{ demolition:demolition(undefined, 4), demolition__2:demolition(4, 6) }, scopeRates:{ demolition_removal:300, demolition_disposal:100, demolition__2_removal:400, demolition__2_disposal:100 } });
  assert.equal(vNextServiceStatus(owner, defaults).status, 'QUOTING LIVE');
  const inputs = thickness => confirmedFixtureInputs({ dimensionMethod:'exact', length:20, width:24, thickness:4, finishType:'broom', demolitionNeeded:true, demolitionAreaSqft:480, reinforcement:'none', accessDifficulty:'easy', baseNeeded:false, adjoinsExistingConcrete:false, demolitionScopeConfirmed:true, demolitionThickness:thickness, demolitionReinforcement:'wire_mesh', demolitionAccessDifficulty:'easy' });
  // 480 sq ft: up to 4 in at 300 = 144000; over 4 up to 6 in at 400 = 192000.
  for (const [thickness, labor] of [[3, 144000], [4, 144000], [5, 192000], [6, 192000]]) assert.equal(amounts(quote('CONCRETE_DRIVEWAY', inputs(thickness), owner))['Existing slab demolition labor'], labor, thickness + ' in');
  assert.equal(quote('CONCRETE_DRIVEWAY', inputs(7), owner).resultType, 'ESTIMATE_REQUIRES_REVIEW');
  const inverted = service('CONCRETE_DRIVEWAY', { laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:300, minimumJob:0, scopeDetails:{ demolition:demolition(6, 4) }, scopeRates:{ demolition_removal:300, demolition_disposal:100 } });
  assert.ok(vNextServiceStatus(inverted, defaults).validationErrors.some(message => /lower thickness limit/.test(message)));
});

test('stair width bands price separately and stair-covering removal labor gets the optional peak surcharge', () => {
  const stairs = (low, high) => ({ description:'[SYNTHETIC] Stair treads and risers with tear-out', mode:'itemized', flooringType:'vinyl_plank', ...(low === undefined ? {} : { minimumWidthLF:low }), maximumWidthLF:high, underlaymentIncluded:false, removalIncluded:true, disposalIncluded:false });
  const owner = service('FLOORING_INSTALL', { laborPerSqft:{ vinyl_plank:250 }, materialPerSqft:{ vinyl_plank:300 }, minimumJob:0, vinylPlankUnderlaymentRule:'never_included', scopeDetails:{ stairs:stairs(undefined, 3), stairs__2:stairs(3, 5) }, scopeRates:{ stairs_labor:6000, stairs_material:4000, stairs_removal:2000, stairs__2_labor:8000, stairs__2_material:5000, stairs__2_removal:2500 } }, { peakMonths:[1], peakSurchargePercent:10 });
  const inputs = width => confirmedFixtureInputs({ sqft:400, sqftMethod:'exact', newFlooringType:'vinyl_plank', existingFloorType:'none', removalNeeded:false, roomCount:2, layoutPattern:'straight', stairSteps:10, stairScopeConfirmed:true, floorAreaExcludesStairs:true, stairRemovalNeeded:true, stairDisposalNeeded:false, stairWidthLF:width });
  // Floor labor 400 x 250 x 1.10 = 110000. Peak 10% of (floor labor + stair labor + stair removal labor).
  assert.deepEqual(amounts(quote('FLOORING_INSTALL', inputs(3), owner)), { 'Flooring labor':110000, 'Flooring materials':129600, 'Complete stair work labor':60000, 'Complete stair work material':40000, 'Complete stair work removal labor':20000, 'Peak season adjustment':19000 });
  assert.deepEqual(amounts(quote('FLOORING_INSTALL', inputs(4), owner)), { 'Flooring labor':110000, 'Flooring materials':129600, 'Complete stair work labor':80000, 'Complete stair work material':50000, 'Complete stair work removal labor':25000, 'Peak season adjustment':21500 });
});

test('the AI starter suggests prices only, never offering or scope definitions', () => {
  for (const type of ['FENCING_INSTALL', 'FENCING_REPLACEMENT', 'EXTERIOR_PAINTING', 'INTERIOR_PAINTING', 'FLOORING_INSTALL', 'SIDING_REPLACEMENT', 'CONCRETE_DRIVEWAY', 'FLAT_ROOF_REPLACEMENT']) {
    assert.ok(starterFields(type).every(field => !['offeringMode', 'offeringDetails', 'offeringRates', 'scopeDetails', 'scopeRates', 'knownOfferings'].includes(field.field)), type);
  }
  assert.throws(() => validateStarterOutput([{ service:'Wood fence', serviceType:'FENCING_INSTALL', fields:{ minimumJob:1500, offeringDetails:{ description:'Includes a lifetime warranty' } } }], ['FENCING_INSTALL']));
});

test('the AI interview cannot set the baseline confirmation or legacy non-baseline settings', () => {
  const details = { description:'[SYNTHETIC] Six-foot cedar privacy fence', fenceType:'cedar', fenceHeight:6, postFootingDescription:'[SYNTHETIC] Posts set in concrete' };
  assert.deepEqual(validateInterviewConfiguration('FENCING_INSTALL', 'offeringDetails', details, { offeringMode:'itemized' }), details);
  for (const extra of [{ terrainSlope:'moderate' }, { baselinePricesConfirmed:true }]) assert.throws(() => validateInterviewConfiguration('FENCING_INSTALL', 'offeringDetails', { ...details, ...extra }, { offeringMode:'itemized' }), /unsupported setting/);
  assert.throws(() => validateInterviewConfiguration('EXTERIOR_PAINTING', 'offeringDetails', { description:'x', stories:2 }, { offeringMode:'installed' }), /unsupported setting/);
  assert.throws(() => validateInterviewConfiguration('INTERIOR_PAINTING', 'offeringDetails', { description:'x', wallHeight:'high' }, { offeringMode:'installed' }), /unsupported setting/);
});

test('a new owner starts with the optional peak surcharge off, so it never blocks quoting', () => {
  const book = readApplicationBook('claude-audit-new-owner');
  assert.deepEqual(book.defaults.peakMonths, []);
  assert.equal(book.defaults.peakSurchargePercent, 0);
  assert.ok(!validateBusinessDefaults(convertApplicationBook(book, 'toCents').defaults).missingFields.some(field => /peak/.test(field)));
});

test('scope status hides the unconfigured base row when other entries exist, and entries are named by their facts', () => {
  const owner = service('SIDING_REPLACEMENT', { laborPerSqft:{ vinyl:250 }, materialPerSqft:{ vinyl:300 }, minimumJob:0, scopeDetails:{ siding_removal__one:{ description:'[SYNTHETIC] Remove vinyl', mode:'itemized', existingSidingType:'vinyl', stories:1, disposalIncluded:true } }, scopeRates:{ siding_removal__one_removal:80, siding_removal__one_disposal:20 } });
  const keys = vNextServiceStatus(owner, defaults).scopeCoverage.map(row => row.key);
  assert.ok(keys.includes('siding_removal__one'));
  assert.ok(!keys.includes('siding_removal'));
  assert.equal(scopeEntrySummary('siding_removal__2', { existingSidingType:'vinyl', stories:2 }), 'vinyl, 2 stories');
  assert.equal(scopeEntrySummary('demolition', demolition(4, 6)), 'over 4 up to 6 in, wire mesh, easy');
  assert.equal(scopeEntrySummary('floor_overlay__2', { existingFloorType:'tile', newFlooringType:'vinyl_plank' }), 'vinyl plank over tile');
});

test('the customer summary uses a short label for the adjoining-edge answer', () => {
  const owner = service('CONCRETE_PATIO_SLAB', { laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:300, minimumJob:0 });
  const facts = customerJobSummary(owner, applicationServiceDefinition(owner), { customerInputs:{ adjoinsExistingConcrete:true, adjoiningEdgeLF:16 } }, 'revision').facts;
  assert.deepEqual(facts, [{ label:'Edges against foundation or existing concrete', value:'Yes' }, { label:'Total measured length of those adjoining edges', value:'16 linear feet' }]);
});
