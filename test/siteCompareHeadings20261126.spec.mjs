import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TYPES} from '../site/build/competitors.mjs';

// The comparison hub's group headings were built by adding "s" to each type, which
// printed "AI receptionist for home servicess" and "AI and live receptionistss".
// HANDWRITTEN EXPECTATION: the built page shows exactly these five headings, in order.
test('comparison hub: every group heading is a correct plural',()=>{
  const html=readFileSync(new URL('../site/www/compare/index.html',import.meta.url),'utf8');
  const headings=[...html.matchAll(/<h2 style="margin-top:36px">([^<]*)<\/h2>/g)].map(match=>match[1]).filter(text=>text!=='Guides');
  assert.equal(TYPES.length,5);
  assert.deepEqual(headings,['Field service software add-ons','AI receptionists for home services','AI receptionists','AI and live receptionists','Live answering services']);
  assert.doesNotMatch(html,/servicess|receptionistss/);
});
