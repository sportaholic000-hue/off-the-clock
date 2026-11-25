// Emails the customer confirmed for a saved quote: the one given with the
// quote, and any given when booking that quote (an appointment or a
// preferred-time request on its booking link). A customer quoted by phone or
// with only a phone often gives their email when booking (Neon audit of v51,
// V51-6). query is an owner-scoped query function (sql => statement).
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
export function confirmedQuoteEmails(query,ownerId,quoteId,contactEmail){
  const out=[];
  const add=value=>{if(typeof value!=='string')return;const email=value.trim().toLowerCase();if(EMAIL.test(email)&&email.length<=254&&!out.includes(email))out.push(email);};
  add(contactEmail);
  for(const row of query('SELECT customerJson FROM appointments WHERE ownerId=? AND quoteId=? ORDER BY createdAt,id').all(ownerId,quoteId))add(parse(row.customerJson)?.email);
  for(const row of query(`SELECT p.customerJson FROM bookingPreferences p JOIN bookingIntents i ON i.ownerId=p.ownerId AND i.id=p.intentId
    WHERE p.ownerId=? AND i.sourceType='quote' AND i.sourceId=? ORDER BY p.createdAt,p.id`).all(ownerId,quoteId))add(parse(row.customerJson)?.email);
  return out;
}
