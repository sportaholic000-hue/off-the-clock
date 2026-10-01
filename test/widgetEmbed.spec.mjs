import test from 'node:test';
import assert from 'node:assert/strict';
import {createWidgetRequest} from '../client/src/widgetTransport.js';

test('widget network failures explain how to retry without exposing browser errors',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Failed to fetch');});
 await assert.rejects(createWidgetRequest('https://quotes.example')('/api/public/quote/synthetic-key'),error=>{
  assert.match(error.message,/could not connect|could not be reached|unable to connect/i);
  assert.match(error.message,/retry/i);
  assert.doesNotMatch(error.message,/Failed to fetch|NetworkError|Load failed/);
  return true;
 });
});
test('widget preserves a definite validation rejection and original decimal request',async t=>{
 let sent;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  sent={url:String(url),...options};
  return new Response(JSON.stringify({error:'Check the job details.',code:'INVALID_REQUEST',details:{fields:['yardSqft']}}),{status:422});
 });
 const body={requestId:'synthetic-request',customerInputs:{yardSqft:125.125},contact:{email:'synthetic@example.invalid'}};
 await assert.rejects(createWidgetRequest('https://quotes.example')('/api/public/quote/synthetic-key',{method:'POST',body}),error=>error.status===422&&error.code==='INVALID_REQUEST'&&error.details.fields[0]==='yardSqft');
 assert.equal(sent.body,JSON.stringify(body));assert.equal(sent.credentials,'omit');assert.equal(sent.headers.authorization,undefined);
});
test('widget retry keeps the original booking idempotency key',async t=>{
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests.push(options);if(requests.length===1)throw new TypeError('NetworkError');
  return new Response(JSON.stringify({status:'REQUESTED',preferenceRequestId:'synthetic-preference'}));
 });
 const request=createWidgetRequest('https://quotes.example'),options={method:'POST',body:{preferredWindows:[{date:'2030-10-02',timeOfDay:'morning'}]},idempotencyKey:'synthetic-same-key'};
 await assert.rejects(request('/api/public/bookings/synthetic-token/preference',options));
 assert.equal((await request('/api/public/bookings/synthetic-token/preference',options)).status,'REQUESTED');
 assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
});

test('unavailable public quote access shows customer wording without changing rejection metadata',async t=>{
 let status=403;
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'QuoteDone or Scale is required',code:'ACCESS_UNAVAILABLE'}),{status}));
 const request=createWidgetRequest('https://quotes.example');
 for(status of [403,404])await assert.rejects(request('/api/public/quote/synthetic-key'),error=>error.message==='Online estimates are unavailable from this page. Please contact the business.'&&error.status===status&&error.code==='ACCESS_UNAVAILABLE');
 status=403;
 await assert.rejects(request('/api/public/bookings/synthetic-token/availability'),error=>error.message==='QuoteDone or Scale is required'&&error.status===403&&error.code==='ACCESS_UNAVAILABLE');
});
