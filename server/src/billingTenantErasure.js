import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {usageOwnerQuery,usageTransaction} from './billingUsagePolicy.js';
import {assertRealContainment} from './deploymentConfig.js';

// Child-first inventory. Financial evidence is deliberately not a prefix-based
// exception: billingVoiceUsage contains call identifiers and must be erased.
export const ERASED_TENANT_TABLES=Object.freeze([
  'ownerRecordEvents','ownerRecordWorkflows','ownerReportSettings','callerBlocklist',
  'quoteEmailDeliveries','quoteEmailRecipients','voiceQuoteNarrations','callbackRequests',
  'ownerAlertAttempts','ownerAlerts','voiceSmsAttempts','voiceSmsDeliveries',
  'appointmentChanges','appointments','bookingIdempotency','bookingPreferences',
  'bookingHolds','bookingIntents','bookingPolicies','bookingSettings',
  'quoteSubmissions','transcriptTurns','voiceOpaqueHandles','voiceToolReceipts',
  'voiceSessionNonces','voiceDurationRecovery','billingVoiceUsage','webhookDeliveries',
  'webhookEndpoints','voiceForwardingArrivals','leads','quoteRequests','quotes','calls','customers',
  'calendarOAuthStates','calendarConnections','widgetSettings','quoteAccessKeys',
  'priceBookDrafts','priceBookCreationRecords','phoneProvisioningOperations',
  'operatorCoverageOperations','businessProfiles','staffInvitations'
]);

export function eraseTenantRows(database,ownerId,at,{ownerQuery}={}){
  database.exec('PRAGMA secure_delete=ON');
  installTenantErasureGuards(database);
  const query=usageOwnerQuery(database,ownerQuery);
  const tables=new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  return usageTransaction(database,()=>{
    // Older idempotency receipts had no ownerId; remove their bound scopes too.
    for(const {callSid} of query('SELECT callSid FROM calls WHERE ownerId=? AND callSid IS NOT NULL').all(ownerId)){
      for(const prefix of ['', 'inbound\0'])query(`DELETE FROM voiceToolIdempotencyReceipts WHERE scopeHash=@scopeHash
        AND EXISTS(SELECT 1 FROM calls WHERE ownerId=@ownerId AND callSid=@callSid)`)
        .run({ownerId,callSid,scopeHash:createHash('sha256').update(`${prefix}${ownerId}\0${callSid}`).digest('hex')});
      query(`DELETE FROM voiceModelFailures WHERE callKey=@callKey
        AND EXISTS(SELECT 1 FROM calls WHERE ownerId=@ownerId AND callSid=@callSid)`)
        .run({ownerId,callSid,callKey:createHash('sha256').update(callSid).digest('hex')});
      query(`UPDATE voiceCircuitState SET probeCallSid=NULL,probeUntil=0 WHERE probeCallSid=@callSid
        AND EXISTS(SELECT 1 FROM calls WHERE ownerId=@ownerId AND callSid=@callSid)`).run({ownerId,callSid});
    }
    query('DELETE FROM voiceToolIdempotencyReceipts WHERE ownerId=?').run(ownerId);
    // Auth rows use userId, including pending office-staff accounts. Delete the
    // sessions before the users; refresh-token rows cascade from the session.
    query(`DELETE FROM authRefreshTokens WHERE sessionId IN(SELECT id FROM authSessions WHERE userId IN
      (SELECT id FROM users WHERE (id=@ownerId AND role='owner') OR (ownerId=@ownerId AND role='staff')))`).run({ownerId});
    for(const table of ['authSessions','authTokens'])query(`DELETE FROM ${table} WHERE userId IN
      (SELECT id FROM users WHERE (id=@ownerId AND role='owner') OR (ownerId=@ownerId AND role='staff'))`).run({ownerId});
    for(const table of ERASED_TENANT_TABLES)if(tables.has(table))query(`DELETE FROM ${table} WHERE ownerId=?`).run(ownerId);
    query("DELETE FROM users WHERE ownerId=? AND role='staff'").run(ownerId);
    query("DELETE FROM voicePlatformAlerts WHERE json_valid(detailsJson) AND json_extract(detailsJson,'$.ownerId')=?").run(ownerId);
    query(`DELETE FROM ownerEmailDeliveries WHERE ownerId=? AND id NOT IN
      (SELECT id FROM outboxEvents WHERE ownerId=? AND eventType LIKE 'billing.%')`).run(ownerId,ownerId);
    for(const table of ['outboxEvents','events'])query(`DELETE FROM ${table} WHERE ownerId=? AND eventType NOT LIKE 'billing.%'`).run(ownerId);
    // Retain the immutable billing foreign key and financial state only. The
    // synthetic unique email frees the former address for a fresh signup; '!' is
    // not a password hash. Explicit auth guards also reject this tombstone.
    query(`UPDATE users SET email=@email,passwordHash='!',firstName='',businessName='',
      timezone='UTC',emailVerifiedAt=NULL,dataDeletedAt=COALESCE(dataDeletedAt,@at),planStatus='canceled'
      WHERE id=@ownerId AND role='owner'`).run({ownerId,at,email:'erased-'+createHash('sha256').update(ownerId).digest('hex')+'@account.invalid'});
  });
}

// A provider response or an already-authenticated request may finish after the
// erasure transaction. Reject those late writes at the storage boundary.
export function installTenantErasureGuards(database){
  const tables=new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
  for(const table of [...ERASED_TENANT_TABLES,'voiceToolIdempotencyReceipts','users'])if(tables.has(table)){
    for(const operation of ['INSERT','UPDATE'])database.exec(`CREATE TRIGGER IF NOT EXISTS retention_${table}_${operation}
      BEFORE ${operation} ON ${table} WHEN EXISTS(SELECT 1 FROM users WHERE id=NEW.ownerId AND dataDeletedAt IS NOT NULL)
      BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASED'); END`);
  }
  for(const table of ['events','outboxEvents'])for(const operation of ['INSERT','UPDATE'])database.exec(`CREATE TRIGGER IF NOT EXISTS retention_${table}_${operation}
    BEFORE ${operation} ON ${table} WHEN NEW.eventType NOT LIKE 'billing.%'
    AND EXISTS(SELECT 1 FROM users WHERE id=NEW.ownerId AND dataDeletedAt IS NOT NULL)
    BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASED'); END`);
  if(tables.has('voicePlatformAlerts'))for(const operation of ['INSERT','UPDATE'])database.exec(`CREATE TRIGGER IF NOT EXISTS retention_voicePlatformAlerts_${operation}
    BEFORE ${operation} ON voicePlatformAlerts WHEN json_valid(NEW.detailsJson)
    AND EXISTS(SELECT 1 FROM users WHERE id=json_extract(NEW.detailsJson,'$.ownerId') AND dataDeletedAt IS NOT NULL)
    BEGIN SELECT RAISE(ABORT,'ACCOUNT_ERASED'); END`);
}

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function retentionPricebookDirectory(env=process.env){
  return path.resolve(projectRoot,env.PRICEBOOK_PATH||'data/pricebooks');
}

export function eraseTenantPricebookFiles(ownerId,{directory=retentionPricebookDirectory()}={}){
  if(typeof ownerId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(ownerId))throw Error('RETENTION_OWNER_ID_INVALID');
  const root=path.resolve(directory),locks=root+'.saves',digest=createHash('sha256').update(ownerId).digest('hex');
  if(!fs.existsSync(root)&&!fs.existsSync(locks))return;
  assertRealContainment(path.dirname(root),root);assertRealContainment(path.dirname(locks),locks);
  const mutexFile=path.join(locks,digest+'.sqlite');let mutex;
  // Use the same OS lock as price-book saving; never unlink a live save lock.
  if(fs.existsSync(mutexFile)){
    assertRealContainment(locks,mutexFile);
    mutex=new Database(mutexFile,{timeout:2000,fileMustExist:true});
    try{mutex.exec('BEGIN IMMEDIATE');}catch(error){mutex.close();throw error;}
  }
  try{
    if(fs.existsSync(root))for(const name of fs.readdirSync(root)){
      const owned=name===ownerId+'.json'||name===ownerId+'.unconfirmed'||
        (name.startsWith(ownerId+'.')&&/^[a-f0-9-]{36}\.tmp$/.test(name.slice(ownerId.length+1)));
      if(!owned)continue;
      const file=path.join(root,name),entry=fs.lstatSync(file);
      if(!entry.isFile()&&!entry.isSymbolicLink())throw Error('RETENTION_PRICEBOOK_FILE_INVALID');
      fs.unlinkSync(file); // unlink an owned symlink, never its target
    }
  }finally{if(mutex){try{mutex.exec('ROLLBACK');}finally{mutex.close();}}}
  for(const suffix of ['','-journal','-wal','-shm']){
    const file=mutexFile+suffix;
    try{const entry=fs.lstatSync(file);if(!entry.isFile()&&!entry.isSymbolicLink())throw Error('RETENTION_LOCK_FILE_INVALID');fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  for(const dir of [root,locks])if(fs.existsSync(dir)){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
}
