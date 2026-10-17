import {landscapeFixture} from './landscapeLaneB20261016Fixture.mjs';

export function concreteFixture(length=10,width=10){return landscapeFixture('CONCRETE_PATIO_SLAB',{
  laborPerSqft:600,concreteCostPerCubicYard:18000,formworkPerLF:2500,minimumJob:0,
  basePrepPerSqft:175,readyMixOrderIncrementCubicYards:0.5
},{dimensionMethod:'exact',length,width,thickness:4,finishType:'broom',demolitionNeeded:false,
  reinforcement:'none',accessDifficulty:'easy',baseNeeded:false,adjoinsExistingConcrete:false});}
export function sodFixture(){return landscapeFixture('LANDSCAPING_SOD',{
  sodMaterialPerSqft:100,sodInstallLaborPerSqft:100,minimumServiceCharge:0,groundPrepPerSqft:150
},{sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:true,slope:'flat',accessDifficulty:'easy'});}
export function plantingFixture(){return landscapeFixture('LANDSCAPING_PLANTING',{
  plantingLaborPerPlant:{small:4500,medium:9000,large:25000},
  plantMaterialAllowance:{small:3000,medium:7000,large:18000},minimumServiceCharge:0
},{plantsBySize:{small:4,medium:0,large:0},bedCondition:'clean',mulchNeeded:false,accessDifficulty:'easy'});}
export function customPlantFixture(){
  const f=plantingFixture();Object.assign(f.ownerPricing.pricing,{
    plantSizes:{shrub_5:{name:'#5 shrub, container',plantType:'shrub',stockType:'container',containerNumber:5},tree_2:{name:'2 in. caliper tree, balled and burlapped',plantType:'tree',stockType:'balled_and_burlapped',caliperInches:2}},
    plantingLaborPerPlant:{shrub_5:4500,tree_2:25000},plantMaterialAllowance:{shrub_5:3000,tree_2:18000}
  });f.customerInputs.plantsBySize={shrub_5:4};return f;
}
export function legacyCases(){
  const rows=[];
  for(const serviceType of ['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY'])for(const baseNeeded of [false,true])for(const thickness of [4,8,24])for(const accessDifficulty of ['easy','difficult']){
    const f=concreteFixture(20,30);f.serviceType=serviceType;f.ownerPricing.serviceType=serviceType;f.ownerPricing.origin.serviceType=serviceType;
    Object.assign(f.customerInputs,{baseNeeded,thickness,accessDifficulty});rows.push(f);
  }
  for(const groundPrepNeeded of [false,true])for(const slope of ['flat','moderate','steep'])for(const accessDifficulty of ['easy','difficult']){const f=sodFixture();Object.assign(f.customerInputs,{groundPrepNeeded,slope,accessDifficulty});rows.push(f);}
  for(const size of ['small','medium','large'])for(const accessDifficulty of ['easy','difficult']){const f=plantingFixture();f.customerInputs.plantsBySize={small:0,medium:0,large:0,[size]:4};f.customerInputs.accessDifficulty=accessDifficulty;rows.push(f);}
  return rows;
}
