import {writeFileSync} from 'node:fs';
import {flatRepair,mowing} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

// November 26, 2026 (v56): verdicts on the deployment and v54 audits — quote
// results that changed. Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v56-20261126:'+id,input:structuredClone(input)});
const unit=(u,price,qty)=>{const f=flatRepair(),p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;
  p.repairPricingUnit={[m]:{[r]:u}};p.repairUnitPrice={[m]:{[r]:price}};p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:60};
  delete c.affectedArea;if(u==='linear_feet')c.repairLengthLF=qty;else c.repairItemCount=qty;delete p.largeRepairMaxSqft;return f;};
add('flat-repair-per-foot-no-area-limit',unit('linear_feet',900,100));
add('flat-repair-per-item-no-area-limit',unit('each',35000,2));
const CHAIN_ID='5f0c9a43-2b7d-4e1a-8c3f-6a2d9e4b7c10';
const named=(name,spacing)=>{const f=offeringFixture('FENCING_INSTALL','itemized'),p=f.ownerPricing.pricing;p.postSpacingLF=spacing;p.offeringDetails={...p.offeringDetails,fenceType:name};
  f.customerInputs.fenceType=name;f.ownerPricing.knownOfferings={...f.ownerPricing.knownOfferings,fenceType:{[name]:CHAIN_ID}};
  f.customerInputs.confirmedFacts.fenceType={...f.customerInputs.confirmedFacts.fenceType,value:name,offeringId:CHAIN_ID};return f;};
add('fence-cyclone-spacing-12',named('cyclone',12));
add('fence-cyclone-spacing-10',named('cyclone',10));
{const f=mowing();Object.assign(f.ownerPricing.pricing,{mowingBaseRatePerSqft:0,mowingVisitCharge:5000,mowingFlatVisitMaxSqft:0.5});add('mowing-flat-cap-below-one',f);}
writeFileSync(new URL('./corpus-additions-20261126-v56.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
