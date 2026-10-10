import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {migrateDatabase} from '../../server/src/migrations.js';
import {installTelephonyOperationsSchema} from '../../server/src/telephonyOperationsMigration.js';
import {createVoiceDurationRecovery} from '../../server/src/voiceDurationRecovery.js';
import {createAuthSessionService} from '../../server/src/authSessionService.js';
import {encryptCredentialPayload} from '../../server/src/credentialEncryption.js';

export const A='SYNTHETIC-erased-business',B='SYNTHETIC-kept-business';
export const END='2026-11-20T12:00:00.000Z',DEADLINE='2027-02-18T12:00:00.000Z',START='2026-10-20T12:00:00.000Z';
export const KEY='23'.repeat(32),hash=value=>createHash('sha256').update(value).digest('hex');
// Independent retention allowlist, deliberately not imported from production.
export const BILLING=new Set(['users','billingAccounts','billingAnnualTerms','billingCancellations','billingCheckoutRequests',
  'billingEventReceipts','billingInvoiceEvidence','billingLifecycleNotices','billingMinuteAlerts','billingOperationLeases',
  'billingRecoveryHolds','billingRetentionLeases','billingSubscriptionEvidence','billingSubscriptionHistory',
  'billingTrialMinuteAlerts','billingUsageCharges','billingUsagePeriods','events','outboxEvents','ownerEmailDeliveries']);
export function tableRows(db){return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
  .map(({name})=>[name,db.prepare(`SELECT * FROM "${name}"`).all()]));}
export function businessRows(db,ownerId){return Object.fromEntries(Object.entries(tableRows(db)).map(([table,rows])=>[table,rows.filter(row=>JSON.stringify(row).includes(ownerId))]));}
export function assertErased(assert,db){
  assert.deepEqual(db.prepare('PRAGMA table_info(users)').all().map(c=>c.name).sort(),
    ['id','ownerId','email','passwordHash','firstName','businessName','plan','planStatus','trialEndsAt','paymentFailedAt',
      'annualPaidThroughAt','paidThroughAt','serviceEndsAt','emailVerifiedAt','dataDeletedAt','timezone','role','createdAt'].sort());
  for(const [table,rows] of Object.entries(tableRows(db)))for(const row of rows){
    if(!JSON.stringify(row).includes(A))continue;
    assert.ok(BILLING.has(table),'Unexpected surviving tenant row: '+table);
    if(['events','outboxEvents'].includes(table))assert.match(row.eventType,/^billing\./);
    if(table==='ownerEmailDeliveries')assert.match(db.prepare('SELECT eventType FROM outboxEvents WHERE id=?').get(row.id).eventType,/^billing\./);
    if(table==='users'){assert.equal(row.id,A);assert.equal(row.ownerId,null);assert.equal(row.passwordHash,'!');assert.equal(row.firstName,'');assert.equal(row.businessName,'');assert.equal(row.timezone,'UTC');assert.equal(row.emailVerifiedAt,null);assert.ok(row.dataDeletedAt);assert.match(row.email,/^erased-[a-f0-9]{64}@account.invalid$/);}
  }
  assert.deepEqual(db.pragma('foreign_key_check'),[]);
}
export function retentionFixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-retention-')),db=new Database(path.join(root,'off-the-clock.sqlite'));
  t.after(()=>{if(db.open)db.close();fs.rmSync(root,{recursive:true,force:true});});
  db.pragma('foreign_keys=ON');migrateDatabase(db);installTelephonyOperationsSchema(db);
  createVoiceDurationRecovery({database:db,ownerQuery:sql=>db.prepare(sql),env:{}});
  db.exec('CREATE TABLE priceBookCreationRecords(ownerId TEXT PRIMARY KEY REFERENCES users(id),createdAt TEXT NOT NULL)');
  let time=Date.parse(DEADLINE)-1;const clock=()=>new Date(time),setTime=value=>{time=new Date(value).getTime();};
  const deployment={root,volume:root,backupPath:path.join(root,'backups'),pricebookPath:path.join(root,'pricebooks'),backupRetentionDays:30,production:true};
  fs.mkdirSync(deployment.pricebookPath);fs.mkdirSync(deployment.backupPath);
  const sessions=createAuthSessionService(db,{clock,environment:{JWT_SECRET:'[SYNTHETIC] retention secret'}}),credentials={};
  for(const ownerId of [A,B]){
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC-HASH','Private name','Private business','Operator','active','America/Halifax','owner',?)").run(ownerId,ownerId+'@example.invalid',START);
    for(const kind of ['active','pending']){
      const id=ownerId+'-staff-'+kind;
      db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt) VALUES(?,?,?,'SYNTHETIC-HASH','Staff name','Private business','Operator','active','staff',?)").run(id,ownerId,id+'@example.invalid',START);
      db.prepare('INSERT INTO staffInvitations(staffId,ownerId,email,status,createdAt) VALUES(?,?,?,?,?)').run(id,ownerId,id+'@example.invalid',kind,START);
      if(kind==='active')credentials[id]=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(id));
      db.prepare("INSERT INTO authTokens(tokenHash,userId,purpose,createdAt,expiresAt) VALUES(?,?,'staff_invite',?,?)").run(hash(id),id,START,DEADLINE);
    }
    credentials[ownerId]=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(ownerId));
    for(const purpose of ['verify_email','reset_password'])db.prepare('INSERT INTO authTokens(tokenHash,userId,purpose,createdAt,expiresAt) VALUES(?,?,?,?,?)').run(hash(ownerId+purpose),ownerId,purpose,START,DEADLINE);
  }
  // Populate every nonfinancial ownerId table discovered in the migrated schema,
  // with FK-valid parents and real CHECK constraints enabled. A newly added
  // tenant table therefore becomes coverage automatically, not a silent omission.
  function seed(table,ownerId){
    if(table==='users')return {id:ownerId};
    const existing=db.prepare(`SELECT * FROM "${table}" WHERE ownerId=?`).get(ownerId);if(existing)return existing;
    const sql=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table).sql;
    const columns=db.prepare(`PRAGMA table_info("${table}")`).all(),fks=db.prepare(`PRAGMA foreign_key_list("${table}")`).all(),row={ownerId};
    for(const col of columns){
      if(col.name==='ownerId'||(!col.pk&&!col.notnull)||col.dflt_value!==null)continue;
      const fk=fks.find(f=>f.from===col.name);
      const enumeration=sql.match(new RegExp('\\b'+col.name+'\\s+IN\\s*\\(\\s*([^,)]+)','i'));
      if(fk)row[col.name]=seed(fk.table,ownerId)[fk.to];
      else if(enumeration)row[col.name]=/^'/.test(enumeration[1])?enumeration[1].replace(/^'|'$/g,''):Number(enumeration[1]);
      else if(/INT|REAL/.test(col.type))row[col.name]=col.name==='expiresAt'?2000:1000;
      else if(col.name==='expiresAt')row[col.name]=DEADLINE;
      else if(/At$|AtUtc$/.test(col.name))row[col.name]=START;
      else if(/Json$/.test(col.name))row[col.name]=JSON.stringify({ownerId,synthetic:true});
      else if(/Hash$|Digest$/.test(col.name))row[col.name]=hash(table+ownerId+col.name);
      else row[col.name]=ownerId+'-'+table+'-'+col.name;
    }
    if(table==='voiceForwardingArrivals')row.forwardedFromPresent=1;
    if(table==='webhookEndpoints')Object.assign(row,{leadsEnabled:1,quotesEnabled:1,bookingsEnabled:1});
    if(table==='operatorCoverageOperations')Object.assign(row,{desiredEnabled:0,confirmedEnabled:0});
    if(table==='calendarOAuthStates')Object.assign(row,{createdAt:1000,expiresAt:2000});
    if(table==='calendarConnections')Object.assign(row,{provider:'google',status:'connected',...encryptCredentialPayload({refreshToken:'[SYNTHETIC] refresh '+ownerId,accessToken:'[SYNTHETIC] access '+ownerId},{key:KEY})});
    const names=Object.keys(row);db.prepare(`INSERT INTO "${table}"(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...Object.values(row));
    return db.prepare(`SELECT * FROM "${table}" WHERE ownerId=?`).get(ownerId);
  }
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  for(const table of tables)if(!BILLING.has(table)&&table!=='staffInvitations'&&db.prepare(`PRAGMA table_info("${table}")`).all().some(c=>c.name==='ownerId'))for(const owner of [A,B])seed(table,owner);
  for(const ownerId of [A,B]){
    seed('events',ownerId);seed('ownerEmailDeliveries',ownerId);
    const calls=db.prepare('SELECT id FROM calls WHERE ownerId=?').get(ownerId),sid='CA'+hash(ownerId).slice(0,32);
    db.prepare('UPDATE calls SET callSid=? WHERE ownerId=?').run(sid,ownerId);
    db.prepare('INSERT INTO voiceModelFailures(callKey,failedAt) VALUES(?,?)').run(hash(sid),1000);
    db.prepare("INSERT INTO voicePlatformAlerts(eventKey,code,detailsJson,createdAt,updatedAt) VALUES(?,?,?,?,?)").run('alert-'+ownerId,'SYNTHETIC',JSON.stringify({ownerId}),START,START);
    db.prepare("INSERT INTO voiceToolIdempotencyReceipts(scopeHash,idempotencyKey,requestDigest,status,leaseExpiresAtUtc,createdAt,updatedAt) VALUES(?,'legacy',?,'RUNNING',?,?,?)").run(hash(ownerId+'\0'+sid),hash(ownerId),START,START,START);
    fs.writeFileSync(path.join(deployment.pricebookPath,ownerId+'.json'),JSON.stringify({ownerId,synthetic:true}));
    db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,createdAt,updatedAt) VALUES(?,?,?,?)').run(ownerId,'cus_'+ownerId,START,START);
    const id='financial-'+ownerId;
    db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,createdAt,updatedAt) VALUES(?,?,'billing.receipt',?,'{}',?,?)").run(id,ownerId,id,START,START);
    db.prepare("INSERT INTO ownerEmailDeliveries(id,ownerId,messageJson,nextAttemptAt,createdAt,updatedAt) VALUES(?,?,'{}',?,?,?)").run(id,ownerId,START,START,START);
  }
  db.prepare("UPDATE users SET serviceEndsAt=?,paidThroughAt=?,planStatus='canceled' WHERE id=?").run(END,END,A);
  db.prepare("INSERT INTO billingCancellations(ownerId,stripeSubscriptionId,operationId,state,endAt,requestedAt,confirmedAt,updatedAt) VALUES(?,'sub_SYNTHETIC','op_SYNTHETIC','CONFIRMED',?,?,?,?)").run(A,END,START,START,START);
  return {db,root,deployment,clock,setTime,sessions,credentials};
}
