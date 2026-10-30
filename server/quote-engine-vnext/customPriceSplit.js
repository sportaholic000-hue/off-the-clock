import {exactDivide,exactMultiply,exactSubtract,exactRound,exactEvidence,exactToNumber} from './exactMath.js';

// Reuse the installed-price materials map. CUSTOM's remainder is labor; no
// separate labor percentage or default split is inferred when the share is blank.
export const customMaterialsShare=p=>p.installedMaterialsPercent?.price;
export function splitCustomPriceLines(lines,{serviceType,pricing,ownerPricing,defaults,month}) {
  const share=customMaterialsShare(pricing);
  if(serviceType!=='CUSTOM'||typeof share!=='number')return lines;
  return lines.flatMap(line=>{
    if(line.calculation?.ratePath!=='price')return [line];
    const material=exactDivide(exactMultiply(line.amountCents,share),100),labor=exactSubtract(line.amountCents,material);
    const materialCents=exactRound(material),laborCents=line.amountCents-materialCents;
    // The split only allocates the owner's price between labor and materials.
    // Both parts keep the price basis and the markup setting the whole price
    // had, so entering a share never changes markup.
    const basis=line.priceBasis||ownerPricing.priceBasisByCategory?.[line.category];
    // Markup eligibility also stays with the price's own charge category.
    const portion=(category,amountCents,exact)=>({
      name:category==='labor'?'Custom service labor':'Custom service materials',category,amountCents,...(basis?{priceBasis:basis}:{}),markupCategory:line.category,
      customPriceSplit:true,ownerVisible:true,customerVisible:false,
      ...(category==='material'?{installedMaterialExactCents:exactEvidence(exact),installedMaterialCents:exactToNumber(exact),materialsPercent:share}:{}),
      ...(amountCents===0?{noCharge:true,noChargeReason:exactToNumber(exact)>0?'rounded_fractional_cent':line.amountCents===0?line.noChargeReason:'configured_zero_percentage'}:{}),
      calculation:{evidenceVariant:'fixed_amount',amountCents,roundedAmountCents:amountCents,
        ratePath:'customSplit.'+category,allocation:{source:structuredClone(line),materialsPercent:share,
          exactPortionCents:exactEvidence(exact),rounding:'material_nearest_cent_labor_remainder'}}
    });
    const result=[portion('labor',laborCents,labor),portion('material',materialCents,material)];
    const months=ownerPricing.peakMonths??defaults.peakMonths,percent=ownerPricing.peakSurchargePercent??defaults.peakSurchargePercent;
    if(months.includes(month)&&percent>0){
      const exact=exactDivide(exactMultiply(labor,percent),100),amountCents=exactRound(exact);
      // A busy-season charge on labor inside a selling price is itself a selling
      // price, as for installed prices; on a cost price it follows the owner's
      // surcharge settings like any other busy-season charge.
      if(amountCents>0)result.push({name:'Peak season adjustment on custom labor',category:'surcharge',...(basis==='sell_price'?{priceBasis:'sell_price'}:{}),amountCents,
        customPriceSplit:true,ownerVisible:true,customerVisible:false,
        calculation:{evidenceVariant:'percentage_derived',ratePath:'customSplit.peakLabor',basisCategory:'labor',
          basisAmountCents:exactToNumber(labor),exactBasisAmountCents:exactEvidence(labor),percent,
          exactUnroundedCents:exactEvidence(exact),unroundedCents:exactToNumber(exact),roundedAmountCents:amountCents}});
    }
    return result;
  });
}
