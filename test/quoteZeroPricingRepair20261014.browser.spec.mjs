import './pricebookTestEnv.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { fixture, flooring, siding } from '../verification/engine-independent/fixtures.mjs';
import { freeFixture, includedFixture } from './quoteEngineVNextFixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import { loadPricebook } from '../server/priceBookService.js';

// This test renders the unchanged, complete owner PriceBook in Chromium. Fetch
// is intercepted at the HTTP boundary and dispatched to the real application
// bridge and isolated JSON/SQLite stores; pricing and status responses are not
// mocked. The expected row labels below were written before the repair:
// absent -> NOT OFFERED; unclassified zero -> NEEDS PRICE; explicitly approved
// free/included zero -> READY; positive -> READY.
const date = { timeZone:'UTC', quoteInstant:'2026-10-14T12:00:00.000Z' };
const PRODUCT_PRICE_FIELDS = ['laborPerSqft','materialPerSqft'];
let browser;
let bundle;

before(async () => {
  const { chromium } = createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE || 'playwright');
  browser = await chromium.launch({
    headless:true,
    ...(process.env.PRICEBOOK_BROWSER_EXECUTABLE ? { executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE } : {})
  });
  const built = await build({
    bundle:true,
    write:false,
    format:'iife',
    platform:'browser',
    define:{
      'import.meta.env.VITE_API_URL':JSON.stringify('http://zero-price-editor.test'),
      'process.env.NODE_ENV':JSON.stringify('production')
    },
    loader:{ '.js':'jsx' },
    stdin:{
      loader:'jsx',
      resolveDir:process.cwd(),
      contents:"import React from 'react'; import {createRoot} from 'react-dom/client'; import PriceBook from './client/src/pricebook.jsx'; createRoot(document.getElementById('root')).render(<PriceBook/>);"
    }
  });
  bundle = built.outputFiles[0].text;
});

after(async () => { await browser?.close(); });

function applicationFixture(type, mode) {
  const flooringType = type.startsWith('FLOORING_');
  let input = flooringType ? flooring(mode === 'included' ? 'vinyl_plank' : 'tile') : siding();
  if (type === 'FLOORING_REPLACEMENT') {
    input = fixture('FLOORING_REPLACEMENT', input.ownerPricing.pricing, {
      ...input.customerInputs,
      existingFloorType:'vinyl',
      subfloorIssues:false
    });
  }
  input.ownerPricing.service = '[SYNTHETIC] '+mode+' '+type;
  if (mode === 'free') {
    if (flooringType) {
      input.ownerPricing.pricing.laborPerSqft.tile = 0;
      input.ownerPricing.pricing.materialPerSqft.tile = 0;
    } else {
      input.ownerPricing.pricing.laborPerSqft.vinyl = 0;
      input.ownerPricing.pricing.materialPerSqft.vinyl = 0;
    }
    input.ownerPricing = freeFixture(input.ownerPricing);
  } else if (mode === 'unclassified-zero') {
    input.ownerPricing.pricing.laborPerSqft.tile = 0;
  } else if (mode === 'missing') {
    delete input.ownerPricing.pricing.laborPerSqft.tile;
  } else if (mode === 'included') {
    const p = input.ownerPricing.pricing;
    p.materialPerSqft.vinyl_plank = 0;
    Object.assign(p, {
      vinylPlankUnderlaymentRule:'always_included',
      underlaymentPerSqft:100,
      underlaymentPriceBasis:'installed_area_sell_price',
      installedLaborPercent:{ underlaymentPerSqft:0 },
      installedMaterialsPercent:{ underlaymentPerSqft:100 }
    });
    input.ownerPricing.priceBasisByCategory.material = 'sell_price';
    input.ownerPricing = includedFixture(input.ownerPricing, {
      'materialPerSqft.vinyl_plank':'underlaymentPerSqft'
    });
  }
  return input;
}

function seed(input, approve) {
  const owner = 'synthetic-qe007-'+randomUUID();
  const service = structuredClone(input.ownerPricing);
  const classification = service.zeroPricePolicy && {
    freeCompleteService:service.zeroPricePolicy.freeCompleteService,
    freeTiers:structuredClone(service.zeroPricePolicy.freeTiers),
    includedPrices:structuredClone(service.zeroPricePolicy.includedPrices)
  };
  delete service.origin;
  delete service.zeroPricePolicy;
  const initial = bridge.readApplicationBook(owner);
  const draft = bridge.convertApplicationBook({
    services:[service],
    defaults:{ currency:'USD', quoteTimeZone:'UTC', ...input.businessDefaults }
  }, 'toDollars');
  bridge.saveApplicationBook(owner, { ...draft, revision:initial.revision }, date);
  if (approve) {
    const saved = bridge.readApplicationBook(owner);
    bridge.approveApplicationService(owner, saved.services[0].id, {
      revision:saved.revision,
      confirmConfiguration:true,
      confirmLegacySettings:true,
      ...(classification ? { zeroClassification:classification } : {})
    }, date);
  }
  return owner;
}

async function openEditor(owner, type) {
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 } });
  const page = await context.newPage();
  const errors = [];
  let saveRequests = 0;
  page.on('pageerror', error => errors.push(error.stack || error.message));
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== 'http://zero-price-editor.test') throw Error('Unexpected browser request: '+url.href);
    if (url.pathname === '/') {
      await route.fulfill({
        contentType:'text/html',
        body:'<!doctype html><html><body><div id="root"></div><script>'+bundle.replaceAll('</script', '<\\/script')+'</script></body></html>'
      });
      return;
    }
    const body = request.postData() ? JSON.parse(request.postData()) : undefined;
    let payload;
    let status = 200;
    try {
      if (url.pathname === '/api/dashboard') payload = { ownerId:owner, operator:{ simulated:true, enabled:false } };
      else if (url.pathname === '/api/onboarding/state') payload = { account:{ plan:'QuoteDone' }, profile:{ businessTypes:[type] } };
      else if (url.pathname === '/api/pricebook/meta') payload = bridge.applicationMetadata();
      else if (url.pathname === '/api/pricebook/'+owner) payload = bridge.readApplicationBook(owner);
      else if (url.pathname === '/api/pricebook/validate') payload = bridge.validateApplicationDraft(owner, body, date);
      else if (url.pathname === '/api/pricebook/save') {
        saveRequests += 1;
        payload = bridge.saveApplicationBook(owner, body, date);
      }
      else if (url.pathname === '/api/pricebook/preview') payload = bridge.previewApplicationQuote(owner, body, date);
      else if (/^\/api\/pricebook\/services\/[^/]+\/approve$/.test(url.pathname)) {
        payload = bridge.approveApplicationService(owner, url.pathname.split('/').at(-2), body, date);
      }
      else throw Error('Unexpected test endpoint '+url.pathname);
    } catch (error) {
      status = error.statusCode || 400;
      payload = { error:error.message, details:error.details };
    }
    await route.fulfill({ status, contentType:'application/json', body:JSON.stringify(payload) });
  });
  await page.goto('http://zero-price-editor.test/');
  await page.getByRole('heading', { name:'Price book', exact:true }).waitFor();
  return { context, page, errors, saveRequests:() => saveRequests };
}

function productRow(page, field, product) {
  return page.locator('#field-'+field+' tbody tr').filter({ has:page.getByText(product, { exact:true }) });
}

async function rowStatus(page, field, product) {
  const row = productRow(page, field, product);
  await row.waitFor();
  return (await row.locator('td.matrix-status').innerText()).trim();
}

function productToggle(page, field, product) {
  return productRow(page, field, product).getByRole('checkbox');
}

function productInput(page, field, product) {
  return productRow(page, field, product).getByRole('textbox', { name:product+' price', exact:true });
}

async function waitForRowStatus(page, field, product, expected) {
  const cell = productRow(page, field, product).locator('td.matrix-status');
  await cell.getByText(expected, { exact:true }).waitFor();
  assert.equal((await cell.innerText()).trim(), expected);
}

async function waitForTierOnlyRow(page, field, product, tierName = 'Premium') {
  const row = productRow(page, field, product);
  await waitForRowStatus(page, field, product, 'TIER ONLY');
  await row.getByText('BASE PRICE OFF', { exact:true }).waitFor();
  await row.getByText('Available in '+tierName+' price option.', { exact:true }).waitFor();
}

async function saveEditor(page) {
  const response = await Promise.all([
    page.waitForResponse(item => item.url().endsWith('/api/pricebook/save') && item.request().method() === 'POST'),
    page.getByRole('button', { name:'Save & validate', exact:true }).click()
  ]).then(([item]) => item);
  assert.equal(response.ok(), true, await response.text());
}

async function approveEditor(page) {
  await page.getByRole('button', { name:'Review saved configuration', exact:true }).click();
  const legacy = page.getByRole('checkbox', { name:/I confirm these retained legacy settings/ });
  if (await legacy.count()) await legacy.check();
  await page.getByRole('checkbox', { name:/I confirm these exact saved prices/ }).check();
  const response = await Promise.all([
    page.waitForResponse(item => /\/api\/pricebook\/services\/[^/]+\/approve$/.test(new URL(item.url()).pathname) && item.request().method() === 'POST'),
    page.getByRole('button', { name:'Confirm saved configuration', exact:true }).click()
  ]).then(([item]) => item);
  assert.equal(response.ok(), true, await response.text());
  await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
}

function toggleFixture(type) {
  const input = applicationFixture(type, 'positive');
  const product = type === 'SIDING_REPLACEMENT' ? 'vinyl' : 'tile';
  const unrelated = type === 'SIDING_REPLACEMENT' ? 'wood' : 'hardwood';
  const p = input.ownerPricing.pricing;
  p.laborPerSqft[unrelated] = type === 'SIDING_REPLACEMENT' ? 610 : 615;
  p.materialPerSqft[unrelated] = type === 'SIDING_REPLACEMENT' ? 910 : 915;
  input.ownerPricing.tiers = [{
    name:'Premium',
    overrides:{
      laborPerSqft:{ [product]:type === 'SIDING_REPLACEMENT' ? 450 : 350, [unrelated]:650 },
      materialPerSqft:{ [product]:type === 'SIDING_REPLACEMENT' ? 750 : 550, [unrelated]:950 }
    }
  }];
  return { input, product, unrelated, label:product === 'vinyl' ? 'Vinyl' : 'Tile' };
}

async function exercisePairedProductToggle(type, controlField) {
  const { input, product, unrelated, label } = toggleFixture(type);
  const owner = seed(input, true);
  const before = loadPricebook(owner).services[0];
  const { context, page, errors } = await openEditor(owner, type);
  try {
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, label).isChecked(), true);
      assert.equal(await rowStatus(page, field, label), 'READY');
    }

    // Either visible control is the switch for the paired base prices. Turning
    // it off removes both base components but deliberately retains price-option
    // overrides, so the editor must not claim that the product is unavailable.
    await productToggle(page, controlField, label).click();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, label).isChecked(), false);
      await waitForTierOnlyRow(page, field, label);
    }

    // The same control must be usable repeatedly, not remain checked while
    // deleting an already-missing component.
    await productToggle(page, controlField, label).click();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, label).isChecked(), true);
      assert.equal(await productInput(page, field, label).inputValue(), '');
      await waitForRowStatus(page, field, label, 'NEEDS PRICE');
    }
    await productToggle(page, controlField, label).click();
    assert.equal(await productToggle(page, controlField, label).isChecked(), false);

    await saveEditor(page);
    const disabled = loadPricebook(owner).services[0];
    assert.equal(Object.hasOwn(disabled.pricing.laborPerSqft, product), false);
    assert.equal(Object.hasOwn(disabled.pricing.materialPerSqft, product), false);
    assert.equal(disabled.pricing.laborPerSqft[unrelated], before.pricing.laborPerSqft[unrelated]);
    assert.equal(disabled.pricing.materialPerSqft[unrelated], before.pricing.materialPerSqft[unrelated]);
    assert.deepEqual(disabled.tiers, before.tiers);
    assert.equal(bridge.bookStatuses(loadPricebook(owner), date)[0].approvalCurrent, false);

    await page.reload();
    await page.getByText('NEEDS PRICING', { exact:false }).first().waitFor();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, label).isChecked(), false);
      await waitForTierOnlyRow(page, field, label);
    }

    // Re-enabling creates editable blanks, not zero-dollar prices. The owner
    // must explicitly enter both components before the product is complete.
    await productToggle(page, controlField, label).click();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, label).isChecked(), true);
      assert.equal(await productInput(page, field, label).inputValue(), '');
      await waitForRowStatus(page, field, label, 'NEEDS PRICE');
    }
    const laborDollars = before.pricing.laborPerSqft[product] / 100;
    const materialDollars = before.pricing.materialPerSqft[product] / 100;
    await productInput(page, 'laborPerSqft', label).fill(String(laborDollars));
    await productInput(page, 'materialPerSqft', label).fill(String(materialDollars));
    await waitForRowStatus(page, 'laborPerSqft', label, 'READY');
    await waitForRowStatus(page, 'materialPerSqft', label, 'READY');
    await saveEditor(page);
    await page.reload();
    // Approval is bound to the exact saved content. The disabled save above
    // made it stale; restoring every approved value exactly makes the same
    // receipt current again without authorizing any different price.
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    const restored = loadPricebook(owner).services[0];
    assert.equal(restored.pricing.laborPerSqft[product], before.pricing.laborPerSqft[product]);
    assert.equal(restored.pricing.materialPerSqft[product], before.pricing.materialPerSqft[product]);
    assert.equal(restored.pricing.laborPerSqft[unrelated], before.pricing.laborPerSqft[unrelated]);
    assert.equal(restored.pricing.materialPerSqft[unrelated], before.pricing.materialPerSqft[unrelated]);
    assert.deepEqual(restored.tiers, before.tiers);
    assert.equal(bridge.bookStatuses(loadPricebook(owner), date)[0].approvalCurrent, true);
    assert.equal(await rowStatus(page, 'laborPerSqft', label), 'READY');
    assert.equal(await rowStatus(page, 'materialPerSqft', label), 'READY');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function exerciseTierOnlyCustomerQuote(controlField) {
  const type = 'FLOORING_INSTALL';
  const { input, product, label } = toggleFixture(type);
  const owner = seed(input, true);
  const before = loadPricebook(owner).services[0];
  const { context, page, errors } = await openEditor(owner, type);
  try {
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    await productToggle(page, controlField, label).click();
    for (const field of PRODUCT_PRICE_FIELDS) {
      assert.equal(await productToggle(page, field, label).isChecked(), false);
      await waitForTierOnlyRow(page, field, label);
    }

    await saveEditor(page);
    await page.getByText('NEEDS PRICING', { exact:false }).first().waitFor();
    const saved = loadPricebook(owner).services[0];
    assert.equal(Object.hasOwn(saved.pricing.laborPerSqft, product), false);
    assert.equal(Object.hasOwn(saved.pricing.materialPerSqft, product), false);
    assert.deepEqual(saved.tiers, before.tiers);
    assert.equal(bridge.bookStatuses(loadPricebook(owner), date)[0].approvalCurrent, false);

    // Use the actual owner approval control, then restart the editor before
    // exercising the production customer-calculation boundary.
    await approveEditor(page);
    await page.reload();
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    for (const field of PRODUCT_PRICE_FIELDS) {
      assert.equal(await productToggle(page, field, label).isChecked(), false);
      await waitForTierOnlyRow(page, field, label);
    }

    const live = loadPricebook(owner);
    const quote = bridge.calculateApplicationQuote(live, live.services[0], {
      serviceId:live.services[0].id,
      customerInputs:input.customerInputs
    }, { ownerId:owner, ...date });
    assert.equal(quote.customerResult.resultType, 'INSTANT_ESTIMATE_READY');
    assert.deepEqual(quote.internalResult.options.map(option => option.tierName), ['Premium']);
    assert.equal(quote.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents, 200200);
    assert.deepEqual(quote.customerResult.options.map(option => option.tierName), ['Premium']);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

function blankProductFixture(type) {
  const configured = toggleFixture(type);
  return {
    ...configured,
    blankProduct:type === 'SIDING_REPLACEMENT' ? 'fiber_cement' : 'carpet',
    blankLabel:type === 'SIDING_REPLACEMENT' ? 'Fiber cement' : 'Carpet',
    added:{ laborPerSqft:235, materialPerSqft:465 }
  };
}

async function exerciseBlankProductSaveBlock(type, controlField) {
  const { input, product, unrelated, blankProduct, blankLabel, added } = blankProductFixture(type);
  const owner = seed(input, true);
  const before = loadPricebook(owner).services[0];
  const { context, page, errors, saveRequests } = await openEditor(owner, type);
  try {
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    for (const field of PRODUCT_PRICE_FIELDS) {
      assert.equal(await productToggle(page, field, blankLabel).isChecked(), false);
      assert.equal(await rowStatus(page, field, blankLabel), 'NOT OFFERED');
    }

    await productToggle(page, controlField, blankLabel).click();
    for (const field of PRODUCT_PRICE_FIELDS) {
      assert.equal(await productToggle(page, field, blankLabel).isChecked(), true);
      assert.equal(await productInput(page, field, blankLabel).inputValue(), '');
      await waitForRowStatus(page, field, blankLabel, 'NEEDS PRICE');
    }

    const requestsBeforeBlankSave = saveRequests();
    await page.getByRole('button', { name:'Save & validate', exact:true }).click();
    await page.waitForTimeout(250);
    assert.equal(saveRequests(), requestsBeforeBlankSave, 'a blank enabled product must not reach persistence');
    await page.getByText(
      blankLabel+' base pricing is incomplete. Enter the labor and material prices, or turn '+blankLabel+' base pricing off before saving.',
      { exact:true }
    ).waitFor();
    for (const field of PRODUCT_PRICE_FIELDS) {
      assert.equal(await productToggle(page, field, blankLabel).isChecked(), true);
      assert.equal(await productInput(page, field, blankLabel).inputValue(), '');
    }

    // A partial pair remains in the draft and receives a component-specific
    // explanation; the other products and retained options are not mutated.
    await productInput(page, controlField, blankLabel).fill(String(added[controlField] / 100));
    const missingField = controlField === 'laborPerSqft' ? 'materialPerSqft' : 'laborPerSqft';
    const missingWord = missingField === 'laborPerSqft' ? 'labor' : 'material';
    await page.getByRole('button', { name:'Save & validate', exact:true }).click();
    await page.waitForTimeout(250);
    assert.equal(saveRequests(), requestsBeforeBlankSave, 'a partial enabled product must not reach persistence');
    await page.getByText(
      blankLabel+' base pricing is incomplete. Enter the '+missingWord+' price, or turn '+blankLabel+' base pricing off before saving.',
      { exact:true }
    ).waitFor();
    assert.equal(await productInput(page, controlField, blankLabel).inputValue(), String(added[controlField] / 100));
    assert.equal(await productInput(page, missingField, blankLabel).inputValue(), '');

    await productInput(page, missingField, blankLabel).fill(String(added[missingField] / 100));
    for (const field of PRODUCT_PRICE_FIELDS) await waitForRowStatus(page, field, blankLabel, 'READY');
    await saveEditor(page);
    assert.equal(saveRequests(), requestsBeforeBlankSave + 1);
    assert.equal(bridge.bookStatuses(loadPricebook(owner), date)[0].approvalCurrent, false);

    await page.reload();
    await page.getByText('NEEDS PRICING', { exact:false }).first().waitFor();
    for (const field of PRODUCT_PRICE_FIELDS) {
      assert.equal(await productToggle(page, field, blankLabel).isChecked(), true);
      assert.equal(await rowStatus(page, field, blankLabel), 'READY');
    }
    const stored = loadPricebook(owner).services[0];
    assert.equal(stored.pricing.laborPerSqft[blankProduct], added.laborPerSqft);
    assert.equal(stored.pricing.materialPerSqft[blankProduct], added.materialPerSqft);
    assert.equal(stored.pricing.laborPerSqft[product], before.pricing.laborPerSqft[product]);
    assert.equal(stored.pricing.materialPerSqft[product], before.pricing.materialPerSqft[product]);
    assert.equal(stored.pricing.laborPerSqft[unrelated], before.pricing.laborPerSqft[unrelated]);
    assert.equal(stored.pricing.materialPerSqft[unrelated], before.pricing.materialPerSqft[unrelated]);
    assert.deepEqual(stored.tiers, before.tiers);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

test('QE-007 browser: approved free flooring product rows survive save/reload and approval invalidates on later edits', async () => {
  const input = applicationFixture('FLOORING_INSTALL', 'free');
  const owner = seed(input, true);
  const { context, page, errors } = await openEditor(owner, input.serviceType);
  try {
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Tile'), 'READY');
    assert.equal(await rowStatus(page, 'materialPerSqft', 'Tile'), 'READY');
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Carpet'), 'NOT OFFERED');

    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/pricebook/save') && response.request().method() === 'POST'),
      page.getByRole('button', { name:'Save & validate', exact:true }).click()
    ]);
    await page.reload();
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Tile'), 'READY');

    // A non-price edit changes the approved content digest. The zero policy is
    // retained, but customer quoting must pause until the changed book is
    // explicitly re-approved.
    const minimum = page.locator('#field-minimumJob input');
    await minimum.fill('1');
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/pricebook/save') && response.request().method() === 'POST'),
      page.getByRole('button', { name:'Save & validate', exact:true }).click()
    ]);
    await page.getByText('NEEDS PRICING', { exact:false }).first().waitFor();
    const stored = loadPricebook(owner);
    const status = bridge.bookStatuses(stored, date)[0];
    assert.equal(status.approvalCurrent, false);
    assert.equal(status.status, 'NEEDS PRICING');
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Tile'), 'READY');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('QE-007 browser: approved included flooring zero is READY only with its selected positive covering charge', async () => {
  const input = applicationFixture('FLOORING_INSTALL', 'included');
  const owner = seed(input, true);
  const { context, page, errors } = await openEditor(owner, input.serviceType);
  try {
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    assert.equal(await rowStatus(page, 'materialPerSqft', 'Vinyl plank'), 'READY');
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Vinyl plank'), 'READY');
    assert.equal(await rowStatus(page, 'materialPerSqft', 'Tile'), 'NOT OFFERED');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('QE-007 browser: unclassified zero is not READY, while a positive flooring price is READY', async () => {
  const input = applicationFixture('FLOORING_INSTALL', 'unclassified-zero');
  const owner = seed(input, false);
  const { context, page, errors } = await openEditor(owner, input.serviceType);
  try {
    await page.getByText('NEEDS PRICING', { exact:false }).first().waitFor();
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Tile'), 'NEEDS PRICE');
    assert.equal(await rowStatus(page, 'materialPerSqft', 'Tile'), 'READY');
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Carpet'), 'NOT OFFERED');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('QE-007 browser: an offered product with a missing price is NEEDS PRICE', async () => {
  const input = applicationFixture('FLOORING_INSTALL', 'missing');
  const owner = seed(input, false);
  const { context, page, errors } = await openEditor(owner, input.serviceType);
  try {
    await page.getByText('NEEDS PRICING', { exact:false }).first().waitFor();
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Tile'), 'NEEDS PRICE');
    assert.equal(await rowStatus(page, 'materialPerSqft', 'Tile'), 'READY');
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Carpet'), 'NOT OFFERED');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('QE-007 browser: approved free and positive siding product rows are distinguished correctly', async () => {
  for (const mode of ['free', 'positive']) {
    const input = applicationFixture('SIDING_REPLACEMENT', mode);
    const owner = seed(input, true);
    const { context, page, errors } = await openEditor(owner, input.serviceType);
    try {
      await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
      assert.equal(await rowStatus(page, 'laborPerSqft', 'Vinyl'), 'READY', mode);
      assert.equal(await rowStatus(page, 'materialPerSqft', 'Vinyl'), 'READY', mode);
      assert.equal(await rowStatus(page, 'laborPerSqft', 'Wood'), 'NOT OFFERED', mode);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
});

for (const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT','SIDING_REPLACEMENT']) {
  for (const controlField of ['laborPerSqft','materialPerSqft']) {
    test('QE-007 follow-up: '+type+' '+controlField+' toggle coherently disables and re-enables its paired product', async () => {
      await exercisePairedProductToggle(type, controlField);
    });
  }
}

for (const controlField of PRODUCT_PRICE_FIELDS) {
  test('QE-007 second follow-up: FLOORING_INSTALL '+controlField+' base-off control discloses retained tier availability and still quotes the exact Premium amount after reapproval', async () => {
    await exerciseTierOnlyCustomerQuote(controlField);
  });
}

for (const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT','SIDING_REPLACEMENT']) {
  for (const controlField of PRODUCT_PRICE_FIELDS) {
    test('QE-007 second follow-up: '+type+' '+controlField+' blank product selection is retained in the draft and blocked from disappearing on save', async () => {
      await exerciseBlankProductSaveBlock(type, controlField);
    });
  }
}

test('QE-007 follow-up: a partially configured flooring pair can be turned off from its missing side', async () => {
  const input = applicationFixture('FLOORING_REPLACEMENT', 'missing');
  const owner = seed(input, false);
  const { context, page, errors } = await openEditor(owner, input.serviceType);
  try {
    await page.getByText('NEEDS PRICING', { exact:false }).first().waitFor();
    assert.equal(await productToggle(page, 'laborPerSqft', 'Tile').isChecked(), true);
    assert.equal(await productToggle(page, 'materialPerSqft', 'Tile').isChecked(), true);
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Tile'), 'NEEDS PRICE');
    assert.equal(await rowStatus(page, 'materialPerSqft', 'Tile'), 'READY');

    await productToggle(page, 'laborPerSqft', 'Tile').click();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, 'Tile').isChecked(), false);
      await waitForRowStatus(page, field, 'Tile', 'NOT OFFERED');
    }
    await saveEditor(page);
    await page.reload();
    await page.getByText('NEEDS PRICING', { exact:false }).first().waitFor();
    const disabled = loadPricebook(owner).services[0];
    assert.equal(Object.hasOwn(disabled.pricing.laborPerSqft || {}, 'tile'), false);
    assert.equal(Object.hasOwn(disabled.pricing.materialPerSqft || {}, 'tile'), false);

    await productToggle(page, 'materialPerSqft', 'Tile').click();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, 'Tile').isChecked(), true);
      assert.equal(await productInput(page, field, 'Tile').inputValue(), '');
      await waitForRowStatus(page, field, 'Tile', 'NEEDS PRICE');
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('QE-007 follow-up: re-enabling an approved free pair does not manufacture free zero prices', async () => {
  const input = applicationFixture('FLOORING_INSTALL', 'free');
  const owner = seed(input, true);
  const before = loadPricebook(owner).services[0];
  const { context, page, errors } = await openEditor(owner, input.serviceType);
  try {
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    await productToggle(page, 'materialPerSqft', 'Tile').click();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, 'Tile').isChecked(), false);
      await waitForRowStatus(page, field, 'Tile', 'NOT OFFERED');
    }

    await productToggle(page, 'materialPerSqft', 'Tile').click();
    for (const field of ['laborPerSqft','materialPerSqft']) {
      assert.equal(await productToggle(page, field, 'Tile').isChecked(), true);
      assert.equal(await productInput(page, field, 'Tile').inputValue(), '');
      await waitForRowStatus(page, field, 'Tile', 'NEEDS PRICE');
    }

    // Exact zero becomes READY only after the owner deliberately enters it.
    // Re-entering the complete, unchanged approved content keeps its
    // content-bound approval current; a changed save is covered above.
    await productInput(page, 'laborPerSqft', 'Tile').fill('0');
    await productInput(page, 'materialPerSqft', 'Tile').fill('0');
    await waitForRowStatus(page, 'laborPerSqft', 'Tile', 'READY');
    await waitForRowStatus(page, 'materialPerSqft', 'Tile', 'READY');
    await saveEditor(page);
    await page.reload();
    await page.getByText('QUOTING LIVE', { exact:false }).first().waitFor();
    const restored = loadPricebook(owner).services[0];
    assert.equal(restored.pricing.laborPerSqft.tile, 0);
    assert.equal(restored.pricing.materialPerSqft.tile, 0);
    assert.deepEqual(restored.zeroPricePolicy, before.zeroPricePolicy);
    assert.equal(bridge.bookStatuses(loadPricebook(owner), date)[0].approvalCurrent, true);
    assert.equal(await rowStatus(page, 'laborPerSqft', 'Tile'), 'READY');
    assert.equal(await rowStatus(page, 'materialPerSqft', 'Tile'), 'READY');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
