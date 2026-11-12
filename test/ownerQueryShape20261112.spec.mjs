import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {usageOwnerQuery} from '../server/src/billingUsagePolicy.js';

// Expected before execution: today's helpers accept any statement with an
// ownerId=? text, so all four shapes below pass and two of them return a row of
// business B to a caller bound to business A. With the structural check both
// helpers refuse all four; the eleven account-row reads and plain
// WHERE ownerId=? / WHERE a.ownerId = ? still pass.
const A='synthetic-owner-a',B='synthetic-owner-b';
const SHAPES=[
  ['WHERE id=? OR ownerId=?','SELECT id,ownerId FROM scratchShapeRows WHERE id=? OR ownerId=?',['b-1',A]],
  ['WHERE ownerId=? OR 1=1','SELECT id,ownerId FROM scratchShapeRows WHERE ownerId=? OR 1=1',[A]],
  ['WHERE NOT ownerId=?','SELECT id,ownerId FROM scratchShapeRows WHERE NOT ownerId=?',[A]],
  ['JOIN with the owner condition only on the joined table',
    'SELECT r.id,r.ownerId FROM scratchShapeRows r JOIN scratchShapeNotes n ON n.rowId=r.id WHERE n.ownerId=?',[A]],
];
const TABLES=['CREATE TABLE scratchShapeRows(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, name TEXT)',
  'CREATE TABLE scratchShapeNotes(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, rowId TEXT NOT NULL)',
  'CREATE TABLE scratchShapeCatalog(id TEXT PRIMARY KEY, label TEXT)'];
function seed(db, temp='') {
  for(const sql of TABLES)db.exec(sql.replace('CREATE TABLE','CREATE '+temp+'TABLE'));
  db.prepare("INSERT INTO scratchShapeRows(id,ownerId,name) VALUES('a-1',?,'A row'),('b-1',?,'B row')").run(A,B);
  // A note of business A that points at business B's row.
  db.prepare("INSERT INTO scratchShapeNotes(id,ownerId,rowId) VALUES('n-1',?,'b-1')").run(A);
  db.exec("INSERT INTO scratchShapeCatalog(id,label) VALUES('a-1','shared label')");
}
function scratch() { const db=new DatabaseSync(':memory:'); seed(db); return db; }
async function appDatabase() {
  const module=await import('../server/src/db.js');
  module.migrate();
  if(!module.db.prepare("SELECT 1 FROM sqlite_temp_master WHERE name='scratchShapeRows'").get())seed(module.db,'TEMP ');
  return module;
}

test('each shape reaches another business when run directly (why the check must refuse it)',()=>{
  const db=scratch();
  try {
    const rows=SHAPES.map(([,sql,params])=>db.prepare(sql).all(...params).map(row=>row.ownerId));
    assert.ok(rows[0].includes(B),'id=? OR ownerId=? returned business B');
    assert.ok(rows[1].includes(B),'ownerId=? OR 1=1 returned business B');
    assert.ok(rows[2].includes(B),'NOT ownerId=? returned business B');
    assert.ok(rows[3].includes(B),'joined-table-only owner condition returned business B');
  } finally { db.close(); }
});

for(const [name,sql] of SHAPES){
  test(`usageOwnerQuery refuses ${name}`,()=>{
    const db=scratch();
    try { assert.throws(()=>usageOwnerQuery(db)(sql),/owner binding/); } finally { db.close(); }
  });
  test(`ownerQuery refuses ${name}`,async()=>{
    const {ownerQuery}=await appDatabase();
    assert.throws(()=>ownerQuery(sql),/must filter by ownerId/);
  });
}

// The eleven account-row statements, read from their source files.
const ACCOUNT_FILES=['server/src/bookingAdminService.js','server/src/onboardingService.js','server/src/ownerCalendarService.js','server/src/ownerCallService.js','server/src/server.js'];
const ACCOUNT_ROW=/\(\s*(?:\w+\.)?ownerId\s*=\s*\?\s+OR\s+(?:\w+\.)?id\s*=\s*\?\s*\)/;
function accountRowStatements() {
  const found=[];
  for(const file of ACCOUNT_FILES){
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const visit=node=>{
      if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&ACCOUNT_ROW.test(node.text))found.push({file,sql:node.text});
      ts.forEachChild(node,visit);
    };
    visit(tree);
  }
  return found;
}

test('the eleven account-row statements pass both helpers',async()=>{
  const statements=accountRowStatements();
  assert.equal(statements.length,11,statements.map(row=>row.file).join('\n'));
  const {ownerQuery}=await appDatabase();
  const {CREATE_TABLE_STATEMENTS}=await import('../server/src/schema.js');
  const db=new DatabaseSync(':memory:');
  try {
    for(const sql of CREATE_TABLE_STATEMENTS)db.exec(sql);
    for(const {file,sql} of statements){
      assert.doesNotThrow(()=>usageOwnerQuery(db)(sql),file+': '+sql);
      assert.doesNotThrow(()=>ownerQuery(sql),file+': '+sql);
    }
    // Run one: it returns only the signed-in owner's own row.
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'!','A','A','Operator','active','UTC','owner','2026-11-12T00:00:00.000Z'),(?,?,'!','B','B','Operator','active','UTC','owner','2026-11-12T00:00:00.000Z')").run(A,'a@example.invalid',B,'b@example.invalid');
    const read=statements.find(row=>row.sql.startsWith("SELECT timezone FROM users WHERE id=? AND (ownerId=? OR id=?)"));
    assert.deepEqual(usageOwnerQuery(db)(read.sql).all(A,A,A).length,1);
    assert.deepEqual(usageOwnerQuery(db)(read.sql).all(B,A,A).length,0,'another owner ID with this owner binding reads nothing');
  } finally { db.close(); }
});

test('plain WHERE ownerId=? and WHERE a.ownerId = ? pass both helpers and return only that owner',async()=>{
  const db=scratch();
  try {
    assert.deepEqual(usageOwnerQuery(db)('SELECT id FROM scratchShapeRows WHERE ownerId=?').all(A).map(row=>row.id),['a-1']);
    assert.deepEqual(usageOwnerQuery(db)('SELECT a.id FROM scratchShapeRows a WHERE a.ownerId = ?').all(B).map(row=>row.id),['b-1']);
  } finally { db.close(); }
  const {ownerQuery}=await appDatabase();
  assert.deepEqual(ownerQuery('SELECT id FROM scratchShapeRows WHERE ownerId=?').all(A).map(row=>row.id),['a-1']);
  assert.deepEqual(ownerQuery('SELECT a.id FROM scratchShapeRows a WHERE a.ownerId = ?').all(B).map(row=>row.id),['b-1']);
});

test('a JOIN passes when its owner condition is on the main table, or the main table holds no owner data',async()=>{
  const db=scratch();
  try {
    const query=usageOwnerQuery(db);
    // Owner condition on the main table.
    assert.deepEqual(query('SELECT n.id FROM scratchShapeNotes n JOIN scratchShapeRows r ON r.id=n.rowId AND r.ownerId=n.ownerId WHERE n.ownerId=?').all(A),[]);
    // Main table without an ownerId column: every joined owner table must be limited.
    assert.deepEqual(query('SELECT c.label FROM scratchShapeCatalog c JOIN scratchShapeRows r ON r.id=c.id WHERE r.ownerId=?').all(A).map(row=>row.label),['shared label']);
    assert.deepEqual(query('SELECT c.label FROM scratchShapeCatalog c JOIN scratchShapeRows r ON r.id=c.id WHERE r.ownerId=?').all(B),[]);
    assert.ok(query('SELECT c.label FROM scratchShapeCatalog c JOIN scratchShapeRows r ON r.id=c.id JOIN scratchShapeNotes n ON n.ownerId=r.ownerId WHERE r.ownerId=?'));
    assert.throws(()=>query('SELECT c.label FROM scratchShapeCatalog c JOIN scratchShapeRows r ON r.id=c.id JOIN scratchShapeNotes n ON n.rowId=r.id WHERE r.ownerId=?'),/owner binding/,'a joined owner table that is not limited');
  } finally { db.close(); }
  const {ownerQuery}=await appDatabase();
  assert.ok(ownerQuery('SELECT c.label FROM scratchShapeCatalog c JOIN scratchShapeRows r ON r.id=c.id WHERE r.ownerId=?'));
});

test('how the check reads WHERE: top-level AND only; UNION parts, subqueries and SET are not owner filters',()=>{
  const db=scratch();
  try {
    const query=usageOwnerQuery(db);
    for(const sql of [
      'SELECT id FROM scratchShapeRows WHERE (ownerId=? AND id=?)',
      'SELECT id FROM scratchShapeRows WHERE name BETWEEN ? AND ? AND ownerId=?',
      'SELECT id FROM scratchShapeRows WHERE ownerId=? AND (name=? OR id=?)',
      "SELECT id FROM scratchShapeRows WHERE CASE WHEN name=? THEN 1 ELSE 0 END=1 AND ownerId=? ORDER BY id LIMIT 5",
      'SELECT id FROM scratchShapeRows WHERE ownerId=? UNION SELECT id FROM scratchShapeNotes WHERE ownerId=?',
      'WITH mine AS (SELECT * FROM scratchShapeRows WHERE ownerId=?) SELECT id FROM mine',
      'UPDATE scratchShapeRows SET name=? WHERE ownerId=? AND id=?',
      'DELETE FROM scratchShapeRows WHERE ownerId=? AND id=?',
    ])assert.doesNotThrow(()=>query(sql),sql);
    for(const sql of [
      'SELECT id FROM scratchShapeRows WHERE ownerId=? AND id=? OR name=?',
      'SELECT id FROM scratchShapeRows WHERE ownerId=? UNION SELECT id FROM scratchShapeNotes WHERE rowId=?',
      'SELECT id FROM scratchShapeRows WHERE id IN (SELECT rowId FROM scratchShapeNotes WHERE ownerId=?)',
      'SELECT s.id FROM (SELECT id, name AS ownerId FROM scratchShapeRows) s WHERE s.ownerId=?',
      'UPDATE scratchShapeRows SET ownerId=? WHERE id=?',
      'DELETE FROM scratchShapeRows WHERE ownerId=? OR id=?',
      'SELECT id FROM scratchShapeRows WHERE ownerId=? COLLATE NOCASE',
    ])assert.throws(()=>query(sql),/owner binding/,sql);
  } finally { db.close(); }
});
