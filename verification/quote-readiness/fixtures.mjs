import {roof,mulch,concrete} from '../../test/opusQuoteFixtures.mjs';
import {fixture} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
export function roofMinimum(){
 const f=roof();const p=f.ownerPricing.pricing;
 Object.assign(p,{laborPerSquare:{asphalt_shingle:9000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:4500},underlaymentPerSquare:{asphalt_shingle:2000},accessoryPricingMode:'per_square_allin',minimumJob:250000});
 for(const k of ['starterPerLF','dripEdgePerLF','ridgeCapPerLF','materialAccessoryBasis','deckingPerSheet'])delete p[k];
 Object.assign(f.customerInputs,{roofSizeInput:2000,serviceScope:'partial',partialAreaSqft:200});
 for(const k of ['starterLengthLF','dripEdgeLengthLF','ridgeCapLengthLF'])delete f.customerInputs[k];
 f.ownerPricing.priceBasisByCategory.material='cost';
 Object.assign(f.businessDefaults,{markupPercent:30,taxMode:'TAX_ALL',taxPercent:15,rangeBufferPercent:10});
 return f;
}
export function wallPainting(cost=false){
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:50,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:100,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
 f.ownerPricing.priceBasisByCategory.material=cost?'cost':'sell_price';
 if(cost){f.ownerPricing.pricing.scopeDetails={paint_wall:{description:'[SYNTHETIC] Wall finish paint',mode:'package_cost',productKey:'wall_finish',coverage:400,wastePercent:10}};
 f.ownerPricing.pricing.scopeRates={paint_wall:5000};f.customerInputs.paintProductsConfirmed=true;}
 return f;
}
export function bareConcrete(){const f=concrete('broom','easy');delete f.ownerPricing.pricing.stampedMaterialPerSqft;return f;}
export function bareMulch(){const f=mulch('TAX_NONE');f.businessDefaults.minimumJobPrice=0;f.businessDefaults.rangeBufferPercent=0;return f;}
export function standardExterior(){return fixture('EXTERIOR_PAINTING',{exteriorLaborPerSqftPerCoat:100,materialPerSqftPerCoat:50,minimumJob:0,laborHourlyRate:5000},{areaInputMethod:'wall_sqft',exteriorAreaSqft:100,stories:1,surfaceCondition:'good',coats:2});}
export function standardFence(){return fixture('FENCING_INSTALL',{laborPerLinearFoot:{wood:1000},materialPerLinearFoot:{wood:2000},postPrice:{wood:2000},concretePerPost:1000,postsIncludedInMaterial:{wood:false},gatePrice:{wood:25000},minimumJob:0},{linearFeet:100,lfMethod:'exact',fenceType:'wood',fenceHeight:6,gateCount:0,terrainSlope:'flat'});}
export const expected={roof:{storedMinimumCents:250000,editorMinimumDollars:2500,preTaxCents:250000,taxCents:37500,midDollars:2875,lowDollars:2875,highDollars:3163},wall:{midDollars:300},wallCost:{midDollars:250},mulch:{midDollars:77.78}};
export function bareCleanup(){return fixture('LANDSCAPING_CLEANUP',{cleanupBaseRatePerSqft:10,debrisPricing:{light:{laborMultiplier:1,disposalFlat:5000},moderate:{laborMultiplier:1.5,disposalFlat:10000},heavy:{laborMultiplier:2,disposalFlat:15000}},minimumServiceCharge:0},{yardSqft:1000,sqftMethod:'exact',debrisLevel:'light',slope:'flat',haulAway:false});}
export function bareSod(){return fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:75,sodInstallLaborPerSqft:125,minimumServiceCharge:0},{sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:false,slope:'flat',accessDifficulty:'easy'});}
export function barePlanting(){return fixture('LANDSCAPING_PLANTING',{plantingLaborPerPlant:{small:1000,medium:2000,large:3000},plantMaterialAllowance:{small:500,medium:1000,large:1500},minimumServiceCharge:0},{plantsBySize:{small:2,medium:1,large:1},bedCondition:'clean',mulchNeeded:false});}
export function unsafeRange(){const f=wallPainting();f.ownerPricing.pricing.laborPerWallSqftPerCoat=10_000_000_000;return f;}
export function cases(){return [
 {id:'M1-cleanup-no-haul',input:bareCleanup(),expected:{midDollars:150}},
 {id:'M1-sod-no-preparation',input:bareSod(),expected:{midDollars:2037.5}},
 {id:'M1-planting-no-mulch',input:barePlanting(),expected:{midDollars:105}},
 {id:'B2-unready-safe-integer-range',input:unsafeRange()},
 {id:'B1-roof-minimum',input:roofMinimum(),minimumDollars:2500,expected:expected.roof},
 {id:'B2-M1-concrete',input:bareConcrete()},
 {id:'B2-M1-wall-painting',input:wallPainting(),expected:expected.wall},
 {id:'B2-M1-mulch',input:bareMulch(),expected:expected.mulch},
 {id:'B2-M1-M6-paint-packages',input:wallPainting(true),expected:expected.wallCost},
 {id:'M2-exterior-standard',input:standardExterior()},
 {id:'M2-fence-standard',input:standardFence()},
 ...['FENCING_INSTALL','EXTERIOR_PAINTING'].flatMap(type=>['installed','itemized'].map(mode=>({id:'M2-configured-'+type+'-'+mode,input:offeringFixture(type,mode)})))
 ];}