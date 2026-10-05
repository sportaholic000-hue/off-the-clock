import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest,ENGINE_VERSION} from '../server/src/quoteDoneBridge.js';

test('QP-04 a persisted $2701 v4 receipt replays unchanged after the v5 approval boundary',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'otc-quote-history-')),previous=process.env.DATABASE_PATH;
 process.env.DATABASE_PATH=join(directory,'synthetic.sqlite');let db;
 try{
  const database=await import('../server/src/db.js');db=database.db;database.migrate();
  const {submitQuote}=await import('../server/src/quoteDoneRoutes.js');
  const owner='synthetic-history-'+randomUUID(),now='2026-10-05T12:00:00.000Z';
  db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner',now);
  const body={requestId:randomUUID(),serviceId:randomUUID(),customerInputs:{stairSteps:10}},oldVersion='quote-engine-vnext-audit-decisions-20261004-v4';
  const response={resultType:'INSTANT_ESTIMATE_READY',quoteId:randomUUID(),lowEstimate:2701,midEstimate:2701,highEstimate:2701,options:[{tierName:null,lowEstimate:2701,midEstimate:2701,highEstimate:2701}]};
  const internal=JSON.stringify({engineVersion:oldVersion,calculationRecord:{engineVersion:oldVersion,finalTotalCents:270100}}),stored=JSON.stringify(response);
  db.prepare('INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,body.requestId,digest(body),response.quoteId,response.resultType,'synthetic-v4',JSON.stringify(body),internal,stored,now);
  assert.notEqual(ENGINE_VERSION,oldVersion);
  const replay=submitQuote(owner,body);assert.equal(replay.status,200);assert.deepEqual(replay.response,response);
  const row=db.prepare('SELECT internalOutcomeJson,customerResponseJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,body.requestId);
  assert.equal(row.internalOutcomeJson,internal);assert.equal(row.customerResponseJson,stored);
  assert.throws(()=>submitQuote(owner,{...body,customerInputs:{stairSteps:11}}),/different submitted details/);
 }finally{db?.close();if(previous===undefined)delete process.env.DATABASE_PATH;else process.env.DATABASE_PATH=previous;rmSync(directory,{recursive:true,force:true});}
});
