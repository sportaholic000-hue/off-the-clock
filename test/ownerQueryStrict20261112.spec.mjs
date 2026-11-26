import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {usageOwnerQuery} from '../server/src/billingUsagePolicy.js';

// Expected before execution: the old helpers accept any SQL that mentions
// ownerId, so the unfiltered SELECT and the INSERT without an ownerId column
// pass there; with the stricter check both helpers refuse them.
function fixture() {
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t(id TEXT PRIMARY KEY, ownerId TEXT, name TEXT)');
  db.prepare("INSERT INTO t(id,ownerId,name) VALUES('1','owner-a','A'),('2','owner-b','B')").run();
  return db;
}

test('both helpers refuse a SELECT that only names ownerId in its columns',async()=>{
  const {ownerQuery}=await import('../server/src/db.js');
  const db=fixture();
  try {
    assert.throws(()=>usageOwnerQuery(db)('SELECT id,ownerId FROM t'),/owner binding/);
    assert.throws(()=>ownerQuery('SELECT id,ownerId FROM t'),/must filter by ownerId/);
  } finally { db.close(); }
});

test('ownerId=? and alias.ownerId = ? pass and return only that owner',async()=>{
  const {ownerQuery,migrate}=await import('../server/src/db.js');
  migrate();
  const db=fixture();
  try {
    assert.deepEqual(usageOwnerQuery(db)('SELECT id FROM t WHERE ownerId=?').all('owner-a').map(row=>row.id),['1']);
    assert.deepEqual(usageOwnerQuery(db)('SELECT a.id FROM t a WHERE a.ownerId = ?').all('owner-b').map(row=>row.id),['2']);
    assert.ok(ownerQuery('SELECT id FROM users WHERE ownerId=?'));
    assert.ok(ownerQuery('SELECT a.id FROM users a WHERE a.ownerId = ?'));
  } finally { db.close(); }
});

test('an INSERT without an ownerId column is refused by both helpers',async()=>{
  const {ownerQuery}=await import('../server/src/db.js');
  const db=fixture();
  try {
    assert.throws(()=>usageOwnerQuery(db)("INSERT INTO t(id,name) VALUES(?,'ownerId')"),/owner binding/);
    assert.throws(()=>ownerQuery("INSERT INTO users(id,email) VALUES(?,'ownerId')"),/must filter by ownerId/);
    usageOwnerQuery(db)('INSERT INTO t(id,ownerId,name) VALUES(?,?,?)').run('3','owner-a','C');
    assert.equal(db.prepare("SELECT ownerId FROM t WHERE id='3'").get().ownerId,'owner-a');
  } finally { db.close(); }
});

test('a non-equality, unbound, quoted or commented ownerId never counts as the owner filter',()=>{
  const db=fixture();
  try {
    for(const sql of [
      'SELECT id FROM t WHERE ownerId<>?',
      'SELECT id FROM t WHERE ownerId IS NOT NULL',
      "SELECT id FROM t WHERE ownerId='owner-a'",
      "SELECT id FROM t WHERE name='ownerId=?'",
      'SELECT id FROM t -- WHERE ownerId=?',
      'UPDATE t SET name=? WHERE id=? /* ownerId=? */',
      'DELETE FROM t WHERE ownerId>=?',
    ])assert.throws(()=>usageOwnerQuery(db)(sql),/owner binding/,sql);
    assert.equal(usageOwnerQuery(db)('UPDATE t SET name=? WHERE ownerId=? AND id=?').run('Z','owner-b','1').changes,0);
    assert.equal(usageOwnerQuery(db)('DELETE FROM t WHERE ownerId = @ownerId AND id=@id').run({ownerId:'owner-a',id:'1'}).changes,1);
  } finally { db.close(); }
});
