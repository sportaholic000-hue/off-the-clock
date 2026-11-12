import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// On a phone, an owner who has never started a trial sees the plan choice and
// "Continue to checkout" before the subscription and minutes cards. The whole
// owner app with its real stylesheet; the network answers with synthetic data.
const root=fileURLToPath(new URL('..',import.meta.url));
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const TOKEN=b64({alg:'HS256'})+'.'+b64({sub:'synthetic-owner',role:'owner',sid:'S'.repeat(43),exp:4102444800})+'.[PLACEHOLDER]';

function fakeServer(planStatus){
  return `(()=>{const account={firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',plan:'Operator',planStatus:${JSON.stringify(planStatus)},timezone:'America/Moncton',trialNotStarted:${planStatus==='pending_payment'},trialEligible:${planStatus==='pending_payment'}};
  const status={billingEnabled:true,providerAvailable:true,plan:'Operator',planStatus:account.planStatus,billingInterval:null,trialEndsAt:null,paymentFailedAt:null,graceEndsAt:null,currentPeriodEndAt:null,
    cancelAtPeriodEnd:false,checkoutState:'NONE',canCheckout:true,canManageBilling:account.planStatus!=='pending_payment',trialNotStarted:account.trialNotStarted,trialEligible:account.trialEligible};
  const bodies={'/api/onboarding/state':{account,priceBookAccess:false,operator:{missing:[]},preview:{},profile:{onboardingStep:1,knowledgeBase:{},calendar:{},businessTypes:[]}},
    '/api/billing/status':status,'/api/billing/lifecycle':{notices:[],cancellation:null},'/api/auth/account':{emailVerified:true}};
  window.fetch=async url=>{const path=String(url).replace(/^https?:\\/\\/[^/]+/,'').split('?')[0];const body=bodies[path]??{};
    return {ok:true,status:200,json:async()=>body,blob:async()=>new Blob([])};};
  localStorage.setItem('otc_token',${JSON.stringify(TOKEN)});})();`;
}

test('390 px: Continue to checkout comes before Current subscription for a new owner',{timeout:120000},async t=>{
  const output=await build({absWorkingDir:root,entryPoints:['client/src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',outdir:'out',
    loader:{'.js':'jsx'},define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  const js=output.outputFiles.find(f=>f.path.endsWith('.js')).text,css=output.outputFiles.find(f=>f.path.endsWith('.css')).text;
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  async function measure(planStatus){
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://synthetic.invalid/**',route=>route.fulfill({contentType:'text/html',
      body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${fakeServer(planStatus)}</script><script>${js}</script></body></html>`}));
    await page.goto('https://synthetic.invalid/settings/billing');
    await page.locator('section[aria-label="Current subscription"]').waitFor();
    const top=selector=>page.locator(selector).first().evaluate(node=>node.getBoundingClientRect().top+window.scrollY);
    const result={checkout:await top('button:has-text("Continue to checkout")'),current:await top('section[aria-label="Current subscription"]'),
      minutes:await page.locator('text=Minutes this billing month').count()?await top('text=Minutes this billing month'):null,
      width:await page.evaluate(()=>document.documentElement.scrollWidth)};
    assert.deepEqual(errors,[]);await page.close();return result;
  }
  const newOwner=await measure('pending_payment');
  console.log('new owner at 390 px:',JSON.stringify(newOwner));
  assert.ok(newOwner.checkout<newOwner.current,'Continue to checkout is above Current subscription');
  assert.ok(newOwner.checkout+42<=844,'Continue to checkout is on the first screen of an 844 px tall phone');
  if(newOwner.minutes!==null)assert.ok(newOwner.checkout<newOwner.minutes,'and above the minutes card');
  assert.ok(newOwner.width<=390,'no sideways scroll');
  const returning=await measure('canceled');
  console.log('owner who had service at 390 px:',JSON.stringify(returning));
  assert.ok(returning.current<returning.checkout,'order unchanged for an owner who had service');
});
