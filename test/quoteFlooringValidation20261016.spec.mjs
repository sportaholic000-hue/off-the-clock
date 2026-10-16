import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {carpet} from './quoteFlooring20261016Fixture.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {validatePricingStructuresDetailed} from '../server/quote-engine-vnext/contracts.js';
import {convertPricebookMoney,ownerMoneyEntries} from '../server/priceBookMoney.js';
import {carpetRollPurchase,FLOORING_ADDONS,FLOORING_PATTERN_FIELDS} from '../server/quote-engine-vnext/flooringPricing.js';
import {applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';

test('carpet derived room area survives customer projection; altered room evidence or bought quantity is rejected',()=>{
  // Expected before execution: 13*14=182 installed, 324 bought; material
  // 97,200c. A valid projection is ready; either independent tampering reviews.
  const f=carpet([{lengthFt:13,widthFt:14}]);delete f.customerInputs.sqft;delete f.customerInputs.roomCount;
  const q=generateQuoteVNext(f);assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');
  for(const change of [copy=>copy.options[0].calculationRecord.normalizedCustomerInputs.carpetRooms[0].lengthFt=12,copy=>copy.options[0].lineItems[1].calculation.quantity=300]){
    const changed=structuredClone(q);change(changed);assert.equal(sanitizeForCustomerVNext(changed).resultType,'ESTIMATE_REQUIRES_REVIEW');
  }
});

test('carpet never silently drops a stated room when fewer room dimensions are supplied',()=>{
  // Expected before execution: a stated2-room scope with one measured room
  // needs the second room's numbers; removing that contradictory legacy count
  // leaves the explicit one-room12x14 quote at145,608c, with estimates accepted.
  const f=carpet([{lengthFt:12,widthFt:14}]);f.customerInputs.roomCount=2;
  let q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(q.invalidCustomerFields.includes('carpetRooms'));
  delete f.customerInputs.roomCount;q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1456.08);
});

test('new area-only carpet layouts add no hard-floor pattern allowance, while the legacy pattern request keeps its cents',()=>{
  // Expected before execution:200sqft, $3 labor/material, .10 product waste,
  // medium rooms =>66,000 labor+66,000 material+200 underlay=132,200c.
  // Retained diagonal_or_pattern request:79,200+70,200+200=149,600c.
  const f=carpet([{lengthFt:10,widthFt:20}]);delete f.customerInputs.carpetRooms;delete f.customerInputs.carpetConnectedAreas;
  for(const layoutPattern of ['diagonal','herringbone_or_chevron']){
    const q=generateQuoteVNext({...f,customerInputs:{...f.customerInputs,layoutPattern}});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1322);
  }
  const legacy=generateQuoteVNext({...f,customerInputs:{...f.customerInputs,layoutPattern:'diagonal_or_pattern'}});assert.equal(legacy.midEstimate,1496);
});

test('flooring optional zero prices ask no questions and do not add new cents',()=>{
  // Expected before execution: 200*300*1.10+200*1.12*500=178,000c;
  // explicit zero for any new optional line behaves like blank.
  const f=flooring();for(const a of FLOORING_ADDONS)f.ownerPricing.pricing[a.rate]=0;
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1780);
  const names=applicationServiceDefinition(f.ownerPricing).customerFields.map(f=>f.name);
  for(const a of FLOORING_ADDONS)assert.equal(names.includes(a.input),false);
});

test('flooring money round trip scales only the five prices, retaining dimensions and pattern fractions',()=>{
  // Expected before execution: $2.50/$35/$75/$125/$4 =>250/3500/7500/
  // 12500/400c; 4%=.04,1.75x,12-ft roll and1.5-ft repeat never scale.
  const p={baseboardReinstallPerLF:2.5,transitionPriceEach:35,furnitureMovingPrice:75,furnitureMovingPriceUnit:'per_room',toiletPullResetEach:125,floorLevelingPerSqft:4,diagonalWasteAdderByType:{vinyl_plank:.04},herringboneLaborMultiplierByType:{vinyl_plank:1.75},carpetRollWidthFt:12,carpetPatternRepeatFt:1.5};
  const book={services:[{serviceType:'FLOORING_INSTALL',pricing:p}]},converted=convertPricebookMoney(book,'toCents');
  const saved=converted.services[0].pricing;
  assert.deepEqual(FLOORING_ADDONS.map(a=>saved[a.rate]),[250,3500,7500,12500,400]);
  for(const key of [...FLOORING_PATTERN_FIELDS,'carpetRollWidthFt','carpetPatternRepeatFt'])assert.deepEqual(saved[key],p[key]);
  assert.deepEqual(convertPricebookMoney(converted,'toDollars'),book);
  assert.deepEqual(ownerMoneyEntries(converted.services[0]).map(x=>x.path).sort(),FLOORING_ADDONS.map(a=>a.rate).sort());
});

test('flooring owner validation names invalid pattern maps, roll dimensions and furniture units',()=>{
  // Expected before execution: each malformed new field produces an explicit
  // owner diagnostic; no carpet entry is allowed in a hard-floor pattern map.
  for(const [field,value] of [['diagonalWasteAdderByType',{carpet:.04}],['diagonalWasteAdderByType',{tile:-.01}],['herringboneLaborMultiplierByType',{tile:0}],['carpetRollWidthFt',0],['carpetPatternRepeatFt',-1],['furnitureMovingPriceUnit','per_sqft']]){
    const f=flooring();f.ownerPricing.pricing[field]=value;
    const issues=validatePricingStructuresDetailed(f.serviceType,f.ownerPricing.pricing);
    assert.ok(issues.some(d=>d.path===field||d.path.startsWith(field+'.')),JSON.stringify({field,issues}));
  }
});

test('carpet room method needs an owner roll width and rejects invalid dimensions or room references',()=>{
  // Expected before execution: missing owner width reviews without fabricating
  // one; negative dimensions and a connection to nonexistent room3 review.
  const f=carpet([{lengthFt:13,widthFt:14}]);delete f.ownerPricing.pricing.carpetRollWidthFt;
  let q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,/roll width/i);
  for(const bad of [carpet([{lengthFt:-13,widthFt:14}]),carpet([{lengthFt:13,widthFt:14}],12,0,[[1,3]])])assert.equal(generateQuoteVNext(bad).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('room-size labor is nondecreasing through both limits with later diagonal labor unchanged',()=>{
  // Expected before execution: per-room boundary labor54,000c and99,000c,
  // multiplied by three rooms and1.20 diagonal after the floor. At450.03sqft
  // labor194,400c; at900.03sqft356,400c. Each quarter-foot step cannot drop.
  for(const boundary of [450,900]){
    let previous=-1;
    for(const delta of [-.25,0,.01,.25,1,10]){
      const f=flooring('tile',boundary+delta);Object.assign(f.customerInputs,{roomCount:3,layoutPattern:'diagonal'});
      const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
      const cents=q.lineItems.find(l=>l.name==='Flooring labor').amountCents;assert.ok(cents>=previous);previous=cents;
      if(delta===.01)assert.equal(cents,boundary===450?194400:356400);
    }
  }
});

test('carpet connected-area direction matches an independent exhaustive orientation oracle on 1,000 seeded layouts',()=>{
  // Expected before execution: every connected group shares one orientation;
  // exhaustive two-direction candidates give exactly the purchased area.
  // Integer quarter-feet keep this independent oracle exact in binary arithmetic.
  let state=0x20261016;const next=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
  for(let trial=0;trial<1000;trial++){
    const count=1+next(6),rooms=Array.from({length:count},()=>({lengthFt:(4+next(116))/4,widthFt:(4+next(116))/4})),roll=[12,13.5,15][next(3)],repeat=next(9)/4;
    const groups=[[],[]];for(let i=1;i<=count;i++)groups[next(2)].push(i);const nonempty=groups.filter(g=>g.length);
    const expected=nonempty.reduce((sum,group)=>sum+Math.min(...[false,true].map(turn=>group.reduce((total,index)=>{const r=rooms[index-1],across=turn?r.lengthFt:r.widthFt,along=turn?r.widthFt:r.lengthFt;return total+Math.ceil((across+.5)/roll)*roll*(along+.5+repeat);},0))),0);
    const bought=carpetRollPurchase({carpetRooms:rooms,carpetConnectedAreas:nonempty},{carpetRollWidthFt:roll,carpetPatternRepeatFt:repeat});
    assert.equal(Number(bought.purchasedQuantity.numerator)/Number(bought.purchasedQuantity.denominator),expected,'trial '+trial);
  }
});
