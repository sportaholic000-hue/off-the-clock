import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
let browser,bundle;
before(async()=>{
  const result=await build({stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import {createRoot} from 'react-dom/client';import Billing from './client/src/billing.jsx';createRoot(document.getElementById('root')).render(<Billing/>);"},bundle:true,write:false,outdir:'SYNTHETIC-browser',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  bundle=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
after(async()=>browser?.close());
async function screen(t,{expired=false}={}){
  const page=await browser.newPage();t.after(()=>page.close());let cancelCount=0,restoreCount=0,exports=0,cancelled=expired;
  await page.route('**/*',route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    if(path==='/settings/billing')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'});
    if(path==='/api/billing/cancel'){cancelCount++;cancelled=true;}
    if(path==='/api/billing/reactivate'){restoreCount++;cancelled=false;}
    if(path.startsWith('/api/billing/export/')){exports++;return route.fulfill({contentType:'text/csv',body:'id,customerName\r\nSYNTHETIC-id,SYNTHETIC-owner-only\r\n'});}
    const end=expired?'2020-11-20T12:00:00.000Z':'2030-11-20T12:00:00.000Z';
    const state={billingEnabled:true,providerAvailable:true,plan:'Operator',planStatus:'active',billingInterval:'monthly',trialEndsAt:null,paymentFailedAt:null,graceEndsAt:null,currentPeriodEndAt:end,cancelAtPeriodEnd:cancelled,checkoutState:'NONE',canCheckout:false,canManageBilling:true,serviceEndsAt:cancelled?end:null};
    const events={serviceEndsAt:state.serviceEndsAt,cancellation:cancelled?{state:'CONFIRMED',phoneReleaseAt:expired?'2020-12-20T12:00:00.000Z':'2030-12-20T12:00:00.000Z',exportUntilAt:expired?'2021-02-18T12:00:00.000Z':'2031-02-18T12:00:00.000Z'}:null,notices:[{id:'SYNTHETIC-notice',message:'Operator monthly: $119.00 CAD will be charged on 2030-11-20T12:00:00.000Z.',emailStatus:'DELIVERED'}]};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(path==='/api/billing/status'?state:path==='/api/billing/lifecycle'?events:{})});
  });
  await page.goto('http://synthetic.test/settings/billing?billingAction=cancel');await page.getByRole('heading',{name:'Current subscription'}).waitFor();return {page,counts:()=>({cancelCount,restoreCount,exports})};
}
test('billing screen shows exact notice amount/date and owner cancellation is one click, no GET mutation',async t=>{
  const {page,counts}=await screen(t);assert.equal(counts().cancelCount,0);assert.match(await page.getByRole('region',{name:'Billing notices'}).innerText(),/\$119.00 CAD.*2030-11-20/);
  await page.getByRole('button',{name:'Cancel plan',exact:true}).click();await page.getByRole('button',{name:'Reactivate',exact:true}).waitFor();assert.equal(counts().cancelCount,1);assert.match(await page.getByRole('region',{name:'Plan lifecycle'}).innerText(),/2030-12-20.*2031-02-18/);
});
test('reactivation refreshes dashboard from persisted backend state and permits CSV download',async t=>{
  const {page,counts}=await screen(t);await page.getByRole('button',{name:'Cancel plan',exact:true}).click();await page.getByRole('button',{name:'Reactivate',exact:true}).click();await page.getByRole('button',{name:'Cancel plan',exact:true}).waitFor();assert.equal(counts().restoreCount,1);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export leads (CSV)',exact:true}).click();assert.equal((await download).suggestedFilename(),'leads.csv');assert.equal(counts().exports,1);
});
test('expired export window disables all CSV buttons and no longer offers setup/service',async t=>{
  const {page}=await screen(t,{expired:true});for(const kind of ['leads','quotes','calls'])assert.equal(await page.getByRole('button',{name:`Export ${kind} (CSV)`,exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Continue setup',exact:true}).count(),0);assert.match(await page.getByRole('region',{name:'Plan lifecycle'}).innerText(),/forwarding shutdown is pending/i);
});
