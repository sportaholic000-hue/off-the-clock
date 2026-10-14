import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {custom} from '../verification/engine-independent/fixtures.mjs';

// Storage outcomes fixed before the repair:
// - success means the replacement, creation evidence and cleared pause agree;
// - a failure before replacement keeps the previous book and creation evidence;
// - a failure after durable replacement keeps the pause marker through restart;
// - an established book neither reads nor saves by updating its creation row;
// - a legacy file is backfilled once, and a failed backfill never blesses it;
// - a marker without a book is uncertain storage, never a new empty book;
// - the real owner save/approval paths retain revision and cross-process locking.

const store = await import('../server/priceBookService.js');
const bridge = await import('../server/src/quoteDoneBridge.js');
const {db:applicationDb} = await import('../server/src/db.js');
const root = process.env.PRICEBOOK_PATH;
const serviceUrl = new URL('../server/priceBookService.js', import.meta.url).href;
const bridgeUrl = new URL('../server/src/quoteDoneBridge.js', import.meta.url).href;
const dbUrl = new URL('../server/src/db.js', import.meta.url).href;

const categories = ['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all = value => Object.fromEntries(categories.map(category => [category,value]));
const defaults = () => ({
  currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,
  travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,
  rangeBufferPercent:0,markupApplies:all(true),peakMonths:[],peakSurchargePercent:0
});
const target = ownerId => path.join(root, ownerId + '.json');
const marker = ownerId => path.join(root, ownerId + '.unconfirmed');
const row = ownerId => applicationDb.prepare('SELECT * FROM priceBookCreationRecords WHERE ownerId=?').get(ownerId);
const diskBook = ownerId => JSON.parse(fs.readFileSync(target(ownerId), 'utf8'));
const owner = prefix => prefix + '-' + randomUUID();

function fixtureBook(ownerId) {
  const fixture = custom(), service = structuredClone(fixture.ownerPricing);
  delete service.origin;
  delete service.quoteDoneApproval;
  return {ownerId,fixture,book:{services:[service],defaults:{currency:'CAD',...fixture.businessDefaults}}};
}

function savedFixture(prefix='storage') {
  const value = fixtureBook(owner(prefix));
  value.saved = store.savePricebook(value.ownerId,value.book).pricebook;
  return value;
}

function dropUpdateFailure() {
  applicationDb.exec('DROP TRIGGER IF EXISTS qe_storage_fail_update; DROP TABLE IF EXISTS qe_storage_update_attempts');
}

function failNthLedgerUpdate(nth=1) {
  dropUpdateFailure();
  applicationDb.exec(`
    CREATE TABLE qe_storage_update_attempts(attempts INTEGER NOT NULL);
    INSERT INTO qe_storage_update_attempts VALUES(0);
    CREATE TRIGGER qe_storage_fail_update BEFORE UPDATE ON priceBookCreationRecords
    BEGIN
      UPDATE qe_storage_update_attempts SET attempts=attempts+1;
      SELECT CASE WHEN (SELECT attempts FROM qe_storage_update_attempts)=${Number(nth)}
        THEN RAISE(ABORT,'QE-001 forced creation-ledger update failure') END;
    END
  `);
}

function updateAttempts() {
  return applicationDb.prepare('SELECT attempts FROM qe_storage_update_attempts').get()?.attempts ?? 0;
}

function dropInsertFailure() {
  applicationDb.exec('DROP TRIGGER IF EXISTS qe_storage_fail_insert');
}

function failLedgerInsert() {
  dropInsertFailure();
  applicationDb.exec(`CREATE TRIGGER qe_storage_fail_insert BEFORE INSERT ON priceBookCreationRecords
    BEGIN SELECT RAISE(ABORT,'QE-001 forced creation-ledger insert failure'); END`);
}

function runNode(script,args=[]) {
  const child=spawn(process.execPath,['--input-type=module','-e',script,...args],{
    cwd:path.resolve(path.dirname(new URL(import.meta.url).pathname),'..'),env:process.env,stdio:['ignore','pipe','pipe']
  });
  let stdout='',stderr='';
  child.stdout.on('data',chunk=>stdout+=chunk);
  child.stderr.on('data',chunk=>stderr+=chunk);
  return new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('exit',(code,signal)=>resolve({code,signal,stdout,stderr}));
  });
}

const realOps = () => ({
  writeFileSync:fs.writeFileSync,renameSync:fs.renameSync,unlinkSync:fs.unlinkSync,
  openSync:fs.openSync,fsyncSync:fs.fsyncSync,closeSync:fs.closeSync,
  existsSync:fs.existsSync,platform:'linux'
});

test('QE-001: confirmation runs after durable replacement and before the pause marker is cleared',()=>{
  const directory=fs.mkdtempSync(path.join(root,'boundary-')),ownerId=owner('callback');
  const file=path.join(directory,ownerId+'.json'),pause=path.join(directory,ownerId+'.unconfirmed');
  fs.writeFileSync(file,JSON.stringify({version:'old'}));
  let confirmationRan=false;
  store.writePricebookFile(directory,ownerId,JSON.stringify({version:'new'}),realOps(),null,()=>{
    confirmationRan=true;
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).version,'new');
    assert.equal(fs.existsSync(pause),true,'the pause must cover cross-store confirmation');
  });
  assert.equal(confirmationRan,true);
  assert.equal(fs.existsSync(pause),false);
});

test('QE-001: failure before replacement keeps the previous file and never invokes creation confirmation',()=>{
  const directory=fs.mkdtempSync(path.join(root,'before-replace-')),ownerId=owner('before');
  const file=path.join(directory,ownerId+'.json');
  fs.writeFileSync(file,JSON.stringify({version:'old'}));
  let confirmationRan=false;
  assert.throws(()=>store.writePricebookFile(directory,ownerId,JSON.stringify({version:'new'}),{
    ...realOps(),renameSync:()=>{throw Object.assign(new Error('synthetic rename failure'),{code:'EIO'});}
  },null,()=>{confirmationRan=true;}),{code:'EIO'});
  assert.equal(confirmationRan,false);
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).version,'old');
  assert.deepEqual(fs.readdirSync(directory),[ownerId+'.json']);
});

test('QE-001: an ordinary application save does not fail after committing changed owner prices',t=>{
  t.after(dropUpdateFailure);
  const value=savedFixture('ordinary-save'),before=bridge.readApplicationBook(value.ownerId);
  const creationBefore=row(value.ownerId);
  failNthLedgerUpdate(2); // baseline load succeeds; its post-replacement upsert fails
  let result,failure;
  try {result=bridge.saveApplicationBook(value.ownerId,{...before,defaults:{...before.defaults,travelFee:9}});}
  catch(error){failure=error;}
  const persisted=diskBook(value.ownerId),paused=fs.existsSync(marker(value.ownerId)),attempts=updateAttempts();
  dropUpdateFailure();
  assert.equal(failure,undefined,JSON.stringify({failure:failure?.message,persistedTravelFee:persisted.defaults.travelFee,paused,attempts}));
  assert.equal(result?.success,true);
  assert.equal(persisted.defaults.travelFee,900);
  assert.equal(paused,false);
  assert.deepEqual(row(value.ownerId),creationBefore,'an existence ledger is not revision history');
});

test('QE-001: the real approval path cannot report failure after making a service customer-live',t=>{
  t.after(dropUpdateFailure);
  const value=savedFixture('approval'),book=store.loadPricebook(value.ownerId),raw=book.services[0];
  const approvalInput={revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true,
    fields:bridge.applicationStatus(raw,book).confirmationFields};
  const creationBefore=row(value.ownerId);
  failNthLedgerUpdate(2); // approval load succeeds; baseline post-replacement upsert fails
  let result,failure;
  try {result=bridge.approveApplicationService(value.ownerId,raw.id,approvalInput);}
  catch(error){failure=error;}
  const committed=diskBook(value.ownerId),paused=fs.existsSync(marker(value.ownerId)),attempts=updateAttempts();
  dropUpdateFailure();
  assert.equal(failure,undefined,JSON.stringify({failure:failure?.message,approvalCommitted:Boolean(committed.services[0].quoteDoneApproval),paused,attempts}));
  assert.equal(result?.success,true);
  assert.ok(committed.services[0].quoteDoneApproval);
  assert.equal(paused,false);
  assert.deepEqual(row(value.ownerId),creationBefore);
  const current=store.loadPricebook(value.ownerId),service=current.services[0];
  assert.equal(bridge.applicationStatus(service,current).status,'QUOTING LIVE');
  const quote=bridge.calculateApplicationQuote(current,service,{serviceId:service.id,customerInputs:value.fixture.customerInputs},{ownerId:value.ownerId});
  assert.equal(quote.customerResult.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(quote.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,12500);
});

test('QE-001: first-creation ledger failure stays paused through restart and a retry confirms recovery',async t=>{
  t.after(dropInsertFailure);
  const value=fixtureBook(owner('first-create'));
  // Ensure the ledger table exists before attaching a fault to its first INSERT.
  savedFixture('table-seed');
  const initial=bridge.readApplicationBook(value.ownerId);
  const dollars=bridge.convertApplicationBook(value.book,'toDollars');
  failLedgerInsert();
  let failure;
  try {bridge.saveApplicationBook(value.ownerId,{...dollars,revision:initial.revision});}
  catch(error){failure=error;}
  assert.equal(failure?.code,'PRICEBOOK_CREATION_UNCONFIRMED');
  assert.equal(fs.existsSync(target(value.ownerId)),true,'the replacement may already be durable');
  assert.equal(fs.existsSync(marker(value.ownerId)),true,'failure must agree with customer-visible pause state');
  assert.equal(row(value.ownerId),undefined);
  const restartScript=`
    const store=await import(${JSON.stringify(serviceUrl)});
    const bridge=await import(${JSON.stringify(bridgeUrl)});
    try {
      const book=store.loadPricebook(process.argv[1]);
      const status=bridge.applicationStatus(book.services[0],book);
      console.log(JSON.stringify({read:true,recorded:store.pricebookCreationRecorded(process.argv[1]),paused:store.pricebookSaveUnconfirmed(process.argv[1]),status:status.status,issues:status.applicationIssues}));
    } catch(error) { console.log(JSON.stringify({read:false,code:error.code,message:error.message})); }
  `;
  const restarted=await runNode(restartScript,[value.ownerId]);
  assert.equal(restarted.code,0,restarted.stderr);
  const observation=JSON.parse(restarted.stdout.trim().split('\n').pop());
  assert.equal(observation.read,true,JSON.stringify(observation));
  assert.equal(observation.recorded,false);
  assert.equal(observation.paused,true);
  assert.equal(observation.status,'NEEDS PRICING');
  assert.ok(observation.issues.some(issue=>/could not be confirmed on disk/.test(issue)));
  dropInsertFailure();
  const recovery=bridge.readApplicationBook(value.ownerId);
  const retry=bridge.saveApplicationBook(value.ownerId,recovery);
  assert.equal(retry.success,true);
  assert.ok(row(value.ownerId));
  assert.equal(fs.existsSync(marker(value.ownerId)),false);
});

test('QE-002: an established valid book is read-only in this process and after restart',async t=>{
  t.after(dropUpdateFailure);
  const value=savedFixture('read-only'),expected=diskBook(value.ownerId),creationBefore=row(value.ownerId);
  failNthLedgerUpdate(1);
  const loaded=store.loadPricebook(value.ownerId);
  assert.deepEqual(loaded,expected);
  assert.equal(updateAttempts(),0);
  assert.deepEqual(row(value.ownerId),creationBefore);
  const restartScript=`
    const {db}=await import(${JSON.stringify(dbUrl)});
    db.pragma('query_only = ON');
    const store=await import(${JSON.stringify(serviceUrl)});
    try { const book=store.loadPricebook(process.argv[1]); console.log(JSON.stringify({read:true,updatedAt:book.updatedAt})); }
    catch(error) { console.log(JSON.stringify({read:false,code:error.code,message:error.message})); }
  `;
  const restarted=await runNode(restartScript,[value.ownerId]);
  dropUpdateFailure();
  assert.equal(restarted.code,0,restarted.stderr);
  assert.deepEqual(JSON.parse(restarted.stdout.trim().split('\n').pop()),{read:true,updatedAt:expected.updatedAt});
});

test('QE-002: legacy file-only backfill is one deliberate write and failed backfill never blesses the file',t=>{
  t.after(()=>{dropInsertFailure();dropUpdateFailure();});
  const ownerId=owner('legacy'),legacy={ownerId,services:[],defaults:defaults(),updatedAt:'2026-09-30T00:00:00.000Z'};
  fs.writeFileSync(target(ownerId),JSON.stringify(legacy));
  assert.equal(row(ownerId),undefined);
  failLedgerInsert();
  assert.throws(()=>store.loadPricebook(ownerId),error=>error.code==='PRICEBOOK_CREATION_UNCONFIRMED'&&/forced creation-ledger insert failure/.test(error.cause?.message));
  assert.equal(row(ownerId),undefined);
  assert.deepEqual(diskBook(ownerId),legacy);
  assert.equal(fs.existsSync(marker(ownerId)),true,'failed legacy backfill leaves durable loss evidence');
  dropInsertFailure();
  assert.deepEqual(store.loadPricebook(ownerId),legacy);
  assert.equal(row(ownerId),undefined,'a read does not bless an already uncertain backfill');
  assert.equal(fs.existsSync(marker(ownerId)),true);
  assert.equal(store.savePricebook(ownerId,legacy).success,true,'a locked full save recovers the legacy book');
  const created=row(ownerId);
  const recoveredBook=diskBook(ownerId);
  assert.ok(created);
  assert.equal(fs.existsSync(marker(ownerId)),false);
  failNthLedgerUpdate(1);
  assert.deepEqual(store.loadPricebook(ownerId),recoveredBook,'the backfill is not repeated');
  assert.equal(updateAttempts(),0);
  dropUpdateFailure();
  fs.unlinkSync(target(ownerId));
  assert.throws(()=>store.loadPricebook(ownerId),error=>error.code==='PRICEBOOK_UNREADABLE'&&/missing/.test(error.message));
});

test('QE-001: a crash marker without a live file is uncertain storage, not a new empty book',()=>{
  const ownerId=owner('marker-only');
  fs.writeFileSync(marker(ownerId),'unconfirmed price-book replacement\n');
  assert.equal(row(ownerId),undefined);
  assert.throws(()=>store.loadPricebook(ownerId),error=>error.code==='PRICEBOOK_UNREADABLE'&&/unconfirmed|missing|replacement/i.test(error.message));
  assert.throws(()=>store.savePricebook(ownerId,{services:[],defaults:defaults()}),error=>error.code==='PRICEBOOK_UNREADABLE');
  assert.equal(fs.existsSync(marker(ownerId)),true);
  assert.equal(fs.existsSync(target(ownerId)),false);
});

test('QE-001/QE-002: concurrent application saves preserve revision binding and one confirmed ledger row',async()=>{
  const value=savedFixture('concurrent'),base=bridge.readApplicationBook(value.ownerId);
  const directory=fs.mkdtempSync(path.join(root,'concurrent-'));
  const start=path.join(directory,'start'),readyA=path.join(directory,'a-ready'),readyB=path.join(directory,'b-ready');
  const worker=`
    import fs from 'node:fs';
    const bridge=await import(${JSON.stringify(bridgeUrl)});
    const [ownerId,inputPath,ready,start]=process.argv.slice(1);
    const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
    fs.writeFileSync(ready,'ready');
    while(!fs.existsSync(start)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);
    try { console.log(JSON.stringify({result:bridge.saveApplicationBook(ownerId,input)})); }
    catch(error) { console.log(JSON.stringify({error:error.details?.code||error.code,status:error.statusCode,message:error.message})); }
  `;
  const inputA=path.join(directory,'a.json'),inputB=path.join(directory,'b.json');
  fs.writeFileSync(inputA,JSON.stringify({...base,defaults:{...base.defaults,travelFee:9}}));
  fs.writeFileSync(inputB,JSON.stringify({...base,defaults:{...base.defaults,travelFee:13}}));
  const a=runNode(worker,[value.ownerId,inputA,readyA,start]),b=runNode(worker,[value.ownerId,inputB,readyB,start]);
  const started=Date.now();
  while(!fs.existsSync(readyA)||!fs.existsSync(readyB)){
    assert.ok(Date.now()-started<10000,'concurrent workers did not become ready');
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  fs.writeFileSync(start,'go');
  const exits=await Promise.all([a,b]);
  for(const exit of exits)assert.equal(exit.code,0,exit.stderr);
  const outcomes=exits.map(exit=>JSON.parse(exit.stdout.trim().split('\n').pop()));
  assert.equal(outcomes.filter(outcome=>outcome.result?.success).length,1,JSON.stringify(outcomes));
  assert.equal(outcomes.filter(outcome=>outcome.error==='REVISION_CONFLICT'||outcome.error==='PRICEBOOK_BUSY').length,1,JSON.stringify(outcomes));
  const final=bridge.readApplicationBook(value.ownerId);
  assert.ok([9,13].includes(final.defaults.travelFee));
  assert.equal(fs.existsSync(marker(value.ownerId)),false);
  assert.ok(row(value.ownerId));
  assert.equal(applicationDb.prepare('SELECT COUNT(*) AS count FROM priceBookCreationRecords WHERE ownerId=?').get(value.ownerId).count,1);
});

test.after(()=>{
  dropUpdateFailure();
  dropInsertFailure();
});
