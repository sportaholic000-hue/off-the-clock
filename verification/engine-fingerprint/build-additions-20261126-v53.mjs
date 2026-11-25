import {writeFileSync} from 'node:fs';
import {mowing} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {baseServices} from '../../test/invariants/harness.mjs';

// November 26, 2026 (v53): owner ruling and the second and third audits of
// v51 — quote results that changed. Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v53-20261126:'+id,input:structuredClone(input)});
const mow=(rate,visit)=>{const f=mowing(),p=f.ownerPricing.pricing;Object.assign(p,{mowingBaseRatePerSqft:rate,baggingSurchargePercent:20,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1},mowingVisitCharge:visit});
  Object.assign(f.customerInputs,{yardSqft:5000,sqftMethod:'exact',grassCondition:'maintained',bagClippings:true,edgingIncluded:false});return f;};
add('mowing-bagging-on-visit-charge',mow(0.2,4500));
add('mowing-flat-per-visit',mow(0,5000));
{const f=offeringFixture('FENCING_INSTALL','installed');f.customerInputs.fenceHeight=1_000_001;add('fence-height-1000001-unpriced',f);}
{const f=offeringFixture('FENCING_INSTALL','itemized');f.ownerPricing.pricing.postSpacingLF=100;add('fence-post-spacing-100',f);}
{const f=structuredClone(baseServices().find(b=>b.id==='roof-steep-7-9').f);f.customerInputs.pitchBand='constructor';add('roof-pitch-band-malformed',f);}
writeFileSync(new URL('./corpus-additions-20261126-v53.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
