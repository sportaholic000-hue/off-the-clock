import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {usageOwnerQuery} from '../server/src/billingUsagePolicy.js';

// Expected before execution.
// On the code before this change, each of the five statements below is
// accepted by both helpers and, run for business A, reads or changes business
// B's row: the CTE read returns both secrets; the authTokens read returns B's
// token and the UPDATE ... FROM consumes it; the ON CONFLICT(id) upsert
// overwrites B's note; INSERT OR REPLACE takes B's row over; the join tied to a
// second unnamed ? returns B's note when B's ID is passed there. After the
// change each is refused (the second ? when the two bound values differ) and B's
// row is unchanged. The tied form of each is accepted and touches only A.
const A='SYNTHETIC-owner-a',B='SYNTHETIC-owner-b',TOKEN_B='b'.repeat(64),TOKEN_A='a'.repeat(64);
const T1='WITH b AS (SELECT secret FROM main.b WHERE ownerId=@owner) SELECT secret FROM main.b';
const T2='SELECT t.userId,t.purpose FROM businessProfiles p JOIN authTokens t ON t.userId=@victim WHERE p.ownerId=@owner';
const T2U='UPDATE authTokens SET consumedAt=@at FROM businessProfiles p WHERE p.ownerId=@owner AND authTokens.userId=@victim';
const T3='INSERT INTO c(id,ownerId,note) VALUES(@id,@owner,@note) ON CONFLICT(id) DO UPDATE SET note=excluded.note';
const T3R='INSERT OR REPLACE INTO c(id,ownerId,note) VALUES(@id,@owner,@note)';
const T4='SELECT c.note FROM b JOIN c ON c.ownerId=? WHERE b.ownerId=?';

const SCRATCH=[
  'CREATE TABLE IF NOT EXISTS b(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, secret TEXT)',
  'CREATE TABLE IF NOT EXISTS c(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, slot TEXT, note TEXT, UNIQUE(ownerId,slot))',
  'CREATE TABLE IF NOT EXISTS d(ownerId TEXT NOT NULL, slot TEXT NOT NULL, note TEXT, PRIMARY KEY(ownerId,slot))',
];
// Minimal copies of the account tables for the node:sqlite database; the app
// database has the real ones.
const ACCOUNT=[
  'CREATE TABLE users(id TEXT PRIMARY KEY, ownerId TEXT, role TEXT NOT NULL)',
  'CREATE TABLE businessProfiles(ownerId TEXT PRIMARY KEY, businessName TEXT)',
  'CREATE TABLE authTokens(tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), purpose TEXT NOT NULL, expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL, consumedAt TEXT)',
  'CREATE TABLE authSessions(id TEXT PRIMARY KEY, userId TEXT NOT NULL, role TEXT NOT NULL)',
  'CREATE TABLE authRefreshTokens(tokenHash TEXT PRIMARY KEY, sessionId TEXT NOT NULL REFERENCES authSessions(id))',
  'CREATE TABLE authKnownAddresses(keyHash TEXT PRIMARY KEY, accountHash TEXT NOT NULL)',
  'CREATE TABLE authRateLimits(keyHash TEXT PRIMARY KEY, count INTEGER NOT NULL)',
];
function seedScratch(db) {
  for(const sql of SCRATCH)db.exec(sql);
  for(const table of ['b','c','d'])db.exec('DELETE FROM '+table);
  db.prepare("INSERT INTO b(id,ownerId,secret) VALUES('b-a',?,'A secret'),('b-b',?,'B secret')").run(A,B);
  db.prepare("INSERT INTO c(id,ownerId,slot,note) VALUES('c-a',?,'s','A note'),('c-b',?,'s','B note')").run(A,B);
  db.prepare("INSERT INTO d(ownerId,slot,note) VALUES(?,'s','A note'),(?,'s','B note')").run(A,B);
}
function seedAccounts(db, app) {
  if(app){
    db.prepare("DELETE FROM authTokens WHERE userId IN (?,?)").run(A,B);
    for(const id of [A,B])if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)){
      db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'!','S','S','Operator','pending_payment','UTC','owner','2026-11-13T00:00:00.000Z')").run(id,id+'@example.invalid');
      db.prepare("INSERT INTO businessProfiles(ownerId,updatedAt) VALUES(?,'2026-11-13T00:00:00.000Z')").run(id);
    }
  } else {
    for(const sql of ACCOUNT)db.exec(sql);
    db.prepare("INSERT INTO users(id,ownerId,role) VALUES(?,NULL,'owner'),(?,NULL,'owner')").run(A,B);
    db.prepare('INSERT INTO businessProfiles(ownerId) VALUES(?),(?)').run(A,B);
    db.prepare("INSERT INTO authSessions(id,userId,role) VALUES('s-a',?,'owner'),('s-b',?,'owner')").run(A,B);
    db.prepare("INSERT INTO authRefreshTokens(tokenHash,sessionId) VALUES('r-a','s-a'),('r-b','s-b')").run();
  }
  db.prepare("INSERT INTO authTokens(tokenHash,userId,purpose,expiresAt,createdAt) VALUES(?,?,'reset_password','2026-12-01T00:00:00.000Z','2026-11-13T00:00:00.000Z'),(?,?,'reset_password','2026-12-01T00:00:00.000Z','2026-11-13T00:00:00.000Z')").run(TOKEN_A,A,TOKEN_B,B);
}
function scratch() { const db=new DatabaseSync(':memory:'); seedScratch(db); seedAccounts(db,false); return db; }
async function app() {
  const module=await import('../server/src/db.js');module.migrate();
  seedScratch(module.db);seedAccounts(module.db,true);
  return {db:module.db,query:module.ownerQuery,refused:/must filter by ownerId/};
}
const helpers=[
  ['usageOwnerQuery',async()=>{const db=scratch();return {db,query:usageOwnerQuery(db),refused:/owner binding/,close:()=>db.close()};}],
  ['ownerQuery',async()=>({...await app(),close:()=>{}})],
];
const noteOf=(db,id)=>db.prepare('SELECT ownerId,note FROM c WHERE id=?').get(id);
const tokenOf=(db,hash)=>db.prepare('SELECT consumedAt FROM authTokens WHERE tokenHash=?').get(hash).consumedAt;
const plain=rows=>rows.map(row=>({...row}));

test('run directly, each statement reads or changes business B\'s row for business A',()=>{
  const db=scratch();
  try {
    assert.deepEqual(plain(db.prepare(T1).all({owner:A})).map(row=>row.secret).sort(),['A secret','B secret']);
    assert.deepEqual(plain(db.prepare(T2).all({victim:B,owner:A})),[{userId:B,purpose:'reset_password'}]);
    db.prepare(T2U).run({at:'2026-11-13T01:00:00.000Z',owner:A,victim:B});assert.equal(tokenOf(db,TOKEN_B),'2026-11-13T01:00:00.000Z');
    db.prepare(T3).run({id:'c-b',owner:A,note:'overwritten'});assert.deepEqual({...noteOf(db,'c-b')},{ownerId:B,note:'overwritten'});
    db.prepare(T3R).run({id:'c-b',owner:A,note:'taken'});assert.deepEqual({...noteOf(db,'c-b')},{ownerId:A,note:'taken'});
    seedScratch(db);
    assert.deepEqual(plain(db.prepare(T4).all(B,A)).map(row=>row.note),['B note']);
  } finally { db.close(); }
});

for(const [name,open] of helpers){
  test(`${name} refuses each of the five statements; business B's row is unchanged`,async()=>{
    const {db,query,refused,close}=await open();
    try {
      let rows;
      assert.throws(()=>{rows=query(T1).all({owner:A});},refused,'CTE named like the table');assert.equal(rows,undefined);
      assert.throws(()=>{rows=query(T2).all({victim:B,owner:A});},refused,'authTokens read');assert.equal(rows,undefined);
      assert.throws(()=>query(T2U).run({at:'2026-11-13T01:00:00.000Z',owner:A,victim:B}),refused,'authTokens UPDATE ... FROM');
      assert.equal(tokenOf(db,TOKEN_B),null);
      assert.throws(()=>query(T3).run({id:'c-b',owner:A,note:'overwritten'}),refused,'ON CONFLICT(id) upsert');
      assert.throws(()=>query(T3R).run({id:'c-b',owner:A,note:'taken'}),refused,'INSERT OR REPLACE');
      assert.throws(()=>query('REPLACE INTO c(id,ownerId,note) VALUES(?,?,?)'),refused,'REPLACE INTO');
      assert.throws(()=>query('UPDATE OR REPLACE c SET id=? WHERE ownerId=? AND id=?'),refused,'UPDATE OR REPLACE');
      assert.deepEqual({...noteOf(db,'c-b')},{ownerId:B,note:'B note'});
      // The second unnamed ? is checked when the statement runs.
      assert.throws(()=>{rows=query(T4).all(B,A);},refused,'second unnamed ? bound to another business');assert.equal(rows,undefined);
      assert.throws(()=>query(T4).get(B,A),refused);
      assert.throws(()=>[...query(T4).iterate(B,A)],refused);
      if(typeof db.prepare('SELECT 1').bind==='function')assert.throws(()=>query(T4).bind(B,A),refused);
    } finally { close(); }
  });

  test(`${name} still accepts the tied form of each and touches only business A`,async()=>{
    const {db,query,close}=await open();
    try {
      assert.deepEqual(plain(query('WITH mine AS (SELECT secret FROM main.b WHERE ownerId=@owner) SELECT secret FROM mine').all({owner:A})).map(row=>row.secret),['A secret']);
      assert.deepEqual(plain(query('SELECT secret FROM main.b WHERE ownerId=?').all(A)).map(row=>row.secret),['A secret']);
      assert.deepEqual(plain(query('SELECT t.purpose FROM businessProfiles p JOIN authTokens t ON t.userId=p.ownerId WHERE p.ownerId=?').all(A)),[{purpose:'reset_password'}]);
      assert.deepEqual(plain(query('SELECT t.tokenHash FROM businessProfiles p JOIN authTokens t ON t.userId=@owner WHERE p.ownerId=@owner').all({owner:A})).map(row=>row.tokenHash),[TOKEN_A]);
      assert.equal(query('UPDATE authTokens SET consumedAt=? FROM businessProfiles p WHERE p.ownerId=? AND authTokens.userId=p.ownerId').run('2026-11-13T02:00:00.000Z',A).changes,1);
      assert.equal(tokenOf(db,TOKEN_A),'2026-11-13T02:00:00.000Z');assert.equal(tokenOf(db,TOKEN_B),null);
      assert.equal(query("UPDATE authTokens SET consumedAt=? FROM businessProfiles p WHERE p.ownerId=? AND authTokens.userId=?").run('2026-11-13T03:00:00.000Z',B,B).changes,1,'positional userId tie with the same business');
      assert.throws(()=>query("UPDATE authTokens SET consumedAt=? FROM businessProfiles p WHERE p.ownerId=? AND authTokens.userId=?").run('2026-11-13T03:00:00.000Z',A,B),/owner binding|must filter by ownerId/);
      // Upsert with a business-match guard or ownerId in the conflict target; REPLACE where every unique key holds ownerId.
      assert.equal(query('INSERT INTO c(id,ownerId,note) VALUES(@id,@owner,@note) ON CONFLICT(id) DO UPDATE SET note=excluded.note WHERE c.ownerId=excluded.ownerId').run({id:'c-b',owner:A,note:'overwritten'}).changes,0);
      assert.equal(query('INSERT INTO c(id,ownerId,slot,note) VALUES(?,?,?,?) ON CONFLICT(ownerId,slot) DO UPDATE SET note=excluded.note').run('c-a2',A,'s','A updated').changes,1);
      assert.equal(query('INSERT OR REPLACE INTO d(ownerId,slot,note) VALUES(?,?,?)').run(A,'s','A replaced').changes,1);
      assert.deepEqual({...noteOf(db,'c-b')},{ownerId:B,note:'B note'});assert.deepEqual({...noteOf(db,'c-a')},{ownerId:A,note:'A updated'});
      assert.deepEqual(plain(db.prepare('SELECT ownerId,note FROM d ORDER BY ownerId').all()),[{ownerId:A,note:'A replaced'},{ownerId:B,note:'B note'}]);
      // Two unnamed ? carrying the same business.
      assert.deepEqual(plain(query(T4).all(A,A)).map(row=>row.note),['A updated']);
      if(typeof db.prepare('SELECT 1').bind==='function')assert.deepEqual(plain(query(T4).bind(A,A).all()).map(row=>row.note),['A updated']);
      assert.deepEqual({...query(T4).get(A,A)},{note:'A updated'});
    } finally { close(); }
  });
}

test('account tables: refresh tokens tie through their session, and unlinkable or global tables are classified',()=>{
  const db=scratch();
  try {
    const query=usageOwnerQuery(db);
    assert.deepEqual(plain(query('SELECT r.tokenHash FROM users u JOIN authSessions s ON s.userId=u.id JOIN authRefreshTokens r ON r.sessionId=s.id WHERE u.id=? AND u.ownerId IS NULL').all(A)),[{tokenHash:'r-a'}]);
    for(const sql of [
      'SELECT r.tokenHash FROM businessProfiles p JOIN authRefreshTokens r ON r.sessionId=? WHERE p.ownerId=?',
      'SELECT s.id FROM businessProfiles p JOIN authSessions s ON s.id=? WHERE p.ownerId=?',
      'SELECT t.userId FROM businessProfiles p JOIN authTokens t ON t.purpose=? WHERE p.ownerId=?',
      'SELECT k.accountHash FROM businessProfiles p JOIN authKnownAddresses k ON k.accountHash=p.ownerId WHERE p.ownerId=?',
      'DELETE FROM authTokens WHERE userId IN (SELECT id FROM users WHERE ownerId=?)',
      'INSERT INTO c(id,ownerId,note) SELECT ?,?,t.purpose FROM authTokens t',
    ])assert.throws(()=>query(sql),/owner binding/,sql);
    assert.deepEqual(plain(query('SELECT p.ownerId FROM businessProfiles p LEFT JOIN authRateLimits l ON l.keyHash=? WHERE p.ownerId=?').all('x',A)),[{ownerId:A}]);
    // The inserted ownerId and a SELECT tied by another ? must carry the same business.
    assert.throws(()=>query('INSERT INTO c(id,ownerId,note) SELECT ?,?,secret FROM b WHERE b.ownerId=?').run('c-x',A,B),/owner binding/);
    assert.equal(query('INSERT INTO c(id,ownerId,note) SELECT ?,?,secret FROM b WHERE b.ownerId=?').run('c-x',A,A).changes,1);
    assert.equal(noteOf(db,'c-x').note,'A secret');
  } finally { db.close(); }
});

test('the two Stripe-keyed billing upserts keep their business-match guard: business A cannot change business B\'s evidence',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../server/src/billingEvidence.js',import.meta.url),'utf8');
  const statements=[...source.matchAll(/usageOwnerQuery\(db\)\(`(INSERT INTO billing(?:Subscription|Invoice)Evidence[\s\S]*?)`\)/g)].map(match=>match[1]);
  assert.equal(statements.length,2);
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE billingSubscriptionEvidence(stripeSubscriptionId TEXT PRIMARY KEY, ownerId TEXT NOT NULL, stripeCustomerId TEXT NOT NULL, eventCreatedAt INTEGER NOT NULL, stateJson TEXT NOT NULL, ambiguous INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE billingInvoiceEvidence(stripeInvoiceId TEXT PRIMARY KEY, ownerId TEXT NOT NULL, stripeCustomerId TEXT NOT NULL, stripeSubscriptionId TEXT NOT NULL, status TEXT NOT NULL, failedAt INTEGER, paidAt INTEGER, amountPaid INTEGER, periodStart INTEGER, periodEnd INTEGER)`);
    const query=usageOwnerQuery(db),[subscription,invoice]=statements;
    query(subscription).run('sub_B',B,'cus_B',1,'{"b":1}',0);
    assert.equal(query(subscription).run('sub_B',A,'cus_B',2,'{"a":1}',0).changes,0,'A cannot update B\'s subscription evidence');
    assert.equal(query(subscription).run('sub_B',B,'cus_B',3,'{"b":2}',0).changes,1,'B updates its own');
    assert.deepEqual({...db.prepare('SELECT ownerId,eventCreatedAt,stateJson FROM billingSubscriptionEvidence').get()},{ownerId:B,eventCreatedAt:3,stateJson:'{"b":2}'});
    query(invoice).run('in_B',B,'cus_B','sub_B','FAILED',1,null,null,1,2);
    assert.equal(query(invoice).run('in_B',A,'cus_B','sub_B','PAID',null,5,100,1,2).changes,0,'A cannot update B\'s invoice evidence');
    assert.equal(query(invoice).run('in_B',B,'cus_B','sub_B','PAID',1,5,100,1,2).changes,1,'B updates its own');
    assert.deepEqual({...db.prepare('SELECT ownerId,status,amountPaid FROM billingInvoiceEvidence').get()},{ownerId:B,status:'PAID',amountPaid:100});
  } finally { db.close(); }
});
