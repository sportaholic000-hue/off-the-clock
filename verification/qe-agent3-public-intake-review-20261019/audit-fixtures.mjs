import {SERVICE_TYPES} from '../../server/quote-engine-vnext/contracts.js';
import {explanationCases} from '../../test/customerExplanationFixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

export const expectedCents={
  ROOFING_REPLACEMENT:244600,
  ROOFING_REPAIR:58600,
  FLAT_ROOF_REPLACEMENT:1805000,
  FLAT_ROOF_REPAIR:36000,
  INTERIOR_PAINTING:300000,
  EXTERIOR_PAINTING:318000,
  FLOORING_INSTALL:260670,
  FLOORING_REPLACEMENT:311280,
  FENCING_INSTALL:450000,
  FENCING_REPLACEMENT:490000,
  SIDING_REPLACEMENT:1170000,
  SIDING_REPAIR:54000,
  CONCRETE_DRIVEWAY:892222,
  CONCRETE_PATIO_SLAB:353889,
  LANDSCAPING_CLEANUP:40000,
  LANDSCAPING_MULCH:32275,
  LANDSCAPING_SOD:253750,
  LANDSCAPING_PLANTING:28500,
  LANDSCAPING_MOWING:16000,
  CUSTOM:12500
};

export function auditFixtures(){
  const rows=new Map();
  for(const row of explanationCases())if(!rows.has(row.input.serviceType))rows.set(row.input.serviceType,row.input);
  rows.set('INTERIOR_PAINTING',offeringFixture('INTERIOR_PAINTING','installed'));
  rows.get('ROOFING_REPLACEMENT').ownerPricing.pricing.unknownPitchBand='up_to_six';
  Object.assign(rows.get('ROOFING_REPLACEMENT').customerInputs,{pitchMethod:'whole_roof',pitchBand:'up_to_six'});
  delete rows.get('ROOFING_REPLACEMENT').customerInputs.pitch;
  for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR'])rows.get(type).ownerPricing.pricing.largeRepairMaxSqft=1_000_000;
  const interior=rows.get('INTERIOR_PAINTING');
  interior.ownerPricing.pricing.offeringDetails.ceilingsOffered=false;
  interior.ownerPricing.pricing.offeringDetails.trimOffered=false;
  Object.assign(interior.customerInputs,{ceilingsIncluded:false,trimIncluded:false});
  delete interior.customerInputs.ceilingAreaSqft;delete interior.customerInputs.trimLengthLF;
  rows.get('CUSTOM').customerInputs.service='[SYNTHETIC PUBLIC INTAKE] CUSTOM';
  rows.get('CUSTOM').ownerPricing.service='[SYNTHETIC PUBLIC INTAKE] CUSTOM';
  if(rows.size!==SERVICE_TYPES.length||SERVICE_TYPES.some(type=>!rows.has(type)))throw Error('Fixture matrix does not cover the registered service set.');
  return new Map(SERVICE_TYPES.map(type=>[type,structuredClone(rows.get(type))]));
}

const copy=value=>structuredClone(value);
export const correctionCases={
  ROOFING_REPLACEMENT:{kind:'stale_then_valid',mutate:c=>({...c,roofSizeInput:1000.5}),expectedCents:244698,quantity:{field:'roofSizeInput',value:1000.5,unit:'square feet'}},
  ROOFING_REPAIR:{kind:'stale_then_valid',mutate:c=>({...c,affectedArea:100.5}),expectedCents:58600,quantity:{field:'affectedArea',value:100.5,unit:'square feet'}},
  FLAT_ROOF_REPLACEMENT:{kind:'invalid',mutate:c=>({...c,serviceScope:'partial',partialAreaSqft:0})},
  FLAT_ROOF_REPAIR:{kind:'stale_then_valid',mutate:c=>({...c,pondingWater:true}),expectedCents:36000,scopeText:/ponding/i},
  INTERIOR_PAINTING:{kind:'invalid',mutate:c=>({...c,ceilingsIncluded:false,ceilingAreaSqft:200})},
  EXTERIOR_PAINTING:{kind:'stale_then_valid',mutate:c=>({...c,exteriorAreaSqft:500.5}),expectedCents:318318,quantity:{field:'exteriorAreaSqft',value:500.5,unit:'square feet'}},
  FLOORING_INSTALL:{kind:'invalid',mutate:c=>({...c,removalNeeded:false,removalAreaSqft:25})},
  FLOORING_REPLACEMENT:{kind:'invalid_then_valid',mutate:c=>({...c,subfloorIssues:false,subfloorRepairAreaSqft:30}),correct:c=>{const n={...c,subfloorIssues:false};delete n.subfloorRepairAreaSqft;return n;},expectedCents:305280},
  FENCING_INSTALL:{kind:'invalid',mutate:c=>({...c,fenceHeight:5.304166666666667})},
  FENCING_REPLACEMENT:{kind:'invalid_then_valid',mutate:c=>({...c,oldFenceRemoval:false,removalLengthLF:50}),correct:c=>{const n={...c,oldFenceRemoval:false};delete n.removalLengthLF;return n;},expectedCents:450000},
  SIDING_REPLACEMENT:{kind:'invalid',mutate:c=>({...c,trimIncluded:false,trimLengthLF:20})},
  SIDING_REPAIR:{kind:'stale_then_valid',mutate:c=>({...c,affectedArea:50.25}),expectedCents:54000,quantity:{field:'affectedArea',value:50.25,unit:'square feet'}},
  CONCRETE_DRIVEWAY:{kind:'invalid',mutate:c=>({...c,dimensionMethod:'measured_outline',outlinePoints:[{x:0,y:0},{x:50,y:0},{x:50,y:10},{x:0,y:10}],length:50,width:10})},
  CONCRETE_PATIO_SLAB:{kind:'invalid',mutate:c=>{const n={...c,dimensionMethod:'measured_area_perimeter',areaSqft:200,perimeterLF:10};delete n.length;delete n.width;return n;}},
  LANDSCAPING_CLEANUP:{kind:'stale_then_valid',mutate:c=>({...c,haulAway:false}),expectedCents:35000},
  LANDSCAPING_MULCH:{kind:'invalid_then_valid',mutate:c=>({...c,inputMethod:'yards',mulchArea:2.75,mulchDepth:3}),correct:c=>{const n={...c,inputMethod:'yards',mulchArea:2.75};delete n.mulchDepth;return n;},expectedCents:32400,quantity:{field:'mulchArea',value:2.75,unit:'cubic yards'}},
  LANDSCAPING_SOD:{kind:'invalid_then_valid',mutate:c=>({...c,groundPrepNeeded:false,usableTopsoilDepthInches:0}),correct:c=>{const n={...c,groundPrepNeeded:false};delete n.usableTopsoilDepthInches;return n;},expectedCents:203750},
  LANDSCAPING_PLANTING:{kind:'invalid_then_valid',mutate:c=>({...c,mulchNeeded:false,mulchYards:2,mulchType:'brown'}),correct:c=>{const n={...c,mulchNeeded:false};delete n.mulchYards;delete n.mulchType;delete n.confirmedFacts?.mulchType;return n;},expectedCents:12500},
  LANDSCAPING_MOWING:{kind:'stale_then_valid',mutate:c=>({...c,serviceFrequency:'one_time'}),expectedCents:24800},
  CUSTOM:{kind:'invalid',mutate:c=>({...c,hours:2})}
};

export function correctedInputs(type,base){
  const row=correctionCases[type];
  if(!row)return null;
  const mutated=row.mutate(copy(base));
  return {mutated,corrected:row.correct?row.correct(copy(base)):mutated};
}
