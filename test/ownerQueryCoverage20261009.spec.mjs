import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {OWNER_QUERY_EXCEPTIONS} from '../server/src/ownerQueryExceptions.js';

const root=new URL('..',import.meta.url).pathname;
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  if(entry.name==='node_modules')return [];
  const path=join(directory,entry.name);
  if(entry.isDirectory())return files(path);
  return entry.isFile()&&/\.js$/.test(entry.name)?[path]:[];
});}
// Parse through balanced parentheses, strings, template literals and comments,
// so a multiline SQL statement counts as one prepare even if it has nested SQL.
function argument(source,start){
  let depth=1,quote=null,escaped=false,lineComment=false,blockComment=false,i=start;
  for(;i<source.length&&depth;i++){
    const c=source[i],next=source[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&next==='/'){blockComment=false;i++;}continue;}
    if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
    if(c==='/'&&next==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&next==='*'){blockComment=true;i++;continue;}
    if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
    if(c==='(')depth++;
    if(c===')')depth--;
  }
  if(depth)throw new Error('Unbalanced prepare call');
  return source.slice(start,i-1).trim();
}
function directPrepares(){
 const result=[],ordinals=new Map();
 for(const path of files(join(root,'server'))){
  const file=relative(root,path).replaceAll('\\','/'),source=readFileSync(path,'utf8');
  const pattern=/\b([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*prepare\s*\(/g;let match;
  while((match=pattern.exec(source))){
   const sql=argument(source,pattern.lastIndex),line=source.slice(0,match.index).split('\n').length;
   // These are application protocol methods, not SQLite connections.
   if((file==='server/src/voice/voiceToolRuntime.js'&&match[1]==='quoteApp')||
      (file==='server/src/voice/voiceToolRuntime.js'&&match[1]==='quoteEmails'))continue;
   if(sql==='sql'&&['server/src/db.js','server/src/billingUsagePolicy.js'].includes(file))continue;
   const signature=createHash('sha256').update(sql).digest('hex'),key=file+'\0'+signature,occurrence=(ordinals.get(key)||0)+1;
   ordinals.set(key,occurrence);result.push({file,line,signature,occurrence});
  }
 }
 return result;
}
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
 const all=directPrepares(),unlisted=all.filter(row=>!exceptions.has(row.file+'\0'+row.signature+'\0'+row.occurrence));
 assert.equal(unlisted.length,0,`${unlisted.length} direct prepares are not in the exact exception list:\n${unlisted.slice(0,20).map(row=>`${row.file}:${row.line}`).join('\n')}`);
 for(const row of OWNER_QUERY_EXCEPTIONS)assert.ok(all.some(call=>call.file===row.file&&call.signature===row.signature&&call.occurrence===row.occurrence),`Unused exception: ${row.file} ${row.function}`);
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
