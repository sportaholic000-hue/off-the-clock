// One-time build of corpus-additions-20261118.json (engine v35): inputs that
// reach the November 18, 2026 round, items 1, 3 and 4. Each result is worked by
// hand in test/qeOwnerRoundV35_20261118.spec.mjs. Run once; the output file is
// never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261118.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {flooring} from '../engine-independent/fixtures.mjs';
import {corpusInputs} from './fingerprint.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const corpus=id=>structuredClone(corpusInputs().find(r=>r.id===id).input);
// Item 1: a 1985 home, lead policy "review before 1978", with and without a country.
const paint=corpus('v29:priced-exterior-itemized-three-story-built-1985');
add('v35:item1-paint-1985-review-before-1978-no-country',paint);
for(const country of ['CA','US']){const f=structuredClone(paint);f.businessDefaults.businessCountry=country;add('v35:item1-paint-1985-review-before-1978-'+country,f);}
{const f=structuredClone(paint);f.customerInputs.postalCode='10001';add('v35:item1-paint-1985-no-country-us-job-code',f);}
{const f=structuredClone(paint);delete f.ownerPricing.pricing.leadSafePainting;add('v35:item1-paint-1985-blank-policy-no-country',f);}
// Item 1: tax by job location with no saved country, a CAD book and a Toronto job.
{const f=flooring('tile',200);Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:13,currency:'CAD',taxByJobLocation:true});f.customerInputs.postalCode='M5V 2T6';add('v35:item1-tax-by-location-no-country',f);}
// Item 3: a 2,000 sq ft asphalt roof (v33 roof), per asphalt product.
const roof=JSON.parse(readFileSync(new URL('./corpus-additions-20261113c.json',import.meta.url),'utf8')).find(r=>r.id==='v33:fix3-nbc-cemented-eave-no-none-measured').input;
function perProduct(method,threeTab,rise){
  const f=structuredClone(roof),p=f.ownerPricing.pricing;
  for(const k of ['lowSlopeAssembly','nbcLowSlopeShingleFactor','nbcLowSlopeShingleMaterialPerSquare'])delete p[k];
  p.lowSlopeAssemblyByProduct={asphalt_shingle:method};
  if(threeTab!==undefined)p.roofProductThreeTab={asphalt_shingle:threeTab};
  if(method==='nbc_low_slope_application')Object.assign(p,{nbcLowSlopeShingleFactorByProduct:{asphalt_shingle:1.5},nbcLowSlopeShingleMaterialByProduct:{asphalt_shingle:10000}});
  f.customerInputs.pitchRisePer12=rise;if(rise>=4){f.customerInputs.pitchBand='up_to_six';}
  return f;
}
for(const rise of [2,3,3.99,4])add('v35:item3-cemented-three-tab-rise-'+rise,perProduct('nbc_low_slope_application',true,rise));
add('v35:item3-cemented-not-three-tab-rise-3',perProduct('nbc_low_slope_application',false,3));
add('v35:item3-double-underlayment-rise-3',perProduct('double_underlayment',undefined,3));
{const f=structuredClone(roof);f.ownerPricing.pricing.roofProductThreeTab={asphalt_shingle:true};add('v35:item3-legacy-cemented-marked-three-tab',f);}
// Item 4: under materials-only tax, a labor-only Quebec job for an Ontario
// business with no Quebec rate is quoted with no tax; with taxed materials it
// goes to review.
function quebec(materialsTaxed){const f=flooring('tile',200);f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,material:materialsTaxed};Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:13,currency:'CAD',businessCountry:'CA',businessProvince:'ON'});f.customerInputs.postalCode='H2X 1A1';return f;}
add('v35:item4-quebec-job-nothing-taxed-no-rate',quebec(false));
add('v35:item4-quebec-job-materials-taxed-no-rate',quebec(true));
writeFileSync(new URL('./corpus-additions-20261118.json',import.meta.url),JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
