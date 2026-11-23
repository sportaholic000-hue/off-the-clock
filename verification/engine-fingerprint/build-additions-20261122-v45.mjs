import {writeFileSync} from 'node:fs';
import {fixture,concrete,mowing,siding,TILE_ON_CONCRETE_SLAB} from '../engine-independent/fixtures.mjs';
import {corpusInputs} from './fingerprint.mjs';

// November 22, 2026 (v45): repairs from Neon's re-audit of ef7e872.
const cases=[];
const add=(id,input)=>cases.push({id:'v45-20261122:'+id,input:structuredClone(input)});
const corpus=id=>structuredClone(corpusInputs().find(row=>row.id===id).input);
const freePolicy=(service,includedPrices)=>({...service,zeroPricePolicy:{serviceId:service.id,ownerId:service.origin.ownerId,operationId:'fixture-free-approval',approvedAt:'2026-09-09T12:00:00.000Z',freeCompleteService:false,freeTiers:[],includedPrices}});

// #1 Job-location tax for a business in BC: a BC job without and with the BC rate.
for(const rate of [undefined,12]){const f=mowing();f.businessDefaults={...f.businessDefaults,taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,businessCountry:'CA',businessProvince:'BC',currency:'CAD',...(rate?{provinceTaxPercent:{BC:rate}}:{})};f.customerInputs.postalCode='V6B1A1';add('mowing-bc-job-location-tax-'+(rate?'rate-12':'no-rate'),f);}

// #3 Isolation joints with add-ons at cost, a 20% add-on markup and materials-only tax.
{const f=corpus('v29:patio-isolation-joints-materials-tax-share-40');Object.assign(f.ownerPricing.pricing,{isolationJointPerLF:1000,installedMaterialsPercent:{isolationJointPerLF:50},installedLaborPercent:{isolationJointPerLF:50}});
  f.businessDefaults={...f.businessDefaults,markupPercent:20,markupMode:'markup',markupApplies:Object.fromEntries(Object.keys(f.businessDefaults.markupApplies).map(k=>[k,k==='addon']))};add('patio-isolation-joints-addon-markup-materials-tax',f);}

// #4 Carpet: separate small rooms that fit side by side on the roll.
const carpet=rooms=>fixture('FLOORING_INSTALL',{laborPerSqft:{carpet:100},materialPerSqft:{carpet:300},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',carpetRollWidthFt:12,carpetCrossgrainSeams:'not_allowed',scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Carpet pad',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_carpet:80}},
  {sqft:rooms.reduce((s,r)=>s+r.lengthFt*r.widthFt,0),sqftMethod:'exact',newFlooringType:'carpet',existingFloorType:'none',removalNeeded:false,roomCount:rooms.length,layoutPattern:'straight',stairSteps:0,carpetRooms:rooms,carpetConnectedAreas:[],underlaymentScopeConfirmed:true});
for(const [id,rooms] of [['two-6x5',[{lengthFt:6,widthFt:5},{lengthFt:6,widthFt:5}]],['two-7x5',[{lengthFt:7,widthFt:5},{lengthFt:7,widthFt:5}]],['6x5-and-5x6',[{lengthFt:6,widthFt:5},{lengthFt:5,widthFt:6}]],['two-5x5',[{lengthFt:5,widthFt:5},{lengthFt:5,widthFt:5}]]])add('carpet-rooms-'+id,carpet(rooms));

// #5 Thickened edge on measured outlines.
const slab=points=>{const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false,dimensionMethod:'measured_outline',outlinePoints:points});delete f.customerInputs.length;delete f.customerInputs.width;Object.assign(f.ownerPricing.pricing,{thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12,concreteWasteFactor:0});return f;};
add('outline-square-thickened-edge',slab([{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20},{x:0,y:0}]));
add('outline-square-2x4-spur-thickened-edge',slab([{x:0,y:0},{x:9,y:0},{x:9,y:-4},{x:11,y:-4},{x:11,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20},{x:0,y:0}]));
add('outline-square-4x2-landing-thickened-edge',slab([{x:0,y:0},{x:8,y:0},{x:8,y:-2},{x:12,y:-2},{x:12,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20},{x:0,y:0}]));
add('outline-t-spur-thickened-edge',slab([{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:11,y:10},{x:11,y:16},{x:9,y:16},{x:9,y:10},{x:0,y:10},{x:0,y:0}]));
add('outline-2x10-walk-thickened-edge',slab([{x:0,y:0},{x:2,y:0},{x:2,y:10},{x:0,y:10},{x:0,y:0}]));

// #10 $0 prices marked included in another price.
{const f=siding(),p=f.ownerPricing.pricing;Object.assign(p,{surfaceExtraRates:{soffit:0,fascia:700},sidingSettings:{soffitUnit:'linear_feet'},installedLaborPercent:{'surfaceExtraRates.fascia':60},installedMaterialsPercent:{'surfaceExtraRates.fascia':40}});
  Object.assign(f.customerInputs,{surfaceOptionalItems:['soffit','fascia'],soffitQuantity:150,fasciaLengthLF:100});f.ownerPricing=freePolicy(f.ownerPricing,{'surfaceExtraRates.soffit':'surfaceExtraRates.fascia'});add('siding-zero-soffit-included-in-fascia',f);}
{const f=fixture('ROOFING_REPAIR',{repairMinimum:0,largeRepairMaxSqft:1_000_000},{repairType:'shingle_patch',affectedArea:60,roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false});
  Object.assign(f.ownerPricing.pricing,{repairPricingUnit:{asphalt_shingle:{shingle_patch:'square_feet'}},repairUnitPrice:{asphalt_shingle:{shingle_patch:0}},repairAreaMinimum:{asphalt_shingle:{shingle_patch:30000}},repairFirstAreaSqft:{asphalt_shingle:{shingle_patch:25}},installedLaborPercent:{'repairAreaMinimum.asphalt_shingle.shingle_patch':60}});
  f.ownerPricing=freePolicy(f.ownerPricing,{'repairUnitPrice.asphalt_shingle.shingle_patch':'repairAreaMinimum.asphalt_shingle.shingle_patch'});add('roof-repair-zero-unit-price-included-in-minimum',f);}

// #13 ZIP+4 zone inside a 3-digit zone, a 5-digit zone and the business rate.
const SPLIT={name:'[SYNTHETIC] Split block',codes:['98101-1234'],percent:10.25};
for(const [id,zones,extra] of [['zip3',[{name:'[SYNTHETIC] Region',codes:['981'],percent:9},SPLIT],{}],['zip5',[{name:'[SYNTHETIC] Downtown',codes:['98101'],percent:9.5},SPLIT],{}],['business-rate',[SPLIT],{taxOutsideZones:'business_rate'}]])
  for(const code of ['98101','98101-1234','98101-5555']){const f=mowing();f.businessDefaults={...f.businessDefaults,taxMode:'TAX_ALL',taxPercent:8,taxByJobLocation:true,businessCountry:'US',currency:'USD',taxZones:zones,...extra};f.customerInputs.postalCode=code;add('mowing-zip4-inside-'+id+'-'+code,f);}

writeFileSync(new URL('./corpus-additions-20261122-v45.json',import.meta.url),JSON.stringify(cases,null,2)+'\n');
console.log(cases.length);
