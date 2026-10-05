import {flooring,siding,concrete,flatRoof,fixture} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
export function configuredScope(input,key,details,rates,customer={}){
 const p=input.ownerPricing.pricing;p.scopeDetails={...(p.scopeDetails||{}),[key]:{description:'[SYNTHETIC] Explicitly defined '+key,...details}};
 p.scopeRates={...(p.scopeRates||{}),...rates};Object.assign(input.customerInputs,customer);return input;
}
const purchase=(productKey,coverage)=>({mode:'package_cost',productKey,coverage,wastePercent:10});
export function measuredScopeCases(){
 const out=[],add=(id,input,cents,arithmetic)=>out.push({id,input,expected:{ready:true,cents},arithmetic});
 for(const [type,base]of [['hardwood',176000],['laminate',174000],['carpet',176000]]){
  const key='floor_underlayment_'+type;
  add('floor-'+type+'-installed',configuredScope(flooring(type),key,{mode:'installed_area_sell_price'},{[key]:100},{underlaymentScopeConfirmed:true}),base+20000,'Base labor 200*300*1.1; material 200*500*(1+product waste). Add 200*100 installed underlayment.');
  add('floor-'+type+'-packages',configuredScope(flooring(type),key,purchase(type,100),{[key]:10000},{underlaymentScopeConfirmed:true}),base+30000,'Underlayment ceil(200*1.1/100)=3 packages *10000.');
 }
 let f=flooring('vinyl_plank');Object.assign(f.ownerPricing.pricing,{vinylPlankUnderlaymentRule:'always_included',underlaymentPriceBasis:'cost'});
 add('floor-vinyl-packages',configuredScope(f,'floor_underlayment_vinyl_plank',purchase('vinyl',100),{floor_underlayment_vinyl_plank:10000},{underlaymentScopeConfirmed:true}),204000,'174000 flooring +3*10000 underlayment.');
 for(const mode of ['installed','itemized']){
  f=configuredScope(flooring(),'stairs',{mode,...(mode==='installed'?{category:'labor'}:{}),flooringType:'tile',maximumWidthLF:4,underlaymentIncluded:true,removalIncluded:true,disposalIncluded:true},mode==='installed'?{stairs_installed:15000}:{stairs_labor:6000,stairs_material:7000,stairs_underlayment:1000,stairs_removal:2000,stairs_disposal:500},{stairSteps:5,stairWidthLF:3,stairRemovalNeeded:true,stairDisposalNeeded:true,floorAreaExcludesStairs:true,stairScopeConfirmed:true});
  add('stairs-'+mode,f,mode==='installed'?253000:260500,'178000 floor +5*(installed15000 or itemized16500).');
  f=configuredScope(flooring(),'floor_overlay',{mode,...(mode==='installed'?{category:'prep'}:{}),existingFloorType:'vinyl_plank',newFlooringType:'tile',basePriceExcludesPreparation:true},mode==='installed'?{floor_overlay_installed:200}:{floor_overlay_prep:100,floor_overlay_material:50},{existingFloorType:'vinyl_plank',overlayScopeConfirmed:true});
  f.customerInputs=confirmedFixtureInputs(f.customerInputs);
  add('overlay-'+mode,f,mode==='installed'?218000:208000,'178000 flooring +200*(installed200 or prep100+material50).');
  add('siding-trim-'+mode,configuredScope(siding(),'siding_trim',{mode,basePriceExcludesTrim:true,...(mode==='installed'?{category:'labor'}:{})},mode==='installed'?{siding_trim_installed:250}:{siding_trim_labor:100,siding_trim_material:150},{trimIncluded:true,trimLengthLF:200,sidingTrimScopeConfirmed:true}),1220000,'1170000 siding +200 LF *250.');
  add('siding-removal-'+mode,configuredScope(siding(),'siding_removal',{mode,...(mode==='installed'?{category:'removal'}:{}),existingSidingType:'[SYNTHETIC] Old vinyl',stories:1,disposalIncluded:true},mode==='installed'?{siding_removal_installed:300}:{siding_removal_removal:100,siding_removal_disposal:50},{oldSidingRemoval:true,existingSidingType:'[SYNTHETIC] Old vinyl',sidingRemovalAreaSqft:500,sidingRemovalStories:1,sidingRemovalScopeConfirmed:true}),mode==='installed'?1320000:1245000,'1170000 new siding +500 measured old area *(installed300 or removal100+disposal50).');
  add('demolition-'+mode,configuredScope(concrete(),'demolition',{mode,...(mode==='installed'?{category:'removal'}:{}),maximumThickness:6,reinforcement:'rebar',accessDifficulty:'difficult',disposalIncluded:true},mode==='installed'?{demolition_installed:500}:{demolition_removal:300,demolition_disposal:100},{demolitionNeeded:true,demolitionAreaSqft:200,demolitionThickness:5,demolitionReinforcement:'rebar',demolitionAccessDifficulty:'difficult',demolitionScopeConfirmed:true}),mode==='installed'?453889:433889,'353889 new slab +200*(installed500 or removal300+disposal100). Existing slab facts differ from new slab facts.');
  add('exposed-'+mode,configuredScope(concrete(),'exposed_aggregate',{mode,...(mode==='installed'?{category:'labor'}:{}),basePriceExcludesFinish:true},mode==='installed'?{exposed_aggregate_installed:350}:{exposed_aggregate_labor:150,exposed_aggregate_material:200},{finishType:'exposed_aggregate',exposedAggregateScopeConfirmed:true}),423889,'353889 base slab +200*350 finishing. No old finish multiplier in addition.');
  add('commercial-'+mode,configuredScope(flatRoof(),'insulation',{mode,...(mode==='installed'?{category:'material'}:{}),insulationSystem:'[SYNTHETIC] Defined insulation thickness',coverboardSystem:'[SYNTHETIC] Defined coverboard thickness',baseRoofLaborExcludesInstallation:true},mode==='installed'?{insulation_installed:200,coverboard_installed:100}:{insulation_labor:50,insulation_material:150,coverboard_labor:25,coverboard_material:75},{buildingType:'commercial',insulationNeeded:true,coverboardNeeded:true,insulationAreaSqft:800,coverboardAreaSqft:600,insulationScopeConfirmed:true}),1690000,'1470000 roof +800*200 insulation +600*100 coverboard.');
 }
 f=offeringFixture('INTERIOR_PAINTING','itemized');f.ownerPricing.priceBasisByCategory.material='cost';
 for(const [key,group,coverage,rate]of [['paint_wall','finish',400,5000],['paint_ceiling','finish',400,5000],['paint_primer','primer',400,4000],['paint_ceiling_primer','primer',400,4000],['paint_prep','prep',100,2000]])configuredScope(f,key,purchase(group,coverage),{[key]:rate},{paintProductsConfirmed:true});
 add('paint-cost-packages',f,299000,'255000 labor +20000 installed trim +ceil(1400*1.1/400)*5000 +ceil(700*1.1/400)*4000 +ceil(700*1.1/100)*2000 =299000.');
 f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:50000},materialCostPerSquare:{asphalt_shingle:30000},tearOffPerSquare:{asphalt_shingle:10000},underlaymentPriceBasis:{asphalt_shingle:'cost'},minimumJob:0,accessoryPricingMode:'per_square_allin'},
 {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
 add('roof-underlayment-packages',configuredScope(f,'roof_underlayment_asphalt_shingle',purchase('roof_roll',500),{roof_underlayment_asphalt_shingle:15000},{roofUnderlaymentScopeConfirmed:true}),1935000,'20*50000 labor +22*30000 field material +20*10000 removal +ceil(2000*1.1/500)*15000 underlayment.');
 return out;
}
