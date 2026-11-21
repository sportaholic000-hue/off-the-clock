import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

// November 21, 2026 (v42). Worked by hand: a draft holds carpet labor at 3.00
// per square foot. The owner then says carpet material is 30 dollars a square
// yard. 30 / 9 has no exact amount per square foot, so the draft's carpet unit
// becomes square yards: material 30.00 as stated, labor 3.00 x 9 = 27.00, and
// tile labor 4.00 per square foot untouched. Real provider parsing, SQLite save
// and reread; only the provider's HTTP reply is synthetic.
test('the interview saves an ordinary per-square-yard carpet price by changing the carpet unit',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-interview-yard-'));
  const previous={DATABASE_PATH:process.env.DATABASE_PATH,GEMINI_TEXT_MODEL:process.env.GEMINI_TEXT_MODEL,GEMINI_API_KEY:process.env.GEMINI_API_KEY};
  const originalFetch=globalThis.fetch;
  Object.assign(process.env,{DATABASE_PATH:join(directory,'synthetic.sqlite'),GEMINI_TEXT_MODEL:'synthetic-text-model',GEMINI_API_KEY:'SYNTHETIC_TEST_ONLY'});
  let db;
  try {
    const database=await import('../server/src/db.js');db=database.db;database.migrate();
    const {createInterviewDraft,saveInterviewDraft,getInterviewDraft,assistInterviewDraft}=await import('../server/src/onboardingService.js');
    const owner='synthetic-yard-'+randomUUID(),now='2026-11-21T12:00:00Z';
    db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner',now);
    const type='FLOORING_INSTALL',draft=createInterviewDraft(owner,{serviceTypes:[type]});
    const saved=saveInterviewDraft(owner,draft.id,{revision:draft.revision,fields:{[type]:{laborPerSqft:{carpet:3,tile:4}}},confirmedFields:{[type]:['laborPerSqft']}});
    assert.deepEqual(saved.fields[type].laborPerSqft,{carpet:3,tile:4});
    const reply=value=>{globalThis.fetch=async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})});};
    reply({value:{carpet:30},carpetSourceUnit:'square_yard'});
    const assisted=await assistInterviewDraft(owner,draft.id,{serviceType:type,field:'materialPerSqft',answer:'[SYNTHETIC] carpet is thirty dollars a square yard'});
    assert.deepEqual(assisted.value,{carpet:30});assert.equal(assisted.carpetPriceUnit,'square_yard');
    const fields=getInterviewDraft(owner,draft.id).fields[type];
    assert.equal(fields.carpetPriceUnit,'square_yard');
    assert.deepEqual(fields.materialPerSqft,{carpet:30});
    assert.deepEqual(fields.laborPerSqft,{carpet:27,tile:4});
    // The labor price itself did not change, so its confirmation stays; the new answer is unconfirmed.
    assert.ok(assisted.draft.confirmedFields[type].includes('laborPerSqft'));
    assert.ok(!assisted.draft.confirmedFields[type].includes('materialPerSqft'));
    // A later per-yard answer on the square-yard draft is kept as stated, with no unit change.
    reply({value:{carpet:25},carpetSourceUnit:'square_yard'});
    const again=await assistInterviewDraft(owner,draft.id,{serviceType:type,field:'materialPerSqft',answer:'[SYNTHETIC] make that twenty-five a yard'});
    assert.deepEqual(again.value,{carpet:25});assert.equal(again.carpetPriceUnit,undefined);
    assert.deepEqual(getInterviewDraft(owner,draft.id).fields[type].laborPerSqft,{carpet:27,tile:4});
  } finally {
    db?.close();globalThis.fetch=originalFetch;
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
    rmSync(directory,{recursive:true,force:true});
  }
});
