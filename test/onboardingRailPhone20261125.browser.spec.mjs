import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// On a phone the onboarding step list is a sideways-scrolling row. It used to stay
// scrolled to the start, so from step 4 on the current step was off screen. The
// whole owner app with its real stylesheet; the network answers with synthetic data.
// HANDWRITTEN EXPECTATIONS, before execution:
// - at 390 px, on steps 2, 5 and 9 the current step sits fully inside the row and the
//   page itself has not scrolled down or sideways;
// - at 1280 px the list is a column and nothing scrolls.
const root=fileURLToPath(new URL('..',import.meta.url));
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const TOKEN=b64({alg:'HS256'})+'.'+b64({sub:'synthetic-owner',role:'owner',sid:'S'.repeat(43),exp:4102444800})+'.[PLACEHOLDER]';
const FAKE=`(()=>{const account={firstName:'[PLACEHOLDER] Pat',businessName:'[PLACEHOLDER] Cedar Co',plan:'QuoteDone',planStatus:'trialing',timezone:'America/Moncton',trialNotStarted:false,trialEligible:false};
  const bodies={'/api/onboarding/state':{account,priceBookAccess:true,bookingAccess:true,quoteDoneAccess:true,operator:{missing:[]},preview:{},profile:{onboardingStep:9,knowledgeBase:{about:'x',hours:'x'},calendar:{},businessTypes:['roofing']}},
    '/api/billing/status':{billingEnabled:true,providerAvailable:true,plan:'QuoteDone',planStatus:'trialing',checkoutState:'NONE',canCheckout:false,canManageBilling:true,trialNotStarted:false,trialEligible:false},
    '/api/billing/lifecycle':{notices:[],cancellation:null},'/api/auth/account':{emailVerified:true}};
  window.fetch=async url=>{const path=String(url).replace(/^https?:\\/\\/[^/]+/,'').split('?')[0];const body=bodies[path]??{};
    return {ok:true,status:200,json:async()=>body,blob:async()=>new Blob([])};};
  localStorage.setItem('otc_token',${JSON.stringify(TOKEN)});})();`;

test('the current onboarding step stays in view on a phone',{timeout:180000},async t=>{
  const output=await build({absWorkingDir:root,entryPoints:['client/src/main.jsx'],bundle:true,write:false,platform:'browser',format:'iife',outdir:'out',
    loader:{'.js':'jsx'},define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},logLevel:'silent'});
  const js=output.outputFiles.find(f=>f.path.endsWith('.js')).text,css=output.outputFiles.find(f=>f.path.endsWith('.css')).text;
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  async function look(width,step){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://synthetic.invalid/**',route=>route.fulfill({contentType:'text/html',
      body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${FAKE}</script><script>${js}</script></body></html>`}));
    await page.goto('https://synthetic.invalid/onboarding?step='+step);
    await page.locator('.rail-step.current').waitFor();
    await page.waitForTimeout(300);
    const r=await page.evaluate(()=>{const rail=document.querySelector('.progress-rail'),current=rail.querySelector('.rail-step.current'),a=rail.getBoundingClientRect(),b=current.getBoundingClientRect();
      return {inView:b.left>=a.left-1&&b.right<=a.right+1,railScroll:rail.scrollLeft,pageX:window.scrollX,pageY:window.scrollY,width:document.documentElement.scrollWidth};});
    assert.deepEqual(errors,[]);await page.close();return r;
  }
  for(const step of [2,5,9]){
    const r=await look(390,step);
    assert.ok(r.inView,`step ${step} in view at 390 px: ${JSON.stringify(r)}`);
    assert.equal(r.pageY,0);assert.equal(r.pageX,0);assert.ok(r.width<=390);
    if(step>=5)assert.ok(r.railScroll>0);
  }
  const desktop=await look(1280,9);
  assert.ok(desktop.inView);assert.equal(desktop.railScroll,0);assert.equal(desktop.pageY,0);
});
