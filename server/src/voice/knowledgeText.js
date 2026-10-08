// The prompt and listed-price calculator must see exactly the same saved facts.
export function rewriteKnowledgeText(value){
 if(typeof value!=='string')return '';
 return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/\r\n?/g,'\n')
  .replace(/\b(?:call or text|text or call)\b/gi,match=>/^[A-Z]/.test(match)?'Call':'call')
  .replace(/\btext (us|me)\b/gi,(match,person)=>(/^[A-Z]/.test(match)?'Call ':'call ')+person)
  .split('\n').map(line=>line.split(/(?<=[.!?])\s+/).filter(sentence=>{
   // Financial conditions are never discarded, even when communications are
   // mentioned in the same sentence. Ordinary uses of "text" are also facts.
   if(/[$€£¥%]|\b(?:CAD|USD|dollars?|cents?|tax(?:es)?|HST|GST|fees?|minimums?|prices?|percent(?:age)?|costs?|rates?)\b/i.test(sentence))return true;
   if(/^(?:automatic|automated) (?:SMS|text|email|booking)?\s*(?:messages?|reminders?|confirmations?) (?:are )?available[.!?]?$/i.test(sentence.trim()))return false;
   if(/^(?:(?:automatic|automated) )?(?:SMS|text(?: message)?) (?:messages?|reminders?|confirmations?) (?:are )?available[.!?]?$/i.test(sentence.trim()))return false;
   if(/^(?:we|i)(?:'ll| will| can)? (?:text|sms) you\b[^.!?]*[.!?]?$/i.test(sentence.trim()))return false;
   const offer=/^(?:(?:we|i)(?:'ll| will| can)?\s+)?(?:send|offer|provide|email)\s+(?:you\s+)?(?:(?:automatic|automated)\s+)?(?:a text\b|texts\b|texting\b|sms\b|text (?:messages?|confirmations?|reminders?)\b|(?:automated|automatic|booking) reminders?\b|booking confirmations?\b)[^.!?]*[.!?]?$/i;
   const receipt=/^you(?:'ll| will| can)? (?:get|receive)\s+(?:a text\b|texts\b|texting\b|sms\b|text (?:messages?|confirmations?|reminders?)\b|(?:automated|automatic|booking) reminders?\b|booking confirmations?\b)[^.!?]*[.!?]?$/i;
   return !offer.test(sentence.trim())&&!receipt.test(sentence.trim());
  }).join(' ').trim()).join('\n').trim();
}
