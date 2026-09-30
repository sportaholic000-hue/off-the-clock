import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogMode,pricingEnvelope,createWidgetRequest,widgetBranding,validInstant,validSchedule,validSlot,validAppointment,safeExternalUrl} from '../src/widgetTransport.js';
const catalog={services:[],contractVersion:'2026-09-29.1',capabilities:{quoteEnvelope:'pricing-only-v2',booking:'booking-v1',postQuoteIdentity:true,serverPricingOnly:true}};
test('versioned catalogs cannot silently mix quote formats',()=>{
 assert.equal(catalogMode({services:[]}), 'legacy');
 assert.equal(catalogMode(catalog),'pricing-only-v2');
 assert.throws(()=>catalogMode({...catalog,contractVersion:'unknown'}),/needs an update/);
 assert.throws(()=>catalogMode({...catalog,capabilities:{...catalog.capabilities,quoteEnvelope:'unknown'}}),/needs an update/);
});
test('the new envelope omits only blank fields, never supplied work or unexpected shapes',()=>{
 const blank={contact:{email:'synthetic@example.invalid',name:''},location:{addressLine1:'',city:''},customerInputs:{yardSqft:125.125}};
 assert.deepEqual(pricingEnvelope(blank,'pricing-only-v2'),{contact:{email:'synthetic@example.invalid'},customerInputs:{yardSqft:125.125}});
 assert.equal(blank.contact.name,'');
 for(const original of [
  {contact:{name:'No name please',email:'synthetic@example.invalid'},location:{addressLine1:'[SYNTHETIC] The area is not measured.'}},
  {contact:{email:'synthetic@example.invalid',unexpected:{work:'[SYNTHETIC] Additional work'}},location:{unexpected:''}},
  {contact:'[SYNTHETIC] Invalid contact shape',location:['[SYNTHETIC] Original location']},
 ])assert.deepEqual(pricingEnvelope(original,'pricing-only-v2'),original);
 assert.deepEqual(pricingEnvelope(blank,'legacy'),blank);
});
test('public transport preserves decimals and sends no owner authentication',async t=>{
 let received;t.mock.method(globalThis,'fetch',async(url,options)=>{received={url:String(url),options};return new Response(JSON.stringify({saved:true}),{status:200});});
 const body={customerInputs:{yardSqft:125.125},requestId:'same-request'};
 await createWidgetRequest('https://quotes.example')('/api/public/quote/key',{method:'POST',body,auth:true});
 assert.equal(received.options.credentials,'omit');assert.equal(received.options.headers.authorization,undefined);assert.equal(received.options.body,JSON.stringify(body));
});
test('booking requests preserve their explicit idempotency key',async t=>{
 let options;t.mock.method(globalThis,'fetch',async(_url,value)=>{options=value;return new Response('{"status":"HELD"}');});
 await createWidgetRequest('https://quotes.example')('/api/public/bookings/token/holds',{method:'POST',body:{slotId:'opaque-slot'},idempotencyKey:'same-key'});
 assert.equal(options.headers['Idempotency-Key'],'same-key');assert.equal(options.headers.authorization,undefined);
});
test('public paths cannot escape into authenticated routes or insecure production origins',async()=>{
 const request=createWidgetRequest('https://quotes.example');
 await assert.rejects(request('/api/auth/me'),/Unsupported/);
 await assert.rejects(request('/api/public/quote/../../auth/me'),/Unsupported/);
 await assert.rejects(request('https://elsewhere.example/api/public/quote/key'),/Unsupported/);
 assert.throws(()=>createWidgetRequest('http://quotes.example'),/HTTPS/);
 assert.equal(typeof createWidgetRequest('http://127.0.0.1:4590'),'function');
});
test('definite booking failures preserve their server code',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'Time unavailable',code:'SLOT_UNAVAILABLE'}),{status:409}));
 await assert.rejects(createWidgetRequest('https://quotes.example')('/api/public/bookings/token/holds',{method:'POST',body:{slotId:'id'}}),error=>error.status===409&&error.code==='SLOT_UNAVAILABLE');
});
test('invalid successful acknowledgements remain errors',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('not json',{status:200}));
 await assert.rejects(createWidgetRequest('https://quotes.example')('/api/public/quote/key'),/could not be confirmed/);
});
test('branding permits flat colors and normalized call numbers, not script destinations',()=>{
 assert.equal(widgetBranding({clickToCallNumber:'javascript:alert(1)',accentColor:'url(evil)'}).phone,null);
 assert.equal(widgetBranding({accentColor:'linear-gradient(red,blue)'}).accentColor,'#00E676');
 assert.equal(widgetBranding({accentColor:'#123ABC',clickToCallNumber:'+15550101234'}).phone,'+15550101234');
 assert.equal(safeExternalUrl('javascript:alert(1)'),null);assert.equal(safeExternalUrl('https://user:pass@example.com'),null);
 assert.equal(safeExternalUrl('https://booking.example/visit'),'https://booking.example/visit');
});
test('calendar data must contain valid explicit UTC instants and a valid timezone',()=>{
 assert.ok(validSchedule({bookingMode:'site_visit_first',timezone:'America/Halifax'}));
 assert.equal(validSchedule({bookingMode:'book_job',timezone:'Not/A_Timezone'}),false);
 assert.ok(validInstant('2030-10-02T13:00:00.000Z'));
 for(const value of ['2030-02-31T13:00:00Z','2030-10-02T24:00:00Z','2030-10-02T13:00:00','October 2, 2030Z'])assert.equal(validInstant(value),false,value);
});
test('only a confirmed calendar appointment for the selected server slot may display booked',()=>{
 const slot={slotId:'opaque-slot',label:'[SYNTHETIC] Test time',startUtc:'2030-10-02T13:00:00.000Z',endUtc:'2030-10-02T14:00:00.000Z'};
 assert.ok(validSlot(slot));assert.equal(validSlot({...slot,endUtc:slot.startUtc}),false);
 const confirmed={status:'CONFIRMED',appointmentId:'appointment',calendarEventStatus:'CONFIRMED',bookingMode:'site_visit_first',timezone:'UTC',startUtc:slot.startUtc,endUtc:slot.endUtc};
 assert.ok(validAppointment(confirmed,slot));
 assert.equal(validAppointment({...confirmed,status:'PENDING_CONFIRMATION'},slot),false);
 assert.equal(validAppointment({...confirmed,calendarEventStatus:'PENDING_CONFIRMATION'},slot),false);
 assert.equal(validAppointment({...confirmed,startUtc:'2030-10-02T13:30:00.000Z'},slot),false);
});
