import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrateDatabase} from '../server/src/migrations.js';
import {usageOwnerQuery} from '../server/src/billingUsagePolicy.js';

// Expected before execution, on a fully migrated two-business database.
// calendarConnections is a rowid table: business A is rowid 1, business B is
// rowid 2. On the code before this change both helpers accept the two
// statements below and REPLACE deletes B's connection, leaving one row
// {rowid:2, ownerId:A}. After the change both helpers refuse them and every
// rowid variant (oid, _rowid_, quoted ROWID, main.calendarConnections, a quoted
// table name, INSERT OR REPLACE ... SELECT, UPDATE OR REPLACE ... SET rowid,
// another rowid owner table (widgetSettings, businessProfiles), a REPLACE that
// supplies no rowid on a rowid table)
// and B's row is unchanged. The rule refuses REPLACE on every rowid owner table,
// so REPLACE stays accepted only on a WITHOUT ROWID table whose every unique key
// holds ownerId, where it changes only A's rows. Upserts that supply a rowid
// stay accepted only with an ownerId conflict target or an ownerId guard, and
// leave B's row unchanged.
const A='SYNTHETIC-owner-a',B='SYNTHETIC-owner-b';
const COLUMNS='ownerId,provider,status,createdAt,updatedAt';
const ROW="@owner,'google','connected','t','t'";
const T1=`INSERT OR REPLACE INTO calendarConnections(rowid,${COLUMNS}) VALUES(@rid,${ROW})`;
const T2=`REPLACE INTO calendarConnections(rowid,${COLUMNS}) VALUES(@rid,${ROW})`;
const REFUSED=[
  ['INSERT OR REPLACE supplying rowid (T\'s statement)',T1],
  ['REPLACE INTO supplying rowid (T\'s statement)',T2],
  ['oid',`INSERT OR REPLACE INTO calendarConnections(oid,${COLUMNS}) VALUES(@rid,${ROW})`],
  ['_rowid_',`REPLACE INTO calendarConnections(_rowid_,${COLUMNS}) VALUES(@rid,${ROW})`],
  ['quoted "ROWID"',`INSERT OR REPLACE INTO calendarConnections("ROWID",${COLUMNS}) VALUES(@rid,${ROW})`],
  ['schema-qualified main.calendarConnections',`INSERT OR REPLACE INTO main.calendarConnections(rowid,${COLUMNS}) VALUES(@rid,${ROW})`],
  ['quoted table name',`INSERT OR REPLACE INTO "calendarConnections"(rowid,${COLUMNS}) VALUES(@rid,${ROW})`],
  ['INSERT OR REPLACE ... SELECT supplying rowid',`INSERT OR REPLACE INTO calendarConnections(rowid,${COLUMNS}) SELECT @rid,${ROW}`],
  ['REPLACE on a rowid table without supplying rowid',`INSERT OR REPLACE INTO calendarConnections(${COLUMNS}) VALUES(${ROW})`],
  ['OR REPLACE with an ownerId upsert target',`INSERT OR REPLACE INTO calendarConnections(rowid,${COLUMNS}) VALUES(@rid,${ROW}) ON CONFLICT(ownerId) DO UPDATE SET status=excluded.status`],
  ['UPDATE OR REPLACE ... SET rowid','UPDATE OR REPLACE calendarConnections SET rowid=@rid WHERE ownerId=@owner'],
  ['UPDATE OR REPLACE ... SET oid on schema-qualified table','UPDATE OR REPLACE main.calendarConnections SET oid=@rid WHERE ownerId=@owner'],
  ['another rowid owner table (widgetSettings)',"INSERT OR REPLACE INTO widgetSettings(rowid,ownerId,updatedAt) VALUES(@rid,@owner,'t')"],
  ['another rowid owner table (businessProfiles)',"INSERT OR REPLACE INTO businessProfiles(rowid,ownerId,updatedAt) VALUES(@rid,@owner,'t')"],
  ['ON CONFLICT(rowid) DO UPDATE without a guard',`INSERT INTO calendarConnections(rowid,${COLUMNS}) VALUES(@rid,${ROW}) ON CONFLICT(rowid) DO UPDATE SET status=excluded.status`],
  ['ON CONFLICT DO UPDATE with no target, supplying rowid',`INSERT INTO calendarConnections(rowid,${COLUMNS}) VALUES(@rid,${ROW}) ON CONFLICT DO UPDATE SET status=excluded.status`],
  ['INSERT ... SELECT supplying rowid, upsert with no target',`INSERT INTO calendarConnections(rowid,${COLUMNS}) SELECT @rid,${ROW} WHERE 1 ON CONFLICT DO UPDATE SET status=excluded.status`],
  ['WITHOUT ROWID owner table whose key lacks ownerId (calendarOAuthStates)',"REPLACE INTO calendarOAuthStates(stateHash,ownerId,createdAt,expiresAt) VALUES(@rid,@owner,1,2)"],
];
const SLOTS='CREATE TABLE IF NOT EXISTS scratchOwnerSlots(ownerId TEXT NOT NULL REFERENCES users(id), slot TEXT NOT NULL, note TEXT, PRIMARY KEY(ownerId,slot)) WITHOUT ROWID';
function seed(db, app) {
  db.exec(SLOTS);
  db.prepare('DELETE FROM calendarConnections WHERE ownerId IN (?,?)').run(A,B);
  db.prepare('DELETE FROM widgetSettings WHERE ownerId IN (?,?)').run(A,B);
  db.prepare('DELETE FROM scratchOwnerSlots WHERE ownerId IN (?,?)').run(A,B);
  for(const id of [A,B])if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)){
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'!','S','S','Operator','pending_payment','UTC','owner','2026-11-15T00:00:00.000Z')").run(id,id+'@example.invalid');
    db.prepare("INSERT INTO businessProfiles(ownerId,updatedAt) VALUES(?,'t')").run(id);
  }
  db.prepare("INSERT INTO calendarConnections(rowid,ownerId,provider,status,createdAt,updatedAt) VALUES(1,?,'google','connected','t','t'),(2,?,'google','connected','t','t')").run(A,B);
  db.prepare("INSERT INTO scratchOwnerSlots(ownerId,slot,note) VALUES(?,'s','A note'),(?,'s','B note')").run(A,B);
  db.prepare("INSERT INTO widgetSettings(rowid,ownerId,updatedAt) VALUES(1,?,'t'),(2,?,'t')").run(A,B);
}
const widgets=db=>db.prepare('SELECT rowid,ownerId FROM widgetSettings WHERE ownerId IN (?,?) ORDER BY rowid').all(A,B).map(row=>({...row}));
const rows=db=>db.prepare('SELECT rowid,ownerId,status FROM calendarConnections WHERE ownerId IN (?,?) ORDER BY rowid').all(A,B).map(row=>({...row}));
const INTACT=[{rowid:1,ownerId:A,status:'connected'},{rowid:2,ownerId:B,status:'connected'}];
const helpers=[
  ['usageOwnerQuery',async()=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');migrateDatabase(db);seed(db,false);return {db,query:usageOwnerQuery(db),refused:/owner binding/,close:()=>db.close()};}],
  ['ownerQuery',async()=>{const m=await import('../server/src/db.js');m.migrate();seed(m.db,true);return {db:m.db,query:m.ownerQuery,refused:/must filter by ownerId/,close:()=>{}};}],
];

test('run directly, REPLACE with business B\'s rowid deletes B\'s connection',async()=>{
  const {db,close}=await helpers[0][1]();
  try {
    for(const sql of [T1,T2,'UPDATE OR REPLACE calendarConnections SET rowid=@rid WHERE ownerId=@owner']){
      seed(db,false);
      db.prepare(sql).run({rid:2,owner:A});
      assert.deepEqual(rows(db),[{rowid:2,ownerId:A,status:'connected'}],sql);
    }
    seed(db,false);
    db.prepare("INSERT OR REPLACE INTO widgetSettings(rowid,ownerId,updatedAt) VALUES(@rid,@owner,'t')").run({rid:2,owner:A});
    assert.deepEqual(widgets(db),[{rowid:2,ownerId:A}],'widgetSettings');
  } finally { close(); }
});

for(const [name,open] of helpers){
  test(`${name} refuses every rowid REPLACE and unguarded upsert variant; business B's row is intact`,async()=>{
    const {db,query,refused,close}=await open();
    try {
      for(const [label,sql] of REFUSED){
        assert.throws(()=>query(sql).run({rid:2,owner:A}),refused,label);
        assert.deepEqual(rows(db),INTACT,label);
        assert.deepEqual(widgets(db),[{rowid:1,ownerId:A},{rowid:2,ownerId:B}],label);
      }
    } finally { close(); }
  });

  test(`${name} still accepts REPLACE on a keyed WITHOUT ROWID table and guarded upserts that supply rowid; only business A changes`,async()=>{
    const {db,query,close}=await open();
    try {
      assert.equal(query('INSERT OR REPLACE INTO scratchOwnerSlots(ownerId,slot,note) VALUES(@owner,@slot,@note)').run({owner:A,slot:'s',note:'A replaced'}).changes,1);
      assert.equal(query('REPLACE INTO scratchOwnerSlots(ownerId,slot,note) VALUES(?,?,?)').run(A,'t','A added').changes,1);
      assert.deepEqual(db.prepare('SELECT ownerId,slot,note FROM scratchOwnerSlots WHERE ownerId IN (?,?) ORDER BY ownerId,slot').all(A,B).map(row=>({...row})),
        [{ownerId:A,slot:'s',note:'A replaced'},{ownerId:A,slot:'t',note:'A added'},{ownerId:B,slot:'s',note:'B note'}]);
      // No-target upsert with B's rowid: the rowid conflict reaches B's row, and the guard leaves it alone.
      const guarded=query(`INSERT INTO calendarConnections(rowid,${COLUMNS}) VALUES(@rid,@owner,'google','guarded','t','t') ON CONFLICT DO UPDATE SET status=excluded.status WHERE calendarConnections.ownerId=excluded.ownerId`).run({rid:2,owner:A});
      assert.equal(guarded.changes,0);
      assert.deepEqual(rows(db),INTACT);
      // ownerId conflict target with B's rowid supplied: the update lands on A's own row.
      const targeted=query(`INSERT INTO calendarConnections(rowid,${COLUMNS}) VALUES(@rid,@owner,'google','targeted','t','t') ON CONFLICT(ownerId) DO UPDATE SET status=excluded.status`).run({rid:2,owner:A});
      assert.equal(targeted.changes,1);
      assert.deepEqual(rows(db),[{rowid:1,ownerId:A,status:'targeted'},{rowid:2,ownerId:B,status:'connected'}]);
      // With no row of A to update, B's rowid is a conflict outside the target: SQLite aborts and B is unchanged.
      db.prepare('DELETE FROM calendarConnections WHERE ownerId=?').run(A);
      assert.throws(()=>query(`INSERT INTO calendarConnections(rowid,${COLUMNS}) VALUES(@rid,@owner,'google','targeted','t','t') ON CONFLICT(ownerId) DO UPDATE SET status=excluded.status`).run({rid:2,owner:A}),/UNIQUE constraint failed/);
      assert.deepEqual(rows(db),[{rowid:2,ownerId:B,status:'connected'}]);
    } finally { close(); }
  });
}
