import {writeFileSync} from 'node:fs';
import {mowing} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

// November 26, 2026 (v52): repairs from Neon's audit of v51 that change a
// quote result (V51-2 asks for the ZIP+4; V51-4 an installed option reaches
// the customer). Run once; never edited.
const cases=[];
const add=(id,input)=>cases.push({id:'v52-20261126:'+id,input:structuredClone(input)});
{const f=mowing();add('wa-zip4-zones-bare-zip-review-setting',{...f,businessDefaults:{...f.businessDefaults,businessCountry:'US',currency:'USD',taxMode:'TAX_ALL',taxPercent:6.5,taxByJobLocation:true,
  taxZones:[{name:'[SYNTHETIC] Bellevue A',codes:['98004-1234','98004-5678'],percent:10.1},{name:'[SYNTHETIC] Bellevue B',codes:['98004-9012'],percent:9.8}]},customerInputs:{...f.customerInputs,postalCode:'98004'}});}
{const f=offeringFixture('INTERIOR_PAINTING','itemized'),inst=offeringFixture('INTERIOR_PAINTING','installed');
 f.ownerPricing.tiers=[{name:'Itemized',overrides:{}},{name:'Turnkey Installed',overrides:{offeringMode:'installed',offeringRates:inst.ownerPricing.pricing.offeringRates,offeringDetails:inst.ownerPricing.pricing.offeringDetails}}];
 f.customerInputs.coats=1;add('interior-itemized-with-installed-option-customer',{...f,callerType:'customer'});}
writeFileSync(new URL('./corpus-additions-20261126-v52.json',import.meta.url),JSON.stringify(cases,null,1)+'\n');
console.log(cases.length+' inputs');
