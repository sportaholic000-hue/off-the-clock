import './pricebookTestEnv.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { CLASS2_DEFAULTS_BY_SERVICE, SAMPLE_INPUTS, getServiceMetadata } from '../server/priceBookMetadata.js';
import { generateQuote } from '../server/quoteEngine.js';
import { getVNextPriceBookMetadata } from '../server/quote-engine-vnext/index.js';

// Full, unchanged application JSX + React/ReactDOM in a real headless browser.
// Only transport is substituted: actual fetch requests are captured and passed
// unchanged to the real JSON-store functions. This is NOT authenticated HTTP
// or deployed application acceptance. No package/browser is installed by tests.
// Use an already-installed Playwright via PRICEBOOK_BROWSER_MODULE if needed;
// PRICEBOOK_BROWSER_EXECUTABLE can select an already-installed browser binary.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// This diagnostic capture follows named hooks in the source being exercised.
 // AI loading/error hooks may be added without changing any pricing behavior.
 // Keep the original stored-record, decimal and UI assertions below intact.
const componentSource=readFileSync(join(repo,'client/src/pricebook.jsx'),'utf8').split('export default function PriceBook() {')[1].split('  async function load()')[0];
const hookNames=[...componentSource.matchAll(/const\s+(?:\[\s*(\w+)\s*,[^\]]+\]|(\w+))\s*=\s*(?:useState|useRef)\s*\(/g)].map(match=>match[1]||match[2]);
const stateIndex=Object.fromEntries(hookNames.map((name,index)=>[name,index]));
for(const name of ['book','selectedType','statuses','validating','draftValidationErrors','preview','previewLoading','error','saving','locked']) assert.ok(Number.isInteger(stateIndex[name]),'Missing observed hook: '+name);
const evidence = process.env.PRICEBOOK_EDITOR_EVIDENCE_DIR || mkdtempSync(join(tmpdir(), 'otc-editor-evidence-'));
mkdirSync(evidence, { recursive:true });
const storeRoot = mkdtempSync(join(tmpdir(), 'otc-editor-store-'));
const previousStore = process.env.PRICEBOOK_PATH;
process.env.PRICEBOOK_PATH = storeRoot;
let store;
try { store = await import('../server/priceBookService.js?editor-browser-regression'); }
finally {
  if (previousStore === undefined) delete process.env.PRICEBOOK_PATH;
  else process.env.PRICEBOOK_PATH = previousStore;
}
// Retain the legacy price representation fixtures, with the customer fields
// supplied by the current application API. Missing metadata is not a quote.
const customerMetadata = getVNextPriceBookMetadata();
const metadata = getServiceMetadata().map(meta=>({...meta,
  customerFields:customerMetadata.find(current=>current.serviceType===meta.serviceType).customerFields}));
const defaults = { markupPercent:0, markupMode:'markup', taxMode:'TAX_NONE', taxPercent:0,
  rangeBufferPercent:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
  overheadFixed:0, peakMonths:[], peakSurchargePercent:0 };
const copy = value => structuredClone(value);
const withoutTimestamp = value => { const next=copy(value); delete next.updatedAt; return next; };
const ids = ['8f6a5772-4bf5-43ca-833c-1db52b7ae2b0','039c9b10-f3b7-4929-bda5-8b3e6af21121'];
function siding(placement='root', factor=0.23, index=0) {
  const pricing = { ...copy(CLASS2_DEFAULTS_BY_SERVICE.SIDING_REPLACEMENT),
    laborPerSqft:{ vinyl:2 }, materialPerSqft:{ vinyl:3 }, minimumJob:14 };
  const result = { id:ids[index], serviceType:'SIDING_REPLACEMENT', service:'Synthetic siding '+index,
    source:'AI_SUGGESTED', active:false, pricing,
    confirmedFields:{ laborPerSqft:true, materialPerSqft:true, minimumJob:true },
    tiers:[], validationInputs:copy(SAMPLE_INPUTS.SIDING_REPLACEMENT) };
  if (placement === 'flat') { delete result.pricing; Object.assign(result, pricing, {trimRatio:factor}); }
  else if (placement === 'root') { delete pricing.trimRatio; result.trimRatio=factor; }
  else if (placement === 'nested') pricing.trimRatio=factor;
  else if (placement === 'equal') { result.trimRatio=factor; pricing.trimRatio=factor; }
  else if (placement === 'absent') delete pricing.trimRatio;
  return result;
}
function mowing(rate=0.005) {
  return { id:ids[0], serviceType:'LANDSCAPING_MOWING', service:'Synthetic mowing',
    source:'AI_SUGGESTED', active:false, mowingBaseRatePerSqft:rate, minimumServiceCharge:0,
    frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},
    overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}, baggingSurchargePercent:0,
    edgingPerLinearFoot:0.01, allowAssumptionBasedQuotes:false,
    confirmedFields:{mowingBaseRatePerSqft:true, minimumServiceCharge:true, frequencyMultipliers:true,
      overgrowthMultipliers:true, baggingSurchargePercent:true, edgingPerLinearFoot:true, allowAssumptionBasedQuotes:true},
    tiers:[{name:'Alternate',overrides:{mowingBaseRatePerSqft:0.0051}}],
    validationInputs:{...copy(SAMPLE_INPUTS.LANDSCAPING_MOWING),yardSqft:10000} };
}
let browser, bundle, browserVersion;
const results=[];
before(async () => {
  const require=createRequire(import.meta.url);
  const { chromium }=require(process.env.PRICEBOOK_BROWSER_MODULE || 'playwright');
  browser=await chromium.launch({ headless:true,
    ...(process.env.PRICEBOOK_BROWSER_EXECUTABLE ? {executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE} : {}) });
  browserVersion=browser.version();
  const built=await build({ absWorkingDir:repo, stdin:{
    contents:"import React from 'react'; import {createRoot} from 'react-dom/client'; import PriceBook from './client/src/pricebook.jsx'; createRoot(document.getElementById('root')).render(<PriceBook />);",
    resolveDir:repo,loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',minify:false,
    define:{'import.meta.env.VITE_API_URL':JSON.stringify('http://pricebook-editor.test'),'process.env.NODE_ENV':JSON.stringify('development')} });
  bundle=built.outputFiles[0].text;
});
after(async () => {
  const files=['client/src/pricebook.jsx','client/src/pricebookEditing.js','client/src/pricebookInputs.jsx',
    'client/src/ui.jsx','client/src/reference.jsx','client/src/api.js','server/priceBookMoney.js','server/priceBookService.js',
    'test/priceBookEditor.browser.spec.mjs'];
  writeFileSync(join(evidence,'execution.json'),JSON.stringify({browserVersion,repo,storeRoot,
    method:'Actual React full PriceBook + intercepted fetch + actual temporary JSON persistence; no authenticated application server',
    sources:Object.fromEntries(files.map(name=>[name,createHash('sha256').update(readFileSync(join(repo,name))).digest('hex')])),results},null,2));
  console.log('Editor browser evidence: '+evidence);
  console.log('Closing editor browser after all scenarios');
  if(browser) await browser.close();
  console.log('Editor browser closed');
});
async function scenario(name, services, run) {
  const dir=join(evidence,name); mkdirSync(dir,{recursive:true});
  const owner='editor-'+name;
  // Convert each representation separately only when seeding an intentionally
  // conflicting legacy fixture. Normal requests always use the real validator.
  const seed={ownerId:owner,defaults:copy(defaults),services:services.map(service=>{
    const {pricing,...root}=service;
    const converted=store.dollarsToCents({services:[root]}).services[0];
    if(pricing) converted.pricing=store.dollarsToCents({services:[{serviceType:service.serviceType,pricing}]}).services[0].pricing;
    return converted;
  })};
  store.savePricebook(owner,seed);
  const initial=store.centsToDollars(store.loadPricebook(owner));
  const requests=[], snapshots=[], failures=[], browserErrors=[];
  const context=await browser.newContext({ viewport:{width:1440,height:1000} });
  await context.addInitScript(() => {
    // Observe committed React state; no application source or state is rewritten.
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__={ supportsFiber:true,inject(){return 1;},
      onCommitFiberRoot(id,root){window.__editorFiberRoot=root;},onCommitFiberUnmount(){} };
  });
  const page=await context.newPage();
  page.on('pageerror',error=>browserErrors.push(error.stack || error.message));
  const css=readFileSync(join(repo,'client/src/styles.css'),'utf8').replace(/@import\s+url\(['"]https?:\/\/[^'"]+['"]\)\s*;/g,'');
  await page.route('**/*',async route=>{
    const request=route.request(), url=new URL(request.url());
    if(url.origin !== 'http://pricebook-editor.test') throw Error('Unexpected external browser request: '+url.origin);
    if(url.pathname === '/') {
      await route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>'+css+'</style></head><body><div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script></body></html>'});return;
    }
    const raw=request.postData(), body=raw ? JSON.parse(raw) : undefined;
    const entry={path:url.pathname,method:request.method(),rawRequest:raw,body:copy(body),storedBefore:readFileSync(join(storeRoot,owner+'.json'),'utf8')};
    let response, status=200;
    try {
      if(url.pathname === '/api/dashboard') response={ownerId:owner,operator:{simulated:true,enabled:false}};
      else if(url.pathname === '/api/onboarding/state') response={account:{plan:'QuoteDone'},profile:{businessTypes:[...new Set(services.map(s=>s.serviceType))]}};
      else if(url.pathname === '/api/pricebook/meta') response={services:metadata};
      else if(url.pathname === '/api/pricebook/'+owner) response=store.centsToDollars(store.loadPricebook(owner));
      else if(url.pathname === '/api/pricebook/validate') response=store.pricebookDraftValidation(body);
      else if(url.pathname === '/api/pricebook/save') response=store.saveValidatedPricebook(owner,body);
      else if(url.pathname === '/api/pricebook/preview') {
        const converted=store.dollarsToCents(body);
        response=generateQuote({serviceType:body.service.serviceType,customerInputs:body.customerInputs,
          ownerPricing:converted.service,businessDefaults:converted.defaults,callerType:'owner'});
      } else throw Error('Unexpected test endpoint '+url.pathname);
    } catch(error) {status=400;response={error:error.message};}
    entry.response=copy(response);entry.status=status;
    entry.storedAfter=readFileSync(join(storeRoot,owner+'.json'),'utf8');requests.push(entry);
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(response)});
  });
  const capture=async(label,screenshot=false)=>{
    await page.waitForFunction(stateIndex=>{
      function find(node){if(!node)return null;if(node.type?.name==='PriceBook')return node;return find(node.child)||find(node.sibling);}
      const fiber=find(window.__editorFiberRoot?.current);if(!fiber)return false;
      const values=[];for(let h=fiber.memoizedState;h;h=h.next)values.push(h.memoizedState);
      return values[stateIndex.book]?.services && values[stateIndex.validating]===false && values[stateIndex.previewLoading]===false && values[stateIndex.saving]===false;
    },stateIndex);
    const state=await page.evaluate(stateIndex=>{
      function find(node){if(!node)return null;if(node.type?.name==='PriceBook')return node;return find(node.child)||find(node.sibling);}
      const fiber=find(window.__editorFiberRoot.current),values=[];
      for(let h=fiber.memoizedState;h;h=h.next)values.push(h.memoizedState);
      return {book:values[stateIndex.book],selectedKey:values[stateIndex.selectedType],statuses:values[stateIndex.statuses],validating:values[stateIndex.validating],draftValidationErrors:values[stateIndex.draftValidationErrors],
        preview:values[stateIndex.preview],previewLoading:values[stateIndex.previewLoading],error:values[stateIndex.error]?.message || null,saving:values[stateIndex.saving],locked:values[stateIndex.locked],
        visibleText:document.body.innerText,html:document.getElementById('root').innerHTML,
        inputs:[...document.querySelectorAll('input,select,textarea')].map(node=>({tag:node.tagName,label:node.getAttribute('aria-label'),value:node.value,
          invalid:node.getAttribute('aria-invalid'),field:node.closest('[id^="field-"]')?.id || null}))};
    },stateIndex);
    assert.ok(state.book.services && state.selectedKey,'React capture must find the actual loaded book and selection');
    snapshots.push({label,...state,stored:readFileSync(join(storeRoot,owner+'.json'),'utf8'),requestsThrough:requests.length});
    if(screenshot) await page.screenshot({path:join(dir,label+'.png'),fullPage:true});
    return state;
  };
  const check=(fn)=>{try{fn();}catch(error){failures.push({message:error.message,actual:error.actual,expected:error.expected});}};
  const savedRequests=()=>requests.filter(r=>r.path==='/api/pricebook/save');
  const save=async(label='saved')=>{await page.getByRole('button',{name:'Save & validate',exact:true}).click();return capture(label,true);};
  const reopen=async()=>{await page.reload();return capture('reopened',true);};
  const openFactors=async()=>{const button=page.getByRole('button',{name:/Quantity assumptions/});if(await button.getAttribute('aria-expanded')==='false')await button.click();};
  const blur=async locator=>{await locator.focus();await page.getByRole('heading',{name:'Price book',exact:true}).click();};
  const factor=()=>page.getByRole('textbox',{name:metadata.find(s=>s.serviceType==='SIDING_REPLACEMENT').class2Fields.find(f=>f.field==='trimRatio').label,exact:true});
  try {
    await page.goto('http://pricebook-editor.test/'); await capture('loaded',true);
    await run({page,initial,requests,snapshots,check,capture,save,reopen,openFactors,blur,factor,savedRequests,
      stored:()=>store.loadPricebook(owner)});
    check(()=>assert.deepEqual(browserErrors,[]));
  } catch(error) {failures.push({message:error.stack || error.message});}
  finally {
    writeFileSync(join(dir,'evidence.json'),JSON.stringify({name,initial,seed,requests,snapshots,failures,browserErrors},null,2));
    results.push({name,passed:!failures.length,failures:failures.length,requests:requests.length,snapshots:snapshots.length});
    await context.close();
  }
  assert.deepEqual(failures,[],name+' must meet the pre-written owner expectations');
}


for(const placement of ['root','nested','flat','equal']) {
  test('editor D1: '+placement+' factor survives no-edit blur save reopen and same-type switches',async()=>{
    await scenario('D1-'+placement,[siding(placement),siding('nested',0.24,1)],async h=>{
      const {page,initial,check,capture,save,reopen,openFactors,blur,factor,stored}=h;
      await openFactors();
      let visible=await factor().inputValue();check(()=>assert.equal(visible,'0.23'));
      await blur(factor());
      const blurred=await capture('unchanged-blur',true);check(()=>assert.deepEqual(blurred.book,initial));
      await page.locator('.service-pick').filter({hasText:'Synthetic siding 1'}).click();
      const other=await capture('other-service');check(()=>assert.equal(other.selectedKey,ids[1]));
      visible=await factor().inputValue();check(()=>assert.equal(visible,'0.24'));
      await page.locator('.service-pick').filter({hasText:'Synthetic siding 0'}).click();
      const back=await capture('switched-back',true);check(()=>assert.equal(back.selectedKey,ids[0]));
      visible=await factor().inputValue();check(()=>assert.equal(visible,'0.23'));
      check(()=>assert.deepEqual(back.book,initial));
      await blur(factor());await save();
      check(()=>assert.deepEqual(withoutTimestamp(stored()),withoutTimestamp(JSON.parse(h.snapshots[0].stored))));
      check(()=>assert.deepEqual(h.savedRequests().at(-1)?.body,initial));
      const again=await reopen();check(()=>assert.deepEqual(withoutTimestamp(again.book),withoutTimestamp(initial)));
      await openFactors();visible=await factor().inputValue();check(()=>assert.equal(visible,'0.23'));
    });
  });
}

test('editor D1: a genuine absent default is displayed without being written by focus or blur',async()=>{
  await scenario('D1-absent',[siding('absent')],async h=>{
    await h.openFactors();const value=await h.factor().inputValue();h.check(()=>assert.equal(value,'0.15'));
    await h.blur(h.factor());const blurred=await h.capture('absent-unchanged-blur',true);
    h.check(()=>assert.deepEqual(blurred.book,h.initial));
    await h.save();h.check(()=>assert.deepEqual(h.savedRequests().at(-1)?.body,h.initial));
    // Existing backend rule stores a genuinely absent Class 2 default on save.
    const expected=copy(JSON.parse(h.snapshots[0].stored));expected.services[0].pricing.trimRatio=0.15;
    h.check(()=>assert.deepEqual(withoutTimestamp(h.stored()),withoutTimestamp(expected)));
  });
});

test('editor D2: conflicting minima survive no-edit focus blur preview switches and unrelated edits',async()=>{
  const conflict=siding('nested');conflict.minimumJob=14.01;
  await scenario('D2-conflict',[conflict,siding('nested',0.24,1)],async h=>{
    const {page,check,capture,save,initial}=h;
    const first=await save('first-rejected');check(()=>assert.equal(h.savedRequests().length,0));
    check(()=>assert.match(first.error || '',/conflict/i));
    await h.blur(page.locator('#field-minimumJob input'));
    const blurred=await capture('conflict-unchanged-blur',true);check(()=>assert.deepEqual(blurred.book,initial));
    await page.locator('.service-pick').filter({hasText:'Synthetic siding 1'}).click();await capture('conflict-other-service');
    await page.locator('.service-pick').filter({hasText:'Synthetic siding 0'}).click();
    const back=await capture('conflict-switched-back');check(()=>assert.deepEqual(back.book,initial));
    await page.locator('#field-laborPerSqft').getByRole('textbox',{name:'Vinyl price',exact:true}).fill('2.01');
    const changed=await capture('unrelated-price-edit',true);
    const expected=copy(initial);expected.services[0].pricing.laborPerSqft.vinyl=2.01;expected.services[0].confirmedFields.laborPerSqft=false;
    check(()=>assert.deepEqual(changed.book,expected));
    const rejected=await save('still-rejected');check(()=>assert.match(rejected.error || '',/conflict/i));
    check(()=>assert.equal(h.savedRequests().length,0));
    check(()=>assert.deepEqual(h.stored(),JSON.parse(h.snapshots[0].stored)));
    check(()=>assert.equal(h.requests.filter(r=>r.path==='/api/pricebook/preview').length,0));
  });
});

test('editor D2: deliberate 14.02 resolves both minima and only its own AI confirmation',async()=>{
  const conflict=siding('nested');conflict.minimumJob=14.01;
  await scenario('D2-explicit-resolution',[conflict],async h=>{
    await h.page.locator('#field-minimumJob input').fill('14.02');
    await h.blur(h.page.locator('#field-minimumJob input'));
    const changed=await h.capture('explicit-14-02',true),expected=copy(h.initial);
    expected.services[0].minimumJob=14.02;expected.services[0].pricing.minimumJob=14.02;
    expected.services[0].confirmedFields.minimumJob=false;
    h.check(()=>assert.deepEqual(changed.book,expected));
    await h.save();h.check(()=>assert.deepEqual(h.savedRequests().at(-1)?.body,expected));
    const expectedStored=copy(JSON.parse(h.snapshots[0].stored));
    expectedStored.services[0].minimumJob=1402;expectedStored.services[0].pricing.minimumJob=1402;expectedStored.services[0].confirmedFields.minimumJob=false;
    h.check(()=>assert.deepEqual(withoutTimestamp(h.stored()),withoutTimestamp(expectedStored)));
    await h.reopen();
    await h.page.locator('#field-minimumJob').getByRole('switch').click();
    const confirmed=await h.capture('explicit-reconfirmation',true);
    const confirmedExpected=copy(expected);confirmedExpected.services[0].confirmedFields.minimumJob=true;
    h.check(()=>assert.deepEqual(withoutTimestamp(confirmed.book),withoutTimestamp(confirmedExpected)));
    await h.save('reconfirmed-save');h.check(()=>assert.equal(h.stored().services[0].confirmedFields.minimumJob,true));
    h.check(()=>assert.equal(h.stored().services[0].active,false));
  });
});

for(const [text,cents,base] of [['0.0049',0.49,4900],['0.0050',0.5,5000],['0.0051',0.51,5100]]) {
  test('editor locked rate: '+text+' types blurs saves and reopens exactly',async()=>{
    await scenario('rate-'+base,[mowing()],async h=>{
      const field=h.page.locator('#field-mowingBaseRatePerSqft input');
      await field.fill(text);await h.blur(field);
      const entered=await h.capture('typed-rate',true),expected=copy(h.initial);
      expected.services[0].mowingBaseRatePerSqft=Number(text);
      if(Number(text)!==0.005)expected.services[0].confirmedFields.mowingBaseRatePerSqft=false;
      h.check(()=>assert.deepEqual(entered.book,expected));
      await h.save();h.check(()=>assert.deepEqual(h.savedRequests().at(-1)?.body,expected));
      h.check(()=>assert.equal(h.stored().services[0].mowingBaseRatePerSqft,cents));
      // Literal decimal numerator / 10000 dollars times 10000 sqft times 100 cents.
      h.check(()=>assert.equal(BigInt(text.replace('.',''))*100n,BigInt(base)));
      const loaded=await h.reopen();h.check(()=>assert.deepEqual(withoutTimestamp(loaded.book),withoutTimestamp(expected)));
      const visible=await h.page.locator('#field-mowingBaseRatePerSqft input').inputValue();
      h.check(()=>assert.equal(Number(visible),Number(text)));
      await h.save('repeat-save');h.check(()=>assert.equal(h.stored().services[0].mowingBaseRatePerSqft,cents));
      h.check(()=>assert.equal(h.stored().services[0].active,false));
    });
  });
}

test('editor locked invalid text: lossless rejection survives blur same-type switch and save',async()=>{
  const one=mowing(),two={...copy(one),id:ids[1],service:'Synthetic second mowing',mowingBaseRatePerSqft:0.01};
  await scenario('invalid-text',[one,two],async h=>{
    const input=h.page.locator('#field-mowingBaseRatePerSqft input'),text='0.09000000000000001';
    await input.fill(text);await h.blur(input);await h.capture('invalid-blur',true);
    await h.page.locator('.service-pick').filter({hasText:'Synthetic second mowing'}).click();await h.capture('invalid-other-service');
    await h.page.locator('.service-pick').filter({hasText:'Synthetic mowing'}).click();
    const back=await h.capture('invalid-back',true),value=await input.inputValue(),invalid=await input.getAttribute('aria-invalid');
    h.check(()=>assert.equal(value,text));h.check(()=>assert.equal(invalid,'true'));
    const expected=copy(h.initial);expected.services[0].mowingBaseRatePerSqft=text;expected.services[0].confirmedFields.mowingBaseRatePerSqft=false;
    h.check(()=>assert.deepEqual(back.book,expected));
    await h.save('invalid-save-rejected');h.check(()=>assert.equal(h.savedRequests().length,0));
    h.check(()=>assert.deepEqual(h.stored(),JSON.parse(h.snapshots[0].stored)));
  });
});

test('editor locked maps tiers and explicit enablement stay separate for two same-type records',async()=>{
  const one=mowing(),two={...copy(one),id:ids[1],service:'Synthetic second mowing',mowingBaseRatePerSqft:0.01};
  await scenario('map-tier-enable',[one,two],async h=>{
    const {page,check,capture}=h,expected=copy(h.initial);
    // The frequency multiplier is a shaped non-money map. A same-value blur
    // preserves approval; a real edit invalidates only that map confirmation.
    const map=page.locator('#field-frequencyMultipliers').getByRole('textbox',{name:'Weekly price',exact:true});
    await h.blur(map);const same=await capture('unchanged-map');check(()=>assert.deepEqual(same.book,expected));
    await map.fill('1.01');expected.services[0].frequencyMultipliers.weekly=1.01;expected.services[0].confirmedFields.frequencyMultipliers=false;
    const changed=await capture('changed-map');check(()=>assert.deepEqual(changed.book,expected));
    const tier=page.locator('.override-row input').first();await tier.fill('0.0049');
    expected.services[0].tiers[0].overrides.mowingBaseRatePerSqft=0.0049;expected.services[0].confirmedFields.mowingBaseRatePerSqft=false;
    const tierChanged=await capture('changed-tier',true);check(()=>assert.deepEqual(tierChanged.book,expected));
    await h.save();check(()=>assert.deepEqual(h.stored().services[1],JSON.parse(h.snapshots[0].stored).services[1]));
    check(()=>assert.equal(h.stored().services[0].tiers[0].overrides.mowingBaseRatePerSqft,0.49));
    await h.reopen();
    await page.locator('#field-frequencyMultipliers').getByRole('switch').click();
    await page.locator('#field-mowingBaseRatePerSqft').getByRole('switch').click();
    await page.getByRole('switch',{name:'Enable quoting for this service',exact:true}).click();
    const enabled=await capture('explicit-enable',true);check(()=>assert.equal(enabled.book.services[0].active,true));
    await h.save('enabled-save');check(()=>assert.equal(h.stored().services[0].active,true));
    check(()=>assert.deepEqual(h.stored().services[1],JSON.parse(h.snapshots[0].stored).services[1]));
  });
});


test('editor D1 direct: reviewer minimal legacy fixture saves root 0.23 without a nested copy',async()=>{
  const service=siding('root');service.pricing={laborPerSqft:{vinyl:2},materialPerSqft:{vinyl:3},minimumJob:0};
  await scenario('D1-direct-minimal',[service],async h=>{
    await h.openFactors();const visible=await h.factor().inputValue();h.check(()=>assert.equal(visible,'0.23'));
    await h.blur(h.factor());const blurred=await h.capture('direct-unchanged-blur',true);h.check(()=>assert.deepEqual(blurred.book,h.initial));
    await h.save();h.check(()=>assert.deepEqual(h.savedRequests().at(-1)?.body,h.initial));
    const expected=copy(JSON.parse(h.snapshots[0].stored));
    for(const [field,value] of Object.entries(CLASS2_DEFAULTS_BY_SERVICE.SIDING_REPLACEMENT)) {
      if(field!=='trimRatio') expected.services[0].pricing[field]=copy(value);
    }
    h.check(()=>assert.deepEqual(withoutTimestamp(h.stored()),withoutTimestamp(expected)));
    await h.reopen();await h.openFactors();const value=await h.factor().inputValue();h.check(()=>assert.equal(value,'0.23'));
  });
});

test('editor D2 direct: deliberately typing the displayed candidate resolves the conflict and revokes affected approval',async()=>{
  const conflict=siding('nested');conflict.minimumJob=14.01;
  await scenario('D2-explicit-existing-candidate',[conflict],async h=>{
    // A text input event is deliberate even when its numeric value matches the
    // nested candidate. The conflicting root value is still a real change.
    await h.page.locator('#field-minimumJob input').fill('14.00');
    const entered=await h.capture('explicit-existing-candidate',true),expected=copy(h.initial);
    expected.services[0].minimumJob=14;expected.services[0].confirmedFields.minimumJob=false;
    h.check(()=>assert.deepEqual(entered.book,expected));
    await h.save();h.check(()=>assert.deepEqual(h.savedRequests().at(-1)?.body,expected));
    const expectedStored=copy(JSON.parse(h.snapshots[0].stored));expectedStored.services[0].minimumJob=1400;expectedStored.services[0].confirmedFields.minimumJob=false;
    h.check(()=>assert.deepEqual(withoutTimestamp(h.stored()),withoutTimestamp(expectedStored)));
  });
});

test('editor fixed-cent boundaries: 14.00 14.01 14.02 retain exact cents and adjacent sub-cent entries reject',async()=>{
  for(const [text,cents] of [['14.00',1400],['14.01',1401],['14.02',1402],['14.0099',null],['14.0101',null]]) {
    await scenario('fixed-'+text.replace('.','-'),[siding('nested')],async h=>{
      const input=h.page.locator('#field-minimumJob input');await input.fill(text);await h.blur(input);
      const entered=await h.capture('entered-fixed',true),expected=copy(h.initial);
      expected.services[0].pricing.minimumJob=cents===null ? text : Number(text);
      if(text!=='14.00')expected.services[0].confirmedFields.minimumJob=false;
      h.check(()=>assert.deepEqual(entered.book,expected));
      await h.save();
      if(cents===null) {
        h.check(()=>assert.equal(h.savedRequests().length,0));h.check(()=>assert.deepEqual(h.stored(),JSON.parse(h.snapshots[0].stored)));
      } else {
        h.check(()=>assert.deepEqual(h.savedRequests().at(-1)?.body,expected));
        const expectedStored=copy(JSON.parse(h.snapshots[0].stored));expectedStored.services[0].pricing.minimumJob=cents;
        expectedStored.services[0].confirmedFields=copy(expected.services[0].confirmedFields);
        h.check(()=>assert.deepEqual(withoutTimestamp(h.stored()),withoutTimestamp(expectedStored)));
        const loaded=await h.reopen();h.check(()=>assert.deepEqual(withoutTimestamp(loaded.book),withoutTimestamp(expected)));
      }
    });
  }
});
