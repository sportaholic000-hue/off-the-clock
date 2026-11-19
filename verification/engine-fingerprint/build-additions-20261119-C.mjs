// One-time build of corpus-additions-20261119-C.json (Lane C launch fixes,
// 2026-11-19): inputs that reach the concrete and landscaping changes the
// frozen inputs do not: saw cuts on a solved rectangle and on rounded circle
// measurements, thickened edges, order-size short-load bands, cubic-metre
// ready-mix (chosen and the Canadian default), the winter concrete charge,
// labor shares of the combined base and ground preparation prices, bare
// ground, zero cleanup debris and mowing without riding-mower access. Each
// input is built from a fixture test/qeLaunchC_20261119.spec.mjs checks by
// hand. Results are recorded as the engine computes them. Run once; the output
// file is never edited. Not registered in fingerprint.mjs (the coordinator does that).
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261119-C.mjs [out.json]
import {writeFileSync} from 'node:fs';
import {fixture,concrete,mowing} from '../engine-independent/fixtures.mjs';

const rows=[];const add=(id,input)=>rows.push({id:'20261119c:'+id,input:structuredClone(input)});
const slab=(pricing={},inputs={})=>{const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false},inputs);Object.assign(f.ownerPricing.pricing,pricing);for(const [k,v] of Object.entries(inputs))if(v===undefined)delete f.customerInputs[k];for(const [k,v] of Object.entries(pricing))if(v===undefined)delete f.ownerPricing.pricing[k];return f;};
const areaPerimeter=(areaSqft,perimeterLF)=>({dimensionMethod:'measured_area_perimeter',areaSqft,perimeterLF,length:undefined,width:undefined});
const JOINTS={controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:800};

// --- C1 and C7: saw cuts from area and perimeter; rounded circle measurements.
add('concrete-joints-area-perimeter-rational-rectangle',slab(JOINTS,areaPerimeter(100,58)));
add('concrete-joints-area-perimeter-irrational-rectangle',slab(JOINTS,areaPerimeter(120,50)));
add('concrete-joints-area-perimeter-no-rectangle-square',slab(JOINTS,areaPerimeter(400,76)));
add('concrete-circle-rounded-62.83',slab(JOINTS,areaPerimeter(314.16,62.83)));
add('concrete-circle-impossible-62.82',slab(JOINTS,areaPerimeter(314.16,62.82)));
// --- C2: thickened edges.
const EDGE={thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12};
add('concrete-thickened-edge-20x20-increment',slab({...EDGE,readyMixOrderIncrementCubicYards:0.5},{length:20,width:20}));
add('concrete-thickened-edge-whole-narrow-walk',slab({...EDGE,thickenedEdgeWidthInches:18},{length:20,width:2}));
add('concrete-thickened-edge-outline',slab(EDGE,{dimensionMethod:'measured_outline',length:undefined,width:undefined,outlinePoints:[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:10,y:10},{x:10,y:20},{x:0,y:20},{x:0,y:0}]}));
// --- C3 and C5: order-size bands in cubic metres; unit choice and the Canadian default.
const BANDS={readyMixUnit:'cubic_metre',readyMixOrderIncrementCubicYards:0.25,shortLoadBands:{small_loads:{upToQuantity:2,charge:15000},medium_loads:{upToQuantity:4,charge:10000}},partialPackagePricing:undefined};
for(const [L,W] of [[10,10],[18,10],[20,10],[40,20]])add(`concrete-short-load-bands-metric-${L}x${W}`,slab(BANDS,{length:L,width:W}));
add('concrete-metric-price-100x100',slab({readyMixUnit:'cubic_metre',concreteCostPerCubicYard:20000},{length:100,width:100}));
add('concrete-yard-equivalent-price-100x100',slab({readyMixUnit:'cubic_yard',concreteCostPerCubicYard:15291.09715968},{length:100,width:100}));
{const f=slab();f.businessDefaults.businessCountry='CA';add('concrete-blank-unit-canada',f);}
{const f=slab();f.businessDefaults.businessCountry='US';add('concrete-blank-unit-united-states',f);}
add('concrete-metric-increment-threshold-per-unit',slab({readyMixUnit:'cubic_metre',concreteCostPerCubicYard:20000,readyMixOrderIncrementCubicYards:0.5,shortLoadThresholdCubicYards:3,shortLoadPerYard:5000,partialPackagePricing:undefined}));
add('concrete-metric-pump-by-volume',slab({readyMixUnit:'cubic_metre',concreteCostPerCubicYard:20000,readyMixOrderIncrementCubicYards:0.5,partialPackagePricing:undefined,placementPerCubicYard:{pump:1000},placementFlat:{pump:150000}},{chuteAccess:'no',placementMethod:'pump'}));
// --- C6: winter concrete charge by work month.
const WINTER={winterConcreteChargePerUnit:1500,winterConcreteStart:'11-01',winterConcreteEnd:'04-15'};
for(const month of [undefined,'january','april','may','not_sure'])add('concrete-winter-'+(month||'no-month'),slab(WINTER,month?{workMonth:month}:{}));
add('concrete-winter-metric-january',slab({...WINTER,winterConcreteChargePerUnit:2000,readyMixUnit:'cubic_metre'},{workMonth:'january'}));
// --- C8: combined base preparation labor share.
for(const [access,share] of [['difficult',undefined],['difficult',60],['difficult',100],['moderate',60],['easy',undefined]]){
  const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',accessDifficulty:access});if(share!==undefined)f.ownerPricing.pricing.basePrepLaborPercent=share;add(`concrete-base-prep-${access}-share-${share??'blank'}`,f);
}
// --- C9 and C10: sod combined ground preparation labor share; bare ground.
const SOD={sodMaterialPerSqft:45,sodInstallLaborPerSqft:60,minimumServiceCharge:0,sodPalletSizeSqft:450};
const sod=(pricing,inputs)=>fixture('LANDSCAPING_SOD',{...SOD,...pricing},{sodSqft:2000,sqftMethod:'exact',groundPrepNeeded:true,existingLawnToRemove:true,slope:'steep',accessDifficulty:'difficult',...inputs});
add('sod-combined-steep-difficult-no-share',sod({groundPrepPerSqft:50}));
add('sod-combined-steep-difficult-share-60',sod({groundPrepPerSqft:50,groundPrepLaborPercent:60}));
add('sod-combined-flat-easy-no-share',sod({groundPrepPerSqft:50},{slope:'flat',accessDifficulty:'easy'}));
add('sod-combined-bare-ground',sod({groundPrepPerSqft:50,groundPrepLaborPercent:100},{existingLawnToRemove:false}));
add('sod-separate-bare-ground',sod({sodRemovalPerSqft:30,sodGradingPerSqft:20},{existingLawnToRemove:false}));
add('sod-separate-bare-ground-topsoil',sod({sodGradingPerSqft:20,topsoilPerCubicYard:3000,topsoilTargetDepthInches:4,topsoilWasteFactor:0},{existingLawnToRemove:false,usableTopsoilDepthInches:3}));
add('sod-ground-prep-lawn-answer-missing',sod({sodRemovalPerSqft:30,sodGradingPerSqft:20},{existingLawnToRemove:undefined}));
// --- C11: explicit zero cleanup debris.
const CLEANUP={cleanupBaseRatePerSqft:10,minimumServiceCharge:0,disposalPerBag:300,disposalPerLoad:6000,haulAwayFee:2500,slopeMultiplier:{flat:1,moderate:1.1,steep:1.25},debrisPricing:{light:{laborMultiplier:1,disposalFlat:5000},moderate:{laborMultiplier:1.2,disposalFlat:7500},heavy:{laborMultiplier:1.5,disposalFlat:10000}}};
for(const [id,inputs] of [['zero-bags',{wasteBags:0}],['zero-loads',{wasteLoads:0}],['zero-bags-haul-away',{wasteBags:0,haulAway:true}],['one-bag',{wasteBags:1}]])add('cleanup-'+id,fixture('LANDSCAPING_CLEANUP',CLEANUP,{yardSqft:1000,sqftMethod:'exact',debrisLevel:'light',slope:'flat',haulAway:false,...inputs}));
// --- C12: mowing without riding-mower access, including a first visit.
for(const [id,multiplier,inputs] of [['no-rider',1.5,{ridingMowerReachesLawn:false}],['rider',1.5,{ridingMowerReachesLawn:true}],['no-rider-first-visit',1.5,{ridingMowerReachesLawn:false,grassCondition:'overgrown'}],['question-unanswered',1.5,{}]]){
  const f=mowing();f.ownerPricing.pricing.noRidingMowerLaborMultiplier=multiplier;Object.assign(f.customerInputs,inputs);add('mowing-'+id,f);
}

const out=process.argv[2]?new URL(process.argv[2],'file://'+process.cwd()+'/'):new URL('./corpus-additions-20261119-C.json',import.meta.url);
writeFileSync(out,JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
