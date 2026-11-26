import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {httpFixture,seedViews} from './leadCaptureRepair20261006HttpFixture.mjs';

// Owner app wording found in the November 26 walkthrough. Real server, database and
// compiled app in Chromium. HANDWRITTEN EXPECTATIONS, before execution:
// - sign-up shows "By creating an account, you agree to the Terms of Service and
//   Privacy Policy." with both linked to the public pages; sign-in does not;
// - one call is counted "1 call", not "1 calls";
// - Leads is headed ACTIVITY, Quotes stays QUOTEDONE;
// - a Starter owner's menu has no Quotes, whose data Starter is refused;
// - the business hours help mentions transfers and booking only on plans that have them.
test('owner app wording: terms notice, counts, leads heading, Starter menu',{timeout:180000},async t=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
  const f=await httpFixture(t);await seedViews(f);
  f.db.prepare("UPDATE users SET plan='Starter' WHERE id='synthetic-b'").run();
  const page=await browser.newPage({viewport:{width:390,height:900}});
  await page.goto(f.base+'/signup');
  const notice=page.locator('p.signup-terms');await notice.waitFor();
  assert.equal(await notice.innerText(),'By creating an account, you agree to the Terms of Service and Privacy Policy.');
  assert.equal(await notice.getByRole('link',{name:'Terms of Service'}).getAttribute('href'),'https://www.offtheclockai.com/terms/');
  assert.equal(await notice.getByRole('link',{name:'Privacy Policy'}).getAttribute('href'),'https://www.offtheclockai.com/privacy/');
  await page.goto(f.base+'/login');await page.getByRole('button',{name:'Forgot password?'}).waitFor();
  assert.equal(await page.locator('p.signup-terms').count(),0,'not on sign-in');
  await page.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);
  await page.goto(f.base+'/calls');await page.getByText('1 call',{exact:true}).waitFor();
  await page.goto(f.base+'/leads');await page.getByRole('heading',{name:'Leads',exact:true}).waitFor();
  assert.equal(await page.locator('.page-header .eyebrow, header .eyebrow').first().innerText(),'ACTIVITY');
  await page.goto(f.base+'/quotes');await page.getByRole('heading',{name:'Quotes',exact:true}).waitFor();
  assert.equal(await page.locator('.page-header .eyebrow, header .eyebrow').first().innerText(),'QUOTEDONE');
  const full=await browser.newPage({viewport:{width:1280,height:900}});
  await full.goto(f.base+'/login');await full.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-a']);
  await full.goto(f.base+'/dashboard');await full.locator('button.nav-item',{hasText:'Leads'}).first().waitFor();
  assert.equal(await full.locator('button.nav-item',{hasText:/^Quotes$/}).count(),1,'QuoteDone menu keeps Quotes');
  const desk=await browser.newPage({viewport:{width:1280,height:900}});
  await desk.goto(f.base+'/login');await desk.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens['synthetic-b']);
  await desk.goto(f.base+'/dashboard');await desk.locator('button.nav-item',{hasText:'Leads'}).first().waitFor();
  assert.equal(await desk.locator('button.nav-item',{hasText:/^Quotes$/}).count(),0,'Starter menu has no Quotes');
  assert.ok(await desk.locator('button.nav-item',{hasText:'Leads'}).count()>0);
  // Business hours help names only what the plan has.
  await desk.goto(f.base+'/settings?section=knowledge');await desk.locator('fieldset.business-hours').waitFor();
  assert.match(await desk.locator('fieldset.business-hours p').first().innerText(),/^Your receptionist tells callers these hours, and the after-hours report uses them\. Times are in /);
  await full.goto(f.base+'/settings?section=knowledge');await full.locator('fieldset.business-hours').waitFor();
  assert.match(await full.locator('fieldset.business-hours p').first().innerText(),/^Your receptionist tells callers these hours\. Transfers, booking and the after-hours report use them too, unless you choose different hours there\. Times are in /);
});
