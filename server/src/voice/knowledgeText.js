// The prompt and listed-price calculator must see exactly the same saved facts.
export function rewriteKnowledgeText(value){
 if(typeof value!=='string')return '';
 const financial=/[$€£¥%]|\b(?:CAD|USD|EUR|GBP|AUD|NZD|dollars?|cents?|tax(?:es|able)?|HST|GST|PST|VAT|fees?|minimums?|maximums?|min|max|prices?|pricing|percent(?:age)?|costs?|rates?|discount(?:s|ed)?|surcharges?|charges?|rebates?|refunds?|deposits?|payments?|pay|paying|paid|bill(?:s|ing)?|invoices?|credits?|balances?|coupons?|promos?|promotions?|sales?|specials?|deals?|sav(?:e[sd]?|ings?)|financing|instalments?|installments?|gratuities|interest|free)\b|\bhalf\s+off\b/i;
 // A contact-only invitation tells the reader to call, text, email or message
 // the business for a quote, pricing, details or booking. The caller is already
 // on the call, so it is removed. A sentence that adds anything else (an
 // amount, a discount, a condition, a named service) never matches and is kept.
 // The purpose may come before the contact instruction ("For a free estimate,
 // call us.") or after it ("Call us to get a free estimate."). The grammar is
 // closed: any other word (an amount, a condition, "emergencies") keeps the
 // sentence.
 const when='(?:\\s+(?:today|now|anytime|any\\s+time|24\\/7))?';
 const address='(?:\\s+(?:(?:at|on)\\s+)?(?:[+\\d(][\\d()\\s.\\-]{5,20}\\d|[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+))?';
 const purpose='(?:for|to\\s+(?:get|request|receive|arrange))\\s+(?:(?:a|an|your|our|more|additional)\\s+)?'+
  '(?:(?:free|no[-\\s]obligation)(?:\\s*,?\\s*(?:and\\s+)?(?:free|no[-\\s]obligation))?\\s+)?'+
  '(?:quotes?|estimates?|consultations?|inspections?|assessments?|pricing|prices?|rates?|details|information|info|hours|access|availability|appointments?)'+
  '|to\\s+(?:book|schedule|set\\s+up)(?:\\s+(?:a|an|your)\\s+(?:appointment|estimate|visit|consultation|service|job|quote|inspection))?';
 const contact='(?:please\\s+)?(?:'+
  '(?:call|text|email|e-mail|message|phone|contact|ring)(?:\\s+or\\s+(?:call|text|email|e-mail|message))?(?:\\s+(?:us|me))?'+
  '|give\\s+(?:us|me)\\s+a\\s+(?:call|ring)|get\\s+in\\s+touch(?:\\s+with\\s+(?:us|me))?|reach\\s+out(?:\\s+to\\s+(?:us|me))?|drop\\s+(?:us|me)\\s+a\\s+(?:line|message|note)'+
  ')'+when+address+when;
 const contactOnly=new RegExp('^(?:(?:'+purpose+')\\s*,?\\s+)?'+contact+'(?:\\s+(?:'+purpose+'))?'+when+'[.!?]?$','i');
 return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\r\n?/g,'\n')
  .split(/\n\s*\n/).map(paragraph=>paragraph.split('\n').map(line=>line.split(/(?<=[.!?])\s+/).map(sentence=>{
   // Check the original sentence before changing or discarding any contact
   // wording: the communication channel itself can qualify a financial offer.
   // A condition can continue the preceding price sentence without repeating
   // its amount or financial terms, so preserve explicit conditions as well.
   if(/\b(?:if|unless|provided|providing|conditional\s+on|subject\s+to|requir(?:e[sd]?|ing))\b/i.test(sentence))return sentence;
   // A closed contact-only invitation is removed before the financial check:
   // "for a free estimate" or "for pricing" adds no offer the caller can use on
   // this call, while amounts, discounts and other offers never match it.
   if(contactOnly.test(sentence.trim()))return '';
   if(financial.test(sentence))return sentence;
   if(/^(?:automatic|automated) (?:SMS|text|email|booking)?\s*(?:messages?|reminders?|confirmations?) (?:are )?available[.!?]?$/i.test(sentence.trim()))return '';
   if(/^(?:(?:automatic|automated) )?(?:SMS|text(?: message)?) (?:messages?|reminders?|confirmations?) (?:are )?available[.!?]?$/i.test(sentence.trim()))return '';
   if(/^(?:we|i)(?:'ll| will| can)? (?:text|sms) you\b[^.!?]*[.!?]?$/i.test(sentence.trim()))return '';
   const offer=/^(?:(?:we|i)(?:'ll| will| can)?\s+)?(?:send|offer|provide|email)\s+(?:you\s+)?(?:(?:automatic|automated)\s+)?(?:a text\b|texts\b|texting\b|sms\b|text (?:messages?|confirmations?|reminders?)\b|(?:automated|automatic|booking) reminders?\b|booking confirmations?\b)[^.!?]*[.!?]?$/i;
   const receipt=/^you(?:'ll| will| can)? (?:get|receive)\s+(?:a text\b|texts\b|texting\b|sms\b|text (?:messages?|confirmations?|reminders?)\b|(?:automated|automatic|booking) reminders?\b|booking confirmations?\b)[^.!?]*[.!?]?$/i;
   if(offer.test(sentence.trim())||receipt.test(sentence.trim()))return '';
   return sentence;
  }).filter(Boolean).join(' ').trim()).filter(Boolean).join('\n').trim()).filter(Boolean).join('\n\n');
}
