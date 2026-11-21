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
  // leaves the explicit one-room 12x14 quote. Since v42 a room no wider than
  // the roll takes one width: the 12-ft side takes one roll width cut 14.5 long
  // = 174 sq ft x 300 = 52,200c material (v17 to v41: 2 widths cut 12.5, 90,000c);
  // labor 168 x 300 x 1.10 = 55,440c; underlayment 168c; total 107,808c.
  const f=carpet([{lengthFt:12,widthFt:14}]);f.customerInputs.roomCount=2;
  let q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(q.invalidCustomerFields.includes('carpetRooms'));
  delete f.customerInputs.roomCount;q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1078.08);
});

test('new area-only carpet layouts add no hard-floor pattern allowance, while the legacy pattern request keeps its cents',()=>{
  // Expected before execution:200sqft, $3 labor/material, .10 product waste,
  // medium rooms =>66,000 labor+66,000 material+200 underlay=132,200c.
  // Retained diagonal_or_pattern request:79,200+70,200+200=149,600c.
  // Lane D fix D3 (November 19, 2026): carpet is always bought from room sizes, so a
  // carpet total area alone now asks for the rooms instead of pricing area plus waste
  // (was: ready at 1,322 for diagonal and herringbone, and 1,496 for the legacy pattern).
  const f=carpet([{lengthFt:10,widthFt:20}]);delete f.customerInputs.carpetRooms;delete f.customerInputs.carpetConnectedAreas;
  for(const layoutPattern of ['diagonal','herringbone_or_chevron','diagonal_or_pattern']){
    const q=generateQuoteVNext({...f,customerInputs:{...f.customerInputs,layoutPattern}});assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.missingCustomerFields,['carpetRooms']);
  }
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

test('carpet connected-area direction and lengthwise fills match an independent exhaustive oracle on 1,000 seeded layouts',()=>{
  // Expected before execution: every connected group shares one orientation;
  // exhaustive two-direction candidates give exactly the purchased area.
  // Integer quarter-feet keep this independent oracle exact in binary arithmetic.
  let state=0x20261016;const next=n=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
  for(let trial=0;trial<1000;trial++){
    const count=1+next(6),rooms=Array.from({length:count},()=>({lengthFt:(4+next(116))/4,widthFt:(4+next(116))/4})),roll=[12,13.5,15][next(3)],repeat=next(9)/4;
    const groups=[[],[]];for(let i=1;i<=count;i++)groups[next(2)].push(i);const nonempty=groups.filter(g=>g.length);
    // Per room: 0.5 ft trim across the room and on every cut. Full-width drops
    // cut to the run + 0.5 + repeat, then the leftover strip either as one more
    // width or split lengthwise from one roll cut into 2 or 3 end-to-end strips,
    // cheapest wins.
    // Lane D fixes D4 and D2 (November 19, 2026): the repeat goes only on cuts in a
    // room of more than one drop or a connected area of more than one room; then
    // last pieces narrower than the roll share roll-width cuts side by side
    // (longest first, first cut they fit; a lone piece keeps its own purchase),
    // with fills kept or also shared, whichever is less. Was: this room-by-room
    // total with the repeat on every cut, which is now an upper bound.
    // v42: a room no wider than the roll is covered by one width (its trim across is given up).
    const roomArea=(across,along,rep=repeat)=>{
      const cover=across<=roll&&across+.5>roll?roll:across+.5;
      const n=Math.ceil(cover/roll),whole=n*roll*(along+.5+rep);
      if(n<2)return {area:whole,n,len:along+.5+rep,strip:cover,fill:false};
      const strip=cover-(n-1)*roll;
      const fills=[2,3].filter(k=>k*strip<=roll).map(k=>(n-1)*roll*(along+.5+rep)+roll*(along+k*(.5+rep))/k);
      const best=Math.min(whole,...fills);
      return {area:best,n,len:along+.5+rep,strip,fill:best<whole};
    };
    const previous=nonempty.reduce((sum,group)=>sum+Math.min(...[false,true].map(turn=>group.reduce((total,index)=>{const r=rooms[index-1],across=turn?r.lengthFt:r.widthFt,along=turn?r.widthFt:r.lengthFt;return total+roomArea(across,along).area;},0))),0);
    const rows=nonempty.flatMap(group=>{
      const options=[false,true].map(turn=>group.map(index=>{const r=rooms[index-1],across=turn?r.lengthFt:r.widthFt,along=turn?r.widthFt:r.lengthFt,n=roomArea(across,along).n;return {...roomArea(across,along,n>1||group.length>1?repeat:0),index};}));
      const sum=list=>list.reduce((s,x)=>s+x.area,0);return sum(options[1])<sum(options[0])?options[1]:options[0];
    });
    const layout=shareFills=>{
      const shared=rows.filter(r=>r.strip<roll&&(shareFills||!r.fill)),cuts=[];let sum=rows.filter(r=>!shared.includes(r)).reduce((s,r)=>s+r.area,0);
      for(const r of [...shared].sort((a,b)=>b.len-a.len||b.strip-a.strip||a.index-b.index)){const c=cuts.find(c=>c.used+r.strip<=roll);if(c){c.used+=r.strip;c.rows.push(r);}else cuts.push({len:r.len,used:r.strip,rows:[r]});}
      for(const c of cuts)sum+=c.rows.length===1?c.rows[0].area:roll*c.len+c.rows.reduce((s,r)=>s+(r.n-1)*roll*r.len,0);
      return sum;
    };
    const expected=Math.min(rows.reduce((s,r)=>s+r.area,0),layout(false),layout(true));
    const bought=carpetRollPurchase({carpetRooms:rooms,carpetConnectedAreas:nonempty},{carpetRollWidthFt:roll,carpetPatternRepeatFt:repeat,carpetCrossgrainSeams:'allowed'});
    const value=Number(bought.purchasedQuantity.numerator)/Number(bought.purchasedQuantity.denominator);
    assert.ok(Math.abs(value-expected)<1e-9,'trial '+trial);
    assert.ok(value<=previous+1e-9,'never more than the room-by-room purchase, trial '+trial);
  }
});
