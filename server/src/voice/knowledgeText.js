// The prompt and listed-price calculator must see exactly the same saved facts.
export function rewriteKnowledgeText(value){
 if(typeof value!=='string')return '';
 return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\r\n?/g,'\n')
  .split('\n').map(line=>line.split(/(?<=[.!?])\s+/).map(sentence=>{
   // Check the original sentence before changing or discarding any contact
   // wording: the communication channel itself can qualify a financial offer.
   // A condition can continue the preceding price sentence without repeating
   // its amount or financial terms, so preserve explicit conditions as well.
   if(/\b(?:if|unless|provided|providing|conditional\s+on|subject\s+to|requir(?:e[sd]?|ing))\b/i.test(sentence))return sentence;
   // The existing free-estimate invitation is rewritable only when it already
   // explicitly permits calls; other free offers can have channel conditions.
   const ordinaryContact=/^(?:call or text|text or call) for (?:a )?free (?:estimate|quote)[.!?]?$/i.test(sentence.trim());
   if(!ordinaryContact&&/[$€£¥%]|\b(?:CAD|USD|EUR|GBP|AUD|NZD|dollars?|cents?|tax(?:es|able)?|HST|GST|PST|VAT|fees?|minimums?|maximums?|min|max|prices?|pricing|percent(?:age)?|costs?|rates?|discount(?:s|ed)?|surcharges?|charges?|rebates?|refunds?|deposits?|payments?|pay|paying|paid|bill(?:s|ing)?|invoices?|credits?|balances?|coupons?|promos?|promotions?|sales?|specials?|deals?|sav(?:e[sd]?|ings?)|financing|instalments?|installments?|gratuities|interest|free)\b|\bhalf\s+off\b/i.test(sentence))return sentence;
   if(/^(?:automatic|automated) (?:SMS|text|email|booking)?\s*(?:messages?|reminders?|confirmations?) (?:are )?available[.!?]?$/i.test(sentence.trim()))return '';
   if(/^(?:(?:automatic|automated) )?(?:SMS|text(?: message)?) (?:messages?|reminders?|confirmations?) (?:are )?available[.!?]?$/i.test(sentence.trim()))return '';
   if(/^(?:we|i)(?:'ll| will| can)? (?:text|sms) you\b[^.!?]*[.!?]?$/i.test(sentence.trim()))return '';
   const offer=/^(?:(?:we|i)(?:'ll| will| can)?\s+)?(?:send|offer|provide|email)\s+(?:you\s+)?(?:(?:automatic|automated)\s+)?(?:a text\b|texts\b|texting\b|sms\b|text (?:messages?|confirmations?|reminders?)\b|(?:automated|automatic|booking) reminders?\b|booking confirmations?\b)[^.!?]*[.!?]?$/i;
   const receipt=/^you(?:'ll| will| can)? (?:get|receive)\s+(?:a text\b|texts\b|texting\b|sms\b|text (?:messages?|confirmations?|reminders?)\b|(?:automated|automatic|booking) reminders?\b|booking confirmations?\b)[^.!?]*[.!?]?$/i;
   if(offer.test(sentence.trim())||receipt.test(sentence.trim()))return '';
   return sentence.replace(/\b(?:call or text|text or call)\b/gi,match=>/^[A-Z]/.test(match)?'Call':'call')
    .replace(/\btext (us|me)\b/gi,(match,person)=>(/^[A-Z]/.test(match)?'Call ':'call ')+person);
  }).filter(Boolean).join(' ').trim()).join('\n').trim();
}
