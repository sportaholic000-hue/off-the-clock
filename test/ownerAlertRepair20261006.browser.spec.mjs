import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';

test('owner alert repairs: production dashboard, Calls, retry and staff visibility',{timeout:90000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t),c=f.context(),words='[SYNTHETIC] Please call after six about the broken latch.';
  await f.voice(c).tool('captureLead',{callbackRequested:true,notes:words});f.db.prepare("UPDATE ownerAlerts SET status='FAILED',lastErrorCode='SYNTHETIC_PROVIDER_OUTAGE' WHERE ownerId=?").run(c.ownerId);
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(f.base+'/login');await p.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);
  await t.test('dashboard surfaces saved failures and Calls shows caller words through deep link/reload',async()=>{
    await p.goto(f.base+'/dashboard');await p.getByRole('heading',{name:'Owner notifications',exact:true}).waitFor();assert.ok((await p.locator('main').innerText()).includes('SYNTHETIC_PROVIDER_OUTAGE'));
    await p.goto(f.base+'/calls?record='+c.callSid);await p.getByRole('heading',{name:'Callback requests',exact:true}).waitFor();await p.reload();await p.getByRole('heading',{name:'Callback requests',exact:true}).waitFor();assert.ok((await p.locator('main').innerText()).includes(words));
  });
  await t.test('owner retries a stored failure, fake provider accepts once, and UI distinguishes acceptance from receipt',async()=>{
    // A click resolves before the asynchronous route commits. Run the fake
    // worker only after the real retry response, matching the production worker
    // which consumes persisted PENDING events rather than a UI click.
    const [retryResponse]=await Promise.all([p.waitForResponse(r=>r.request().method()==='POST'&&/\/api\/owner-alerts\/[^/]+\/retry$/.test(new URL(r.url()).pathname)),p.getByRole('button',{name:'Retry owner alert',exact:true}).first().click()]);
    assert.equal(retryResponse.status(),200);assert.equal((await retryResponse.json()).status,'PENDING');
    const accepted=new Set(),w=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,environment:{EMAIL_FROM:'alerts@example.invalid'},ready:()=>true,send:async m=>{accepted.add(m.idempotencyKey);return {accepted:true,id:'SYNTHETIC_'+m.idempotencyKey};}});
    await w.dispatchOnce();assert.equal(accepted.size,1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND status='ACCEPTED'").get(c.ownerId).n,1);await p.getByRole('button',{name:'Refresh',exact:true}).click();await p.getByText('ACCEPTED',{exact:true}).first().waitFor();const text=await p.locator('main').innerText();assert.ok(text.includes('Inbox delivery and owner reading are not confirmed'));const before=accepted.size;await w.dispatchOnce();assert.equal(accepted.size,before);
  });
  await t.test('staff reads callback and delivery states without mutation controls or foreign data',async()=>{
    await p.evaluate(token=>{localStorage.setItem('otc_token',token);window.dispatchEvent(new Event('otc:session'));},f.tokens['synthetic-staff']);await p.goto(f.base+'/calls?record='+c.callSid);await p.getByRole('heading',{name:'Callback requests',exact:true}).waitFor();assert.ok((await p.locator('main').innerText()).includes(words));assert.equal(await p.getByRole('button',{name:'Retry owner alert',exact:true}).count(),0);
  });
  assert.deepEqual(errors,[]);
});
