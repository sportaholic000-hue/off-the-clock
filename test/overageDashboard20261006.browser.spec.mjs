import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {fixture,A} from './overageMinute20261006Fixture.mjs';
let browser,bundle;
before(async()=>{
  const result=await build({stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import {createRoot} from 'react-dom/client';import Dashboard from './client/src/dashboard.jsx';createRoot(document.getElementById('root')).render(<Dashboard/>);"},bundle:true,write:false,outdir:'synthetic-browser',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  bundle=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
after(async()=>browser?.close());
async function screen(t,usage){
  let current=usage;const page=await browser.newPage(),pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  t.after(async()=>{await page.close();assert.deepEqual(pageErrors,[],'the merged dashboard must render without uncaught errors');});
  const callActivity={total:0,calls:[],counts:{answered:0,quotes:0,bookings:0,seconds:0},notifications:[],emailAlertsConfigured:false};
  await page.route('**/*',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'});
    const value=path==='/api/dashboard'?{ownerId:A,role:'owner',operator:{enabled:false,eligible:false,missing:[]},minuteUsage:current,pricebookStatuses:[],previewActivity:null,callActivity,quoteRequestCount:0}
      :path==='/api/onboarding/state'?{profile:{onboardingStep:1,knowledgeBase:{},calendar:{}},preview:{}}
      :path==='/api/leads/activity'?callActivity
      :path==='/api/integrations/webhook'?{webhook:null,deliveries:[],dispatchEnabled:false}
      :path==='/api/integrations/webhook/deliveries'?{deliveries:[],total:0,nextOffset:null}:{};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.goto('http://synthetic.test/');await page.getByText('0 unresolved deliveries',{exact:true}).waitFor();
  const panel=page.getByRole('region',{name:'Voice minute usage'});await panel.waitFor();
  return {page,panel,update:async value=>{current=value;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));}};
}
test('real dashboard always shows zero-call usage, then refreshes the $160.30 overage and $0.30 nudge on focus',async t=>{
  const h=fixture(t);h.activate();const {panel,update}=await screen(t,h.service.snapshot(A));
  assert.match(await panel.innerText(),/Minutes used\s+0/);assert.match(await panel.innerText(),/Minutes left\s+300/);assert.match(await panel.innerText(),/Overage so far\s+\$0\.00/);
  h.call(758*60);await update(h.service.snapshot(A));await panel.getByText('Upgrading to QuoteDone would have saved you $0.30 this month',{exact:true}).waitFor();
  assert.match(await panel.innerText(),/\$160\.30/);assert.match(await panel.innerText(),/overage at \$0\.35\/min now applies/);
});
test('QuoteDone dashboard shows $0.35 overage, annual monthly allowance and no Operator upgrade nudge',async t=>{
  const h=fixture(t);h.activate(A,{plan:'QuoteDone',interval:'annual'});h.call(1201*60);const {panel}=await screen(t,h.service.snapshot(A));
  assert.match(await panel.innerText(),/Minutes used\s+1,201/);assert.match(await panel.innerText(),/Overage so far\s+\$0\.35/);assert.match(await panel.innerText(),/overage is billed monthly/);assert.doesNotMatch(await panel.innerText(),/would have saved/);
});
test('unverified period and pending historical charge are visible without an invented zero balance',async t=>{
  const h=fixture(t);h.activate();h.call(301*60);h.setTime('2026-11-20T12:00:00.000Z');h.fakes.fail('invoice');await h.service.processOwner(A);const {panel}=await screen(t,h.service.snapshot(A));
  assert.match(await panel.innerText(),/waiting for verified billing-period information/);assert.match(await panel.innerText(),/\$0\.35/);assert.match(await panel.innerText(),/will be retried safely/);assert.doesNotMatch(await panel.innerText(),/Overage so far\s+\$0\.00/);
});
