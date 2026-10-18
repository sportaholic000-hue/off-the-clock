import {rewriteKnowledgeText} from './knowledgeText.js';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const refusal=()=>({status:'needs_review',message:'The saved listing or quantity cannot be multiplied safely. Repeat only the saved listing word for word with its conditions, or ask the business to review it. No multiplied amount is available.'});
const decimal=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
const coefficient=value=>{const [whole,fraction='']=value.split('.');return {value:BigInt(whole+fraction),scale:fraction.length};};
const priceSentence=/^(?<item>[\p{L}\p{M}\p{N}#\[][\p{L}\p{M}\p{N}\s:'’()\[\]#./×-]*?\s*)?(?<currency>CA\$|C\$|US\$|AU\$|A\$|NZ\$|HK\$|\$|€|£|¥|CAD|USD|EUR|GBP|AUD|NZD)\s*(?<amount>(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,6})?)\s*(?:each|(?:per\s+|\/\s*)(?:(?:square|sq\.?|linear|lineal|lin\.?|cubic|cu\.?|board)\s+(?:foot|feet|ft|yards?|yds?|meters?|metres?|m|inch(?:es)?|in)|[a-z]+))\.?$/iu;
const qualifiedPricePrefix=/\p{N}|\b(?:minimum|min|maximum|max|from|starting|start|up\s+to|about|approx|around|only|first|second|half|discount|off|sale|special|promo|deal|free|extra|additional|each\s+additional|per|over|pack)\b/iu;
// The optional item text is a product name, not an eligibility expression.
// Quantity confirmation cannot establish payment, timing, availability or scope
// conditions. Refuse clause markers anywhere in that text, including inside
// parentheses or after a product number. Do not attempt to evaluate the clause.
const conditionalPricePrefix=/\b(?:if|unless|when(?:ever)?|where(?:ver)?|whether|before|after|until|while|once|upon|provided|providing|assuming|subject|conditional(?:ly)?|condition(?:s)?|contingent|depend(?:s|ing|ent)?|pending|based|except|otherwise|during|since)\b/iu;
// Recognize prepositional phrases without rejecting ordinary compounds such
// as board-on-board panels, nail-in anchors and plug-in adapters.
const prepositionalPricePrefix=/(?:^|\s|:|\(|\[)(?:with|without|for|on|in|at|by|under|as|to|via|through)\b/iu;
// Other qualifiers do not need an explicit "if" to make a rate non-flat.
// Unclassified eligibility/payment/time/charge wording also takes the existing
// verbatim-listing fallback, even when it could be part of a genuine item name.
// Only the separately recognized tax/contact sentences below are accepted.
const uncertainPricePrefix=/\b(?:terms?|restrictions?|requiring|could|ballpark|suggested|provisional|preliminary|tentative|indicative|negotiated|agreed|normally|usually|typically|yearly|plus|except)\b|\bcan\s+(?:change|vary|depend|be|cost)\b/iu;
const unclassifiedPricePrefix=/\b(?:prepaid|prepay(?:ment)?|paid|cash|deposit|payment|financ(?:e|ing)|credit|coupon|rebate|refund|surcharge|fee(?:s)?|member(?:s|ship)?|subscriber(?:s)?|resident(?:s)?|senior(?:s)?|student(?:s)?|eligible|eligibility|qualif(?:y|ies|ied|ying)|approved|approval|consent|required|requires?|requirement(?:s)?|must|may|might|would|should|valid|available|availability|stock|limited|advance|prebooked|weekday(?:s)?|weekend(?:s)?|daily|weekly|monthly|annually|seasonal|monday|tuesday|wednesday|thursday|friday|saturday|sunday|holiday(?:s)?|included?|including|inclusive|excluded?|excluding|exclusive|billed|separately|terms|appl(?:y|ies|icable)|var(?:y|ies|iable)|negotiable|approximate(?:ly)?|estimated?|roughly|bulk|wholesale)\b/iu;
// Only numbers with a recognizable product-name role may precede the one
// saved unit price. Any remaining number might be a quantity or condition.
const withoutProductNumbers=item=>item
 .replace(/\b\d+\s*[x×]\s*\d+\b/giu,'')
 .replace(/\bgrade\s+\d+\b/giu,'')
 .replace(/\b\d+\/\d+\s+inch(?:es)?\b/giu,'')
 .replace(/#\d+\b/giu,'');
// A unit is one word, or a standard two-word measure (square foot, linear
// foot, cubic yard...). Any other second word ("per hour minimum", "per item
// daily", "per sqft twice") can change the charge, so it is not multiplied.
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
   // A qualification anywhere before the price can change the charge. Even
   // genuine item names such as "Half-round gutter" must be repeated as saved.
   const item=match.groups.item||'';
   // Normalize qualification detection only; saved identity, product numbers,
   // currencies and the exact arithmetic below retain their original spelling.
   const qualification=item.normalize('NFKC');
   if(price||qualifiedPricePrefix.test(withoutProductNumbers(item))||conditionalPricePrefix.test(qualification)||prepositionalPricePrefix.test(qualification)||uncertainPricePrefix.test(qualification)||unclassifiedPricePrefix.test(qualification))return refusal();
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
