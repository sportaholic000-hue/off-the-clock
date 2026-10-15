import './pricebookTestEnv.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { flooring, siding } from '../verification/engine-independent/fixtures.mjs';
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
  const input = type === 'FLOORING_INSTALL' ? flooring(mode === 'included' ? 'vinyl_plank' : 'tile') : siding();
  input.ownerPricing.service = '[SYNTHETIC] '+mode+' '+type;
  if (mode === 'free') {
    if (type === 'FLOORING_INSTALL') {
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
      else if (url.pathname === '/api/pricebook/save') payload = bridge.saveApplicationBook(owner, body, date);
      else if (url.pathname === '/api/pricebook/preview') payload = bridge.previewApplicationQuote(owner, body, date);
      else throw Error('Unexpected test endpoint '+url.pathname);
    } catch (error) {
      status = error.statusCode || 400;
      payload = { error:error.message, details:error.details };
    }
    await route.fulfill({ status, contentType:'application/json', body:JSON.stringify(payload) });
  });
  await page.goto('http://zero-price-editor.test/');
  await page.getByRole('heading', { name:'Price book', exact:true }).waitFor();
  return { context, page, errors };
}

function productRow(page, field, product) {
  return page.locator('#field-'+field+' tbody tr').filter({ has:page.getByText(product, { exact:true }) });
}

async function rowStatus(page, field, product) {
  const row = productRow(page, field, product);
  await row.waitFor();
  return (await row.locator('td.matrix-status').innerText()).trim();
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
