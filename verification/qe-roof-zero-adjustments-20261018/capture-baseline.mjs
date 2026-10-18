// Run ONLY on the pinned base, before editing production. No live providers.
import '../../test/pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {roof,pitchBands,total,OLD_VERSION} from './fixture.mjs';
import {generateQuoteVNext,ENGINE_VERSION} from '../../server/quote-engine-vnext/index.js';
import {webQuote,db} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';
const base='1857b7779b83b70f7753b41b72c3677270cd4ffc';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base);
assert.equal(ENGINE_VERSION,OLD_VERSION);
assert.equal(execFileSync('git',['diff','--','server'],{encoding:'utf8'}),'');
const controls=[];
for(const row of [...pitchBands.map(r=>({customer:{pitchBand:r.band},expected:r.positive})),{customer:{pitchBand:'up_to_six',existingLayers:3,stories:2},expected:549400}]){
  const q=generateQuoteVNext(roof(row.customer));assert.equal(total(q),row.expected);
  controls.push({...row,lineItems:q.lineItems});
}
writeFileSync(new URL('./positive-v8-lines.json',import.meta.url),JSON.stringify({base,engineVersion:ENGINE_VERSION,controls},null,2)+'\n');
const f=roof();delete f.ownerPricing.startingValueAdoptions;
const w=webQuote(f,[],undefined,{roofRuleMode:'new'});
assert.equal(w.result.midEstimate,4858);assert.equal(w.service.quoteDoneApproval.engineVersion,OLD_VERSION);
const quote=db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(w.owner,w.row.recordId);
writeFileSync(new URL('./historical-v8.json',import.meta.url),JSON.stringify({base,owner:w.owner,book:w.book,body:w.body,response:w.result,submission:w.row,quote},null,2)+'\n');
console.log(JSON.stringify({base,engineVersion:ENGINE_VERSION,positiveControls:controls.length,historicalCents:485800,providerCalls:0}));
