// One-time build of corpus-additions-20261113.json (engine v31): at least one
// input for each of the eight items of the November 13 round. Items 1-4 are the
// books the real editor and conflict recovery now produce; items 5-7 reach the
// engine changes; item 8 changes only recovery wording, so its input is the
// square-yard book that box describes. Each result is worked by hand in
// test/qeReviewV31_20261113.spec.mjs. Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261113.mjs
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {convertPricebookMoney} from '../../server/priceBookMoney.js';
import * as E from '../../client/src/pricebookEditing.js';
import {reconcilePricebook} from '../../client/src/pricebookConflict.js';
import {fixture,flooring} from '../engine-independent/fixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const D=s=>convertPricebookMoney(s,'toDollars'),C=s=>convertPricebookMoney(s,'toCents');
const CARPET=['carpetPriceUnit','laborPerSqft','materialPerSqft'];
// 200 sq ft of carpet with an included pad; the service's carpet settings come from `pricing`.
function carpetJob(){
  const f=flooring('carpet',200);delete f.ownerPricing.pricing.perStepPrice;Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true});
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}});
  for(const k of CARPET)delete f.ownerPricing.pricing[k];
  return f;
}
// The engine reads the editor's service as the bridge projects it.
function asInput(dollars){
  const f=carpetJob(),s=C(dollars),pricing={...E.servicePricing(s)},ownerPricing={...s,pricing};
  for(const k of CARPET)delete ownerPricing[k];
  return {...f,ownerPricing};
}
function book(pricing,tiers,root=false){
  const s=structuredClone(carpetJob().ownerPricing);
  Object.assign(root?s:s.pricing,pricing);s.tiers=tiers;return D(s);
}
const FT3={laborPerSqft:{carpet:300},materialPerSqft:{carpet:500}},YD27={carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2700},materialPerSqft:{carpet:4500}};
// Item 1: base changed from $3/$5 per sq ft to sq yd with a yard option inheriting; and the reverse.
add('v31:item1-base-to-yard-yard-option-inherits',asInput(E.editCarpetPriceUnit(book(FT3,[{name:'Option',overrides:{carpetPriceUnit:'square_yard'}}]),'square_yard')));
add('v31:item1-base-to-foot-foot-option-inherits',asInput(E.editCarpetPriceUnit(book(YD27,[{name:'Option',overrides:{carpetPriceUnit:'square_foot'}}]),'square_foot')));
// Item 2: the option's own unit removed (base $27/$45 per sq yd, option on sq ft, no option prices).
add('v31:item2-option-foot-unit-removed',asInput(E.editTierCarpetPriceUnit(book(YD27,[{name:'Option',overrides:{carpetPriceUnit:'square_foot'}}]),0,undefined)));
// Item 3: A converts to sq yd, B sets option labor $27 per sq ft; B saves, A recovers.
{
  const start=E.editServiceTiers(book(FT3,[]),[{name:'Option',overrides:{laborPerSqft:{carpet:3}}}]);
  const A=E.editCarpetPriceUnit(start,'square_yard'),B=E.editServiceTiers(start,[{name:'Option',overrides:{laborPerSqft:{carpet:27}}}]);
  const b=s=>({services:[s],defaults:{},revision:1});
  add('v31:item3-recovered-option-labor-per-foot-in-yard-book',asInput(reconcilePricebook(b(start),b(A),b(B)).draft.services[0]));
}
// Item 4: prices stored on the service; A to sq yd, B material $6 per sq ft; the saved change kept.
{
  const start=book(FT3,[],true),A=E.editCarpetPriceUnit(start,'square_yard'),B=E.editServiceField(start,'materialPerSqft',{carpet:6});
  const b=s=>({services:[s],defaults:{},revision:1}),first=reconcilePricebook(b(start),b(A),b(B));
  add('v31:item4-root-stored-saved-material-kept',asInput(reconcilePricebook(b(start),b(A),b(B),{[first.conflicts[0].key]:'remote'}).draft.services[0]));
}
// Item 5: a USD book taxing by job location, Toronto job; a painting job with no postal code.
{
  const f=flooring('tile',200);Object.assign(f.businessDefaults,{currency:'USD',taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,taxZones:[{name:'Manhattan',codes:'100',percent:8.875}],taxOutsideZones:'review'});
  f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,labor:true,material:true};f.customerInputs.postalCode='M5V 2T6';
  add('v31:item5-usd-book-toronto-job-tax',f);
  const g=structuredClone(f);g.businessDefaults.currency='CAD';g.customerInputs.postalCode='10001';
  add('v31:item5-cad-book-new-york-job-tax',g);
  const v30=Object.fromEntries(JSON.parse(readFileSync(new URL('./corpus-additions-20261112b.json',import.meta.url),'utf8')).map(r=>[r.id,r.input]));
  const paint=(country,currency)=>{const p=structuredClone(v30['v30:r06-usd-business-canadian-postal-code-1978-to-1990']);delete p.customerInputs.postalCode;p.businessDefaults.currency=currency;p.businessDefaults.businessCountry=country;return p;};
  add('v31:item5-painting-no-postal-code-canadian-business-usd',paint('CA','USD'));
  add('v31:item5-painting-no-postal-code-us-business-cad',paint('US','CAD'));
}
// Items 6 and 7: 2,000 sq ft asphalt shingle roof, October 16 rules.
function slopeRoof(customer={},pricing={}){
  const product='asphalt_shingle';
  const p=Object.fromEntries(Object.entries({laborPerSquare:20000,materialCostPerSquare:15000,tearOffPerSquare:6000,underlaymentPerSquare:2000,underlaymentPriceBasis:'installed_area_sell_price'}).map(([k,v])=>[k,{[product]:v}]));
  const f=fixture('ROOFING_REPLACEMENT',{...p,disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,unknownPitchBand:'up_to_six',
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,...pricing},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:product,replacementRoofType:product,pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  for(const [k,v] of Object.entries(pricing))if(v===undefined)delete f.ownerPricing.pricing[k];
  for(const [k,v] of Object.entries(customer))if(v===undefined)delete f.customerInputs[k];
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  const facts={};
  for(const field of ['existingRoofType','replacementRoofType']){const id=randomUUID();f.ownerPricing.knownOfferings[field]={...f.ownerPricing.knownOfferings[field],[product]:id};facts[field]={status:'identified',field,value:product,offeringId:id};}
  f.customerInputs.confirmedFacts={...f.customerInputs.confirmedFacts,...facts};
  return f;
}
const CEMENTED={nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000};
const low={pitchBand:'under_four',pitchRisePer12:3};
add('v31:item6-nbc-low-slope-method-blank',slopeRoof(low,{roofBuildingCode:'nbc',...CEMENTED,lowSlopeAssembly:undefined}));
add('v31:item6-nbc-cemented-application-chosen',slopeRoof(low,{roofBuildingCode:'nbc',...CEMENTED,lowSlopeAssembly:'nbc_low_slope_application'}));
add('v31:item6-irc-cemented-application-refused',slopeRoof(low,{roofBuildingCode:'irc',...CEMENTED,lowSlopeAssembly:'nbc_low_slope_application'}));
add('v31:item7-not-sure-with-areas-by-pitch',slopeRoof({pitchMethod:'not_sure',pitchBand:undefined,pitchAreaUpTo6Sqft:1000,pitchArea7To9Sqft:1000}));
// Item 8: the square-yard book the recovery box describes ($27/$45 per sq yd).
add('v31:item8-square-yard-book-in-recovery-box',asInput(book(YD27,[])));
writeFileSync(new URL('./corpus-additions-20261113.json',import.meta.url),JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
