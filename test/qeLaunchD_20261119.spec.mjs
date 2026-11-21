// Lane D launch fixes (November 19, 2026): flooring, carpet and fence.
// D1 tile substrate, D2 carpet pieces side by side, D3 carpet needs room sizes,
// D4 pattern repeat only where seams match, D5 leveling on replacement,
// D6 fence allowance note names panels, D7 gate before the first section.
// Expected values are worked by hand in the comment before each assertion.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';
import {validateCustomerInputs,customerContractForVNext,allowedPricingFields} from '../server/quote-engine-vnext/contracts.js';
import {carpetRollPurchase,LEVELING_UNKNOWN_NOTE} from '../server/quote-engine-vnext/flooringPricing.js';
import {TILE_SUBSTRATE_LABEL,TILE_SUBSTRATE_NOTE,customerFieldVisible} from '../server/scopeConfiguration.js';
import {FENCE_START_GATE_QUESTION,FENCE_CLOSED_QUESTION,FENCE_SECTION_QUESTION,FENCE_GATE_CORNER_QUESTION} from '../server/quote-engine-vnext/fencePricing.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {voiceQuestionContract,bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {customerSummaryValue} from '../server/src/customerSummary.js';
import * as bridge from '../server/src/quoteDoneBridge.js';

const total=q=>q.options?.[0]?.calculationRecord?.scenarios?.mid?.finalTotalCents;
const lines=q=>Object.fromEntries((q.options?.[0]?.lineItems||[]).map(l=>[l.name,l.amountCents]));
const sqft=r=>Number(r.purchasedQuantity.numerator)/Number(r.purchasedQuantity.denominator);
const BACKER={scopeDetails:{floor_underlayment_tile:{description:'Half-inch cement backer board, screwed and taped',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_tile:250}};
const PAD={scopeDetails:{floor_underlayment_carpet:{description:'Carpet pad',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_carpet:80}};
const BACKER_LINE='Tile backer board or uncoupling membrane';
// A 200 sq ft single-room job: $3.00 labor and $5.00 material per sq ft;
// 200 sq ft is a medium room (labor x 1.10).
function floor(service,type,pricing={},customer={}){
  pricing=Object.fromEntries(Object.entries(pricing).filter(([,v])=>v!==undefined));
  const c={sqft:200,sqftMethod:'exact',newFlooringType:type,existingFloorType:'none',removalNeeded:false,roomCount:1,layoutPattern:'straight',stairSteps:0,...(service==='FLOORING_REPLACEMENT'?{subfloorIssues:false}:{}),...customer};
  for(const [k,v] of Object.entries(c))if(v===undefined)delete c[k];
  return fixture(service,{laborPerSqft:{[type]:300},materialPerSqft:{[type]:500},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',perStepPrice:10000,...pricing},c);
}
const SERVICES=['FLOORING_INSTALL','FLOORING_REPLACEMENT'];
const status=f=>vNextServiceStatus({...f.ownerPricing,active:true},f.businessDefaults);

// ---------------------------------------------------------------------------
// D1. Tile substrate
// Base for every 200 sq ft tile job: labor 200*300*1.10=66,000; materials
// 200*(1+0.12 tile waste)*500=112,000; together 178,000 cents.
// Backer at $2.50 installed per sq ft: 200*250=50,000.

test('D1: tile laid on wood adds the owner backer price; on concrete it does not; both services',()=>{
  for(const service of SERVICES){
    for(const support of ['joists','wood_on_concrete','sleepers']){
      // Wood: 178,000 + 50,000 backer = 228,000.
      const q=generateQuoteVNext(floor(service,'tile',BACKER,{floorConstructionKnown:'yes',floorSupportConstruction:support,underlaymentScopeConfirmed:true}));
      assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',service+' '+support);
      assert.equal(lines(q)[BACKER_LINE],50000,service+' '+support);
      assert.equal(total(q),228000,service+' '+support);
    }
    // Concrete slab: 178,000, no backer line even though the owner has a backer price.
    const slab=generateQuoteVNext(floor(service,'tile',BACKER,{floorConstructionKnown:'yes',floorSupportConstruction:'concrete_slab'}));
    assert.equal(slab.resultType,'INSTANT_ESTIMATE_READY');assert.equal(lines(slab)[BACKER_LINE],undefined);assert.equal(total(slab),178000);
    assert.deepEqual(slab.options[0].skippedAddons,[]);
  }
});

test('D1: wood with no owner backer price is an owner missing price, never a guessed one',()=>{
  for(const service of SERVICES){
    const q=generateQuoteVNext(floor(service,'tile',{},{floorConstructionKnown:'yes',floorSupportConstruction:'joists'}));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(q.missingOwnerFields,['scopeDetails.floor_underlayment_tile']);
    assert.deepEqual(q.missingCustomerFields,[]);
    // Concrete beside it needs no backer price: 178,000.
    assert.equal(total(generateQuoteVNext(floor(service,'tile',{},{floorConstructionKnown:'yes',floorSupportConstruction:'concrete_slab'}))),178000);
  }
});

test('D1: not sure quotes without the backer, leaves it for the site visit and says so',()=>{
  for(const service of SERVICES)for(const answers of [{floorConstructionKnown:'no'},{floorConstructionKnown:'yes',floorSupportConstruction:'not_sure'}]){
    // 178,000 with no backer line; the backer is listed as not included.
    const q=generateQuoteVNext(floor(service,'tile',BACKER,answers));
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(total(q),178000);assert.equal(lines(q)[BACKER_LINE],undefined);
    assert.deepEqual(q.options[0].skippedAddons,[TILE_SUBSTRATE_LABEL]);
    assert.ok(q.options[0].disclaimer.includes(TILE_SUBSTRATE_NOTE));
    // The customer sees the same partial estimate.
    const customer=sanitizeForCustomerVNext(q);assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY');assert.equal(customer.midEstimate,1780);
    assert.deepEqual(customer.options[0].skippedAddons,[TILE_SUBSTRATE_LABEL]);
  }
});

test('D1: the floor-construction questions are asked for tile, one at a time',()=>{
  for(const service of SERVICES){
    assert.deepEqual(generateQuoteVNext(floor(service,'tile',BACKER)).missingCustomerFields,['floorConstructionKnown']);
    assert.deepEqual(generateQuoteVNext(floor(service,'tile',BACKER,{floorConstructionKnown:'yes'})).missingCustomerFields,['floorSupportConstruction']);
    // A detail answered together with No contradicts itself (existing rule).
    assert.deepEqual(generateQuoteVNext(floor(service,'tile',BACKER,{floorConstructionKnown:'no',floorSupportConstruction:'joists'})).invalidCustomerFields,['floorSupportConstruction']);
    // Hardwood beside it is not asked.
    const hardwood=validateCustomerInputs(service,floor(service,'hardwood').customerInputs,floor(service,'hardwood').ownerPricing.pricing,floor(service,'hardwood').ownerPricing);
    assert.equal((hardwood.missingCustomerFields||[]).includes('floorConstructionKnown'),false);
  }
});

test('D1: old floor removed: a wood floor answers what it sits on; any other floor what it is laid on',()=>{
  // Removal 200 sq ft at $1.00 = 20,000; base 178,000 -> 198,000.
  const removal={removalPerSqft:{hardwood:100,vinyl:100},...BACKER};
  const job=(service,existing,answers)=>floor(service,'tile',removal,{existingFloorType:existing,removalNeeded:true,removalAreaSqft:200,floorConstructionKnown:'yes',...answers});
  for(const service of SERVICES){
    // Glued to concrete leaves the bare slab: 198,000.
    assert.equal(total(generateQuoteVNext(job(service,'hardwood',{woodFloorAssembly:'glued_to_concrete'}))),198000);
    // A wood subfloor on joists stays: 198,000 + 50,000 = 248,000.
    assert.equal(total(generateQuoteVNext(job(service,'hardwood',{woodFloorAssembly:'joists',underlaymentScopeConfirmed:true}))),248000);
    assert.equal(total(generateQuoteVNext(job(service,'hardwood',{woodFloorAssembly:'sleepers',underlaymentScopeConfirmed:true}))),248000);
    // Laid on or fastened to concrete may leave plywood: not sure, 198,000 partial.
    const direct=generateQuoteVNext(job(service,'hardwood',{woodFloorAssembly:'direct_on_concrete'}));
    assert.equal(total(direct),198000);assert.deepEqual(direct.options[0].skippedAddons,[TILE_SUBSTRATE_LABEL]);
    // A non-wood floor answers what it is laid on.
    assert.equal(total(generateQuoteVNext(job(service,'vinyl',{floorSupportConstruction:'joists',underlaymentScopeConfirmed:true}))),248000);
    assert.equal(total(generateQuoteVNext(job(service,'vinyl',{floorSupportConstruction:'concrete_slab'}))),198000);
    // The other kind's question is refused (existing rule).
    assert.deepEqual(generateQuoteVNext(job(service,'hardwood',{floorSupportConstruction:'joists'})).invalidCustomerFields,['floorSupportConstruction']);
  }
});

test('D1: backer included in the floor price: not sure needs nothing left for the site',()=>{
  const included={scopeDetails:{floor_underlayment_tile:{description:'Backer board included in our tile price',mode:'included_in_floor_price'}}};
  // 178,000 either way; not sure says the underlayment is included instead of leaving it for the site.
  const q=generateQuoteVNext(floor('FLOORING_INSTALL','tile',included,{floorConstructionKnown:'no',underlaymentScopeConfirmed:true}));
  assert.equal(total(q),178000);assert.deepEqual(q.options[0].skippedAddons,[]);
  assert.ok(q.options[0].disclaimer.includes('Underlayment is included in the flooring material price.'));
  const slab=generateQuoteVNext(floor('FLOORING_INSTALL','tile',included,{floorConstructionKnown:'yes',floorSupportConstruction:'concrete_slab'}));
  assert.equal(total(slab),178000);assert.equal(slab.options[0].disclaimer.includes('Underlayment is included in the flooring material price.'),false);
});

test('D1: tile kept over an existing floor is unchanged: no construction question',()=>{
  // Stay: the owner's overlay rule prices the old floor's preparation; the
  // construction question is not part of tile over a kept floor.
  const f=floor('FLOORING_INSTALL','tile',{},{existingFloorType:'vinyl',removalNeeded:false});
  const v=validateCustomerInputs('FLOORING_INSTALL',f.customerInputs,f.ownerPricing.pricing,f.ownerPricing);
  assert.equal((v.missingCustomerFields||[]).includes('floorConstructionKnown'),false);
});

test('D1: widget and voice ask the same questions for tile; services without tile do not show them',()=>{
  const f=floor('FLOORING_INSTALL','tile',BACKER),fields=customerContractForVNext('FLOORING_INSTALL',f.ownerPricing.pricing,f.ownerPricing).fields;
  assert.equal(fields.floorConstructionKnown.evidenceOnly,undefined);
  assert.equal(customerFieldVisible({...fields.floorConstructionKnown,name:'floorConstructionKnown'},{newFlooringType:'tile',existingFloorType:'none',removalNeeded:false}),true);
  assert.equal(customerFieldVisible({...fields.floorSupportConstruction,name:'floorSupportConstruction'},{newFlooringType:'tile',existingFloorType:'none',removalNeeded:false,floorConstructionKnown:'yes'}),true);
  assert.equal(customerFieldVisible({...fields.floorSupportConstruction,name:'floorSupportConstruction'},{newFlooringType:'tile',existingFloorType:'none',removalNeeded:false,floorConstructionKnown:'no'}),false);
  // Backer confirmation only where the backer applies.
  const confirm={...fields.underlaymentScopeConfirmed,name:'underlaymentScopeConfirmed'};
  assert.equal(customerFieldVisible(confirm,{newFlooringType:'tile',existingFloorType:'none',floorSupportConstruction:'joists'}),true);
  assert.equal(customerFieldVisible(confirm,{newFlooringType:'tile',existingFloorType:'none',floorSupportConstruction:'concrete_slab'}),false);
  const definition=bridge.applicationServiceDefinition(f.ownerPricing);
  const voice=voiceQuestionContract(f.ownerPricing,definition,{newFlooringType:'tile',existingFloorType:'none',removalNeeded:false}).fields.map(q=>q.field);
  for(const name of ['floorConstructionKnown','floorSupportConstruction'])assert.ok(voice.includes(name),name);
  const hardwood=floor('FLOORING_INSTALL','hardwood');
  assert.equal(customerContractForVNext('FLOORING_INSTALL',hardwood.ownerPricing.pricing,hardwood.ownerPricing).fields.floorConstructionKnown.evidenceOnly,true);
});

test('D1: readiness: tile goes live without a backer price and lists it; a set backer is probed on wood',()=>{
  const bare=status(floor('FLOORING_INSTALL','tile'));
  assert.equal(bare.status,'QUOTING LIVE');
  assert.equal(bare.scopeCoverage.find(r=>r.key==='floor_underlayment_tile').configurationComplete,false);
  const priced=status(floor('FLOORING_INSTALL','tile',BACKER));
  assert.equal(priced.status,'QUOTING LIVE');assert.equal(priced.scopeCoverage.find(r=>r.key==='floor_underlayment_tile').configurationComplete,true);
  // A backer with no price is reported on its own row, not as a broken service.
  const unpriced=status(floor('FLOORING_INSTALL','tile',{scopeDetails:BACKER.scopeDetails}));
  assert.ok(unpriced.scopeCoverage.find(r=>r.key==='floor_underlayment_tile').variants[0].missingFields.includes('scopeRates.floor_underlayment_tile'));
});

test('D1 same fault: a floating floor with a construction condition is no longer blocked by its own probe',()=>{
  // Before: readiness listed customerInputs.floorConstructionKnown as a missing owner field.
  const f=floor('FLOORING_INSTALL','laminate',{laminateFloatConditions:{no_sleeper_construction:true},laminateInstallInstructions:'Synthetic laminate, instructions 2025',scopeDetails:{floor_underlayment_laminate:{description:'Foam included',mode:'included_in_floor_price'}}});
  const s=status(f);
  assert.equal(s.missingOwnerFields.includes('customerInputs.floorConstructionKnown'),false);
  assert.equal(s.status,'QUOTING LIVE');
});

// ---------------------------------------------------------------------------
// D2. Carpet pieces side by side. Each piece is the room's across + 0.5 ft by
// along + 0.5 ft; separate one-drop rooms get no repeat (D4).

test('D2: two 4 x 4 rooms share one 12 x 4.5 cut',()=>{
  // Old: each room its own width, 2 * 12 * 4.5 = 108. New: 4.5 + 4.5 = 9 <= 12, one cut 12 * 4.5 = 54.
  const r=carpetRollPurchase({carpetRooms:[{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],carpetConnectedAreas:[[1],[2]]},{carpetRollWidthFt:12});
  assert.equal(sqft(r),54);
  assert.deepEqual(r.sharedCuts,[{sharedCut:1,rollWidthFt:12,cutLengthFt:4.5,rooms:[1,2],boughtSqft:54}]);
  assert.deepEqual(r.cuts.map(c=>[c.room,c.pieces,c.sharedPiece]),[[1,0,{widthFt:4.5,cutLengthFt:4.5,sharedCut:1}],[2,0,{widthFt:4.5,cutLengthFt:4.5,sharedCut:1}]]);
});

test('D2: widths that exactly fill the roll share; a hair wider do not',()=>{
  // 5.5 x 5.5: 6 + 6 = 12 <= 12, one cut 12 * 6 = 72 (old 144).
  assert.equal(sqft(carpetRollPurchase({carpetRooms:[{lengthFt:5.5,widthFt:5.5},{lengthFt:5.5,widthFt:5.5}],carpetConnectedAreas:[[1],[2]]},{carpetRollWidthFt:12})),72);
  // 5.51 x 5.51: 6.01 + 6.01 = 12.02 > 12, two cuts 2 * 12 * 6.01 = 144.24 (unchanged).
  assert.equal(sqft(carpetRollPurchase({carpetRooms:[{lengthFt:5.51,widthFt:5.51},{lengthFt:5.51,widthFt:5.51}],carpetConnectedAreas:[[1],[2]]},{carpetRollWidthFt:12})),144.24);
  // Three 4 x 4 rooms: 4.5 * 3 = 13.5 > 12; two share (54), the third keeps its own width (54): 108 (old 162).
  const three=carpetRollPurchase({carpetRooms:[{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],carpetConnectedAreas:[[1],[2],[3]]},{carpetRollWidthFt:12});
  assert.equal(sqft(three),108);assert.deepEqual(three.sharedCuts.map(c=>c.rooms),[[1,2]]);assert.equal(three.cuts[2].pieces,1);
  // A shared cut is as long as its longest piece: 3.5 x 3.5 beside 4.5 x 4.5 -> 12 * 4.5 = 54 (old 42 + 54 = 96).
  assert.equal(sqft(carpetRollPurchase({carpetRooms:[{lengthFt:3,widthFt:3},{lengthFt:4,widthFt:4}],carpetConnectedAreas:[[1],[2]]},{carpetRollWidthFt:12})),54);
});

test('D2: a crossgrain fill strip can share a cut instead of being filled',()=>{
  // Room 1 (6 long, 10.5 wide): 11 x 6.5 piece, 78 alone. Room 2 (12.5 long, 6 wide):
  // side to side 13 across = one 12 ft drop 6.5 long (78) + a 1 ft strip; as a
  // crossgrain fill 12 * (6 + 3*0.5)/3 = 30 -> 108 (front to back would be 12 x 13 = 156).
  // Separately: 78 + 108 = 186. Fills shared: 11 + 1 = 12 fits one 12 x 6.5 cut (78)
  // beside room 2's drop (78): 156.
  // (Before v42 this case used a 12 ft long room 2 with a 0.5 ft strip; a room no wider than
  // the roll now takes one width and has no strip, so the room is 12.5 ft long here.)
  const rooms=[{lengthFt:6,widthFt:10.5},{lengthFt:12.5,widthFt:6}];
  const r=carpetRollPurchase({carpetRooms:rooms,carpetConnectedAreas:[[1],[2]]},{carpetRollWidthFt:12,carpetCrossgrainSeams:'allowed'});
  assert.equal(sqft(r),156);assert.deepEqual(r.sharedCuts.map(c=>[c.cutLengthFt,c.rooms]),[[6.5,[1,2]]]);
  assert.equal(r.cuts[1].fill,undefined);
  // Without crossgrain fills room 2 runs front to back (6.5 wide x 13, 156; side to side is 156 too): 11 + 6.5 > 12, so 78 + 156 = 234.
  assert.equal(sqft(carpetRollPurchase({carpetRooms:rooms,carpetConnectedAreas:[[1],[2]]},{carpetRollWidthFt:12})),234);
  // The room as wide as the roll: room 2 at 12 ft long takes one 12 x 6.5 width (78), no strip: 78 + 78 = 156 either way.
  const fit=[{lengthFt:6,widthFt:11},{lengthFt:12,widthFt:6}];
  for(const p of [{carpetRollWidthFt:12,carpetCrossgrainSeams:'allowed'},{carpetRollWidthFt:12}]){const x=carpetRollPurchase({carpetRooms:fit,carpetConnectedAreas:[[1],[2]]},p);assert.equal(sqft(x),156);assert.deepEqual(x.sharedCuts,[]);assert.equal(x.cuts[1].fill,undefined);}
});

test('D2: a single room and rooms that cannot share are unchanged',()=>{
  // 10 x 10 on 12 ft: one 12 x 10.5 cut = 126. 15 x 15 with fills: 15.5 across =
  // one 12 ft width 15.5 long (186) + a 3.5 ft fill cut as 3 strips (15 + 3*0.5)/3 =
  // 5.5 long (66) = 252 (existing test's fill).
  assert.equal(sqft(carpetRollPurchase({carpetRooms:[{lengthFt:10,widthFt:10}]},{carpetRollWidthFt:12})),126);
  const fill=carpetRollPurchase({carpetRooms:[{lengthFt:15,widthFt:15}]},{carpetRollWidthFt:12,carpetCrossgrainSeams:'allowed'});
  assert.equal(sqft(fill),12*15.5+12*5.5);assert.deepEqual(fill.cuts[0].fill,{pieces:3,crossgrainSeams:2,widthFt:3.5,cutLengthFt:5.5});assert.deepEqual(fill.sharedCuts,[]);
});

// Independent oracle: today's room-by-room purchase (repeat on every cut), and
// the new rules written separately: repeat only for more than one drop or a
// connected area of more than one room; narrow last pieces shared longest first.
function oracle(rooms,groups,roll,repeat,fills){
  const room=(r,turn,inGroup,repeatRule,index)=>{
    // Since v42 a room no wider than the roll is covered by one width (its 0.5 ft trim across is given up).
    const across=turn?r.lengthFt:r.widthFt,along=turn?r.widthFt:r.lengthFt,cover=across<=roll&&across+0.5>roll?roll:across+0.5,n=Math.ceil(cover/roll);
    const rep=repeatRule?(n>1||inGroup>1?repeat:0):repeat,len=along+0.5+rep,strip=cover-(n-1)*roll;
    let area=n*roll*len,fill=null;
    if(fills&&n>1){for(const k of [2,3])if(k*strip<=roll){const a=(n-1)*roll*len+roll*(along+k*(0.5+rep))/k;if(a<area){area=a;fill=a-(n-1)*roll*len;}}}
    return {area,len,strip,n,fill,index};
  };
  let old=0;const rows=[];
  for(const g of groups){
    const pick=repeatRule=>[false,true].map(turn=>g.map(i=>room(rooms[i-1],turn,g.length,repeatRule,i))).reduce((a,b)=>b.reduce((s,x)=>s+x.area,0)<a.reduce((s,x)=>s+x.area,0)?b:a);
    old+=pick(false).reduce((s,x)=>s+x.area,0);rows.push(...pick(true));
  }
  const pack=pieces=>{const cuts=[];for(const p of [...pieces].sort((a,b)=>b.len-a.len||b.strip-a.strip||a.index-b.index)){const c=cuts.find(c=>c.used+p.strip<=roll+1e-9);if(c){c.used+=p.strip;c.rows.push(p);}else cuts.push({len:p.len,used:p.strip,rows:[p]});}return cuts;};
  const layout=shareFills=>{
    let sum=0;const narrow=[];
    for(const r of rows){const narrowPiece=r.strip<roll-1e-9;if(narrowPiece&&(shareFills||r.fill===null))narrow.push(r);else sum+=r.area;}
    for(const c of pack(narrow)){
      // A cut holding one piece is that room's own purchase again (its last width or its fill).
      if(c.rows.length===1){sum+=c.rows[0].area;continue;}
      sum+=roll*c.len;for(const r of c.rows)sum+=(r.n-1)*roll*r.len;
    }
    return sum;
  };
  const separate=rows.reduce((s,x)=>s+x.area,0);
  return {old,separate,next:Math.min(separate,layout(false),layout(true))};
}

test('D2/D4: 1,500 seeded layouts never buy more than today and match the independent oracle',()=>{
  let state=0x20261119;const next=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
  for(let trial=0;trial<1500;trial++){
    const count=1+next(5),rooms=Array.from({length:count},()=>({lengthFt:(4+next(80))/4,widthFt:(4+next(80))/4})),roll=[12,13.5,15][next(3)],repeat=next(9)/4,fills=next(2)===1;
    const sides=[[],[],[]];for(let i=1;i<=count;i++)sides[next(3)].push(i);const groups=sides.filter(g=>g.length);
    const expected=oracle(rooms,groups,roll,repeat,fills);
    const bought=sqft(carpetRollPurchase({carpetRooms:rooms,carpetConnectedAreas:groups},{carpetRollWidthFt:roll,carpetPatternRepeatFt:repeat,...(fills?{carpetCrossgrainSeams:'allowed'}:{})}));
    assert.ok(bought<=expected.old+1e-9,'never more than today: trial '+trial);
    assert.ok(Math.abs(bought-expected.next)<1e-6,'trial '+trial+' '+bought+' vs '+expected.next);
  }
});

// ---------------------------------------------------------------------------
// D3. Carpet needs room sizes. Carpet 200 sq ft fixture prices: $3.00 labor,
// $5.00 carpet per sq ft; pad $0.80 per sq ft.
const carpetJob=(rooms,pricing={},customer={})=>{
  const f=floor('FLOORING_INSTALL','carpet',{carpetRollWidthFt:12,...PAD,...pricing},{sqft:undefined,sqftMethod:undefined,roomCount:undefined,layoutPattern:undefined,underlaymentScopeConfirmed:true,...(rooms?{carpetRooms:rooms}:{}),...customer});
  return f;
};

test('D3: carpet is bought from room sizes: a 10 x 10 room on a 12 ft roll buys 126 sq ft, not area + 10%',()=>{
  // Labor 100 sq ft small room: 100*300*1.20 = 36,000. Carpet 12 x 10.5 = 126 sq ft
  // * 500 = 63,000 (area + 10% would buy 110). Pad 100*80 = 8,000. Total 107,000.
  const q=generateQuoteVNext(carpetJob([{lengthFt:10,widthFt:10}]));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual(lines(q),{'Flooring labor':36000,'Flooring materials':63000,'Carpet underlayment':8000});assert.equal(total(q),107000);
  // A 13 ft wide room needs two widths: 20 x 13 runs side to side, 20.5 across = 2
  // widths 13.5 long = 324 sq ft * 500 = 162,000; labor 260 medium *300*1.10 = 85,800;
  // pad 260*80 = 20,800. Total 268,600 (area + 10% would buy 286).
  const wide=generateQuoteVNext(carpetJob([{lengthFt:20,widthFt:13}]));
  assert.equal(lines(wide)['Flooring materials'],162000);assert.equal(total(wide),268600);
});

test('D3: a carpet total area alone asks for the room sizes, on the widget and the phone',()=>{
  const areaOnly=carpetJob(null,{},{sqft:100,sqftMethod:'exact',roomCount:1});
  const q=generateQuoteVNext(areaOnly);
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.missingCustomerFields,['carpetRooms']);
  // An earlier total-area choice does not stand in for rooms either.
  assert.deepEqual(generateQuoteVNext(carpetJob(null,{},{sqft:100,sqftMethod:'exact',roomCount:1,carpetMeasurementMethod:'area_only'})).missingCustomerFields,['carpetRooms']);
  const fields=customerContractForVNext('FLOORING_INSTALL',areaOnly.ownerPricing.pricing,areaOnly.ownerPricing).fields;
  assert.equal(fields.carpetMeasurementMethod.evidenceOnly,true);assert.equal(fields.carpetRooms.evidenceOnly,undefined);
  assert.deepEqual(fields.carpetRooms.visibleWhen,[[['newFlooringType','eq','carpet']]]);
  // Shown even before the owner sets a roll width (the quote then waits on the owner).
  const noRoll=carpetJob(null,{carpetRollWidthFt:undefined});delete noRoll.ownerPricing.pricing.carpetRollWidthFt;
  assert.equal(customerContractForVNext('FLOORING_INSTALL',noRoll.ownerPricing.pricing,noRoll.ownerPricing).fields.carpetRooms.evidenceOnly,undefined);
  const definition=bridge.applicationServiceDefinition(areaOnly.ownerPricing);
  const voice=voiceQuestionContract(areaOnly.ownerPricing,definition,{newFlooringType:'carpet'}).fields.map(q=>q.field);
  for(const name of ['sqft','sqftMethod','roomCount','layoutPattern','carpetMeasurementMethod'])assert.equal(voice.includes(name),false,name);
  assert.ok(voice.includes('carpetRooms'));
  // A service that does not offer carpet does not show the carpet rooms.
  const tile=floor('FLOORING_INSTALL','tile');
  assert.equal(customerContractForVNext('FLOORING_INSTALL',tile.ownerPricing.pricing,tile.ownerPricing).fields.carpetRooms.evidenceOnly,true);
});

test('D3: square-yard carpet prices convert as before',()=>{
  // Same 10 x 10 room priced $27.00 labor and $45.00 carpet per sq yd:
  // labor 100/9 sq yd * 2700 * 1.20 = 36,000; carpet 126/9 = 14 sq yd * 4500 = 63,000; pad 8,000.
  const q=generateQuoteVNext(carpetJob([{lengthFt:10,widthFt:10}],{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2700},materialPerSqft:{carpet:4500}}));
  assert.equal(total(q),107000);
});

test('D3: readiness: carpet needs the owner roll width; probes use room sizes',()=>{
  const noRoll=carpetJob(null);delete noRoll.ownerPricing.pricing.carpetRollWidthFt;
  const s=status(noRoll);assert.equal(s.status,'NEEDS PRICING');assert.deepEqual(s.missingOwnerFields,['carpetRollWidthFt']);
  const withRoll=status(carpetJob(null,{removalPerSqft:{carpet:100}}));
  assert.equal(withRoll.status,'QUOTING LIVE');
  assert.equal(withRoll.scopeCoverage.find(r=>r.key==='floor_removal_carpet').configurationComplete,true);
});

// ---------------------------------------------------------------------------
// D4. Pattern repeat only where seams match.

test('D4: a one-drop room alone gets no repeat; more than one drop or connected rooms do',()=>{
  const buy=(rooms,groups,repeat)=>sqft(carpetRollPurchase({carpetRooms:rooms,carpetConnectedAreas:groups},{carpetRollWidthFt:12,carpetPatternRepeatFt:repeat}));
  // 10 x 10, 2 ft repeat: one drop, no seam: 12 * 10.5 = 126 (old 12 * 12.5 = 150).
  assert.equal(buy([{lengthFt:10,widthFt:10}],undefined,2),126);
  // Boundary: 11.5 x 11.5 covers 12.0 across, one drop: 12 * 12 = 144 (old 168).
  assert.equal(buy([{lengthFt:11.5,widthFt:11.5}],undefined,2),144);
  // Since v42 a room up to the roll width is one drop: 11.5001 x 11.5001 is 12 * (11.5001 + 0.5) = 144.0012 (was two drops, 336.0024).
  assert.equal(buy([{lengthFt:11.5001,widthFt:11.5001}],undefined,2),144.0012);
  // 12.0001 x 12.0001 is wider than the roll: 2 drops either way, 2 * 12 * (12.0001 + 0.5 + 2) = 348.0024.
  assert.equal(buy([{lengthFt:12.0001,widthFt:12.0001}],undefined,2),348.0024);
  // Two connected 4 x 4 rooms match at the doorway: 4.5 x 6.5 pieces sharing one cut, 12 * 6.5 = 78.
  assert.equal(buy([{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],[[1,2]],2),78);
  // The same rooms separate: no repeat, 12 * 4.5 = 54.
  assert.equal(buy([{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],[[1],[2]],2),54);
  // Not sure which rooms connect: treated as one connected area, so repeat (78).
  assert.equal(buy([{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],'unknown',2),78);
});

test('D4: the quote record keeps the cut list and the repeat rule',()=>{
  const q=generateQuoteVNext(carpetJob([{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],{carpetPatternRepeatFt:2},{carpetConnectedAreas:[[1],[2]]}));
  const d=q.options[0].calculationRecord.quantityDerivations.find(x=>x.name==='flooringMaterialSqft');
  assert.deepEqual(d.inputs.sharedCuts,[{sharedCut:1,rollWidthFt:12,cutLengthFt:4.5,rooms:[1,2],boughtSqft:54}]);
  assert.match(d.formula,/repeat only in a room with more than one drop or a connected area of more than one room/);
  // 54 sq ft * 500 = 27,000.
  assert.equal(lines(q)['Flooring materials'],27000);
});

// ---------------------------------------------------------------------------
// D5. Leveling on replacement. Hardwood 200 sq ft: labor 66,000; materials
// 200*(1+0.10)*500 = 110,000; removal of 200 sq ft vinyl at $1.50 = 30,000.
const LEVEL={floorLevelingPerSqft:200,floorLevelingMaxDepthInches:0.5,subfloorAllowancePerSqft:300,removalPerSqft:{vinyl:150},scopeDetails:{floor_underlayment_hardwood:{description:'Foam included',mode:'included_in_floor_price'}}};
const levelJob=(service,customer)=>floor(service,'hardwood',service==='FLOORING_INSTALL'?{...LEVEL,subfloorAllowancePerSqft:undefined}:LEVEL,{existingFloorType:'vinyl',removalNeeded:true,removalAreaSqft:200,underlaymentScopeConfirmed:true,...customer});

test('D5: replacement offers the same leveling question and price as installation, separate from subfloor repair',()=>{
  // 50 sq ft leveling * 200 = 10,000: 66,000 + 110,000 + 30,000 + 10,000 = 216,000.
  const q=generateQuoteVNext(levelJob('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:50}));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.equal(lines(q)['Floor leveling'],10000);assert.equal(total(q),216000);
  // Both: subfloor repair 20 sq ft * 300 = 6,000 more: 222,000.
  const both=generateQuoteVNext(levelJob('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:50,subfloorIssues:true,subfloorRepairAreaSqft:20}));
  assert.equal(lines(both)['Subfloor repair allowance'],6000);assert.equal(lines(both)['Floor leveling'],10000);assert.equal(total(both),222000);
  // Installation, unchanged: 216,000 too (same lines).
  assert.equal(total(generateQuoteVNext(levelJob('FLOORING_INSTALL',{floorLevelingNeeded:true,floorLevelingSqft:50}))),216000);
  // Not sure: 206,000 with leveling left for the site visit.
  const unsure=generateQuoteVNext(levelJob('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:'unknown'}));
  assert.equal(total(unsure),206000);assert.deepEqual(unsure.options[0].skippedAddons,['Floor leveling']);assert.ok(unsure.options[0].disclaimer.includes(LEVELING_UNKNOWN_NOTE));
  // Asked, and checked against the floor area, exactly as on installation.
  assert.deepEqual(generateQuoteVNext(levelJob('FLOORING_REPLACEMENT',{})).missingCustomerFields,['floorLevelingNeeded']);
  assert.deepEqual(generateQuoteVNext(levelJob('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:250})).invalidCustomerFields,['floorLevelingSqft']);
  // 200 of 200 is allowed: 200*200 = 40,000 -> 246,000.
  assert.equal(total(generateQuoteVNext(levelJob('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:200}))),246000);
});

test('D5: the replacement price book, form, voice and readiness carry leveling',()=>{
  for(const field of ['floorLevelingPerSqft','floorLevelingMaxDepthInches'])assert.ok(allowedPricingFields('FLOORING_REPLACEMENT').includes(field),field);
  const f=levelJob('FLOORING_REPLACEMENT',{floorLevelingNeeded:false});
  const fields=customerContractForVNext('FLOORING_REPLACEMENT',f.ownerPricing.pricing,f.ownerPricing).fields;
  for(const name of ['floorLevelingNeeded','floorLevelingSqft'])assert.equal(fields[name].evidenceOnly,undefined,name);
  const definition=bridge.applicationServiceDefinition(f.ownerPricing),voice=voiceQuestionContract(f.ownerPricing,definition,{floorLevelingNeeded:true}).fields.map(q=>q.field);
  assert.ok(voice.includes('floorLevelingNeeded'));assert.ok(voice.includes('floorLevelingSqft'));
  const meta=bridge.applicationMetadata().services.find(s=>s.serviceType==='FLOORING_REPLACEMENT').fields.find(x=>x.field==='floorLevelingPerSqft');
  assert.ok(meta);assert.equal(meta.requiredAtBase,false);
  const s=status(f);assert.equal(s.status,'QUOTING LIVE');
  assert.equal(s.scopeCoverage.find(r=>r.key==='floor_extra_floorLevelingPerSqft').configurationComplete,true);
});

// ---------------------------------------------------------------------------
// D6. Fence allowance note.
const disclaimer=q=>q.options[0].disclaimer;
const ALLOWANCE=/Post quantities use the total-length allowance|Post and panel quantities use the total-length allowance/;

test('D6: from a total length, the note names posts and panels when panels are counted',()=>{
  // 100 LF, 8 ft spacing, 2 gates, no corners, 1 open run: line posts ceil(100/8)-1 = 12;
  // panels 12 + 0 + 2 + 1 = 15 * 50.00 = 75,000 (quantities unchanged).
  const f=offeringFixture('FENCING_INSTALL','itemized'),p=f.ownerPricing.pricing;
  p.offeringDetails.infillPricing='per_panel';p.offeringRates.fencePanelEach=5000;delete p.offeringRates.fenceMaterialPerLF;
  const q=generateQuoteVNext(f);
  assert.equal(lines(q)['Fence panels'],75000);
  assert.ok(disclaimer(q).includes('Post and panel quantities use the total-length allowance for 1 separate fence run(s); both counts are confirmed on site.'));
  assert.equal(disclaimer(q).includes('Post quantities use'),false);
  // Infill per linear foot: the posts-only note is unchanged.
  const lf=generateQuoteVNext(offeringFixture('FENCING_INSTALL','itemized'));
  assert.ok(disclaimer(lf).includes('Post quantities use the total-length allowance for 1 separate fence run(s).'));
  // Installed per-foot pricing counts no posts or panels: no allowance note (same fault).
  assert.doesNotMatch(disclaimer(generateQuoteVNext(offeringFixture('FENCING_INSTALL','installed'))),ALLOWANCE);
  // Measured sections: no allowance note.
  const g=offeringFixture('FENCING_INSTALL','itemized');for(const k of ['linearFeet','lfMethod','gates','cornerCount'])delete g.customerInputs[k];
  Object.assign(g.customerInputs,{fenceRunCount:1,fenceRuns:[{closed:false,sections:[{lengthLF:20}]}]});
  assert.doesNotMatch(disclaimer(generateQuoteVNext(g)),ALLOWANCE);
});

// ---------------------------------------------------------------------------
// D7. Gate before the first section. 20 LF open run, 8 ft spacing: line posts
// ceil(20/8)-1 = 2; labor 20*1000 = 20,000; infill 20*(1.10)*2000 = 44,000;
// each post 2000 + 400 + 600 = 3,000; walk gate 25,000.
function runs(r){const g=offeringFixture('FENCING_INSTALL','itemized');for(const k of ['linearFeet','lfMethod','gates','cornerCount'])delete g.customerInputs[k];Object.assign(g.customerInputs,{fenceRunCount:r.length,fenceRuns:r});return g;}

test('D7: a gate can start an open run, counted like an end gate',()=>{
  // No gate: 2 + 2 ends = 4 posts (12,000): 76,000.
  assert.equal(total(generateQuoteVNext(runs([{closed:false,sections:[{lengthLF:20}]}]))),76000);
  // End gate (unchanged): 2 + (2 + 2 - 1) = 5 posts (15,000) + 25,000: 104,000.
  assert.equal(total(generateQuoteVNext(runs([{closed:false,sections:[{lengthLF:20,gateAfter:'walk'}]}]))),104000);
  // Start gate: the same 104,000.
  const start=generateQuoteVNext(runs([{closed:false,gateBefore:'walk',sections:[{lengthLF:20}]}]));
  assert.equal(start.resultType,'INSTANT_ESTIMATE_READY');assert.equal(lines(start)['Installed gate: walk'],25000);assert.equal(total(start),104000);
  // A gate at each end: 2 + (2 + 4 - 2) = 6 posts (18,000) + 50,000: 132,000.
  assert.equal(total(generateQuoteVNext(runs([{closed:false,gateBefore:'walk',sections:[{lengthLF:20,gateAfter:'walk'}]}]))),132000);
  // A closed run has no start; an unknown gate is refused.
  const closed=generateQuoteVNext(runs([{closed:true,gateBefore:'walk',sections:[{lengthLF:20},{lengthLF:20},{lengthLF:20}]}]));
  assert.equal(closed.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(closed.invalidCustomerFields,['fenceRuns']);
  const unknown=generateQuoteVNext(runs([{closed:false,gateBefore:'double_drive',sections:[{lengthLF:20}]}]));
  assert.deepEqual(unknown.invalidCustomerFields,['fenceRuns']);
  // Counted gates must match the placed gates, start gate included.
  const counted=runs([{closed:false,gateBefore:'walk',sections:[{lengthLF:20}]}]);counted.customerInputs.gates={walk:1};
  assert.equal(total(generateQuoteVNext(counted)),104000);
});

test('D7: widget, phone and the customer summary carry the start gate',()=>{
  const f=runs([{closed:false,gateBefore:'walk',sections:[{lengthLF:20,gateAfter:'walk'}]}]),definition=bridge.applicationServiceDefinition(f.ownerPricing);
  const field=definition.customerFields.find(q=>q.name==='fenceRuns');
  assert.equal(field.startGateQuestion,FENCE_START_GATE_QUESTION);
  const spoken=voiceQuestionContract(f.ownerPricing,definition,f.customerInputs).fields.find(q=>q.field==='fenceRuns');
  assert.deepEqual(spoken.details,[FENCE_CLOSED_QUESTION,FENCE_SECTION_QUESTION,FENCE_GATE_CORNER_QUESTION+' Ask only where a gate is placed; supply cornerAfterGate (boolean) on that section.',FENCE_START_GATE_QUESTION+' Ask only for a run that does not connect back; supply gateBefore on that run, equal to the offered gate key.']);
  const customerInputs=structuredClone(f.customerInputs);delete customerInputs.confirmedFacts;customerInputs.fenceRuns[0].gateBefore='Walk';
  const bound=bindVoiceQuoteInputs(f.ownerPricing,definition,{customerInputs,productConfirmations:{fenceType:true}});
  assert.deepEqual(bound.followUps,[]);assert.equal(bound.customerInputs.fenceRuns[0].gateBefore,'walk');
  const bad=structuredClone(customerInputs);bad.fenceRuns[0].gateBefore='Garage';
  assert.deepEqual(bindVoiceQuoteInputs(f.ownerPricing,definition,{customerInputs:bad,productConfirmations:{fenceType:true}}).followUps,['Identify the offered gate at the start of each run that has one.']);
  const label=field.gateChoices.find(g=>g.value==='walk').label;
  assert.equal(customerSummaryValue(field,f.customerInputs.fenceRuns,String),'Run 1: sections of 20 ft; does not connect back; gate '+label+' before section 1; gate '+label+' after section 1, at the end of the run');
  // A closed run's closing gate reads as before.
  assert.equal(customerSummaryValue(field,[{closed:true,sections:[{lengthLF:20},{lengthLF:20},{lengthLF:20,gateAfter:'walk'}]}],String),'Run 1: sections of 20 ft, 20 ft and 20 ft; connects back; gate '+label+' between sections 3 and 1');
});

// Through the real widget components.
async function bundle(entry){
  const {build}=await import('esbuild');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},stdin:{resolveDir:root,loader:'jsx',contents:entry}});
  return output.outputFiles[0].text;
}
async function render(entry,globals){
  const {JSDOM}=await import('jsdom'),code=await bundle(entry);
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.eval(Object.entries(globals).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('')+'window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(code);return w;
}
const until=async(cond,n=500)=>{for(let i=0;i<n&&!cond();i++)await new Promise(r=>setTimeout(r,10));};

test('D7: the fence form asks the start gate only for a run that does not connect back',async t=>{
  const f=runs([{closed:false,sections:[{lengthLF:20}]}]),field=bridge.applicationServiceDefinition(f.ownerPricing).customerFields.find(q=>q.name==='fenceRuns');
  const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {FenceRunsInput} from './client/src/FenceRunsInput.jsx';
    function App(){const [runs,setRuns]=useState(window.initial);window.current=runs;return <FenceRunsInput field={window.field} runs={runs} onChange={v=>{window.current=v;setRuns(v);}}/>;}
    createRoot(document.getElementById('root')).render(<App/>);`;
  const w=await render(entry,{initial:[{closed:false,sections:[{lengthLF:20}]}],field});t.after(()=>w.close());
  const select=()=>w.document.querySelector(`select[aria-label="${FENCE_START_GATE_QUESTION} — run 1"]`);
  await until(()=>select());assert.ok(select(),'start gate asked for an open run');
  select().value='walk';select().dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>w.current[0].gateBefore==='walk');
  assert.equal(w.current[0].gateBefore,'walk');
  // Choosing that the run connects back removes the start gate and its question.
  const closed=w.document.querySelector(`select[aria-label="${FENCE_CLOSED_QUESTION} — run 1"]`);
  closed.value='true';closed.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>w.current[0].closed===true);
  assert.equal(w.current[0].gateBefore,undefined);await until(()=>!select());assert.equal(select(),null);
});

test('D3: the carpet form shows room sizes, not a total area, for carpet only',async t=>{
  const entry=`import {customerMeasurementVisible} from './client/src/quoteDoneControls.jsx';window.visible=customerMeasurementVisible;`;
  const w=await render(entry,{});t.after(()=>w.close());
  for(const name of ['sqft','sqftMethod','roomCount','layoutPattern'])assert.equal(w.visible({name},{newFlooringType:'carpet'}),false,name);
  assert.equal(w.visible({name:'carpetRooms',visibleWhen:[[['newFlooringType','eq','carpet']]]},{newFlooringType:'carpet'}),true);
  assert.equal(w.visible({name:'sqft'},{newFlooringType:'tile'}),true);
});
