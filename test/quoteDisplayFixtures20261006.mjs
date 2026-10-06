import {randomUUID} from 'node:crypto';
import {fixture,mowing,flooring} from '../verification/engine-independent/fixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';

export const date={timeZone:'UTC',quoteInstant:'2026-10-06T12:00:00.000Z'};
export function roofingDisplayFixture(){
 return fixture('ROOFING_REPLACEMENT',{
  laborPerSquare:{asphalt_shingle:7500},materialCostPerSquare:{asphalt_shingle:12000},
  tearOffPerSquare:{asphalt_shingle:3000},underlaymentPerSquare:{asphalt_shingle:1500},
  underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},
  installedLaborPercent:{'underlaymentPerSquare.asphalt_shingle':0},installedMaterialsPercent:{'underlaymentPerSquare.asphalt_shingle':100},
  minimumJob:0,accessoryPricingMode:'per_square_allin'
 },{roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
}
export function mowingDisplayFixture(){
 const f=mowing();f.ownerPricing.pricing.minimumServiceCharge=15000;
 Object.assign(f.businessDefaults,{currency:'CAD',rangeBufferPercent:10,taxMode:'TAX_ALL',taxPercent:15});
 for(const key of Object.keys(f.ownerPricing.taxabilityByCategory))f.ownerPricing.taxabilityByCategory[key]=true;
 return f;
}
export function missingFloorDisplayFixture(){
 const f=flooring();delete f.ownerPricing.pricing.perStepPrice;delete f.ownerPricing.pricing.materialPerSqft.tile;return f;
}
export function savedDisplayFixture(f,{approve=true}={}){
 const owner='synthetic-quote-display-'+randomUUID(),s=structuredClone(f.ownerPricing);delete s.origin;
 const initial=bridge.readApplicationBook(owner),draft=bridge.convertApplicationBook({services:[s],defaults:{currency:'CAD',quoteTimeZone:'UTC',...f.businessDefaults}},'toDollars');
 bridge.saveApplicationBook(owner,{...draft,revision:initial.revision},date);
 if(approve)bridge.approveApplicationService(owner,s.id,{revision:bridge.readApplicationBook(owner).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
 const book=loadPricebook(owner),service=book.services[0];
 return {owner,book,service,definition:bridge.applicationServiceDefinition(service),
  status:bridge.bookStatuses(book,date)[0],
  quote:customerInputs=>bridge.calculateApplicationQuote(book,service,{customerInputs,customerFeeSelections:{}},{preparingIntake:true,...date}),
  preview:customerInputs=>bridge.previewApplicationQuote(owner,{revision:bridge.readApplicationBook(owner).revision,serviceId:service.id,customerInputs},date)};
}
