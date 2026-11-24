// Audit f1501ff #7 (November 24, 2026): flatRoofItemBasis was the only
// tree-shaped price-book field typed 'number', so the editor showed a dollar
// box, the AI interview rejected a per-detail choice, and owners could not say
// which details their base price includes. Expected, written before the fix:
// - every tree-shaped field of every service is typed 'json' (general rule,
//   so a new tree field cannot regress the same way);
// - the interview accepts {flatRoofEdgeMetalPerLF:'included_in_base'} and
//   still rejects an unknown choice, an unknown detail and a bare number.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {validateInterviewValue} from '../../server/src/priceBookAI.js';

test('f1501ff #7: every tree-shaped field is typed json in the editor metadata',()=>{
  const wrong=[];
  for(const service of bridge.applicationMetadata().services)for(const field of service.fields)if(field.tree&&field.type!=='json')wrong.push(service.serviceType+'.'+field.field+': '+field.type);
  assert.deepEqual(wrong,[]);
});
test('f1501ff #7: the interview accepts a per-detail choice and rejects bad values',()=>{
  assert.deepEqual(validateInterviewValue('FLAT_ROOF_REPLACEMENT','flatRoofItemBasis',{flatRoofEdgeMetalPerLF:'included_in_base'}),{flatRoofEdgeMetalPerLF:'included_in_base'});
  for(const bad of [{flatRoofEdgeMetalPerLF:'free'},{notADetail:'included_in_base'},5])
    assert.throws(()=>validateInterviewValue('FLAT_ROOF_REPLACEMENT','flatRoofItemBasis',bad));
});
