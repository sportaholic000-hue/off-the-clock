import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmsIdentity} from '../server/src/voice/identityAnswer.js';

// Unaccented "si" is dropped: it is also an English name ("This is Si"). "Sí" still works.
// Neon (89ff890b) added French "ben" as a filler word and Spanish "si" as a yes.
// Both are English names, so "This is Ben" was taken as a yes for a saved
// customer named Sally, and that caller would get Sally's saved details.
// HANDWRITTEN EXPECTATIONS, before execution:
// - for saved name Sally, none of these answers recognises the caller (an
//   answer starting with yes still counts, per the owner's rule of 2026-11-20);
// - Ben's own "This is Ben" / "Ben here" still recognises a saved Ben.
test('another person naming themselves is never taken as the saved customer',()=>{
  for(const answer of ['This is Ben','Ben speaking','Ben here','Si here','This is Si','Ben','I\'m Ben'])
    assert.equal(confirmsIdentity(answer,'Sally','Sally Synthetic'),false,answer);
  for(const answer of ['This is Ben','Ben here','Ben speaking','Yes'])
    assert.equal(confirmsIdentity(answer,'Ben','Ben Synthetic'),true,answer);
});
