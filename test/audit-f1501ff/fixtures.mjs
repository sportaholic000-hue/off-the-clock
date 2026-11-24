// Fixtures for audit f1501ff repros, shared by the item tests and the
// consistency harness (test/invariants/harness.mjs).
import {slopeRoof} from './roofFixture.mjs';
import {flooring,concrete,fixture} from '../../verification/engine-independent/fixtures.mjs';
import {configuredScope} from '../measuredScopeFixtures.mjs';
import {confirmedFixtureInputs} from '../quoteEngineVNextFixtures.mjs';

// #5c: floating vinyl plank kept over existing tile, installed overlay price.
export function floatingOverlay(){
  let f=flooring('vinyl_plank');Object.assign(f.ownerPricing.pricing,{vinylPlankInstallInstructions:'[SYNTHETIC] Plank Y',vinylPlankInstallMethod:'floating'});
  f=configuredScope(f,'floor_overlay',{mode:'installed',category:'prep',existingFloorType:'tile',newFlooringType:'vinyl_plank',basePriceExcludesPreparation:true},{floor_overlay_installed:200},{existingFloorType:'tile',overlayScopeConfirmed:true,removalNeeded:false,existingFloorSound:'yes'});
  delete f.customerInputs.floorConstructionKnown;delete f.customerInputs.floorSupportConstruction;f.customerInputs=confirmedFixtureInputs(f.customerInputs);
  return f;
}

// #5b: concrete patio with the base always included (customers not asked)
// and no labor share for the combined base preparation price.
export function concreteBaseIncluded(){
  const f=concrete();f.ownerPricing.pricing.newSlabBase='included';delete f.customerInputs.baseNeeded;
  return f;
}

// #3: itemized roof accessories; the base material wording says the base
// excludes starter, drip edge, ridge cap, flashing and vents. Starter 200 LF
// x 2.00, drip edge 200 LF x 3.00, ridge cap 40 LF x 5.00 (slopeRoof base).
export function roofExcludingFlashingVents(wording='excludes_itemized_accessories_flashing_vents'){
  return slopeRoof({starterLengthLF:200,dripEdgeLengthLF:200,ridgeCapLengthLF:40},{accessoryPricingMode:'itemized',materialAccessoryBasis:wording,starterPerLF:200,dripEdgePerLF:300,ridgeCapPerLF:500});
}

// #12: roof repair priced by area: first 50 sq ft $300.00 minimum, then
// $5.00 per extra sq ft (labor 60% / materials 40%). 60 sq ft job.
export function roofRepairByArea(unitCents=500){
  const f=fixture('ROOFING_REPAIR',{repairMinimum:0,largeRepairMaxSqft:1_000_000},{repairType:'shingle_patch',affectedArea:60,roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false});
  Object.assign(f.ownerPricing.pricing,{repairPricingUnit:{asphalt_shingle:{shingle_patch:'square_feet'}},repairUnitPrice:{asphalt_shingle:{shingle_patch:unitCents}},repairAreaMinimum:{asphalt_shingle:{shingle_patch:30000}},repairFirstAreaSqft:{asphalt_shingle:{shingle_patch:50}},
    installedLaborPercent:{'repairAreaMinimum.asphalt_shingle.shingle_patch':60,'repairUnitPrice.asphalt_shingle.shingle_patch':60},installedMaterialsPercent:{'repairAreaMinimum.asphalt_shingle.shingle_patch':40,'repairUnitPrice.asphalt_shingle.shingle_patch':40}});
  return f;
}
export const zeroPolicy=(f,includedPrices)=>({serviceId:f.ownerPricing.id,ownerId:f.ownerPricing.origin.ownerId,operationId:'SYNTHETIC-policy',approvedAt:'2026-11-24T12:00:00.000Z',freeCompleteService:false,freeTiers:[],includedPrices});
