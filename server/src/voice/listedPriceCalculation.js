const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const refusal=()=>({status:'needs_review',message:'The saved listing or quantity cannot be multiplied safely. Repeat only the saved listed price and its conditions, or ask the business to review it. No multiplied amount is available.'});
const decimal=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const coefficient=value=>{const [whole,fraction='']=value.split('.');return {value:BigInt(whole+fraction),scale:fraction.length};};
const moneyPattern=/(CA\$|C\$|US\$|AU\$|A\$|NZ\$|HK\$|\$|€|£|¥|\bCAD\b|\bUSD\b|\bEUR\b|\bGBP\b|\bAUD\b|\bNZD\b)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,6})?)(?![\d.,])/gi;
// This tool reads one exact saved paragraph, not a model-supplied rate. Lists
// with several prices, nonlinear conditions or uncertain units remain review.
export function calculateSavedListedPrice(knowledge,args){
  if(!record(knowledge)||knowledge.draft===true||typeof knowledge.prices!=='string'||knowledge.prices.length>20000||args?.customerConfirmed!==true||typeof args.listedItem!=='string'||args.listedItem.length>2000||typeof args.quantity!=='string'||!decimal.test(args.quantity))return refusal();
  const paragraph=args.listedItem.trim();
  const entries=knowledge.prices.replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(value=>value.trim());
  if(!paragraph||entries.filter(value=>value===paragraph).length!==1)return refusal();
  if(/\b(?:from|starting|minimum|maximum|min|max|discount|bulk|bundle|free|buy|save|up to|at least|at most|between|first|subsequent|thereafter|tier|tiers|threshold|increment|prorate|prorated|rounded|rounding)\b|\d\s*[-–]\s*\d|\b(?:for|over|under|above|below|after|before|exceeding)\s+\d/i.test(paragraph))return refusal();
  const matches=[...paragraph.matchAll(moneyPattern)];if(matches.length!==1)return refusal();
  const match=matches[0],amount=match[2].replaceAll(',','');
  if(!decimal.test(amount)||/[-+]\s*$/.test(paragraph.slice(0,match.index)))return refusal();
  const tail=paragraph.slice(match.index+match[0].length);
  if(!/^\s*(?:each\b|(?:per\s+|\/\s*)(?:item|unit|piece|hour|hr|minute|day|week|month|visit|sqft|square foot|square feet|linear foot|linear feet|foot|feet|yard|cubic yard|cubic yards)s?\b)/i.test(tail))return refusal();
  const rate=coefficient(amount),quantity=coefficient(args.quantity);
  if(quantity.value===0n)return refusal();
  const scale=rate.scale+quantity.scale;
  let digits=(rate.value*quantity.value).toString().padStart(scale+1,'0');
  let whole=scale?digits.slice(0,-scale):digits,fraction=scale?digits.slice(-scale).replace(/0+$/,''):'';
  if(whole.length>12)return refusal();
  // Preserve the exact decimal product, including fractional cents. No binary
  // multiplication, rounding, unit conversion, taxes, fees or other arithmetic.
  fraction=fraction.padEnd(2,'0');
  const currency=match[1],extendedAmount=whole+'.'+fraction;
  const spokenAmount=currency+(currency.endsWith('$')||['$','€','£','¥'].includes(currency)?'':' ')+extendedAmount;
  return {status:'calculated',listedItem:paragraph,quantity:args.quantity,extendedAmount,currency,
    voiceSummary:paragraph+'. At that listed price, '+args.quantity+' comes to '+spokenAmount+'. The stated conditions still apply. No tax, fees, discounts or other items have been added.'};
}
