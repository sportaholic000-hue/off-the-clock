import {flooring} from '../verification/engine-independent/fixtures.mjs';

export function carpet(rooms,roll=12,repeat=0,connected='unknown'){
  const f=flooring('carpet',rooms.reduce((sum,r)=>sum+r.lengthFt*r.widthFt,0));
  Object.assign(f.ownerPricing.pricing,{materialPerSqft:{carpet:300},scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Defined carpet underlayment',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_carpet:1},installedLaborPercent:{'scopeRates.floor_underlayment_carpet':0},installedMaterialsPercent:{'scopeRates.floor_underlayment_carpet':100},carpetRollWidthFt:roll,...(repeat?{carpetPatternRepeatFt:repeat}:{})});
  Object.assign(f.customerInputs,{carpetRooms:rooms,carpetConnectedAreas:connected,roomCount:rooms.length,underlaymentScopeConfirmed:true});
  return f;
}

export async function estimatedCarpetPhone(h,f,{publish}={}){
  const saved=publish(h.c.ownerId,f),match=await h.tool('matchService',{query:f.ownerPricing.service});
  const inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
  const args={serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,callerMeasurementsEstimated:true,productConfirmations:{},additionalWork:[]};
  let result=await h.tool('getQuote',args);
  if(result.questionContract?.fields.some(field=>field.confirmationToken)){
    args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));
    result=await h.tool('getQuote',args);
  }
  return {...saved,match,args,result};
}
