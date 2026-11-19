// One-time build of corpus-additions-20261119-D.json (lane D of the November 19,
// 2026 launch fixes): inputs the frozen corpus does not reach for D1 tile
// substrate, D2 carpet pieces side by side, D3 carpet room sizes, D4 pattern
// repeat only at seams, D5 leveling on replacement, D6 per-panel fence
// allowance and D7 a gate before the first section. The expected values are
// worked by hand in test/qeLaunchD_20261119.spec.mjs. Run once; the output file
// is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261119-D.mjs [out.json]
import {writeFileSync} from 'node:fs';
import {fixture} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

const rows=[];const add=(id,input)=>rows.push({id:'laneD:'+id,input:structuredClone(input)});
function floor(service,type,pricing={},customer={}){
  pricing=Object.fromEntries(Object.entries(pricing).filter(([,v])=>v!==undefined));
  const c={sqft:200,sqftMethod:'exact',newFlooringType:type,existingFloorType:'none',removalNeeded:false,roomCount:1,layoutPattern:'straight',stairSteps:0,...(service==='FLOORING_REPLACEMENT'?{subfloorIssues:false}:{}),...customer};
  for(const [k,v] of Object.entries(c))if(v===undefined)delete c[k];
  return fixture(service,{laborPerSqft:{[type]:300},materialPerSqft:{[type]:500},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',perStepPrice:10000,...pricing},c);
}
const BACKER={scopeDetails:{floor_underlayment_tile:{description:'Half-inch cement backer board, screwed and taped',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_tile:250}};
const INCLUDED={scopeDetails:{floor_underlayment_tile:{description:'Backer board included in our tile price',mode:'included_in_floor_price'}}};
const PAD={scopeDetails:{floor_underlayment_carpet:{description:'Carpet pad',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_carpet:80}};

// D1: tile on wood, concrete, not sure; old floor removed; backer included.
for(const service of ['FLOORING_INSTALL','FLOORING_REPLACEMENT']){
  const s=service==='FLOORING_INSTALL'?'install':'replacement';
  for(const support of ['joists','wood_on_concrete','sleepers','concrete_slab','not_sure'])add(`d1-${s}-tile-on-${support}-backer-priced`,floor(service,'tile',BACKER,{floorConstructionKnown:'yes',floorSupportConstruction:support,...(['joists','wood_on_concrete','sleepers'].includes(support)?{underlaymentScopeConfirmed:true}:{})}));
  add(`d1-${s}-tile-on-joists-no-backer-price`,floor(service,'tile',{},{floorConstructionKnown:'yes',floorSupportConstruction:'joists'}));
  add(`d1-${s}-tile-construction-unknown`,floor(service,'tile',BACKER,{floorConstructionKnown:'no'}));
  add(`d1-${s}-tile-construction-unanswered`,floor(service,'tile',BACKER));
  const removal={removalPerSqft:{hardwood:100,vinyl:100},...BACKER};
  for(const assembly of ['joists','glued_to_concrete','direct_on_concrete','sleepers'])add(`d1-${s}-tile-hardwood-removed-${assembly}`,floor(service,'tile',removal,{existingFloorType:'hardwood',removalNeeded:true,removalAreaSqft:200,floorConstructionKnown:'yes',woodFloorAssembly:assembly,...(['joists','sleepers'].includes(assembly)?{underlaymentScopeConfirmed:true}:{})}));
  add(`d1-${s}-tile-vinyl-removed-joists`,floor(service,'tile',removal,{existingFloorType:'vinyl',removalNeeded:true,removalAreaSqft:200,floorConstructionKnown:'yes',floorSupportConstruction:'joists',underlaymentScopeConfirmed:true}));
  add(`d1-${s}-tile-backer-included-unknown`,floor(service,'tile',INCLUDED,{floorConstructionKnown:'no',underlaymentScopeConfirmed:true}));
}

// D2, D3, D4: carpet bought from room sizes on a 12 ft roll.
const carpet=(name,rooms,groups,pricing={})=>add(name,floor('FLOORING_INSTALL','carpet',{carpetRollWidthFt:12,...PAD,...pricing},{sqft:undefined,sqftMethod:undefined,roomCount:undefined,layoutPattern:undefined,underlaymentScopeConfirmed:true,carpetRooms:rooms,...(groups?{carpetConnectedAreas:groups}:{})}));
carpet('d2-two-4x4-rooms-share-one-cut',[{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],[[1],[2]]);
carpet('d2-two-5.5-rooms-fill-the-roll',[{lengthFt:5.5,widthFt:5.5},{lengthFt:5.5,widthFt:5.5}],[[1],[2]]);
carpet('d2-two-5.51-rooms-do-not-fit',[{lengthFt:5.51,widthFt:5.51},{lengthFt:5.51,widthFt:5.51}],[[1],[2]]);
carpet('d2-three-4x4-rooms',[{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],[[1],[2],[3]]);
carpet('d2-fill-strip-shares-cut',[{lengthFt:6,widthFt:11},{lengthFt:12,widthFt:6}],[[1],[2]],{carpetCrossgrainSeams:'allowed'});
carpet('d3-10x10-room',[{lengthFt:10,widthFt:10}]);
carpet('d3-20x13-room-two-widths',[{lengthFt:20,widthFt:13}]);
carpet('d3-10x10-room-square-yards',[{lengthFt:10,widthFt:10}],undefined,{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2700},materialPerSqft:{carpet:4500}});
add('d3-carpet-total-area-only',floor('FLOORING_INSTALL','carpet',{carpetRollWidthFt:12,...PAD},{sqft:100,roomCount:1,layoutPattern:undefined,underlaymentScopeConfirmed:true}));
carpet('d4-10x10-repeat-2',[{lengthFt:10,widthFt:10}],undefined,{carpetPatternRepeatFt:2});
carpet('d4-11.5-repeat-2',[{lengthFt:11.5,widthFt:11.5}],undefined,{carpetPatternRepeatFt:2});
carpet('d4-11.5001-repeat-2',[{lengthFt:11.5001,widthFt:11.5001}],undefined,{carpetPatternRepeatFt:2});
carpet('d4-two-4x4-connected-repeat-2',[{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],[[1,2]],{carpetPatternRepeatFt:2});
carpet('d4-two-4x4-separate-repeat-2',[{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}],[[1],[2]],{carpetPatternRepeatFt:2});

// D5: leveling on replacement, beside subfloor repair; installation alongside.
const LEVEL={floorLevelingPerSqft:200,floorLevelingMaxDepthInches:0.5,removalPerSqft:{vinyl:150},scopeDetails:{floor_underlayment_hardwood:{description:'Foam included',mode:'included_in_floor_price'}}};
const level=(service,customer)=>floor(service,'hardwood',service==='FLOORING_REPLACEMENT'?{...LEVEL,subfloorAllowancePerSqft:300}:LEVEL,{existingFloorType:'vinyl',removalNeeded:true,removalAreaSqft:200,underlaymentScopeConfirmed:true,...customer});
add('d5-replacement-leveling-50',level('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:50}));
add('d5-replacement-leveling-50-subfloor-20',level('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:50,subfloorIssues:true,subfloorRepairAreaSqft:20}));
add('d5-replacement-leveling-unknown',level('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:'unknown'}));
add('d5-replacement-leveling-200-of-200',level('FLOORING_REPLACEMENT',{floorLevelingNeeded:true,floorLevelingSqft:200}));
add('d5-install-leveling-50',level('FLOORING_INSTALL',{floorLevelingNeeded:true,floorLevelingSqft:50}));

// D6: per-panel infill from a total length.
{const f=offeringFixture('FENCING_INSTALL','itemized'),p=f.ownerPricing.pricing;p.offeringDetails.infillPricing='per_panel';p.offeringRates.fencePanelEach=5000;delete p.offeringRates.fenceMaterialPerLF;add('d6-fence-per-panel-total-length',f);}

// D7: a gate before the first section of an open run.
const runs=(name,r)=>{const g=offeringFixture('FENCING_INSTALL','itemized');for(const k of ['linearFeet','lfMethod','gates','cornerCount'])delete g.customerInputs[k];Object.assign(g.customerInputs,{fenceRunCount:r.length,fenceRuns:r});add(name,g);};
runs('d7-open-run-no-gate',[{closed:false,sections:[{lengthLF:20}]}]);
runs('d7-open-run-end-gate',[{closed:false,sections:[{lengthLF:20,gateAfter:'walk'}]}]);
runs('d7-open-run-start-gate',[{closed:false,gateBefore:'walk',sections:[{lengthLF:20}]}]);
runs('d7-open-run-gate-each-end',[{closed:false,gateBefore:'walk',sections:[{lengthLF:20,gateAfter:'walk'}]}]);
runs('d7-closed-run-start-gate-refused',[{closed:true,gateBefore:'walk',sections:[{lengthLF:20},{lengthLF:20},{lengthLF:20}]}]);

const out=process.argv[2]?new URL(process.argv[2],'file://'+process.cwd()+'/'):new URL('./corpus-additions-20261119-D.json',import.meta.url);
writeFileSync(out,JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
