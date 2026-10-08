import {rewriteKnowledgeText} from './knowledgeText.js';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const refusal=()=>({status:'needs_review',message:'The saved listing or quantity cannot be multiplied safely. Repeat only the saved listing word for word with its conditions, or ask the business to review it. No multiplied amount is available.'});
const decimal=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const coefficient=value=>{const [whole,fraction='']=value.split('.');return {value:BigInt(whole+fraction),scale:fraction.length};};
const priceSentence=/^(?<item>[\p{L}\p{M}\[][\p{L}\p{M}\s:'’()\[\]-]*?\s*)?(?<currency>CA\$|C\$|US\$|AU\$|A\$|NZ\$|HK\$|\$|€|£|¥|CAD|USD|EUR|GBP|AUD|NZD)\s*(?<amount>(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,6})?)\s*(?:each|(?:per\s+|\/\s*)[a-z]+(?:\s+[a-z]+)?)\.?$/iu;
const taxSentence=/^(?:all prices\s+)?(?:plus\s+(?:HST|GST|tax)(?:\s*(?:and|\/)\s*(?:HST|GST|tax))?|taxes extra)\.?$/i;
const contactSentence=/^call(?: us| me)? (?:for (?:a )?(?:free )?(?:estimate|quote|hours|access|details|information)|to (?:book|schedule)(?: an? (?:appointment|estimate))?)\.?$/i;
// Positive sentence grammar: one flat rate and only tax/contact qualifications.
// Nothing else (including a second price basis) is interpreted or calculated.
export function calculateSavedListedPrice(knowledge,args){
 if(!record(knowledge)||knowledge.draft===true||typeof knowledge.prices!=='string'||knowledge.prices.length>20000||args?.customerConfirmed!==true||typeof args.listedItem!=='string'||args.listedItem.length>20000||typeof args.quantity!=='string'||!decimal.test(args.quantity))return refusal();
 const paragraph=args.listedItem.trim();
 const entries=rewriteKnowledgeText(knowledge.prices).split(/\n\s*\n/).map(value=>value.trim());
 if(!paragraph||entries.filter(value=>value===paragraph).length!==1)return refusal();
 const sentences=paragraph.split(/\n|(?<=[.!?])\s+/).map(value=>value.trim()).filter(Boolean);
 let price;
 for(const sentence of sentences){
  const match=priceSentence.exec(sentence);
  if(match){
   // "from"/"starting at" introduce a price bound, not an item name.
   if(price||/\b(?:from|starting(?: at)?|minimum|maximum)\s*:?\s*$/i.test(match.groups.item||''))return refusal();
   price=match.groups;
  }else if(!taxSentence.test(sentence)&&!contactSentence.test(sentence))return refusal();
 }
 if(!price)return refusal();
 const amount=price.amount.replaceAll(',','');if(!decimal.test(amount))return refusal();
 const rate=coefficient(amount),quantity=coefficient(args.quantity);if(quantity.value===0n)return refusal();
 const product=rate.value*quantity.value,denominator=10n**BigInt(rate.scale+quantity.scale),scaled=product*100n;
 const remainder=scaled%denominator,cents=scaled/denominator+(remainder*2n>=denominator?1n:0n);
 const whole=(cents/100n).toString();if(whole.length>12)return refusal();
 const extendedAmount=whole+'.'+(cents%100n).toString().padStart(2,'0');
 const currency=price.currency,spokenAmount=currency+(currency.endsWith('$')||['$','€','£','¥'].includes(currency)?'':' ')+whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+extendedAmount.slice(-3);
 return {status:'calculated',listedItem:paragraph,quantity:args.quantity,extendedAmount,currency,
  voiceSummary:paragraph+(/[.!?]$/.test(paragraph)?' ':'. ')+'At that listed price, '+args.quantity+' comes to '+spokenAmount+(remainder?' (rounded to the nearest cent)':'')+'. The stated conditions still apply. No tax, fees, discounts or other items have been added.'};
}
