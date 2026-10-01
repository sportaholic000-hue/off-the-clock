import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {createLaunchPlanFixture,closeLaunchPlanDatabase} from '../../test/helpers/launchPlanFixture.mjs';

const [rootArg,evidenceArg]=process.argv.slice(2);
const root=path.resolve(rootArg),evidence=path.resolve(evidenceArg);
assert.equal(fs.existsSync(evidence),false,'Use a fresh evidence directory.');
fs.mkdirSync(evidence,{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const fixture=await createLaunchPlanFixture({dist:path.join(root,'client/dist')});
const browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE});
const rows=[],errors=[];let activePage;
try {
 for(const plan of ['Operator','QuoteDone']) {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();activePage=page;page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(120000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',
    body:'<!doctype html><h1>Synthetic Stripe checkout</h1>'}));
  const email=plan.toLowerCase()+'-browser-'+crypto.randomUUID()+'@example.invalid';
  await page.goto(fixture.origin+'/onboarding',{waitUntil:'domcontentloaded'});
  assert.equal(await page.getByRole('button',{name:'Scale',exact:true}).count(),0);
  await page.getByRole('button',{name:plan,exact:true}).click();
  await page.getByLabel('Owner first name',{exact:true}).fill('Owner');
  await page.getByLabel('Business name',{exact:true}).fill('Synthetic '+plan+' business');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Password',{exact:true}).fill('launch-browser-password');
  await page.getByRole('button',{name:'Start setup',exact:true}).click();
  await page.getByRole('heading',{name:'Billing',exact:true}).waitFor();
  await page.getByText('Payment pending',{exact:true}).waitFor();
  const account=fixture.db.prepare('SELECT id,plan,planStatus,trialEndsAt FROM users WHERE email=?').get(email);
  assert.equal(account.plan,plan);assert.equal(account.planStatus,'pending_payment');assert.equal(account.trialEndsAt,null);
  assert.equal(await page.getByLabel('Plan',{exact:true}).inputValue(),plan);
  assert.equal(await page.getByLabel('Billing interval',{exact:true}).inputValue(),'monthly');
  assert.equal(await page.getByRole('option',{name:'Scale',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Continue setup',exact:true}).count(),0);
  await page.reload();
  assert.equal(await page.getByLabel('Plan',{exact:true}).inputValue(),plan);
  if(plan==='QuoteDone') {
   await page.goto(fixture.origin+'/onboarding?step=3',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Activate your QuoteDone plan',exact:true}).waitFor();
   assert.equal(await page.locator('select').filter({has:page.locator('option[value="CA"]')}).count(),0);
   await page.goto(fixture.origin+'/onboarding?step=7',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Activate your QuoteDone plan',exact:true}).waitFor();
   await page.getByRole('button',{name:'Continue to billing',exact:true}).click();
   await page.getByText('Payment pending',{exact:true}).waitFor();
  }
  const registration={...account};
  await page.getByRole('button',{name:'Continue to checkout',exact:true}).click();
  await page.getByRole('heading',{name:'Synthetic Stripe checkout',exact:true}).waitFor();
  const checkout=fixture.calls.checkout.at(-1);
  assert.equal(checkout.parameters.line_items[0].price,fixture.priceIds[plan].monthly);
  assert.equal(checkout.parameters.payment_method_collection,'always');
  // Returning alone cannot grant access.
  await page.goto(fixture.origin+'/settings/billing?checkout=success&plan=Scale',{waitUntil:'domcontentloaded'});
  await page.getByText('Payment pending',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Continue setup',exact:true}).count(),0);
  const activationEvidence=await fixture.completeCheckout(account.id);
  assert.equal(activationEvidence.first.status,200);assert.equal(activationEvidence.second.status,200);
  await page.getByRole('button',{name:'Refresh billing status',exact:true}).click();
  await page.getByText('Trial',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Resume checkout',exact:true}).count(),0);
  await page.getByRole('button',{name:'Continue setup',exact:true}).click();
  await page.getByRole('heading',{name:'What work do you do?',exact:true}).waitFor();
  await page.goto(fixture.origin+'/onboarding?step=3',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Set your jurisdiction',exact:true}).waitFor();
  const text=await page.locator('body').innerText();
  if(plan==='QuoteDone') {
   assert.equal(await page.locator('select').filter({has:page.locator('option[value="CA"]')}).count(),1);
   assert.equal(text.includes('You can add jurisdiction settings when you turn on QuoteDone.'),false);
  } else {
   assert.equal(await page.locator('select').filter({has:page.locator('option[value="CA"]')}).count(),0);
   assert.equal(text.includes('You can add jurisdiction settings when you turn on QuoteDone.'),true);
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(evidence,plan+'-onboarding.png'),fullPage:true});
  if(plan==='QuoteDone') {
   await page.goto(fixture.origin+'/onboarding?step=7',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Build your price book',exact:true}).waitFor();
   assert.equal(await page.getByRole('heading',{name:'Activate your QuoteDone plan',exact:true}).count(),0);
  }
  const activated=fixture.db.prepare('SELECT plan,planStatus,trialEndsAt FROM users WHERE id=?').get(account.id);
  rows.push({plan,passed:true,registration,checkoutPrice:checkout.parameters.line_items[0].price,activated,
    jurisdictionUnlocked:plan==='QuoteDone',priceBookSetupUnlocked:plan==='QuoteDone',queryDidNotActivate:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);
} catch(error) {
 rows.push({passed:false,error:String(error.stack),url:activePage?.url(),text:activePage?await activePage.locator('body').innerText().catch(()=>null):null});
 if(activePage)await activePage.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;
} finally {
 fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({
  syntheticStripe:true,realApplicationHandlers:true,version:browser.version(),rows,errors},null,2));
 await browser.close();await fixture.close();closeLaunchPlanDatabase();
}
