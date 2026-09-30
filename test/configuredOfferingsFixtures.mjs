import {fixtureIdentity,fixtureOfferings,confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {PRICE_BASIS_CATEGORIES,withClass2Defaults} from '../server/quote-engine-vnext/index.js';
const map=value=>Object.fromEntries(PRICE_BASIS_CATEGORIES.map(key=>[key,value]));
export const offeringDefaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
export function offeringFixture(type,mode) {
  const fence=type.startsWith('FENCING_'),interior=type==='INTERIOR_PAINTING',installed=mode==='installed';
  const details=fence?{
    description:'[SYNTHETIC] Defined six-foot wood fence',fenceType:'wood',fenceHeight:6,terrainSlope:'flat',
    postFootingDescription:'[SYNTHETIC] Defined standard posts, concrete footings and digging.',
    gates:{walk:{widthLF:4,description:'[SYNTHETIC] Four-foot installed gate and hardware.',postsAndFootingsIncluded:installed}},
    ...(type==='FENCING_REPLACEMENT'?{removalOffered:true,removalDescription:'[SYNTHETIC] Remove the measured old fence and haul it away.',removalIncludesDisposal:true}:{})
  }:{
    description:'[SYNTHETIC] Defined painting offering',substrate:interior?'[SYNTHETIC] Drywall':'[SYNTHETIC] Wood siding',coating:'[SYNTHETIC] Owner-specified coating',
    finishCoats:2,surfaceCondition:'fair',preparation:'[SYNTHETIC] Defined preparation of the measured affected area.',primerCoats:1,
    ...(interior?{wallHeight:'standard',ceilingsOffered:true,trimOffered:true,ceilingCoats:2,ceilingPrimerCoats:1,trimDescription:'[SYNTHETIC] Trim with preparation, one primer and two finish coats.'}:{stories:2})
  };
  const rates=fence?{
    ...(installed?{installedFencePerLF:4000}:{fenceLaborPerLF:1000,fenceMaterialPerLF:2000,postMaterialEach:2000,footingLaborEach:400,footingMaterialEach:600}),
    gate_walk:25000,...(type==='FENCING_REPLACEMENT'?{removalPerLF:800}:{})
  }:installed?{
    installedWallPerSqft:600,...(interior?{installedCeilingPerSqft:300,installedTrimPerLF:200}:{})
  }:{wallLaborPerSqftPerCoat:100,wallMaterialPerSqftPerCoat:30,prepLaborPerSqft:100,prepMaterialPerSqft:20,primerLaborPerSqftPerCoat:50,primerMaterialPerSqftPerCoat:20,...(interior?{ceilingLaborPerSqftPerCoat:80,ceilingMaterialPerSqftPerCoat:25,ceilingPrimerLaborPerSqftPerCoat:40,ceilingPrimerMaterialPerSqftPerCoat:15,installedTrimPerLF:200}:{})};
  const customerInputs=fence?confirmedFixtureInputs({linearFeet:100,lfMethod:'exact',fenceType:'wood',fenceHeight:6,terrainSlope:'flat',gates:{walk:2},...(!installed?{postCount:14}:{}),...(type==='FENCING_REPLACEMENT'?{oldFenceRemoval:true,removalLengthLF:50}:{})}):{
    areaInputMethod:'wall_sqft',[interior?'wallAreaSqft':'exteriorAreaSqft']:500,coats:2,surfaceCondition:'fair',
    ...(!installed?{prepAreaSqft:120}:{}),...(interior?{wallHeight:'standard',wallScopeUniform:true,ceilingsIncluded:true,ceilingAreaSqft:200,trimIncluded:true,trimLengthLF:100}:{stories:2})
  };
  const priceBasis=map('cost');priceBasis.addon='sell_price';if(!fence)priceBasis.material='sell_price';
  return {serviceType:type,customerInputs,ownerPricing:{...fixtureIdentity('MANUAL',undefined,type),serviceType:type,service:type,active:true,knownOfferings:fixtureOfferings(type),pricing:withClass2Defaults(type,{minimumJob:0,offeringMode:mode,offeringDetails:details,offeringRates:rates}),priceBasisByCategory:priceBasis,taxabilityByCategory:map(false),feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},peakMonths:[],peakSurchargePercent:0},businessDefaults:structuredClone(offeringDefaults),callerType:'owner',currentMonth:1};
}
