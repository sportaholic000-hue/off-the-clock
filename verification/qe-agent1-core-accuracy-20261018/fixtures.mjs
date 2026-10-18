import {fixture,flooring} from '../engine-independent/fixtures.mjs';
import {roof} from '../qe-roof-zero-adjustments-20261018/fixture.mjs';
import {synchronizeDependentLinesVNext,roofDependentDefinitionsVNext} from '../../server/quote-engine-vnext/priceGroundwork.js';
export {fixture,flooring,roof};
export function paint(){
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:10,minimumJob:0,paintWasteFactor:0,paintingRates:{trimLaborPerLFPerCoat:200,trimMaterialPerLFPerCoat:10,trimPrepLaborPerLF_fair:200,trimPrepMaterialPerLF_fair:10,trimPrepLaborPerLF_poor:200,trimPrepMaterialPerLF_poor:10}},{areaInputMethod:'wall_sqft',wallAreaSqft:100,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:1,ceilingsIncluded:false,trimIncluded:true,trimLengthLF:10,trimCoats:1,trimSurfaceCondition:'fair'});
 f.ownerPricing.priceBasisByCategory.material='sell_price';f.ownerPricing.peakMonths=[1,10];f.ownerPricing.peakSurchargePercent=10;return f;
}
export function accessoryRoof(pricing={}){return roof({roofSizeInput:100,pitchBand:'up_to_six'},{materialCostPerSquare:{asphalt_shingle:10000},wasteFactorByComplexity:{simple:.1,moderate:.15,complex:.2},...pricing});}
export function confirmAccessories(f,ids){
 const definitions=roofDependentDefinitionsVNext(f.ownerPricing),selected=ids||definitions.map(d=>d.id);
 f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,definitions,{ownerId:f.ownerPricing.origin.ownerId,reenteredIds:selected,confirmIds:selected,now:'2026-10-18T12:00:00.000Z'});return f;
}
export function installedFloor(rate='transitionPriceEach'){
 const f=flooring('tile',200);f.ownerPricing.pricing[rate]=10000;
 Object.assign(f.customerInputs,rate==='transitionPriceEach'?{transitionCount:1}:{floorLevelingNeeded:true,floorLevelingSqft:1});
 f.ownerPricing.pricing.installedLaborPercent={[rate]:30};f.ownerPricing.pricing.installedMaterialsPercent={[rate]:40};return f;
}
