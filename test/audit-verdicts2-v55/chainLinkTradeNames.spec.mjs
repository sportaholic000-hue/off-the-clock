// Verdicts on the deployment and v54 audits, item 1.5: chain link was
// recognized only by a fence-type name containing "chain", so an owner who
// names it "Cyclone" (a common trade name for chain link, as is "hurricane
// fence") got the 12 ft limit instead of chain link's 10 ft (ASTM F567).
// "Mesh" stays unrecognized: it also names welded-wire products.
// Expected, written before the change: cyclone, cyclone_fence, hurricane and
// hurricane_fence are held to 10 ft; wire_mesh keeps 12 ft.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {chainLinkFenceType,fencePostSpacingProblem} from '../../server/quote-engine-vnext/fencePricing.js';

test('cyclone and hurricane fences are chain link',()=>{
  for(const name of ['chain_link','chainlink','cyclone','cyclone_fence','hurricane','hurricane_fence','Cyclone']){
    assert.equal(chainLinkFenceType(name),true,name);
    assert.equal(fencePostSpacingProblem(name,10),null,name);assert.match(fencePostSpacingProblem(name,12)||'',/at most 10 feet/,name);
  }
  for(const name of ['wire_mesh','galvanized_mesh','wood','vinyl']){assert.equal(chainLinkFenceType(name),false,name);assert.equal(fencePostSpacingProblem(name,12),null,name);}
});
