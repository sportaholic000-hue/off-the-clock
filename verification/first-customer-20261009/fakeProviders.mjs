// Synthetic provider boundary for the first-customer rehearsal.
// Calendar behavior comes from the repository's bookingCalendarProvider20261006
// test fixture. Resend responses use the same fake delivery shape as
// test/accountEmail.spec.mjs; no provider network request is allowed.
const savedNodeEnv=process.env.NODE_ENV;
process.env.NODE_ENV='test';
await import('../../test/fixtures/bookingCalendarProvider20261006.mjs');
process.env.NODE_ENV=savedNodeEnv;
import {readFileSync,writeFileSync} from 'node:fs';
const calendarFetch=globalThis.fetch;
const statePath=process.env.FIRST_CUSTOMER_MAIL_LOG;
globalThis.fetch=async (raw,options={})=>{
  const url=new URL(raw);
  if(url.origin==='https://api.resend.com'){
    if(url.pathname!=='/emails'||options.method!=='POST')throw Error('Unexpected synthetic email request');
    const state=JSON.parse(readFileSync(statePath,'utf8'));
    const message=JSON.parse(options.body);
    if(!message.to.every(address=>address.endsWith('@example.invalid')))throw Error('Synthetic recipients only');
    state.push({to:message.to,subject:message.subject,text:message.text,idempotencyKey:new Headers(options.headers).get('idempotency-key')});
    writeFileSync(statePath,JSON.stringify(state,null,2));
    return new Response(JSON.stringify({id:'SYNTHETIC_EMAIL_'+state.length}),{status:200,headers:{'content-type':'application/json'}});
  }
  return calendarFetch(raw,options);
};
