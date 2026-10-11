import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {OWNER_QUERY_EXCEPTIONS, OWNER_QUERY_NON_QUERY_USES} from '../server/src/ownerQueryExceptions.js';
import {prepareInventory,unlistedPrepares} from './helpers/ownerQueryScan.mjs';

const root=new URL('..',import.meta.url).pathname;
test('every direct database prepare or exec in server is an exact listed exception',()=>{
 const exceptions=new Map();
 for(const row of OWNER_QUERY_EXCEPTIONS){
  assert.ok(typeof row.file==='string'&&row.file.startsWith('server/'));
  assert.ok(typeof row.function==='string'&&row.function.length>0);
  assert.ok(typeof row.reason==='string'&&row.reason.length>8);
  assert.match(row.signature,/^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(row.occurrence)&&row.occurrence>0);
  const key=row.file+'\0'+(row.method||'prepare')+'\0'+row.signature+'\0'+row.occurrence;
  if(row.method==='exec')assert.ok(['authentication','registration','migrations','admin','platform metrics'].includes(row.category),`Disallowed exec category: ${row.file}`);
  assert.ok(!exceptions.has(key),`Duplicate exception: ${row.file} ${row.function}`);
  exceptions.set(key,row);
 }
 const all=prepareInventory(root),unlisted=unlistedPrepares(root,OWNER_QUERY_EXCEPTIONS,OWNER_QUERY_NON_QUERY_USES);
 assert.equal(unlisted.length,0,`${unlisted.length} prepare/exec occurrences are not listed:\n${unlisted.slice(0,20).map(row=>`${row.file}:${row.line} ${row.snippet}`).join('\n')}`);
 for(const row of OWNER_QUERY_EXCEPTIONS)assert.ok(all.some(call=>call.direct&&call.file===row.file&&call.method===(row.method||'prepare')&&call.signature===row.signature&&call.occurrence===row.occurrence),`Unused exception: ${row.file} ${row.function}`);
 for(const row of OWNER_QUERY_NON_QUERY_USES){
  assert.ok(row.reason?.length>8,`Missing non-query reason: ${row.file}`);
  assert.ok(Number.isInteger(row.line)&&row.line>0,`Missing line: ${row.file}`);
  assert.ok(all.some(call=>call.file===row.file&&call.method===(row.method||'prepare')&&call.line===row.line&&call.signature===row.signature&&call.occurrence===row.occurrence),`Unused allowed use: ${row.file}:${row.line} ${row.function}`);
 }
});

function scratchScan(name,extension,source,expected,extractionsOnly=false) {
 const directory=mkdtempSync(join(root,'.owner-query-scan-'));
 try {
  mkdirSync(join(directory,'server','src'),{recursive:true});
  writeFileSync(join(directory,'server','src',name+extension),source);
  const all=unlistedPrepares(directory,[],[]);
  const found=extractionsOnly?all.filter(row=>row.forbidden):all;
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

// Expected before execution: both auditor bypasses produce inventory findings.
test('scan inventories database.exec tenant deletion: 1 finding',()=>{
 scratchScan('exec-delete','.js','database.exec("DELETE FROM customers")',1);
});
test('scan detects concatenated database prepare and exec properties: 1 finding each',()=>{
 scratchScan('concat-prepare','.js','database["pre"+"pare"]("DELETE FROM customers")',1);
 scratchScan('concat-exec','.mjs','database["ex"+"ec"]("DELETE FROM customers")',1);
});
test('scan detects bracketed exec and unknown computed database keys: 1 finding each',()=>{
 scratchScan('bracket-exec','.js','database["exec"]("DELETE FROM customers")',1);
 scratchScan('dynamic-exec','.cjs','database[methodFromOutside]("DELETE FROM customers")',1);
 scratchScan('alias-exec','.js','const connection=database; connection[methodFromOutside]("DELETE FROM customers")',1);
});
test('computed access cannot be permitted by an exception or non-query entry',()=>{
 const directory=mkdtempSync(join(root,'.owner-query-scan-'));
 try {
  mkdirSync(join(directory,'server'),{recursive:true});
  writeFileSync(join(directory,'server','bad.js'),'database["pre"+"pare"]("DELETE FROM customers")');
  const all=prepareInventory(directory);assert.equal(all.length,1);
  assert.equal(unlistedPrepares(directory,all,all).length,1);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('scan detects optional, escaped, aliased and destructured computed methods',()=>{
 scratchScan('optional','.js','database?.["ex"+"ec"]?.("DELETE FROM customers")',1);
 scratchScan('escaped','.js',String.raw`database["pr\u0065pare"]("DELETE FROM customers")`,1);
 scratchScan('constructed','.mjs','const store=new DatabaseSync(":memory:"); store[method]("DELETE FROM customers")',1);
 scratchScan('destructured-computed','.js','const {["ex"+"ec"]:run}=database; run("DELETE FROM customers")',1);
});

test('RegExp exec is not database SQL; shadowed or unknown receivers still need inventory',()=>{
 scratchScan('regexp','.js','const expression=/x/; expression.exec("text"); /y/.exec("text")',0);
 scratchScan('shadowed-regexp','.js','const expression=/x/; function work(expression){expression.exec("DELETE FROM customers")}',1);
 scratchScan('unknown-exec','.js','connection.exec("DELETE FROM customers")',1);
});

test('mutable regex-shaped receivers cannot hide a later database exec: 1 finding',()=>{
 scratchScan('mutable-regexp','.js','let expression=/x/; expression=database; expression.exec("DELETE FROM customers")',1);
});

// Expected: an initially harmless key cannot hide a later sensitive method.
test('mutable or shadowed computed keys on database objects remain forbidden',()=>{
 scratchScan('mutable-key','.js','let key="close"; key="ex"+"ec"; database[key]("DELETE FROM customers")',1);
 scratchScan('shadowed-key','.js','const key="close"; function work(key){database[key]("DELETE FROM customers")}',1);
});

// The legacy inventory also retains lexical prepare references. Require exactly
// one forbidden extraction without removing those independently reviewed rows.
const scratchExtraction=(...args)=>scratchScan(...args,true);

// Expected before implementation: each extraction is one forbidden occurrence,
// independently of the local alias and how it is eventually invoked.
test('scan destructuring 20261011: auditor renamed exec through call',()=>{
 scratchExtraction('auditor-renamed-exec','.js','const {exec: run} = database; run.call(database,"DELETE FROM customers")',1);
});
test('scan destructuring 20261011: auditor shorthand exec',()=>{
 scratchExtraction('auditor-shorthand-exec','.js','const {exec} = database',1);
});

const destructuringForms=[
 ['declaration shorthand',(method,call)=>`const {${method}}=database; ${call(method)}`],
 ['declaration renamed',(method,call)=>`const {${method}:run}=database; ${call('run')}`],
 ['declaration shorthand default',(method,call)=>`const {${method}=fallback}=database; ${call(method)}`],
 ['declaration renamed default',(method,call)=>`const {${method}:run=fallback}=database; ${call('run')}`],
 ['declaration quoted key',(method,call)=>`const {"${method}":run}=database; ${call('run')}`],
 ['declaration computed key',(method,call)=>`const {["${method.slice(0,2)}"+"${method.slice(2)}"]:run}=database; ${call('run')}`],
 ['declaration nested object',(method,call)=>`const {connection:{${method}:run}}=holder; ${call('run')}`],
 ['declaration nested array',(method,call)=>`const [{${method}:run}]=connections; ${call('run')}`],
 ['declaration nested default',(method,call)=>`const {connection:{${method}:run}=database}={}; ${call('run')}`],
 ['parameter nested default',(method,call)=>`function work({connection:{${method}:run}=database}={}){${call('run')}}`],
 ['arrow shorthand parameter',(method,call)=>`const work=({${method}})=>${call(method)}`],
 ['catch binding',(method,call)=>`try{throw database;}catch({${method}:run}){${call('run')}}`],
 ['for-of declaration',(method,call)=>`for(const {${method}:run} of [database]){${call('run')}}`],
 ['assignment shorthand',(method,call)=>`let ${method}; ({${method}}=database); ${call(method)}`],
 ['assignment renamed',(method,call)=>`let run; ({${method}:run}=database); ${call('run')}`],
 ['assignment shorthand default',(method,call)=>`let ${method}; ({${method}=fallback}=database); ${call(method)}`],
 ['assignment renamed default',(method,call)=>`let run; ({${method}:run=fallback}=database); ${call('run')}`],
 ['assignment quoted key',(method,call)=>`let run; ({"${method}":run}=database); ${call('run')}`],
 ['assignment computed key',(method,call)=>`let run; ({["${method.slice(0,2)}"+"${method.slice(2)}"]:run}=database); ${call('run')}`],
 ['assignment nested object',(method,call)=>`let run; ({connection:{${method}:run}}=holder); ${call('run')}`],
 ['assignment nested array',(method,call)=>`let run; ([{${method}:run}]=connections); ${call('run')}`],
 ['assignment nested default',(method,call)=>`let run; ({connection:{${method}:run}=database}={}); ${call('run')}`],
 ['assignment for-of',(method,call)=>`let run; for({${method}:run} of [database]){${call('run')}}`],
];
for(const method of ['exec','prepare'])for(const [index,[form,source]] of destructuringForms.entries())
test(`scan destructuring 20261011: ${method} ${form}`,()=>{
 scratchExtraction('destructuring-'+index,['.js','.mjs','.cjs'][index%3],source(method,name=>`${name}.call(database,"DELETE FROM customers")`),1);
});

for(const method of ['exec','prepare'])for(const [invocation,call] of [
 ['direct',name=>`${name}("DELETE FROM customers")`],
 ['call',name=>`${name}.call(database,"DELETE FROM customers")`],
 ['apply',name=>`${name}.apply(database,["DELETE FROM customers"])`],
 ['bind',name=>`${name}.bind(database)("DELETE FROM customers")`],
])test(`scan destructuring 20261011: extracted ${method} invocation ${invocation}`,()=>{
 scratchExtraction('destructured-invocation','.js',`const {${method}:run}=database; ${call('run')}`,1);
});

test('scan destructuring 20261011: nested dynamic database keys are forbidden',()=>{
 scratchExtraction('binding-dynamic','.js','const {db:{[method]:run}}=holder; run.call(database,"DELETE FROM customers")',1);
 scratchExtraction('assignment-dynamic','.js','let run; ({[method]:run}=database); run.apply(database,["DELETE FROM customers"])',1);
 scratchExtraction('assignment-nested-dynamic','.js','let run; ({db:{[method]:run}}=holder); run.bind(database)("DELETE FROM customers")',1);
});

test('scan destructuring 20261011: extracted methods cannot be allowlisted',()=>{
 const directory=mkdtempSync(join(root,'.owner-query-scan-'));
 try{
  mkdirSync(join(directory,'server'),{recursive:true});
  for(const source of [
   'const {exec:run}=database', 'const {prepare:run}=database',
   'let run; ({exec:run}=database)', 'let run; ({prepare:run}=database)',
  ]){
   writeFileSync(join(directory,'server','bad.js'),source);
   const all=prepareInventory(directory);
   assert.equal(all.length,1,source);assert.equal(all[0].forbidden,true,source);
   assert.equal(unlistedPrepares(directory,all,all).length,1,source);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('scan destructuring 20261011: metadata, defaults and safe patterns are not extractions',()=>{
 scratchScan('metadata-control','.js','const metadata={exec:"documentation"}; const {close}=database; const {execStatus}=metadata',0);
 scratchScan('default-control','.js','let options; ({options={exec:"documentation"}}={}); const work=({options={exec:"documentation"}}={})=>options',0);
 scratchScan('assignment-control','.js','let options; options={exec:"documentation"}; const metadata={nested:{exec:"documentation"}}',0);
});

test('scan destructuring 20261011: multiple methods and nested defaults are counted once',()=>{
 scratchExtraction('multiple-methods','.js','const {exec:run,prepare:statement}=database',2);
 scratchExtraction('nested-default-once','.js','let run; ({nested:{exec:run}=database}={})',1);
});
