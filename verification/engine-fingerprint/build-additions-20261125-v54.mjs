import {writeFileSync} from 'node:fs';
import {mowing} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {baseServices} from '../../test/invariants/harness.mjs';

// November 25, 2026 (v54): new-issues audit of v53 — quote results that
// changed. Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v54-20261125:'+id,input:structuredClone(input)});
const flat=(inputs,pricing={})=>{const f=mowing(),p=f.ownerPricing.pricing;
  Object.assign(p,{mowingBaseRatePerSqft:0,mowingVisitCharge:5000,mowingFlatVisitMaxSqft:20000,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1.1,monthly:1.5,one_time:1.5},overgrowthMultipliers:{maintained:1,overgrown:1.5,severe:2}},pricing);
  Object.assign(f.customerInputs,{yardSqft:5000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false},inputs);return f;};
add('mowing-flat-one-time-severe',flat({serviceFrequency:'one_time',grassCondition:'severe'}));
add('mowing-flat-no-riding-mower',flat({ridingMowerReachesLawn:false},{noRidingMowerLaborMultiplier:1.5}));
add('mowing-flat-over-size-limit',flat({yardSqft:20001}));
add('mowing-flat-at-size-limit',flat({yardSqft:20000}));
const CHAIN_ID='5f0c9a43-2b7d-4e1a-8c3f-6a2d9e4b7c10';
const chain=spacing=>{const f=offeringFixture('FENCING_INSTALL','itemized'),p=f.ownerPricing.pricing;p.postSpacingLF=spacing;p.offeringDetails={...p.offeringDetails,fenceType:'chain_link'};
  f.customerInputs.fenceType='chain_link';f.ownerPricing.knownOfferings={...f.ownerPricing.knownOfferings,fenceType:{chain_link:CHAIN_ID}};
  f.customerInputs.confirmedFacts.fenceType={...f.customerInputs.confirmedFacts.fenceType,value:'chain_link',offeringId:CHAIN_ID};return f;};
add('fence-chain-link-spacing-10',chain(10));
add('fence-chain-link-spacing-10.5',chain(10.5));
{const f=offeringFixture('FENCING_INSTALL','itemized');f.ownerPricing.pricing.postSpacingLF=2;add('fence-post-spacing-2',f);}
for(const layers of [0,1]){const f=structuredClone(baseServices().find(b=>b.id==='roof-steep-7-9').f);Object.assign(f.ownerPricing.pricing,{pitchInstallationAdderOverTwelve:0.5});
  Object.assign(f.customerInputs,{pitchBand:'over_twelve',existingLayers:layers});add('roof-over-twelve-removal-addition-blank-'+layers+'-layers',f);}
writeFileSync(new URL('./corpus-additions-20261125-v54.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
