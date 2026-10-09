import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {OWNER_QUERY_EXCEPTIONS, OWNER_QUERY_NON_QUERY_USES} from '../server/src/ownerQueryExceptions.js';
import {prepareInventory,unlistedPrepares} from './helpers/ownerQueryScan.mjs';

const root=new URL('..',import.meta.url).pathname;
test('every direct database prepare in server is an exact listed exception',()=>{
 const exceptions=new Map();
 for(const row of OWNER_QUERY_EXCEPTIONS){
  assert.ok(typeof row.file==='string'&&row.file.startsWith('server/'));
  assert.ok(typeof row.function==='string'&&row.function.length>0);
  assert.ok(typeof row.reason==='string'&&row.reason.length>8);
  assert.match(row.signature,/^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(row.occurrence)&&row.occurrence>0);
  const key=row.file+'\0'+row.signature+'\0'+row.occurrence;
  assert.ok(!exceptions.has(key),`Duplicate exception: ${row.file} ${row.function}`);
  exceptions.set(key,row);
 }
 const all=prepareInventory(root),unlisted=unlistedPrepares(root,OWNER_QUERY_EXCEPTIONS,OWNER_QUERY_NON_QUERY_USES);
 assert.equal(unlisted.length,0,`${unlisted.length} prepare occurrences are not listed:\n${unlisted.slice(0,20).map(row=>`${row.file}:${row.line} ${row.snippet}`).join('\n')}`);
 for(const row of OWNER_QUERY_EXCEPTIONS)assert.ok(all.some(call=>call.direct&&call.file===row.file&&call.signature===row.signature&&call.occurrence===row.occurrence),`Unused exception: ${row.file} ${row.function}`);
 for(const row of OWNER_QUERY_NON_QUERY_USES){
  assert.ok(row.reason?.length>8,`Missing non-query reason: ${row.file}`);
  assert.ok(Number.isInteger(row.line)&&row.line>0,`Missing line: ${row.file}`);
  assert.ok(all.some(call=>call.file===row.file&&call.line===row.line&&call.signature===row.signature&&call.occurrence===row.occurrence),`Unused allowed use: ${row.file}:${row.line} ${row.function}`);
 }
});

function scratchScan(name,extension,source,expected) {
 const directory=mkdtempSync(join(root,'.owner-query-scan-'));
 try {
  mkdirSync(join(directory,'server','src'),{recursive:true});
  writeFileSync(join(directory,'server','src',name+extension),source);
  const found=unlistedPrepares(directory,[],[]);
  assert.equal(found.length,expected,`${name} should yield exactly ${expected} unlisted occurrences`);
 } finally { rmSync(directory,{recursive:true,force:true}); }
}

test('scan rejects bracketed database[\'prepare\'] in .js: 1 finding',()=>{
 scratchScan('bracket-single','.js',"database['prepare']('SELECT * FROM calls')",1);
});
test('scan rejects double quoted and template computed prepare in .js: 1 each',()=>{
 scratchScan('bracket-double','.js','database["prepare"]("SELECT 1")',1);
 scratchScan('bracket-template','.js','database[`prepare`]("SELECT 1")',1);
});
test('scan rejects dynamic key spelling in .js: 1 finding',()=>{
 scratchScan('bracket-variable','.js',"const key = 'prepare'; database[key]('SELECT 1')",1);
});
test('scan rejects database.prepare.bind alias in .js: 1 finding',()=>{
 scratchScan('bound-alias','.js','const p = database.prepare.bind(database)',1);
});
test('scan rejects const p = database.prepare alias in .js: 1 finding',()=>{
 scratchScan('property-alias','.js','const p = database.prepare',1);
});
test('scan rejects destructured prepare alias in .js: 1 finding',()=>{
 scratchScan('destructured','.js','const {prepare} = database',1);
});
test('scan covers .mjs and .cjs: 1 finding in each',()=>{
 scratchScan('module','.mjs',"database.prepare('SELECT 1')",1);
 scratchScan('common','.cjs',"database.prepare('SELECT 1')",1);
});
test('scan permits an ownerQuery control and ignores commented prepares: 0 findings',()=>{
 scratchScan('control','.mjs',"// database.prepare('SELECT 1')\n/* database['prepare']() */\nownerQuery('SELECT * FROM calls WHERE ownerId=?')",0);
});
test('scan does not mistake a slash inside a regex literal for a comment: 1 finding',()=>{
 scratchScan('regex-literal','.js',"const slash=/[//]/; database.prepare('SELECT 1')",1);
});

test('owner-row predicate preserves owner and staff parent lookup results',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {validateStaffOwnerParent}=await import('../server/src/tenant.js');
 const {usageOwnerQuery}=await import('../server/src/billingUsagePolicy.js');
 const db=new DatabaseSync(':memory:');
 try{
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY, ownerId TEXT, role TEXT NOT NULL);");
  db.prepare("INSERT INTO users(id,ownerId,role) VALUES('owner',NULL,'owner'),('staff','owner','staff'),('orphan',NULL,'staff')").run();
  assert.deepEqual(['owner','staff','orphan','missing'].map(id=>validateStaffOwnerParent(db,id)),[true,false,false,false]);
  const owner=usageOwnerQuery(db)("SELECT role FROM users WHERE id=? AND ownerId IS NULL").get('owner');
  assert.equal(owner.role,'owner');
  assert.throws(()=>usageOwnerQuery(db)('SELECT role FROM users WHERE id=?'),/owner binding/);
 }finally{db.close();}
});

test('voice idempotency receipts persist tenant owner and replay legacy scope records',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {createVoiceToolIdempotencyStore}=await import('../server/src/voice/voicePersistence.js');
 const {CREATE_TABLE_STATEMENTS}=await import('../server/src/schema.js');
 const db=new DatabaseSync(':memory:');
 try{
  for(const statement of CREATE_TABLE_STATEMENTS)db.exec(statement);
  const store=createVoiceToolIdempotencyStore({database:db,clock:()=>new Date('2026-10-09T10:00:00.000Z')});
  const request={ownerId:'synthetic-owner',scope:'a'.repeat(64),key:'synthetic-tool',digest:'b'.repeat(64)};
  assert.deepEqual(await store.run({...request,execute:()=>({value:1})}),{status:'executed',value:{value:1}});
  assert.equal(db.prepare('SELECT ownerId FROM voiceToolIdempotencyReceipts WHERE scopeHash=?').get(request.scope).ownerId,request.ownerId);
  assert.deepEqual(await store.run({...request,execute:()=>{throw Error('should replay');}}),{status:'replayed',value:{value:1}});
  const legacy={...request,scope:'c'.repeat(64)};
  db.prepare("INSERT INTO voiceToolIdempotencyReceipts(scopeHash,idempotencyKey,requestDigest,status,responseJson,leaseExpiresAtUtc,createdAt,updatedAt) VALUES(?,?,?,'COMPLETED','{\"value\":2}',?,?,?)").run(legacy.scope,legacy.key,legacy.digest,'2026-10-09T10:01:00.000Z','2026-10-09T09:00:00.000Z','2026-10-09T09:00:00.000Z');
  assert.deepEqual(await store.run({...legacy,execute:()=>{throw Error('should replay legacy');}}),{status:'replayed',value:{value:2}});
 }finally{db.close();}
});
