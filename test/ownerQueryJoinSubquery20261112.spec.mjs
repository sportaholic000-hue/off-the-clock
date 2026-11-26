import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {usageOwnerQuery} from '../server/src/billingUsagePolicy.js';
import * as exceptions from '../server/src/ownerQueryExceptions.js';
const OWNER_QUERY_REVIEWED_STATEMENTS=exceptions.OWNER_QUERY_REVIEWED_STATEMENTS??[];

// Expected before execution.
// On the code before this change both helpers accept the two shapes below and,
// run with business A's owner ID, they return business B's value
// ('B secret' and SYNTHETIC-owner-b). After the change both helpers refuse
// them, so no value of B is returned. Every table that holds business data,
// joined or inside a subquery, must be tied to the same business; tied forms
// are accepted and return only A's rows. The payment-grace sweep suspends only
// A (0 at 2.9 days, 1 at 3.1 days, then 0); erasing A leaves B's rows identical
// and A as a billing tombstone. Those two results are the same before and after.
const A='SYNTHETIC-owner-a',B='SYNTHETIC-owner-b';
const LEAKS=[
  ['subquery in the select list (T\'s example)','SELECT (SELECT secret FROM c WHERE id=?) AS leaked FROM b WHERE ownerId=?',['c-b',A],'B secret'],
  ['joined table not tied','SELECT c.ownerId FROM b JOIN c ON c.id=? WHERE b.ownerId=?',['c-b',A],B],
];
const TABLES=[
  'CREATE TABLE b(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, cId TEXT, label TEXT)',
  'CREATE TABLE c(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, secret TEXT)',
  'CREATE TABLE catalog(id TEXT PRIMARY KEY, label TEXT)',
];
function seed(db, temp='') {
  for(const sql of TABLES)db.exec(sql.replace('CREATE TABLE','CREATE '+temp+'TABLE'));
  // A's row b-a points at B's row c-b through a plain id reference.
  db.prepare("INSERT INTO b(id,ownerId,cId,label) VALUES('b-a',?,'c-b','A label'),('b-b',?,'c-b','B label')").run(A,B);
  db.prepare("INSERT INTO c(id,ownerId,secret) VALUES('c-a',?,'A secret'),('c-b',?,'B secret')").run(A,B);
  db.exec("INSERT INTO catalog(id,label) VALUES('c-b','shared label')");
}
function scratch() { const db=new DatabaseSync(':memory:'); seed(db); return db; }
let app;
async function appDatabase() {
  if(app)return app;
  app=await import('../server/src/db.js');
  app.migrate();
  if(!app.db.prepare("SELECT 1 FROM sqlite_temp_master WHERE name='c'").get())seed(app.db,'TEMP ');
  return app;
}
const value=row=>row&&Object.values(row)[0];

test('run directly, both shapes return business B\'s value to a query bound to business A',()=>{
  const db=scratch();
  try { for(const [name,sql,params,leaked] of LEAKS)assert.equal(value(db.prepare(sql).get(...params)),leaked,name); }
  finally { db.close(); }
});

for(const [name,sql,params] of LEAKS){
  test(`usageOwnerQuery refuses ${name}; B's value is not returned`,()=>{
    const db=scratch();
    try {
      let row;
      assert.throws(()=>{row=usageOwnerQuery(db)(sql).get(...params);},/owner binding/);
      assert.equal(row,undefined);
    } finally { db.close(); }
  });
  test(`ownerQuery refuses ${name}; B's value is not returned`,async()=>{
    const {ownerQuery}=await appDatabase();
    let row;
    assert.throws(()=>{row=ownerQuery(sql).get(...params);},/must filter by ownerId/);
    assert.equal(row,undefined);
  });
}

// Each position a business table can sit in, untied (refused) and tied (accepted).
const REFUSED=[
  'SELECT b.id FROM b LEFT JOIN c ON c.id=b.cId WHERE b.ownerId=?',
  'SELECT b.id FROM b CROSS JOIN c WHERE b.ownerId=?',
  'SELECT b.id FROM b, c WHERE b.ownerId=? AND c.id=b.cId',
  'SELECT c.secret FROM b LEFT JOIN c ON b.ownerId=? WHERE b.ownerId=?',
  'SELECT b.id FROM b JOIN catalog k ON k.id=b.cId JOIN c ON c.id=k.id WHERE b.ownerId=?',
  'SELECT x.secret FROM b JOIN (SELECT id, secret FROM c) x ON x.id=b.cId WHERE b.ownerId=?',
  'WITH x AS (SELECT secret FROM c) SELECT b.id FROM b JOIN x WHERE b.ownerId=?',
  'SELECT id FROM b WHERE ownerId=? AND cId IN (SELECT id FROM c WHERE secret=?)',
  'SELECT id FROM b WHERE ownerId=? AND EXISTS(SELECT 1 FROM c WHERE c.id=b.cId)',
  'SELECT id FROM b WHERE ownerId=? AND NOT EXISTS(SELECT 1 FROM c WHERE c.id=b.cId)',
  'SELECT id FROM b WHERE ownerId=? AND (SELECT COUNT(*) FROM c WHERE c.ownerId=? OR c.id=b.cId)>0',
  'SELECT b.id FROM b JOIN c ON c.ownerId=b.ownerId AND c.id=(SELECT id FROM c WHERE secret=?) WHERE b.ownerId=?',
  'SELECT ownerId, COUNT(*) FROM b WHERE ownerId=? GROUP BY ownerId HAVING COUNT(*)<(SELECT COUNT(*) FROM c)',
  'SELECT id FROM b WHERE ownerId=? ORDER BY (SELECT secret FROM c WHERE c.id=b.cId)',
  'SELECT id FROM b WHERE ownerId=? UNION SELECT id FROM b WHERE ownerId=? AND cId IN (SELECT id FROM c)',
  'SELECT (SELECT (SELECT secret FROM c WHERE c.id=b.cId)) FROM b WHERE b.ownerId=?',
  'UPDATE b SET label=(SELECT secret FROM c WHERE c.id=b.cId) WHERE ownerId=? AND id=?',
  'UPDATE b SET label=? WHERE ownerId=? AND cId IN (SELECT id FROM c WHERE secret=?)',
  'UPDATE b SET label=c.secret FROM c WHERE b.ownerId=? AND c.id=b.cId',
  'DELETE FROM b WHERE ownerId=? AND cId IN (SELECT id FROM c WHERE secret=?)',
  'DELETE FROM b WHERE ownerId=? RETURNING (SELECT secret FROM c WHERE c.id=b.cId)',
  'INSERT INTO b(id,ownerId,label) SELECT ?,?,secret FROM c WHERE id=?',
  'INSERT INTO b(id,ownerId,label) VALUES(?,?,(SELECT secret FROM c WHERE id=?))',
  'INSERT INTO b(id,ownerId,label) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET label=(SELECT secret FROM c WHERE id=?)',
  // A plain id reference does not make the row the same business's row.
  'SELECT c.secret FROM b JOIN c ON c.id=b.cId WHERE b.ownerId=?',
  // users: joined on a parameter, and an account row not known to be the owner's
  // own row (it may be a staff row, whose id is not the owner ID).
  'SELECT b.id FROM b JOIN users u ON u.id=? WHERE b.ownerId=?',
  'SELECT b.label FROM users u JOIN b ON b.ownerId=u.id WHERE u.id=? AND (u.ownerId=? OR u.id=?)',
  // Named owner parameters must be the same one.
  'SELECT b.id FROM b JOIN c ON c.ownerId=@other WHERE b.ownerId=@ownerId',
];
const ACCEPTED=[
  ['SELECT c.secret FROM b JOIN c ON c.ownerId=b.ownerId AND c.id=b.cId WHERE b.ownerId=?',[A],[]],
  ['SELECT c.secret FROM b LEFT JOIN c ON c.ownerId=b.ownerId AND c.id=b.cId WHERE b.ownerId=?',[A],[null]],
  ['SELECT c.secret FROM b, c WHERE b.ownerId=? AND c.ownerId=b.ownerId',[A],['A secret']],
  ['SELECT c.secret FROM b RIGHT JOIN c ON c.ownerId=b.ownerId WHERE b.ownerId=? AND c.ownerId=?',[A,A],['A secret']],
  ['SELECT (SELECT secret FROM c WHERE c.ownerId=b.ownerId AND c.id=b.cId) AS secret FROM b WHERE b.ownerId=?',[A],[null]],
  ['SELECT (SELECT secret FROM c WHERE c.ownerId=? AND c.id=?) AS secret FROM b WHERE b.ownerId=?',[A,'c-b',A],[null]],
  ['SELECT id FROM b WHERE ownerId=? AND EXISTS(SELECT 1 FROM c WHERE c.ownerId=b.ownerId AND c.id=b.cId)',[A],[]],
  ['SELECT id FROM b WHERE ownerId=? AND cId IN (SELECT id FROM c WHERE ownerId=?)',[A,A],[]],
  ['SELECT x.secret FROM b JOIN (SELECT id, secret FROM c WHERE ownerId=?) x ON x.id=b.cId WHERE b.ownerId=?',[A,A],[]],
  ['WITH x AS (SELECT secret FROM c WHERE ownerId=?) SELECT x.secret FROM b JOIN x WHERE b.ownerId=?',[A,A],['A secret']],
  ['SELECT b.label AS own, k.label AS shared FROM b JOIN catalog k ON k.id=b.cId WHERE b.ownerId=?',[A],['A label']],
  ['SELECT (SELECT COUNT(*) FROM catalog) AS n FROM b WHERE b.ownerId=?',[A],[1]],
  ['SELECT b.label FROM b JOIN c ON c.ownerId=@ownerId AND c.id=b.cId WHERE b.ownerId=@ownerId',[{ownerId:A}],[]],
];

test('every position: an untied business table is refused by both helpers',async()=>{
  const db=scratch();
  const {ownerQuery}=await appDatabase();
  try {
    db.exec("CREATE TABLE users(id TEXT PRIMARY KEY, ownerId TEXT, role TEXT)");
    for(const sql of REFUSED){
      assert.throws(()=>usageOwnerQuery(db)(sql),/owner binding/,sql);
      assert.throws(()=>ownerQuery(sql),/must filter by ownerId/,sql);
    }
  } finally { db.close(); }
});

test('every position: a tied business table is accepted and returns only business A\'s rows',async()=>{
  const db=scratch();
  const {ownerQuery}=await appDatabase();
  try {
    for(const [sql,params,expected] of ACCEPTED){
      assert.deepEqual(usageOwnerQuery(db)(sql).all(...params).map(value),expected,sql);
      assert.deepEqual(ownerQuery(sql).all(...params).map(value),expected,sql);
    }
  } finally { db.close(); }
});

test('users: the owner\'s own row ties joined tables; a role=\'owner\' or ownerId IS NULL account row ties by its id',async()=>{
  const db=scratch();
  try {
    db.exec("CREATE TABLE users(id TEXT PRIMARY KEY, ownerId TEXT, role TEXT)");
    db.prepare("INSERT INTO users(id,ownerId,role) VALUES(?,NULL,'owner'),(?,NULL,'owner')").run(A,B);
    const query=usageOwnerQuery(db);
    assert.deepEqual(query('SELECT u.role FROM b JOIN users u ON u.id=b.ownerId WHERE b.ownerId=?').all(A).map(value),['owner']);
    assert.deepEqual(query('SELECT b.label FROM users u JOIN b ON b.ownerId=u.id WHERE u.id=? AND u.ownerId IS NULL').all(A).map(value),['A label']);
    assert.deepEqual(query("SELECT b.label FROM users u JOIN b ON b.ownerId=u.id WHERE u.id=? AND (u.ownerId=? OR u.id=?) AND u.role='owner'").all(A,A,A).map(value),['A label']);
    assert.deepEqual(query('SELECT (SELECT label FROM b WHERE b.ownerId=users.id) FROM users WHERE users.id=? AND users.ownerId IS NULL').all(A).map(value),['A label']);
  } finally { db.close(); }
});

test('the reviewed usage-period upsert passes by its exact text only and reads only its own business\'s charges',async()=>{
  assert.equal(OWNER_QUERY_REVIEWED_STATEMENTS.length,1);
  const {CREATE_TABLE_STATEMENTS}=await import('../server/src/schema.js');
  const {installBillingUsageSchema}=await import('../server/src/billingUsageSchema.js');
  const {readFileSync}=await import('node:fs');
  const ts=(await import('typescript')).default;
  const [row]=OWNER_QUERY_REVIEWED_STATEMENTS;
  const source=readFileSync(new URL('../'+row.file,import.meta.url),'utf8');
  const tree=ts.createSourceFile(row.file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  let sql=null;
  const visit=node=>{if(ts.isNoSubstitutionTemplateLiteral(node)&&createHash('sha256').update(node.text).digest('hex')===row.signature)sql=node.text;ts.forEachChild(node,visit);};
  visit(tree);
  assert.ok(sql,'the reviewed statement is in its file');
  const db=new DatabaseSync(':memory:');
  try {
    for(const statement of CREATE_TABLE_STATEMENTS)db.exec(statement);
    installBillingUsageSchema(db);
    const query=usageOwnerQuery(db);
    assert.doesNotThrow(()=>query(sql));
    assert.throws(()=>query(sql+' '),/owner binding/,'one changed character is not the reviewed statement');
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'!','A','A','Operator','active','UTC','owner','2026-11-12T00:00:00.000Z'),(?,?,'!','B','B','Operator','active','UTC','owner','2026-11-12T00:00:00.000Z')").run(A,'a@example.invalid',B,'b@example.invalid');
    const insert=['p-a',A,'cus_a','sub_a','price_1','Operator','monthly','2026-11-01T00:00:00.000Z','2026-12-01T00:00:00.000Z','2026-11-01T00:00:00.000Z','2026-12-01T00:00:00.000Z','2026-11-01T00:00:00.000Z','2026-11-01T00:00:00.000Z'];
    query(sql).run(...insert,'2026-11-02T00:00:00.000Z');
    // A charge of business B that points at A's period (a bad cross-business reference).
    db.prepare("INSERT INTO billingUsageCharges(id,periodId,ownerId,sequence,amountCents,minutesUsed,usageDigest,nextAttemptAt,createdAt,updatedAt) VALUES('charge-b','p-a',?,1,35,1,'d','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z','2026-11-02T00:00:00.000Z')").run(B);
    const update=[...insert];update[5]='QuoteDone';update[12]='2026-11-03T00:00:00.000Z';
    query(sql).run(...update,'2026-11-03T00:00:00.000Z');
    assert.equal(db.prepare('SELECT plan FROM billingUsagePeriods WHERE id=?').get('p-a').plan,'QuoteDone','B\'s charge does not freeze A\'s period');
    db.prepare("INSERT INTO billingUsageCharges(id,periodId,ownerId,sequence,amountCents,minutesUsed,usageDigest,nextAttemptAt,createdAt,updatedAt) VALUES('charge-a','p-a',?,2,35,1,'d','2026-11-03T00:00:00.000Z','2026-11-03T00:00:00.000Z','2026-11-03T00:00:00.000Z')").run(A);
    update[5]='Starter';
    query(sql).run(...update,'2026-11-03T00:00:00.000Z');
    assert.equal(db.prepare('SELECT plan FROM billingUsagePeriods WHERE id=?').get('p-a').plan,'QuoteDone','A\'s own charge freezes A\'s period');
  } finally { db.close(); }
});

test('payment-grace sweep result is unchanged: suspends only the expired business',async t=>{
  const {fixture,START,prices}=await import('./overageMinute20261006Fixture.mjs');
  const FA='SYNTHETIC-owner-a',FB='SYNTHETIC-owner-b';
  const f=fixture(t);
  f.activate(FA);f.activate(FB);
  const sec=at=>Date.parse(at)/1000,end='2026-11-20T12:00:00.000Z',amount=11900;
  f.billing.applyVerifiedStripeEvent({id:'evt_SYNTHETIC_tie_failed',type:'invoice.payment_failed',created:sec(START),livemode:false,data:{object:{
    id:'in_SYNTHETIC_tie_failed',customer:'cus_'+FA,subscription:'sub_'+FA,currency:'cad',status:'open',amount_paid:0,amount_remaining:amount,
    period_start:sec(START),period_end:sec(end),lines:{has_more:false,data:[{price:{id:prices.Operator.monthly},amount,quantity:1,period:{start:sec(START),end:sec(end)}}]}}}});
  const day=86400000,at=days=>new Date(Date.parse(START)+days*day).toISOString();
  const status=id=>f.db.prepare('SELECT planStatus FROM users WHERE id=?').get(id).planStatus;
  assert.equal(status(FA),'payment_failed');assert.equal(status(FB),'active');
  assert.deepEqual(f.billing.suspendExpiredGracePeriods({at:at(2.9)}),{suspendedCount:0});
  assert.deepEqual(f.billing.suspendExpiredGracePeriods({at:at(3.1),ownerId:FB}),{suspendedCount:0});
  assert.deepEqual(f.billing.suspendExpiredGracePeriods({at:at(3.1)}),{suspendedCount:1});
  assert.equal(status(FA),'suspended');assert.equal(status(FB),'active');
  assert.deepEqual(f.billing.suspendExpiredGracePeriods({at:at(3.2)}),{suspendedCount:0});
  const accounts=f.db.prepare('SELECT ownerId,graceEndsAt,paymentFailedAt,updatedAt FROM billingAccounts ORDER BY ownerId').all().map(row=>({...row}));
  assert.deepEqual(accounts,[
    {ownerId:FA,graceEndsAt:at(3),paymentFailedAt:START,updatedAt:at(3.1)},
    {ownerId:FB,graceEndsAt:null,paymentFailedAt:null,updatedAt:accounts[1].updatedAt},
  ]);
  t.diagnostic('grace accounts '+JSON.stringify(accounts));
});

test('account deletion result is unchanged: business A erased to a billing tombstone, business B identical',async t=>{
  const {A:EA,B:EB,DEADLINE,retentionFixture,businessRows,assertErased}=await import('./helpers/tenantRetentionFixture.mjs');
  const {eraseTenantRows}=await import('../server/src/billingTenantErasure.js');
  const f=retentionFixture(t);
  const beforeB=businessRows(f.db,EB),beforeA=businessRows(f.db,EA);
  eraseTenantRows(f.db,EA,DEADLINE);
  assertErased(assert,f.db);
  assert.deepEqual(businessRows(f.db,EB),beforeB);
  const afterA=businessRows(f.db,EA);
  for(const table of ['billingAccounts','billingSubscriptionHistory','billingEventReceipts','billingUsagePeriods'])
    assert.equal((afterA[table]||[]).length,(beforeA[table]||[]).length,table+' rows of A are retained');
  assert.equal(afterA.users.length,1);
  assert.equal(afterA.users[0].dataDeletedAt,DEADLINE);assert.equal(afterA.users[0].planStatus,'canceled');
  const counts=Object.fromEntries(Object.entries(afterA).filter(([,rows])=>rows.length).map(([table,rows])=>[table,rows.length]));
  assert.deepEqual(counts,{billingAccounts:1,billingCancellations:1,outboxEvents:1,ownerEmailDeliveries:1,users:1});
  t.diagnostic('erased A rows remaining '+JSON.stringify(counts));
});
