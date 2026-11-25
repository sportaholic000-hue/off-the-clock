// Neon audit of v48 #3 (November 25, 2026): the price-book editor stores a
// percent field as a fraction (15% -> 0.15); the interview asked "(%)",
// "enter 20 for 20%", and saved 15 as 15 (1,500% gravel compaction, 1,500%
// tile waste). Expected, written before the fix:
// - the interview keeps the owner's percentage (15) in the draft;
// - the draft review payload, which becomes the price book, holds 0.15 for
//   baseCompactionAllowance and {tile:0.15} for diagonalWasteAdderByType;
// - a percentage over 100 is refused at capture.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateInterviewValue} from '../../server/src/priceBookAI.js';
import * as onboarding from '../../server/src/onboardingService.js';
import {db,migrate} from '../../server/src/db.js';

migrate();
function owner(){const id='neon-v48-3-'+randomUUID(),now='2026-11-25T12:00:00.000Z';db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'UTC','owner',now);return id;}

for(const [type,field,value,expected] of [['CONCRETE_DRIVEWAY','baseCompactionAllowance',15,0.15],['FLOORING_INSTALL','diagonalWasteAdderByType',{tile:15},{tile:0.15}]])
test('Neon v48 #3: '+field+' is saved as a fraction in the price book',()=>{
  const id=owner(),draft=onboarding.createInterviewDraft(id,{mode:'browser',serviceTypes:[type]});
  const saved=onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{[type]:{[field]:value}}});
  assert.deepEqual(saved.fields[type][field],value);
  assert.deepEqual(onboarding.draftReviewPayload(id,draft.id).services[0].fields[field],expected);
});
test('Neon v48 #3: a percentage over 100 is refused',()=>{
  assert.throws(()=>validateInterviewValue('CONCRETE_DRIVEWAY','baseCompactionAllowance',150,{}),/0 to 100/);
  // Message changed by Neon v49 NEW-10: this field's own limit is 50%.
  assert.throws(()=>validateInterviewValue('FLOORING_INSTALL','diagonalWasteAdderByType',{tile:150},{}),/0 to 50/);
});
