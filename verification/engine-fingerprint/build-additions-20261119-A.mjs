// One-time build of corpus-additions-20261119-A.json (Lane A fixes of the
// November 19 owner round): inputs no frozen input exercised for the
// per-service tax rate (A1), the foreign-job check under both job-location
// settings (A2), ZIP+4 tax zones (A3) and the renamed building-age answer keys
// (A9, with the earlier keys alongside). Each input is built from a fixture an
// existing test already checks. Results are recorded as the engine computes
// them; the ones worked by hand are in test/qeLaunchA_20261119.spec.mjs. Run
// once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261119-A.mjs [out.json]
import {writeFileSync} from 'node:fs';
import {mowing,flooring,withLaneDAnswers} from '../engine-independent/fixtures.mjs';
import {corpusInputs} from './fingerprint.mjs';

const rows=[];const add=(id,input)=>rows.push({id:'laneA-20261119:'+id,input:structuredClone(input)});
// Built after the merge with the other November 19 lanes: frozen inputs answer
// the new tile and carpet questions (Lane D, withLaneDAnswers) and trim coats
// (Lane E, one coat, which their values assume); the shared flooring fixture
// already answers tile on a concrete slab.
const answered=input=>{const f=withLaneDAnswers(input),c=f.customerInputs||{};if(f.serviceType==='INTERIOR_PAINTING'&&c.trimIncluded===true&&c.trimCoats===undefined)c.trimCoats=1;return f;};
const corpus=id=>answered(corpusInputs().find(r=>r.id===id).input);
const taxed=(f,defaults,service={},customer={})=>{Object.assign(f.businessDefaults,defaults);Object.assign(f.ownerPricing,service);for(const [k,v] of Object.entries(customer)){if(v===undefined)delete f.customerInputs[k];else f.customerInputs[k]=v;}return f;};
const SK={taxMode:'TAX_ALL',taxPercent:11,businessCountry:'CA',businessProvince:'SK',currency:'CAD'};
const ON={taxMode:'TAX_ALL',taxPercent:13,businessCountry:'CA',businessProvince:'ON',currency:'CAD'};
const US={taxMode:'TAX_ALL',taxPercent:6,businessCountry:'US',currency:'USD'};
const ZONES=[{name:'[SYNTHETIC] Split ZIP east',codes:['98101-1234'],percent:10.25},{name:'[SYNTHETIC] Downtown',codes:['98101'],percent:9.5},{name:'[SYNTHETIC] Region',codes:['981'],percent:8}];

// --- A1: the service's own tax rate.
add('sk-mow-business-rate',taxed(mowing(),SK));
add('sk-mow-service-rate-5',taxed(mowing(),SK,{taxPercent:5}));
add('sk-mow-service-rate-5-sk-postal',taxed(mowing(),SK,{taxPercent:5},{postalCode:'S4P 3Y2'}));
add('sk-mow-service-rate-5-ontario-postal',taxed(mowing(),SK,{taxPercent:5},{postalCode:'K1A 0B1'}));
add('sk-mow-location-on-no-sk-rate-service-rate-5',taxed(mowing(),{...SK,taxByJobLocation:true},{taxPercent:5},{postalCode:'S4P 3Y2'}));
add('sk-mow-location-on-sk-rate-11-service-rate-5',taxed(mowing(),{...SK,taxByJobLocation:true,provinceTaxPercent:{SK:11}},{taxPercent:5},{postalCode:'S4P 3Y2'}));
add('sk-mow-location-on-service-rate-5-nova-scotia-postal',taxed(mowing(),{...SK,taxByJobLocation:true},{taxPercent:5},{postalCode:'B3H 1A1'}));
add('on-mow-service-rate-0',taxed(mowing(),ON,{taxPercent:0}));
{const f=taxed(mowing(),ON,{taxPercent:5});f.ownerPricing.pricing.minimumServiceCharge=15000;add('on-mow-service-rate-5-minimum',f);}
add('us-floor-service-rate-zone-match-keeps-zone',taxed(flooring(),{...US,taxByJobLocation:true,taxZones:ZONES},{taxPercent:4},{postalCode:'98101'}));
add('us-floor-service-rate-outside-zones-business-rate',taxed(flooring(),{...US,taxByJobLocation:true,taxZones:ZONES,taxOutsideZones:'business_rate'},{taxPercent:4},{postalCode:'10001'}));
add('us-floor-service-rate-location-off',taxed(flooring(),US,{taxPercent:4}));

// --- A2: a postal or ZIP code in the other country, under both settings.
add('on-mow-us-zip-location-off',taxed(mowing(),ON,{},{postalCode:'10001'}));
add('on-mow-us-zip-location-on',taxed(mowing(),{...ON,taxByJobLocation:true},{},{postalCode:'10001'}));
add('us-floor-canadian-postal-location-off',taxed(flooring(),US,{},{postalCode:'K1A 0B1'}));
{const f=taxed(mowing(),ON,{},{postalCode:'10001'});f.ownerPricing.pricing.minimumServiceCharge=15000;f.businessDefaults.rangeBufferPercent=10;add('on-mow-us-zip-minimum-range',f);}
{const f=taxed(flooring(),{...ON,taxMode:'TAX_MATERIALS'},{},{postalCode:'10001'});add('on-floor-materials-tax-us-zip',f);}
add('on-mow-us-zip-tax-none',taxed(mowing(),{...ON,taxMode:'TAX_NONE',taxPercent:0},{},{postalCode:'10001'}));
add('no-country-mow-us-zip-location-off',taxed(mowing(),{taxMode:'TAX_ALL',taxPercent:13,currency:'CAD'},{},{postalCode:'10001'}));

// --- A3: ZIP+4 tax zones; the most specific match wins.
for(const [id,code] of [['zip4-match','98101-1234'],['zip4-other-plus-four','98101-9999'],['zip5-only','98101'],['zip3-prefix','98199']])
  add('us-floor-zones-'+id,taxed(flooring(),{...US,taxByJobLocation:true,taxZones:ZONES},{},{postalCode:code}));

// --- A9: the renamed building-age keys read exactly like the earlier keys.
for(const id of ['v29:priced-exterior-itemized-three-story-built-1985','v30:r06-usd-business-canadian-postal-code-1978-to-1990','v30:r07-flooring-removal-1978-to-1990','v31:item5-painting-no-postal-code-canadian-business-usd','v31:item5-painting-no-postal-code-us-business-cad','v35:item1-paint-1985-review-before-1978-no-country','v35:item1-paint-1985-review-before-1978-CA','v35:item1-paint-1985-review-before-1978-US','v35:item1-paint-1985-no-country-us-job-code','v35:item1-paint-1985-blank-policy-no-country']){
  const f=corpus(id);f.customerInputs.buildingAge='1978_to_1990';add('new-key-'+id.replace(/^v\d+:/,''),f);
}
{const f=corpus('v30:r07-flooring-removal-1978-to-1990');
  for(const key of ['1990_or_later','1991_or_later']){const g=structuredClone(f);g.customerInputs.buildingAge=key;add('flooring-removal-built-1991-or-later-key-'+key,g);}
  for(const key of ['1990_or_later','1991_or_later']){const g=structuredClone(f);g.customerInputs.buildingAge=key;g.ownerPricing.pricing.olderMaterialRemoval='exclude';add('flooring-removal-exclude-key-'+key,g);}}

const out=process.argv[2]?new URL(process.argv[2],'file://'+process.cwd()+'/'):new URL('./corpus-additions-20261119-A.json',import.meta.url);
writeFileSync(out,JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
