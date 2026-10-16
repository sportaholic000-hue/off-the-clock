import {randomUUID} from 'node:crypto';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {fenceOfferingFromLegacy} from '../server/quote-engine-vnext/fencePricing.js';

export function fenceFixture(mode='itemized'){
  const f=offeringFixture('FENCING_INSTALL',mode),p=f.ownerPricing.pricing;
  const offer=fenceOfferingFromLegacy(p);
  const rates=offer.heightRows.saved_height.offeringRates;
  const shares=offer.heightRows.saved_height;
  offer.heightRows={
    six:{minimumHeight:4,maximumHeight:6,postSpacingLF:8,offeringRates:{...rates},installedLaborPercent:{...shares.installedLaborPercent},installedMaterialsPercent:{...shares.installedMaterialsPercent}},
    eight:{minimumHeight:6,maximumHeight:8,postSpacingLF:4,offeringRates:{...rates,...(mode==='installed'?{installedFencePerLF:6000}:{}),gate_walk:40000},installedLaborPercent:{...shares.installedLaborPercent},installedMaterialsPercent:{...shares.installedMaterialsPercent}},
  };
  const {offeringMode,offeringDetails,offeringRates,...common}=p;
  f.ownerPricing.pricing={...common,fenceOfferings:{wood:offer}};
  f.ownerPricing.tiers=[];f.customerInputs.fenceRunCount=1;f.customerInputs.gates={};
  return f;
}
export function fourTypes(){
  const f=fenceFixture('installed'),p=f.ownerPricing.pricing,wood=p.fenceOfferings.wood;
  p.fenceOfferings={};f.ownerPricing.knownOfferings.fenceType={};
  for(const [i,type] of ['wood','vinyl','chain_link','aluminum'].entries()){
    const offer=structuredClone(wood);offer.offeringDetails.fenceType=type;
    offer.heightRows.six.offeringRates.installedFencePerLF=(i+1)*1000;
    offer.tiers=['Good','Better','Best'].map((name,n)=>({name,overrides:{heightRows:{six:{offeringRates:{installedFencePerLF:(i+1)*1000+n*100}}}}}));
    p.fenceOfferings[type]=offer;f.ownerPricing.knownOfferings.fenceType[type]=randomUUID();
  }
  f.customerInputs.fenceType='aluminum';f.customerInputs.confirmedFacts.fenceType={status:'identified',field:'fenceType',value:'aluminum',offeringId:f.ownerPricing.knownOfferings.fenceType.aluminum};
  return f;
}
