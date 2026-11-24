// Fixtures for audit f1501ff repros, shared by the item tests and the
// consistency harness (test/invariants/harness.mjs).
import {flooring,concrete} from '../../verification/engine-independent/fixtures.mjs';
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
