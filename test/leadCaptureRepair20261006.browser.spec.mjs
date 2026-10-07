import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {httpFixture,seedViews} from './leadCaptureRepair20261006HttpFixture.mjs';

// Chromium is required, exactly as in the existing hosted strict gate. Missing
// local executables are an environment failure, never a passing/skipped test.
test('lead capture repairs: production owner app navigation, stored contacts and live feed',{timeout:110000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t),s=await seedViews(f),errors=[];
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(f.base+'/login');await page.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);
  await t.test('owner deep link, browser refresh and Calls Refresh retain saved request and urgency',async()=>{
    await page.goto(f.base+'/calls?record='+s.c.callSid);await page.getByRole('heading',{name:'Leads',exact:true}).waitFor();
    let text=await page.locator('main').innerText();for(const value of [s.notes,'preferred@example.invalid','+19025550199','Gate can fall.','notification has not been confirmed'])assert.ok(text.includes(value),value);
    await page.reload();await page.getByRole('heading',{name:'Leads',exact:true}).waitFor();assert.ok((await page.locator('main').innerText()).includes(s.notes));
    f.advance(2000);await f.voice(s.c).tool('captureLead',{notes:'[SYNTHETIC] Corrected callback notes'});await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('[SYNTHETIC] Corrected callback notes',{exact:false}).first().waitFor();
  });
  await t.test('staff receives instant callback contact and corrected lead contact with no private pricing evidence',async()=>{
    await page.evaluate(token=>{localStorage.setItem('otc_token',token);window.dispatchEvent(new Event('otc:session'));},f.tokens['synthetic-staff']);
    await page.goto(f.base+'/quotes?record=synthetic-http-quote');await page.getByText('instant@example.invalid',{exact:true}).waitFor();
    let text=await page.locator('main').innerText();assert.ok(text.includes('+19025550188'));assert.ok(text.includes('221.23'));assert.doesNotMatch(text,/SECRET_COST|SECRET_RATE|Owner-only/);
    await page.goto(f.base+'/leads?record='+s.row.id);await page.getByRole('heading',{name:'[SYNTHETIC] Gate follow-up',exact:true}).waitFor();text=await page.locator('main').innerText();assert.ok(text.includes('preferred@example.invalid'));assert.ok(text.includes('+19025550199'));assert.ok(text.includes('original@example.invalid'));assert.doesNotMatch(text,/SECRET_COST|SECRET_RATE|Owner-only/);
  });
  // Separate browser context for feed timing and tenant switching. Session
  // selection is a one-time write; reload must preserve the chosen identity.
  await page.close();const live=await browser.newPage();live.on('pageerror',error=>errors.push(error.message));
  await live.goto(f.base+'/login');await live.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);
  await live.clock.install();
  await t.test('open dashboard renders a newly persisted call, then its feed link survives production reload',async()=>{
    await live.goto(f.base+'/dashboard');await live.getByText('[SYNTHETIC] Initial captured gate',{exact:true}).waitFor();
    const newCall=f.context();f.db.prepare("UPDATE calls SET summaryText='[SYNTHETIC] Newly saved callback',createdAt='2026-10-06T12:05:00.000Z' WHERE ownerId=? AND id=?").run(newCall.ownerId,newCall.callSid);
    await f.voice(newCall).tool('captureLead',{notes:'[SYNTHETIC] New feed request'});await live.clock.runFor(5200);
    await live.getByText('[SYNTHETIC] Newly saved callback',{exact:true}).waitFor({timeout:10000});assert.equal(f.feedRequests.length,1);
    await live.getByRole('button').filter({hasText:'[SYNTHETIC] Newly saved callback'}).click();await live.getByRole('heading',{name:'Leads',exact:true}).waitFor();assert.equal(new URL(live.url()).searchParams.get('record'),newCall.callSid);
    await live.reload();await live.getByRole('heading',{name:'Leads',exact:true}).waitFor();assert.ok((await live.locator('main').innerText()).includes('New feed request'));
    const stopped=f.feedRequests.length;await live.clock.runFor(16000);assert.equal(f.feedRequests.length,stopped);
  });
  await t.test('tenant change discards old in-flight feed data and cleans up previous tenant timers',async()=>{
    let release,startedResolve;const started=new Promise(resolve=>{startedResolve=resolve;});
    f.setFeedHook(async(req,res)=>{if(req.headers.authorization!=='Bearer '+f.tokens['synthetic-a'])return false;release=()=>res.json(f.service.dashboard('synthetic-a'));startedResolve();return true;});
    f.db.prepare("UPDATE calls SET summaryText='[SYNTHETIC] OTHER OWNER FEED' WHERE ownerId=? AND id=?").run(s.foreign.ownerId,s.foreign.callSid);
    await live.goto(f.base+'/dashboard');await live.getByText('[SYNTHETIC] Initial captured gate',{exact:true}).waitFor();await live.clock.runFor(5200);await started;
    await live.evaluate(token=>{localStorage.setItem('otc_token',token);window.dispatchEvent(new Event('otc:session'));},f.tokens['synthetic-b']);
    await live.getByText('[SYNTHETIC] OTHER OWNER FEED',{exact:true}).waitFor();release();await live.clock.runFor(100);
    assert.doesNotMatch(await live.locator('main').innerText(),/Initial captured gate|Newly saved callback|preferred@example.invalid/);
    const oldReads=f.feedRequests.filter(row=>row.authorization==='Bearer '+f.tokens['synthetic-a']).length;f.setFeedHook(null);await live.clock.runFor(5200);assert.equal(f.feedRequests.filter(row=>row.authorization==='Bearer '+f.tokens['synthetic-a']).length,oldReads);
    await live.getByRole('button').filter({hasText:'[SYNTHETIC] OTHER OWNER FEED'}).click();await live.getByRole('heading',{name:'Leads',exact:true}).waitFor();const stopped=f.feedRequests.length;await live.clock.runFor(16000);assert.equal(f.feedRequests.length,stopped);
  });
  assert.deepEqual(errors,[]);assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=?').get(s.c.ownerId).resultJson,s.receipt);
});
