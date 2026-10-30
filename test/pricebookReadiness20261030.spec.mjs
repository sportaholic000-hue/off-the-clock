import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as bridge from '../server/src/quoteDoneBridge.js';
import * as store from '../server/priceBookService.js';
import {CONCRETE_OWNER_DECISIONS} from './ownerDecisionsFixture.mjs';
import {pricebookReadiness} from '../server/scripts/pricebook-readiness.js';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';

// The readiness report lists, for every saved book, which services quote under
// this engine and what the rest need, without prices or customer data.
const CATEGORIES=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(CATEGORIES.map(key=>[key,value]));
const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,
  taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(true),peakMonths:[],peakSurchargePercent:0};
const patio=pricing=>({serviceType:'CONCRETE_PATIO_SLAB',service:'[SYNTHETIC] Patio',source:'MANUAL',active:true,tiers:[],
  feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},
  priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),pricing:{...CONCRETE_OWNER_DECISIONS,laborPerSqft:5.1,concreteCostPerCubicYard:172,formworkPerLF:2.85,minimumJob:0,...pricing}});
function saved(pricing,approve){
  const ownerId='readiness-'+crypto.randomUUID();
  bridge.saveApplicationBook(ownerId,{revision:bridge.readApplicationBook(ownerId).revision,services:[patio(pricing)],defaults});
  const book=store.loadPricebook(ownerId);
  if(approve){const status=bridge.applicationStatus(book.services[0],book);bridge.approveApplicationService(ownerId,book.services[0].id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields});}
  return ownerId;
}

test('the readiness report names each service that cannot quote and what it needs',()=>{
  const live=saved({},true),noMix=saved({concreteMixDescription:undefined},false);
  const report=pricebookReadiness();
  assert.equal(report.engineVersion,ENGINE_VERSION);
  const row=id=>report.rows.find(r=>r.ownerId===id);
  assert.equal(row(live).status,'QUOTING LIVE');assert.equal(row(live).approvedEngineVersion,ENGINE_VERSION);
  assert.equal(row(noMix).status,'NEEDS PRICING');assert.ok(row(noMix).missingOwnerFields.includes('concreteMixDescription'));
  // Field names only: no prices or saved settings.
  assert.doesNotMatch(JSON.stringify(report),/"pricing"|concreteCostPerCubicYard|"172"|5\.1/);
  // The command-line report reads the same directory and writes nothing.
  const before=JSON.stringify(store.loadPricebook(noMix));
  const run=spawnSync(process.execPath,[fileURLToPath(new URL('../server/scripts/pricebook-readiness.js',import.meta.url))],{env:process.env,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const printed=JSON.parse(run.stdout);
  assert.equal(printed.rows.find(r=>r.ownerId===noMix).status,'NEEDS PRICING');
  assert.equal(JSON.stringify(store.loadPricebook(noMix)),before);
});
