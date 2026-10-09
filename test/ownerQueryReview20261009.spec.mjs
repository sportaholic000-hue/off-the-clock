import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';
import {createBillingEvidence} from '../server/src/billingEvidence.js';
import {usageOwnerQuery} from '../server/src/billingUsagePolicy.js';
import {createVoiceHandleStore,createVoiceNonceRepository,createVoiceSessionStore,createVoiceToolIdempotencyStore} from '../server/src/voice/voicePersistence.js';

const OWNER_A='synthetic-owner-a', OWNER_B='synthetic-owner-b';
const ACCOUNT='AC'+'a'.repeat(32), CALL='CA'+'b'.repeat(32);
const AT='2026-10-09T12:00:00.000Z', EPOCH=Date.parse(AT);
const context=ownerId=>({ownerId,accountSid:ACCOUNT,callSid:CALL,from:'+19025550100',to:'+19025550101'});

function database() {
 const db=new DatabaseSync(':memory:');
 for(const sql of CREATE_TABLE_STATEMENTS)db.exec(sql);
 db.exec('ALTER TABLE billingInvoiceEvidence ADD COLUMN currency TEXT');
 db.exec('ALTER TABLE billingInvoiceEvidence ADD COLUMN invoiceJson TEXT');
 for(const [id,ownerId,role] of [[OWNER_A,null,'owner'],[OWNER_B,null,'owner'],['synthetic-staff',OWNER_A,'staff']]) {
  db.prepare(`INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt)
    VALUES(?,?,?,'synthetic-hash','Synthetic','Synthetic Trade','Operator','pending_payment','UTC',?,?)`)
    .run(id,ownerId,id+'@example.invalid',role,AT);
 }
 return db;
}

test('eight owner-row statements read or update precisely the same owner rows',()=>{
 const db=database();
 try {
  // Handwritten expected: owner A and owner B each return their own row;
  // the staff login cannot be returned as an owner. Other-owner fields stay put.
  const reads=[
   ['billingMutationGuard:12',"SELECT plan,planStatus,trialEndsAt,paymentFailedAt,annualPaidThroughAt,paidThroughAt,serviceEndsAt FROM users WHERE id=? AND role='owner'"],
   ['billingRoutes:387',"SELECT id,email,firstName,businessName FROM users WHERE id=? AND role='owner'"],
   ['tenant:21','SELECT role FROM users WHERE id=?'],
   ['productionVoiceRuntime:99',"SELECT businessName FROM users WHERE id=? AND role=?",['owner']],
   ['voicePersistence:341',"SELECT id,plan,planStatus,trialEndsAt,paymentFailedAt,annualPaidThroughAt,paidThroughAt,serviceEndsAt FROM users WHERE id=? AND role='owner'"],
   ['voiceSettings:27',"SELECT timezone FROM users WHERE id=? AND role='owner'"]
  ];
  for(const [label,oldSql,extra=[]] of reads){
   const newSql=oldSql+' AND ownerId IS NULL';
   for(const id of [OWNER_A,OWNER_B]){
    const args=[id,...extra];
    assert.deepEqual(db.prepare(newSql).get(...args),db.prepare(oldSql).get(...args),label);
    assert.ok(db.prepare(newSql).get(...args),`${label} returns the handwritten owner row ${id}`);
   }
  }
  assert.equal(db.prepare("SELECT role FROM users WHERE id=? AND ownerId IS NULL").get('synthetic-staff'),undefined);
  const newUpdate=usageOwnerQuery(db)("UPDATE users SET plan=?,planStatus=?,trialEndsAt=?,paymentFailedAt=? WHERE id=? AND role='owner' AND ownerId IS NULL");
  // Two snapshots of the same synthetic database, run one statement in each.
  const oldDb=database();
  try {
   assert.equal(oldDb.prepare("UPDATE users SET plan=?,planStatus=?,trialEndsAt=?,paymentFailedAt=? WHERE id=? AND role='owner'").run('QuoteDone','paid',AT,null,OWNER_A).changes,1);
   assert.equal(newUpdate.run('QuoteDone','paid',AT,null,OWNER_A).changes,1);
   assert.deepEqual(db.prepare('SELECT id,plan,planStatus FROM users ORDER BY id').all(),oldDb.prepare('SELECT id,plan,planStatus FROM users ORDER BY id').all());
   assert.deepEqual(db.prepare('SELECT id,plan,planStatus FROM users ORDER BY id').all().map(r=>[r.id,r.plan,r.planStatus]),[
    [OWNER_A,'QuoteDone','paid'],[OWNER_B,'Operator','pending_payment'],['synthetic-staff','Operator','pending_payment']
   ]);
   assert.equal(oldDb.prepare("UPDATE users SET annualPaidThroughAt=? WHERE id=? AND role='owner'").run(AT,OWNER_A).changes,1);
   assert.equal(usageOwnerQuery(db)("UPDATE users SET annualPaidThroughAt=? WHERE id=? AND role='owner' AND ownerId IS NULL").run(AT,OWNER_A).changes,1);
   assert.deepEqual(db.prepare('SELECT id,annualPaidThroughAt FROM users ORDER BY id').all(),oldDb.prepare('SELECT id,annualPaidThroughAt FROM users ORDER BY id').all());
  }finally{oldDb.close();}
 }finally{db.close();}
});

test('owner-bound evidence preserves the foreign subscription and invoice rejection codes',()=>{
 const db=database(), fail=(code,message)=>Object.assign(new Error(message),{code});
 try {
  const evidence=createBillingEvidence({db,fail});
  const input={ownerId:OWNER_A,customerId:'cus_same',subscriptionId:'sub_same',facts:{status:'active'},created:1};
  assert.equal(evidence.recordSubscription(input).stale,false);
  assert.throws(()=>evidence.recordSubscription({...input,ownerId:OWNER_B,customerId:'cus_other'}),{code:'CROSS_ACCOUNT_IDS'});
  const invoice={id:'in_same',customer:'cus_same',subscription:'sub_same',status:'paid',amount_paid:100};
  assert.equal(evidence.recordInvoice({ownerId:OWNER_A,customerId:'cus_same',subscriptionId:'sub_same',object:invoice,paid:true,created:1}).stale,false);
  assert.throws(()=>evidence.recordInvoice({ownerId:OWNER_B,customerId:'cus_other',subscriptionId:'sub_other',object:{...invoice,customer:'cus_other',subscription:'sub_other'},paid:true,created:2}),{code:'CROSS_ACCOUNT_IDS'});
  assert.equal(db.prepare('SELECT ownerId FROM billingInvoiceEvidence WHERE stripeInvoiceId=?').get('in_same').ownerId,OWNER_A);
 }finally{db.close();}
});

test('nonce and CallSid foreign collision decisions keep their original results',()=>{
 const db=database();
 try {
  let nonceId=0;
  const hash='a'.repeat(64),repo=createVoiceNonceRepository({database:db,randomUUID:()=> 'synthetic-nonce-'+(++nonceId)});
  const row=ownerId=>({nonceHash:hash,...context(ownerId),expiresAt:EPOCH+60000,issuedAt:EPOCH});
  assert.equal(repo.insert(row(OWNER_A)),true);
  // Handwritten old SQL SELECT 1 by nonce sees owner A. Both owners inserting
  // the same digest must get false, and owner B consuming it gets mismatch.
  assert.equal(db.prepare('SELECT 1 FROM voiceSessionNonces WHERE nonceHash=?').get(hash)!==undefined,true);
  assert.equal(repo.insert(row(OWNER_B)),false);
  assert.deepEqual(repo.consume({nonceHash:hash,binding:context(OWNER_B),now:EPOCH}),{status:'mismatch'});
  assert.equal(repo.consume({nonceHash:hash,binding:context(OWNER_A),now:EPOCH}).status,'consumed');
  assert.deepEqual(repo.consume({nonceHash:'c'.repeat(64),binding:context(OWNER_B),now:EPOCH}),{status:'not_found'});

  db.prepare(`INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,createdAt,updatedAt)
    VALUES('synthetic-call',?,?,?,?,?,'CONNECTING',?,?)`).run(OWNER_A,CALL,ACCOUNT,context(OWNER_A).from,context(OWNER_A).to,AT,AT);
  const hashB='b'.repeat(64);
  assert.equal(repo.insert({...row(OWNER_B),nonceHash:hashB}),true);
  const store=createVoiceSessionStore({database:db,clock:()=>new Date(AT)});
  assert.equal(store.validateCallBinding({context:context(OWNER_B)}),false);
  assert.equal(store.loadSessionByNonceHash({sessionKey:hashB}),null);
  assert.throws(()=>store.createSession({sessionKey:hashB,context:context(OWNER_B),expiresAt:EPOCH+60000}),{code:'VOICE_CALL_BINDING_MISMATCH'});
  assert.throws(()=>store.recordFallback({context:context(OWNER_B),reason:'VOICE_FALLBACK'}),{code:'VOICE_CALL_BINDING_MISMATCH'});
  assert.equal(db.prepare('SELECT ownerId FROM calls WHERE callSid=?').get(CALL).ownerId,OWNER_A);
 }finally{db.close();}
});

test('foreign opaque handle keeps HANDLE_COLLISION, own handle still resolves',()=>{
 const db=database();
 try {
  const handles=createVoiceHandleStore({database:db,secret:'synthetic-secret-'.repeat(4),clock:()=>new Date(AT)});
  const request={context:context(OWNER_B),type:'quote',resourceKey:'synthetic-quote',reference:{id:'q'},expiresAt:new Date(EPOCH+60000)};
  const handle=handles.issue(request),digest=createHash('sha256').update(handle).digest('hex');
  assert.equal(handles.resolve({context:request.context,handle,expectedType:'quote'}).reference.id,'q');
  db.prepare('UPDATE voiceOpaqueHandles SET ownerId=? WHERE handleHash=?').run(OWNER_A,digest);
  // Handwritten old global lookup sees the row; foreign owner yields a collision.
  assert.equal(db.prepare('SELECT ownerId FROM voiceOpaqueHandles WHERE handleHash=?').get(digest).ownerId,OWNER_A);
  assert.throws(()=>handles.issue(request),{code:'HANDLE_COLLISION'});
  assert.throws(()=>handles.resolve({context:request.context,handle,expectedType:'quote'}),{code:'INVALID_OPAQUE_HANDLE'});
 }finally{db.close();}
});

test('four receipt predicates retain global scope, including ownerId empty legacy rows',async()=>{
 const db=database();
 try {
  const scope='c'.repeat(64),key='synthetic-key',digest='d'.repeat(64);
  db.prepare(`INSERT INTO voiceToolIdempotencyReceipts(scopeHash,idempotencyKey,requestDigest,status,responseJson,leaseExpiresAtUtc,createdAt,updatedAt)
    VALUES(?,?,?,'COMPLETED','{"value":2}',?,?,?)`).run(scope,key,digest,AT,AT,AT);
  const old=db.prepare('SELECT requestDigest,status,responseJson,leaseExpiresAtUtc FROM voiceToolIdempotencyReceipts WHERE scopeHash=? AND idempotencyKey=?').get(scope,key);
  const current=usageOwnerQuery(db)('SELECT requestDigest,status,responseJson,leaseExpiresAtUtc FROM voiceToolIdempotencyReceipts WHERE scopeHash=? AND idempotencyKey=? AND ownerId IS NOT NULL').get(scope,key);
  assert.deepEqual(current,old);
  assert.equal(db.prepare('SELECT ownerId FROM voiceToolIdempotencyReceipts WHERE scopeHash=?').get(scope).ownerId,'');
  // The legacy empty-owner row can indeed be matched by another owner, just
  // as the original global scope lookup did. Proposed isolation is separate.
  const store=createVoiceToolIdempotencyStore({database:db,clock:()=>new Date(AT)});
  assert.deepEqual(await store.run({ownerId:OWNER_B,scope,key,digest,execute:()=>{throw Error('must replay');}}),{status:'replayed',value:{value:2}});
  assert.deepEqual(await store.run({ownerId:OWNER_A,scope,key,digest,execute:()=>{throw Error('must replay');}}),{status:'replayed',value:{value:2}});
  const owned={scope:'e'.repeat(64),key:'owned',digest:'f'.repeat(64)};
  assert.deepEqual(await store.run({ownerId:OWNER_A,...owned,execute:()=>({value:3})}),{status:'executed',value:{value:3}});
  assert.equal(db.prepare('SELECT ownerId FROM voiceToolIdempotencyReceipts WHERE scopeHash=?').get(owned.scope).ownerId,OWNER_A);
  assert.deepEqual(await store.run({ownerId:OWNER_B,...owned,execute:()=>{throw Error('must replay');}}),{status:'replayed',value:{value:3}});
  for(const predicate of [
   'AND requestDigest=? AND status=\'RUNNING\' AND leaseExpiresAtUtc<=?',
   'AND requestDigest=? AND status=\'RUNNING\'',
  ]){
   const oldSql='SELECT 1 FROM voiceToolIdempotencyReceipts WHERE scopeHash=? AND idempotencyKey=? '+predicate;
   const newSql=oldSql+' AND ownerId IS NOT NULL';
   const args=predicate.includes('leaseExpiresAtUtc')?[scope,key,digest,AT]:[scope,key,digest];
   assert.deepEqual(db.prepare(newSql).get(...args),db.prepare(oldSql).get(...args));
  }
 }finally{db.close();}
});

test('three nonce statements preserve the old selection and update on two-owner snapshots',()=>{
 const oldDb=database(),newDb=database(),nonce='1'.repeat(64);
 try {
  for(const db of [oldDb,newDb])db.prepare(`INSERT INTO voiceSessionNonces
    (id,nonceHash,ownerId,accountSid,callSid,fromNumber,toNumber,expiresAtUtc,consumedAtUtc,createdAt)
    VALUES('synthetic-nonce',?,?,?,?,?,?,?,NULL,?)`).run(nonce,OWNER_A,ACCOUNT,CALL,context(OWNER_A).from,context(OWNER_A).to,AT,AT);
  const oldPresence=oldDb.prepare('SELECT 1 FROM voiceSessionNonces WHERE nonceHash=?').get(nonce);
  const ownPresence=usageOwnerQuery(newDb)('SELECT 1 FROM voiceSessionNonces WHERE nonceHash=? AND ownerId=?').get(nonce,OWNER_A);
  assert.deepEqual(ownPresence,oldPresence); // handwritten: both return {1:1}
  const oldRow=oldDb.prepare('SELECT * FROM voiceSessionNonces WHERE nonceHash=?').get(nonce);
  const ownRow=usageOwnerQuery(newDb)('SELECT * FROM voiceSessionNonces WHERE nonceHash=? AND ownerId=?').get(nonce,OWNER_A);
  assert.deepEqual(ownRow,oldRow); // handwritten: only owner A's nonce
  assert.equal(usageOwnerQuery(newDb)('SELECT * FROM voiceSessionNonces WHERE nonceHash=? AND ownerId=?').get(nonce,OWNER_B),undefined);
  assert.equal(usageOwnerQuery(newDb)('SELECT 1 FROM voiceSessionNonces WHERE nonceHash=? AND ownerId<>?').get(nonce,OWNER_B)?.['1'],1);
  const oldChanges=oldDb.prepare('UPDATE voiceSessionNonces SET consumedAtUtc=? WHERE nonceHash=? AND consumedAtUtc IS NULL').run(AT,nonce).changes;
  const newChanges=usageOwnerQuery(newDb)('UPDATE voiceSessionNonces SET consumedAtUtc=? WHERE nonceHash=? AND ownerId=? AND consumedAtUtc IS NULL').run(AT,nonce,OWNER_A).changes;
  assert.equal(oldChanges,1);assert.equal(newChanges,1);
  assert.deepEqual(newDb.prepare('SELECT ownerId,consumedAtUtc FROM voiceSessionNonces').get(),oldDb.prepare('SELECT ownerId,consumedAtUtc FROM voiceSessionNonces').get());
 }finally{oldDb.close();newDb.close();}
});

test('three opaque-handle statements preserve old owner decisions and mutation',()=>{
 const oldDb=database(),newDb=database(),hash='2'.repeat(64);
 try {
  for(const db of [oldDb,newDb])db.prepare(`INSERT INTO voiceOpaqueHandles
    (handleHash,resourceKeyDigest,ownerId,callSid,accountSid,callerNumber,destinationNumber,handleType,referenceJson,expiresAtUtc,createdAt,updatedAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(hash,'3'.repeat(64),OWNER_A,CALL,ACCOUNT,context(OWNER_A).from,context(OWNER_A).to,'quote','{"id":1}',AT,AT,AT);
  const oldRow=oldDb.prepare('SELECT * FROM voiceOpaqueHandles WHERE handleHash=?').get(hash);
  const ownRow=usageOwnerQuery(newDb)('SELECT * FROM voiceOpaqueHandles WHERE handleHash=? AND ownerId=?').get(hash,OWNER_A);
  assert.deepEqual(ownRow,oldRow); // handwritten: owner A's reference
  assert.equal(usageOwnerQuery(newDb)('SELECT * FROM voiceOpaqueHandles WHERE handleHash=? AND ownerId=?').get(hash,OWNER_B),undefined);
  assert.equal(usageOwnerQuery(newDb)('SELECT 1 FROM voiceOpaqueHandles WHERE handleHash=? AND ownerId<>?').get(hash,OWNER_B)?.['1'],1);
  const oldChanges=oldDb.prepare('UPDATE voiceOpaqueHandles SET referenceJson=?,expiresAtUtc=?,updatedAt=? WHERE handleHash=?').run('{"id":2}',AT,AT,hash).changes;
  const newChanges=usageOwnerQuery(newDb)('UPDATE voiceOpaqueHandles SET referenceJson=?,expiresAtUtc=?,updatedAt=? WHERE handleHash=? AND ownerId=?').run('{"id":2}',AT,AT,hash,OWNER_A).changes;
  assert.equal(oldChanges,1);assert.equal(newChanges,1);
  assert.deepEqual(newDb.prepare('SELECT referenceJson,ownerId FROM voiceOpaqueHandles').get(),oldDb.prepare('SELECT referenceJson,ownerId FROM voiceOpaqueHandles').get());
  const oldResolve=oldDb.prepare('SELECT * FROM voiceOpaqueHandles WHERE handleHash=?').get(hash);
  const newResolve=usageOwnerQuery(newDb)('SELECT * FROM voiceOpaqueHandles WHERE handleHash=? AND ownerId=?').get(hash,OWNER_A);
  assert.deepEqual(newResolve,oldResolve);
 }finally{oldDb.close();newDb.close();}
});

test('receipt read, lease, completion and delete SQL change exactly the old rows',()=>{
 const scope='4'.repeat(64),key='synthetic-receipt',digest='5'.repeat(64);
 const insert=db=>db.prepare(`INSERT INTO voiceToolIdempotencyReceipts
   (scopeHash,idempotencyKey,requestDigest,status,responseJson,leaseExpiresAtUtc,createdAt,updatedAt)
   VALUES(?,?,?,'RUNNING',NULL,?,?,?)`).run(scope,key,digest,AT,AT,AT);
 for(const [label,oldSql,newSql,args,expected] of [
  ['lease',`UPDATE voiceToolIdempotencyReceipts SET leaseExpiresAtUtc=?,updatedAt=? WHERE scopeHash=? AND idempotencyKey=? AND requestDigest=? AND status='RUNNING' AND leaseExpiresAtUtc<=?`,`UPDATE voiceToolIdempotencyReceipts SET leaseExpiresAtUtc=?,updatedAt=? WHERE scopeHash=? AND idempotencyKey=? AND requestDigest=? AND status='RUNNING' AND leaseExpiresAtUtc<=? AND ownerId IS NOT NULL`,['2026-10-09T12:01:00.000Z',AT,scope,key,digest,AT],1],
  ['completion',`UPDATE voiceToolIdempotencyReceipts SET status='COMPLETED',responseJson=?,updatedAt=?,leaseExpiresAtUtc=? WHERE scopeHash=? AND idempotencyKey=? AND requestDigest=? AND status='RUNNING'`,`UPDATE voiceToolIdempotencyReceipts SET status='COMPLETED',responseJson=?,updatedAt=?,leaseExpiresAtUtc=? WHERE scopeHash=? AND idempotencyKey=? AND requestDigest=? AND status='RUNNING' AND ownerId IS NOT NULL`,['{"value":7}',AT,AT,scope,key,digest],1],
  ['delete',`DELETE FROM voiceToolIdempotencyReceipts WHERE scopeHash=? AND idempotencyKey=? AND requestDigest=? AND status='RUNNING'`,`DELETE FROM voiceToolIdempotencyReceipts WHERE scopeHash=? AND idempotencyKey=? AND requestDigest=? AND status='RUNNING' AND ownerId IS NOT NULL`,[scope,key,digest],1]
 ]){
  const oldDb=database(),newDb=database();
  try {
   insert(oldDb);insert(newDb);
   assert.equal(oldDb.prepare(oldSql).run(...args).changes,expected,label+' old');
   assert.equal(usageOwnerQuery(newDb)(newSql).run(...args).changes,expected,label+' new');
   assert.deepEqual(newDb.prepare('SELECT scopeHash,status,responseJson,leaseExpiresAtUtc FROM voiceToolIdempotencyReceipts').all(),oldDb.prepare('SELECT scopeHash,status,responseJson,leaseExpiresAtUtc FROM voiceToolIdempotencyReceipts').all(),label);
  }finally{oldDb.close();newDb.close();}
 }
});

test('receipt owner column and insert parameter preserve legacy projection and global key',()=>{
 const oldDb=database(),newDb=database(),scope='6'.repeat(64),digest='7'.repeat(64);
 try {
  oldDb.prepare(`INSERT INTO voiceToolIdempotencyReceipts(scopeHash,idempotencyKey,requestDigest,status,responseJson,leaseExpiresAtUtc,createdAt,updatedAt)
   VALUES(?,?,?,'RUNNING',NULL,?,?,?)`).run(scope,'same',digest,AT,AT,AT);
  usageOwnerQuery(newDb)(`INSERT INTO voiceToolIdempotencyReceipts(ownerId,scopeHash,idempotencyKey,requestDigest,status,responseJson,leaseExpiresAtUtc,createdAt,updatedAt)
   VALUES(?,?,?,?,'RUNNING',NULL,?,?,?)`).run(OWNER_A,scope,'same',digest,AT,AT,AT);
  const projected='SELECT scopeHash,idempotencyKey,requestDigest,status,responseJson,leaseExpiresAtUtc,createdAt,updatedAt FROM voiceToolIdempotencyReceipts';
  assert.deepEqual(newDb.prepare(projected).get(),oldDb.prepare(projected).get());
  assert.equal(oldDb.prepare('SELECT ownerId FROM voiceToolIdempotencyReceipts').get().ownerId,'');
  assert.equal(newDb.prepare('SELECT ownerId FROM voiceToolIdempotencyReceipts').get().ownerId,OWNER_A);
  assert.equal(usageOwnerQuery(newDb)('SELECT scopeHash FROM voiceToolIdempotencyReceipts WHERE scopeHash=? AND idempotencyKey=? AND ownerId IS NOT NULL').get(scope,'same')?.scopeHash,scope);
  assert.throws(()=>newDb.prepare(`INSERT INTO voiceToolIdempotencyReceipts(scopeHash,idempotencyKey,requestDigest,status,leaseExpiresAtUtc,createdAt,updatedAt)
   VALUES(?,?,?,'RUNNING',?,?,?)`).run(scope,'same',digest,AT,AT,AT),/UNIQUE/);
 }finally{oldDb.close();newDb.close();}
});
