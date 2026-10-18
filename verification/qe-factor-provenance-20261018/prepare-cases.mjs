// PREPARATION ONLY: writes independent expectations and synthetic inputs before
// compare.mjs is run. No calls to generateQuoteVNext / calculator functions.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fixture,flooring,flatRoof,flatRepair,siding,custom} from '../engine-independent/fixtures.mjs';
import {roof} from '../../server/quote-engine-vnext/tests/coreFixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {concreteFixture,sodFixture,plantingFixture} from '../../test/quoteConcreteLandscape20261016Fixture.mjs';
import {cleanupFixture,mowingFixture} from '../../test/landscapeLaneB20261016Fixture.mjs';
import {carpet} from '../../test/quoteFlooring20261016Fixture.mjs';
import {fixtureOfferings,confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
import {CLASS2_DEFINITIONS} from '../../server/quote-engine-vnext/contracts.js';
import {synchronizeStartingValuesVNext} from '../../server/quote-engine-vnext/priceGroundwork.js';
const dir=path.dirname(new URL(import.meta.url).pathname);
const clone=structuredClone, cases=[];
function add(id,f,baselineChange,base,active,calculation,classification='automatic assumption',metric='total'){
 const b=clone(f);baselineChange(b);
 cases.push({id,service:f.serviceType,classification,metric,calculation,expected:{baselineCents:base,activeCents:active,deltaCents:active-base},baseline:b,active:f});
}
const p=f=>f.ownerPricing.pricing;
const type=(f,t)=>{f.serviceType=t;f.ownerPricing.serviceType=t;f.ownerPricing.origin.serviceType=t;return f;};
const neutral=(f,keys)=>{for(const key of keys){const v=p(f)[key];p(f)[key]=typeof v==='object'?Object.fromEntries(Object.keys(v).map(k=>[k,/waste/i.test(key)?0:1])):/waste/i.test(key)?0:1;}};
function roofDefaults(){const f=roof();for(const key of ['wasteFactorByComplexity','pitchMultiplier','storyMultiplier'])p(f)[key]=clone(CLASS2_DEFINITIONS.ROOFING_REPLACEMENT[key].defaultValue);return f;}
function adopt(f,group){f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,CLASS2_DEFINITIONS[f.serviceType],{adoptGroups:[group],ownerId:f.ownerPricing.origin.ownerId,now:'2026-10-18T00:00:00Z'});return f;}
function retire(f,paths){f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,CLASS2_DEFINITIONS[f.serviceType],{ownerEnteredPaths:paths,ownerId:f.ownerPricing.origin.ownerId,now:'2026-10-18T00:00:01Z'});}
function paint(){const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:1,ceilingsIncluded:false,trimIncluded:false});f.ownerPricing.priceBasisByCategory.material='sell_price';return f;}
let f=roofDefaults();Object.assign(f.customerInputs,{pitch:'very_steep',stories:3,roofComplexity:'complex'});
add('roof-legacy-combined',f,b=>neutral(b,['wasteFactorByComplexity','pitchMultiplier','storyMultiplier']),171000,236600,'10 squares: baseline 50000 labor + 20000 removal + 100000 field material + 1000 underlay. Active 50000*1.4*1.2 + 20000*1.4*1.2 + 100000*1.18 +1000.');
f=fixture('ROOFING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:10000,repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:8}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:4000,medium:8000,large:16000}}}},{roofType:'asphalt_shingle',repairType:'shingle_patch',affectedArea:100,pitch:'very_steep',stories:3,leakPresent:false});
add('roof-repair-pitch-story',f,b=>neutral(b,['pitchMultiplier','storyMultiplier']),48000,75200,'4h*10000c +8000c; active labor *1.4*1.2, allowance unchanged.');
f=flatRoof();f.customerInputs.accessDifficulty='difficult';
add('flat-roof-access-waste',f,b=>neutral(b,['accessMultiplier','membraneWasteFactor']),1400000,1680000,'1000sf: 500000 labor +200000 removal +700000 material; active labor/removal *1.30; material *1.10.','mixed automatic access / owner-policy waste');
f=flatRepair();f.customerInputs.accessDifficulty='difficult';
add('flat-repair-access',f,b=>neutral(b,['accessMultiplier']),36000,45000,'3h*10000*1.30+6000 vs 3h*10000+6000.','owner-policy inherited adjustment');
f=paint();f.customerInputs.wallHeight='vaulted';
add('interior-height-waste',f,b=>neutral(b,['wallHeightLaborMultiplier','paintWasteFactor']),52000,63200,'400sf*100c*1.25 +400sf*30c*1.10 vs 400*(100+30).','owner policy');
f=offeringFixture('EXTERIOR_PAINTING','itemized');f.customerInputs.stories=3;
add('exterior-story-waste',f,b=>neutral(b,['storyMultiplier','paintWasteFactor','primerWasteFactor','prepMaterialWasteFactor']),225000,265000,'500sf: finish 2*100c, prep100c, primer50c =>175000 labor; material 2*30+20+20 =>50000. Active labor*1.20, materials*1.10.','owner policy');
for(const t of ['FLOORING_INSTALL','FLOORING_REPLACEMENT']){
 f=type(flooring('tile',1000),t);if(t==='FLOORING_REPLACEMENT')f.customerInputs.subfloorIssues=false;
 add(t.toLowerCase()+'-waste',f,b=>neutral(b,['wasteFactorByType']),800000,860000,'1000sf*300c labor + 1000sf*500c material; active material *1.12, large-room factor1.');
}
for(const t of ['FENCING_INSTALL','FENCING_REPLACEMENT']){
 f=offeringFixture(t,'itemized');f.customerInputs.gates={};f.customerInputs.terrainSlope='steep';p(f).offeringDetails.baselinePricesConfirmed=true;
 const extra=t.endsWith('REPLACEMENT')?40000:0;
 add(t.toLowerCase()+'-terrain-waste',f,b=>neutral(b,['terrainLaborMultiplier','fenceWasteFactor']),342000+extra,393680+extra+(extra?7200:0),'100LF, 14 posts. Labor100000+14*400=105600; *1.30 active. Material200000*1.10+14*(2000+600). Baseline waste0; selected removal50LF*800 has owner 60% labor share: 40000*(.4+.6*1.30)=47200 active, 40000 neutral.','owner policy');
}
for(const t of ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB']){
 f=type(concreteFixture(20,20),t);delete p(f).readyMixOrderIncrementCubicYards;p(f).stampedMaterialPerSqft=300;Object.assign(f.customerInputs,{finishType:'stamped',accessDifficulty:'difficult'});
 add(t.toLowerCase()+'-finish-access-waste',f,b=>neutral(b,['finishMultiplier','accessMultiplier','concreteWasteFactor','stampedMaterialWasteFactor']),648889,879778,'400sf: labor240000*1.5*1.25=450000; concrete round(400*4/324*1.10*18000)=97778; forms80*2500=200000; stamp400*300*1.1=132000. Neutral labor240000, concrete88889, forms200000, stamp120000.','mixed automatic finish/access / owner-policy material waste');
}
f=cleanupFixture();f.customerInputs.slope='steep';
add('cleanup-slope',f,b=>neutral(b,['slopeMultiplier']),70000,73500,'10000sf*1c*1.35 labor; ceil(10000/2000)*12000=60000 disposal (above10000 minimum). Neutral labor10000.');
f=fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{standard:6000},mulchInstallLaborPerYard:4000,minimumServiceCharge:0},{inputMethod:'sqft',mulchArea:1080,mulchDepth:3,mulchType:'standard',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'difficult'});
add('mulch-overage-access',f,b=>{p(b).mulchOverageFactor=1;neutral(b,['accessMultiplier']);},100000,119000,'1080*3/324=10yd3: material10*6000*1.15=69000; labor10*4000*1.25=50000; neutral60000+40000.');
f=sodFixture();Object.assign(f.customerInputs,{groundPrepNeeded:false,slope:'steep',accessDifficulty:'difficult'});
add('sod-slope-access-waste',f,b=>neutral(b,['slopeMultiplier','accessMultiplier','sodWasteFactor']),200000,273750,'1000sf: material100000*1.05=105000; labor100000*1.35*1.25=168750. Neutral200000.');
f=plantingFixture();f.customerInputs.accessDifficulty='difficult';
add('planting-access',f,b=>neutral(b,['accessMultiplier']),30000,34500,'4 plants: labor4*4500*1.25=22500; allowance4*3000=12000; neutral30000.','owner-policy inherited adjustment');
f=mowingFixture();Object.assign(f.customerInputs,{serviceFrequency:'one_time',grassCondition:'maintained'});
add('mowing-no-automatic-factor',f,()=>{},5000,5000,'10000sf*0.5c; owner frequency1 and maintained1. There are no automatic Class2 factors.','owner-supplied control');
f=siding();f.customerInputs.stories=3;
add('siding-waste-story',f,b=>neutral(b,['wasteFactorByType','storyMultiplier']),1100000,1250000,'1000sf: labor400000*1.2; vinyl material700000*1.10. Neutral1100000.');
f=fixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:10000,repairHours:{vinyl:{minor:{small:2,medium:4,large:8}}},materialAllowance:{vinyl:{minor:{small:5000,medium:10000,large:20000}}}},{sidingType:'vinyl',damageLevel:'minor',affectedArea:50,stories:3});
add('siding-repair-story',f,b=>neutral(b,['storyMultiplier']),50000,58000,'4h*10000*1.20 +10000 fixed material vs40000+10000.');
f=custom();add('custom-no-automatic-factor',f,()=>{},12500,12500,'One fixed synthetic selling price12500; no automatic trade factors.','owner-supplied control');
// Isolated effects / counterfactuals. These are not replacement-rate recommendations.
f=flatRoof();f.customerInputs.accessDifficulty='difficult';p(f).membraneWasteFactor=0;
add('flat-access-isolated',f,b=>neutral(b,['accessMultiplier']),1400000,1610000,'(500000+200000)*(1.30-1)=210000 added labor/removal cents; material700000 unchanged.');
f=sodFixture();Object.assign(f.customerInputs,{groundPrepNeeded:false,slope:'steep',accessDifficulty:'difficult'});p(f).sodWasteFactor=0;
add('sod-productivity-isolated',f,b=>neutral(b,['slopeMultiplier','accessMultiplier']),200000,268750,'100000 labor*(1.35*1.25-1)=68750 added cents; material100000 unchanged.');
f=type(concreteFixture(20,20),'CONCRETE_DRIVEWAY');delete p(f).readyMixOrderIncrementCubicYards;p(f).stampedMaterialPerSqft=300;f.customerInputs.finishType='stamped';
add('concrete-finish-isolated',f,b=>{p(b).finishMultiplier.stamped=1;},669778,789778,'400sf*600c*(1.50-1)=120000 additional finish labor. Other labor240000/material97778/forms200000/stamp132000 fixed.');
f=roofDefaults();Object.assign(f.customerInputs,{pitchMethod:'whole_roof',pitchBand:'up_to_six',roofComplexity:'complex'});delete f.customerInputs.pitch;
f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
add('roof-adopted-complexity',f,b=>{p(b).complexityLaborMultiplier.complex=1;},189000,209000,'10*5000 base labor +10*2000 tear-off +10*11800 material+1000 underlay; add50000*(1.4-1)=20000.','weak starting assumption');
f=clone(f);f.customerInputs.roofComplexity='simple';f.customerInputs.pitchBand='ten_to_twelve';p(f).laborPerSquare.product_0=20000;p(f).tearOffPerSquare.product_0=6000;p(f).disposalPerSquare=2000;
add('roof-adopted-upper-pitch',f,b=>{b.customerInputs.pitchBand='up_to_six';},391000,485800,'10sq: labor200000+tear60000+disposal20000+material110000+underlay1000=391000. Compared with the up-to-six pitch band, add200000*.31 +10*(6000+2000)*.41=94800. Zero-adder defect is preserved separately.','weak starting assumption');
f=clone(f);f.customerInputs.pitchBand='up_to_six';f.customerInputs.existingLayers=3;
add('roof-additional-layer-factor',f,b=>{p(b).additionalLayerRemovalFactor=1;},551000,515000,'First-layer base391000; extra2 layers disposal40000; extra tear2*60000*.70=84000 vs120000. Delta -36000.','weak cross-price-list starting assumption');
f=flooring('vinyl_plank',700);Object.assign(f.customerInputs,{roomCount:2,layoutPattern:'herringbone_or_chevron'});adopt(f,'flooring_patterns_20261017');
add('floor-herringbone-labor-isolated',f,b=>{p(b).herringboneLaborMultiplierByType.vinyl_plank=1;retire(b,['herringboneLaborMultiplierByType.vinyl_plank']);},602000,759500,'700*300*1.75 labor367500 vs210000; material700*1.12*500=392000 fixed.','weak starting assumption');
for(const [kind,baseWaste,added] of [['laminate',.08,.06],['vinyl_plank',.08,.04],['hardwood',.10,.07],['tile',.12,.03]]){
 f=flooring(kind,500);f.customerInputs.layoutPattern='diagonal';
 // Scope-specific underlayment is owner-priced, not a default product price.
 let under=0;if(['laminate','hardwood'].includes(kind)){Object.assign(p(f),{scopeDetails:{['floor_underlayment_'+kind]:{description:'[SYNTHETIC] defined underlayment',mode:'installed_area_sell_price'}},scopeRates:{['floor_underlayment_'+kind]:1},installedLaborPercent:{['scopeRates.floor_underlayment_'+kind]:0},installedMaterialsPercent:{['scopeRates.floor_underlayment_'+kind]:100}});f.customerInputs.underlaymentScopeConfirmed=true;under=500;}
 const b=clone(f);adopt(f,'flooring_patterns_20261017');
 const baseline=Math.round(180000+250000*(1+baseWaste+.07)+under),active=Math.round(180000+250000*(1+baseWaste+added)+under);
 add('floor-diagonal-'+kind,f,x=>{x.ownerPricing=b.ownerPricing;},baseline,active,`500sf: labor500*300*1.20=180000; material250000*(1+${baseWaste}+old .07 or proposed ${added}); underlay${under} fixed.`,'weak range-to-fixed-adder assumption');
}
f=flooring('vinyl_plank',700);Object.assign(f.customerInputs,{roomCount:2,layoutPattern:'diagonal'});p(f).wasteFactorByType.vinyl_plank=.20;adopt(f,'flooring_patterns_20261017');
add('floor-owner-base-not-capped',f,b=>{p(b).wasteFactorByType.vinyl_plank=.08;},644000,686000,'Labor700*300*1.2=252000; proposed .04 adds to owner base .20 =>24% total, not cited12% total. Material434000 vs392000.','owner-base interaction; not arithmetic defect');
f=paint();adopt(f,'painting_coats_20261017');
add('paint-one-coat-ratio',f,b=>{p(b).paintingSettings.wallAdditionalCoatRatio=1;retire(b,['paintingSettings.wallAdditionalCoatRatio']);},53200,57644,'Material400*30*1.1=13200. Labor round(400*100*2/1.8)=44444 vs40000.','weak starting assumption');
f=paint();f.customerInputs.coats=3;adopt(f,'painting_coats_20261017');
add('paint-three-coat-ratio',f,b=>{p(b).paintingSettings.wallAdditionalCoatRatio=1;retire(b,['paintingSettings.wallAdditionalCoatRatio']);},159600,155155,'Material400*3*30*1.1=39600; first labor44444 + additional round(400*2*100*1.6/1.8)=71111 =>115555 vs120000.','weak starting assumption');
f=paint();Object.assign(p(f),{trimLaborPerLF:200,trimMaterialPerLF:30});Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:100,trimCoats:1,trimSurfaceCondition:'good'});adopt(f,'painting_coats_20261017');
add('trim-one-coat-ratio',f,b=>{p(b).paintingSettings.trimAdditionalCoatRatio=1;retire(b,['paintingSettings.trimAdditionalCoatRatio']);},80944,91019,'Wall57644 fixed; trimmaterial3300; trimlabor round(100*200*2/1.33)=30075 vs20000.','near-one-third product/task-specific proposal');
f=carpet([{lengthFt:12,widthFt:12}],12); // CRI half-foot trim; compare same floor with wider owner product roll.
add('carpet-roll-boundary',f,b=>{p(b).carpetRollWidthFt=12.5;},98859,141984,'144sf labor144*300*1.2=51840, underlay144. At12ft roll: ceil(12.5/12)*12*12.5=300sf*300=90000. At12.5ft roll:156.25sf*300=46875. Difference43125 from whole-roll geometry, not a new default roll width.','supported trim method; supplier/seaming evidence required');
f=concreteFixture();
add('concrete-order-increment',f,b=>{delete p(b).readyMixOrderIncrementCubicYards;},184444,187000,'100sf: labor60000+forms100000; unrounded order100*4/324*1.1=110/81yd =>round(*18000)=24444. Half-yard increment =>1.5yd*18000=27000.','hypothetical owner supplier increment');
f=concreteFixture(20,30);f.customerInputs.baseNeeded=true;Object.assign(p(f),{baseDepthInches:4,baseCompactionAllowance:.20,baseGravelPerCubicYard:4500,baseExcavationGradingPerSqft:120});
add('concrete-compaction-owner',f,b=>{p(b).baseCompactionAllowance=0;},868333,875000,'600sf: base gravel600*4/324*4500=33333 rounded; *1.2=40000. Other lines835000 fixed: labor360000+ready-mix8.5yd*18000=153000+forms250000+grading72000.','hypothetical owner allowance; no default compaction');
f=sodFixture();f.customerInputs.groundPrepNeeded=false;p(f).sodPalletSizeSqft=450;
add('sod-whole-pallets',f,b=>{delete p(b).sodPalletSizeSqft;},205000,235000,'1000sf*1.05=1050; ceil(1050/450)*450=1350sf at100c vs105000c; labor100000 fixed.','hypothetical owner supplier increment');
f=flooring('tile',200);p(f).cartonCoverageSqft={tile:30};
add('floor-whole-cartons',f,b=>{delete p(b).cartonCoverageSqft;},178000,186000,'Labor200*300*1.1=66000. Material200*1.12=224sf; ceil(224/30)*30=240sf at500c vs112000.','hypothetical owner supplier increment');
f=clone(cases.find(c=>c.id==='mulch-overage-access').active);Object.assign(f.customerInputs,{inputMethod:'yards',mulchArea:10});
delete f.customerInputs.mulchDepth;
add('mulch-direct-yards-no-overage',f,b=>{p(b).mulchOverageFactor=1;},110000,110000,'Stated10yd material60000; labor40000*1.25=50000; stored1.15 deliberately bypassed.','explicit owner policy');
f=plantingFixture();Object.assign(p(f),{mulchMaterialPerYard:{standard:6000},mulchInstallLaborPerYard:4000});Object.assign(f.customerInputs,{mulchNeeded:true,mulchYards:2,mulchType:'standard'});
f.ownerPricing.knownOfferings=fixtureOfferings(f.serviceType);f.customerInputs=confirmedFixtureInputs(f.customerInputs);
add('planting-retained-overage-unused',f,b=>{p(b).mulchOverageFactor=1;},50000,50000,'Plants30000; stated2yd mulch(6000+4000)=20000; saved1.15 unused.','explicit owner policy');
f=sodFixture();Object.assign(p(f),{topsoilPerCubicYard:3000,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2});f.customerInputs.usableTopsoilDepthInches='unknown';
add('sod-owner-topsoil-allowance',f,b=>{p(b).topsoilTypicalImportDepthInches=1;},214259,223519,'Separate topsoil configuration replaces the legacy prep line; base sod205000. Removal and grading are unpriced/excluded, not silently included. Unknown existing soil uses owner typical import:1000*2/324*3000=18519 vs1in9259.','hypothetical owner allowance; no default soil depth');
f=custom();f.ownerPricing.priceBasisByCategory.labor='cost';f.businessDefaults.markupPercent=30;
add('shared-owner-markup-policy',f,b=>{b.businessDefaults.markupPercent=0;},12500,16250,'Synthetic cost12500*(1+.30)=16250, not margin division. Default30 is owner policy; this is not a new owner rate.','explicit owner policy');
// Scope package coverage example deliberately supplied here, not a manufacturer claim.
f=paint();f.ownerPricing.priceBasisByCategory.material='cost';f.customerInputs.paintProductsConfirmed=true;p(f).scopeDetails={paint_wall:{description:'[SYNTHETIC] finish product',mode:'package_cost',productKey:'synthetic_finish',coverage:300,wastePercent:0}};p(f).scopeRates={paint_wall:5000};
add('paint-package-coverage',f,b=>{p(b).scopeDetails.paint_wall.coverage=400;},45000,50000,'400sf one coat; ceil(400/300)=2 packages at5000 vs ceil(400/400)=1; labor40000. Generic10% measured waste is not added to this explicit package path.','hypothetical supplier coverage; no default coverage');
const pack={preparedAt:new Date().toISOString(),base:'1857b7779b83b70f7753b41b72c3677270cd4ffc',notice:'All amounts/rates and counterfactuals are hypothetical synthetic fixtures. Zero tax/markup/minimum/buffer unless named. Neutral factor is a mathematical reference, not a recommendation. No market, profitability or accuracy inference.',cases};
const serialized=JSON.stringify(pack,null,2)+'\n';fs.writeFileSync(path.join(dir,'expected-cases.json'),serialized);
fs.writeFileSync(path.join(dir,'EXPECTED.md'),'# Expectations written before the engine comparison\n\n'+pack.notice+'\n\nPrepared '+pack.preparedAt+'. Engine comparisons are a separate command; preparation calls no quote calculator. Compare exact line-item cents, not outward display-range rounding. A changed roll width is a supplier-product counterfactual, not a change to the fixed trim rule.\n\n| Case | Service | Baseline cents | Active cents | Delta cents | Independent working |\n|---|---|---:|---:|---:|---|\n'+cases.map(c=>`| ${c.id} | ${c.service} | ${c.expected.baselineCents} | ${c.expected.activeCents} | ${c.expected.deltaCents} | ${c.calculation} |`).join('\n')+'\n');
console.log(JSON.stringify({preparedAt:pack.preparedAt,cases:cases.length,services:new Set(cases.map(c=>c.service)).size,expectedSha256:crypto.createHash('sha256').update(serialized).digest('hex'),engineComparisonsRun:0}));
