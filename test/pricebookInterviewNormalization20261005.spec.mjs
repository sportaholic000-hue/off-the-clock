import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateInterviewValue} from '../server/src/priceBookAI.js';

// Prewritten expectations: $5.00/sq ft survives provider parsing, SQLite save,
// reread and equivalent manual resave. No job quote is produced. Collisions
// leave the prior saved draft unchanged. See QUOTE_LAUNCH_DECISIONS_20261005.md.
test('interview stores normalized maps through manual and actual assist paths without losing confirmation',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-interview-names-'));
  const previous={DATABASE_PATH:process.env.DATABASE_PATH,GEMINI_API_KEY:process.env.GEMINI_API_KEY};
  const originalFetch=globalThis.fetch;
  Object.assign(process.env,{DATABASE_PATH:join(directory,'synthetic.sqlite'),GEMINI_API_KEY:'SYNTHETIC_TEST_ONLY'});
  let db;
  try {
    const database=await import('../server/src/db.js');db=database.db;database.migrate();
    const {createInterviewDraft,saveInterviewDraft,getInterviewDraft,assistInterviewDraft}=await import('../server/src/onboardingService.js');
    const owner='synthetic-names-'+randomUUID(),now='2026-10-05T12:00:00Z';
    db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner',now);
    const type='FLAT_ROOF_REPLACEMENT',draft=createInterviewDraft(owner,{serviceTypes:[type]});
    const fields={laborPerSqft:{'EPDM rubber':5},knownOfferings:{membraneType:{'EPDM rubber':true}}};
    const saved=saveInterviewDraft(owner,draft.id,{fields:{[type]:fields},confirmedFields:{[type]:Object.keys(fields)}});
    assert.deepEqual(saved.fields[type].laborPerSqft,{epdm_rubber:5});
    assert.deepEqual(saved.fields[type].knownOfferings,{membraneType:{epdm_rubber:true}});
    const same=saveInterviewDraft(owner,draft.id,{fields:{[type]:fields}});
    assert.deepEqual(same.confirmedFields[type],Object.keys(fields));
    assert.deepEqual(getInterviewDraft(owner,draft.id).fields,same.fields);
    const before=getInterviewDraft(owner,draft.id);
    assert.throws(()=>saveInterviewDraft(owner,draft.id,{fields:{[type]:{laborPerSqft:{'EPDM rubber':5,epdm_rubber:2.5}}}}),/already listed/);
    assert.deepEqual(getInterviewDraft(owner,draft.id),before);
    let calls=0;
    globalThis.fetch=async url=>{
      assert.equal(new URL(url).hostname,'generativelanguage.googleapis.com');calls++;
      return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"value":{"EPDM rubber":5}}'}]}}]})};
    };
    const assisted=await assistInterviewDraft(owner,draft.id,{serviceType:type,field:'laborPerSqft',answer:'[SYNTHETIC] EPDM rubber five dollars per square foot'});
    assert.equal(calls,1);assert.deepEqual(assisted.value,{epdm_rubber:5});
    assert.deepEqual(assisted.draft.fields[type].laborPerSqft,validateInterviewValue(type,'laborPerSqft',fields.laborPerSqft));
    assert.ok(!assisted.draft.confirmedFields[type].includes('laborPerSqft'));
    assert.deepEqual(getInterviewDraft(owner,draft.id).fields,assisted.draft.fields);
  } finally {
    db?.close();globalThis.fetch=originalFetch;
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
    rmSync(directory,{recursive:true,force:true});
  }
});
