// Neon audit of v48 #5 (November 25, 2026): the owner's price-book preview
// built its form from the service's own questions only, so the postal or ZIP
// code (travel zones, tax by job location, taxed business) and the work month
// (busy-season or winter concrete pricing) the customer form asks were
// missing, and every such preview went to review. Expected, written before
// the fix: the preview asks the same job-context questions as the customer
// definition, and none when the book needs none.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {concrete} from '../../verification/engine-independent/fixtures.mjs';
import {readFileSync} from 'node:fs';
import {customerQuoteFields} from '../../server/customerQuoteFields.js';
import {customerContextFields} from '../../server/customerContextFields.js';
// The preview (client/src/offeringEditor.jsx) is the service questions plus
// customerContextFields; the .jsx cannot be loaded by node:test directly.
const offeringPreviewFields=(meta,service,defaults)=>[...customerQuoteFields(service,service.pricing),...customerContextFields(service,service.pricing,defaults)];
import * as bridge from '../../server/src/quoteDoneBridge.js';

const names=fields=>fields.map(f=>f.name).filter(n=>['postalCode','workMonth'].includes(n));
test('Neon v48 #5: the preview asks the postal code and work month the customer form asks',()=>{
  const f=concrete();Object.assign(f.ownerPricing,{peakMonths:[6,7,8],peakSurchargePercent:10});
  const defaults={...f.businessDefaults,taxMode:'TAX_ALL',taxPercent:13};
  const customer=bridge.applicationServiceDefinition(f.ownerPricing,{defaults,services:[f.ownerPricing]}).customerFields;
  assert.deepEqual(names(customer),['postalCode','workMonth']);
  assert.deepEqual(names(offeringPreviewFields(null,f.ownerPricing,defaults)),names(customer));
  const plain={...f.businessDefaults,taxMode:'TAX_NONE'};f.ownerPricing.peakMonths=[];
  assert.deepEqual(names(offeringPreviewFields(null,f.ownerPricing,plain)),names(bridge.applicationServiceDefinition(f.ownerPricing,{defaults:plain,services:[f.ownerPricing]}).customerFields));
});
test('Neon v48 #5: the price-book preview uses the shared job-context rule',()=>{
  const source=readFileSync(new URL('../../client/src/offeringEditor.jsx',import.meta.url),'utf8');
  assert.match(source,/export function offeringPreviewFields\(meta,service,defaults\)[\s\S]{0,200}customerContextFields\(/);
  assert.match(readFileSync(new URL('../../client/src/pricebook.jsx',import.meta.url),'utf8'),/offeringPreviewFields\(selectedMeta,selected,book\.defaults\)/);
});
