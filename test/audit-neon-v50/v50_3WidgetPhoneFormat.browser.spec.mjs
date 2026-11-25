// Neon audit of v50, V50-3 (November 26, 2026): the quote form accepts an
// ordinary North American number such as "(506) 555-0123", pre-fills it into
// the booking widget, and booking then refused it ("Enter the customer phone
// number in international format"). Expected, written before the fix: the
// widget books with "(506) 555-0123" typed, and the appointment stores
// +15065550123. (Same real-browser setup as bookingCalendar20261006.)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {application} from '../fixtures/bookingCalendarApplication20261006.mjs';

test('V50-3: the booking widget books with a phone typed as (506) 555-0123',{timeout:60000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  const s=await application(t),i=s.intent();
  const output=await build({absWorkingDir:process.cwd(),stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React from 'react';import{createRoot}from'react-dom/client';
    import{WidgetBooking}from'./client/src/widgetBooking.jsx';import{api}from'./client/src/api.js';
    const root=createRoot(document.getElementById('root'));
    window.mount=props=>root.render(<WidgetBooking {...props} request={api} cachePrefix="synthetic-booking-"/>);
  `},bundle:true,write:false,outfile:'synthetic-booking.js',format:'iife',platform:'browser',define:{'import.meta.env.VITE_API_URL':JSON.stringify(s.base),'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
  const script=output.outputFiles.find(f=>f.path.endsWith('.js')).text,styles=output.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
  const context=await browser.newContext({timezoneId:'America/Moncton',locale:'en-US'}),page=await context.newPage(),errors=[];
  await page.clock.setFixedTime(s.clock());page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===s.base?route.continue():route.abort());
  await page.route(s.base+'/synthetic-ui',route=>route.fulfill({contentType:'text/html',body:'<style>'+styles.replaceAll('</style','<\\/style')+'</style><div id="root"></div><script>'+script.replaceAll('</script','<\\/script')+'</script>'}));
  await page.goto(s.base+'/synthetic-ui');
  await page.evaluate(props=>window.mount(props),{result:{bookingToken:i.bookingToken,quoteId:i.intentId,resultType:'INSTANT_ESTIMATE_READY'},initialDraft:{customer:{...s.filters.customer,phone:'(506) 555-0123'},location:s.filters.location}});
  await page.getByLabel('Have the work or measurements changed since this estimate?').selectOption('UNCHANGED');
  await page.getByRole('button',{name:'Book it',exact:true}).click();
  await page.getByText('Times shown in America/Moncton.',{exact:true}).waitFor();
  await page.getByRole('radio').first().check();
  await page.getByRole('button',{name:'Review appointment',exact:true}).click();
  await page.getByLabel('I confirm this appointment, contact information and job site.').check();
  await page.getByRole('button',{name:'Confirm appointment',exact:true}).click();
  await page.getByText('Site visit booked',{exact:true}).waitFor();
  const row=s.db.prepare("SELECT * FROM appointments WHERE ownerId='synthetic-a'").get();
  assert.equal(row.status,'CONFIRMED');assert.equal(JSON.parse(row.customerJson).phone,'+15065550123');
  assert.deepEqual(errors,[]);
});
