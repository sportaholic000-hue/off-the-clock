import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {eraseTenantRows,eraseTenantPricebookFiles} from './billingTenantErasure.js';
import {verifyBackup,drainSnapshots,cleanupAbandonedSnapshots} from './backups.js';
import {encryptBundle,decryptBundle,fileChecksum} from './offsiteArchive.js';
import {assertRealContainment} from './deploymentConfig.js';
import {withBackupRetentionLock,removeStaleProcessLock} from './backupRetentionLock.js';
import {usageOwnerQuery} from './billingUsagePolicy.js';
import {requireOffsiteErasureInventory,rememberBackupErasure} from './offsiteHistory.js';
import {eraseOldObjectVersions} from './offsiteVersionErasure.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
function save(file,value){
  const temp=file+'.'+randomUUID();
  fs.writeFileSync(temp,JSON.stringify(value),{flag:'wx',mode:0o600,flush:true});fs.renameSync(temp,file);
  const fd=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function scrubBundle(bundle,ownerId,at){
  const manifestFile=path.join(bundle,'manifest.json'),hasManifest=fs.existsSync(manifestFile),journal=path.join(bundle,'.erasure-in-progress');
  // An interrupted rewrite has its original manifest plus this durable marker.
  // Otherwise validate the source before modifying any recovery material.
  if(hasManifest&&!fs.existsSync(journal)){
    const verified=verifyBackup(bundle);
    if(verified.tenantErasureVersion===2&&verified.erasedOwners?.includes(ownerId)&&!fs.existsSync(path.join(bundle,'pricebooks',ownerId+'.json')))return false;
  }
  const file=path.join(bundle,'off-the-clock.sqlite');assertRealContainment(bundle,file);
  const db=new Database(file,{fileMustExist:true});let changed=false;
  try{
    const columns=db.prepare('PRAGMA table_info(users)').all();
    if(!columns.length)return false;
    if(!columns.some(c=>c.name==='dataDeletedAt'))db.exec('ALTER TABLE users ADD COLUMN dataDeletedAt TEXT');
    const owner=usageOwnerQuery(db)("SELECT dataDeletedAt FROM users WHERE id=@ownerId AND role='owner'").get({ownerId});
    if(!owner)return false;
    // A snapshot can capture the account tombstone before a failed price-book
    // deletion completes. That marker never proves the bundle's files are gone;
    // reapply the idempotent row/file cleanup whenever the billing owner exists.
    changed=true;
    fs.writeFileSync(journal,'pending',{mode:0o600,flush:true});
    eraseTenantRows(db,ownerId,at);
    // Do not leave deleted values in freelist pages or a retained WAL.
    db.pragma('wal_checkpoint(TRUNCATE)');db.pragma('journal_mode=DELETE');db.exec('VACUUM');
    eraseTenantPricebookFiles(ownerId,{directory:path.join(bundle,'pricebooks')});
    if(db.pragma('foreign_key_check').length)throw Error('BACKUP_DATABASE_INVALID');
  }finally{db.close();}
  if(hasManifest&&changed){
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    manifest.tenantErasureVersion=2;manifest.erasedOwners=[...new Set([...(manifest.erasedOwners||[]),ownerId])].sort();
    manifest.files=manifest.files.filter(entry=>entry.name!=='pricebooks/'+ownerId+'.json').map(entry=>{
      if(!(entry.name==='off-the-clock.sqlite'||/^pricebooks\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.json$/.test(entry.name)))throw Error('BACKUP_MANIFEST_INVALID');
      assertRealContainment(bundle,path.join(bundle,entry.name));
      const bytes=fs.readFileSync(path.join(bundle,entry.name));return {name:entry.name,bytes:bytes.length,sha256:hash(bytes)};
    });
    save(manifestFile,manifest);verifyBackup(bundle);
  }
  if(changed)fs.rmSync(journal,{force:true});return changed;
}
function localBundles(root,ownerId,at){
  if(!fs.existsSync(root))return;
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw Error('BACKUP_UNSAFE_DIRECTORY');
    if(!entry.isDirectory())continue;
    const directory=path.join(root,entry.name);
    if(fs.existsSync(path.join(directory,'off-the-clock.sqlite')))scrubBundle(directory,ownerId,at);
  }
}
function removeAbandonedCopies(root,pattern){
  if(!fs.existsSync(root))return;
  for(const entry of fs.readdirSync(root,{withFileTypes:true}))if(pattern.test(entry.name)){
    const file=path.join(root,entry.name);assertRealContainment(root,file);
    if(entry.isSymbolicLink())throw Error('BACKUP_UNSAFE_DIRECTORY');
    fs.rmSync(file,{recursive:entry.isDirectory(),force:true});
  }
}
function assertNoWorker(directory){
  removeStaleProcessLock(path.join(directory,'run.lock'));
}
const validKey=(key,config)=>key.startsWith(config.prefix+'/')&&/^(?:daily\/\d{4}-\d{2}-\d{2}|continuous\/\d{13}-[a-f0-9-]{36})\.enc$/.test(key.slice(config.prefix.length+1));

// Whole-business backups are shared: redact a tenant inside each snapshot,
// preserving all other tenants' rows/files and all financial evidence. A clean
// replacement is fsynced locally before removing a remote object. Its journal
// survives crashes, failed deletes/uploads, and lost responses.
export async function eraseTenantBackupCopies(ownerId,deployment,{config={enabled:false},store,drain=async()=>{},at=new Date().toISOString()}={}){
  if(!deployment.backupPath)return;
  assertRealContainment(deployment.root,deployment.backupPath);
  return withBackupRetentionLock(deployment,async()=>{
    await drain();await drainSnapshots();
    const daily=path.join(deployment.backupPath,'.offsite'),continuous=path.join(deployment.backupPath,'.offsite-continuous');
    for(const directory of [daily,continuous,path.join(continuous,'snapshots')])assertRealContainment(deployment.root,directory);
    assertNoWorker(daily);assertNoWorker(continuous);
    // Workers are drained and restores share this lock. These are unpublished,
    // redundant staging copies left by a crash, not recovery points. Removing
    // them does not remove another business from any verified backup.
    for(const directory of [daily,continuous])removeAbandonedCopies(directory,/^verify-[a-f0-9-]{36}$/);
    await cleanupAbandonedSnapshots(deployment);
    if(deployment.volume){
      const restores=path.join(deployment.volume,'restores');assertRealContainment(deployment.volume,restores);
      removeAbandonedCopies(restores,/^\.(?:(?:offsite|continuous)-[A-Za-z0-9]{6}|restore-[a-f0-9-]{36})$/);
    }
    // Serialized with publication. An intent is monotonic even when its first
    // attempt fails: every later replacement must honor every recorded owner.
    const owners=rememberBackupErasure(deployment,ownerId,at);
    for(const owner of owners){
      localBundles(deployment.backupPath,owner.ownerId,owner.at);
      localBundles(path.join(continuous,'snapshots'),owner.ownerId,owner.at);
      if(deployment.volume){assertRealContainment(deployment.volume,path.join(deployment.volume,'restores'));localBundles(path.join(deployment.volume,'restores'),owner.ownerId,owner.at);}
    }
    const work=path.join(deployment.backupPath,'.retention',hash(ownerId));assertRealContainment(deployment.root,work);
    fs.mkdirSync(work,{recursive:true,mode:0o700});
    // Local plaintext copies have already been erased. Missing settings cannot
    // turn a historical or ambiguous upload into proof of no remote copies.
    requireOffsiteErasureInventory(deployment,config,store);
    let versioned=false;
    if(config.enabled){
      if(typeof store?.versioning!=='function')throw Error('OFFSITE_VERSIONING_UNAVAILABLE');
      const state=await store.versioning();
      if(!['ENABLED','SUSPENDED','UNSUPPORTED','NEVER_ENABLED'].includes(state))throw Error('OFFSITE_VERSIONING_UNAVAILABLE');
      versioned=['ENABLED','SUSPENDED'].includes(state);
    }
    async function cleanArchive(source,record,directory){
      const bundle=path.join(directory,'bundle');await decryptBundle(source,bundle,config.key);
      let changed=false;
      for(const owner of owners)changed=scrubBundle(bundle,owner.ownerId,owner.at)||changed;
      if(!changed)return null;
      const clean=path.join(directory,'clean.enc'),metadata=await encryptBundle(bundle,clean,config.key);
      return {...record,...metadata};
    }
    function journalArchive(directory,journal){
      const name=journal.archive||'clean.enc';
      if(!/^(?:clean|replacement-[a-f0-9]{64})\.enc$/.test(name))throw Error('OFFSITE_RETENTION_JOURNAL_INVALID');
      const file=path.join(directory,name);assertRealContainment(deployment.root,file);return file;
    }
    function saveReplacement(directory,record,source){
      const archive='replacement-'+record.sha256+'.enc',target=path.join(directory,archive);
      fs.renameSync(source,target);
      const journal={version:2,record,archive};save(path.join(directory,'replacement.json'),journal);
      // The new pair is durable before deleting its predecessor. A crash sees
      // either journal and a matching immutable archive, never mismatched bytes.
      for(const name of fs.readdirSync(directory))if(name!==archive&&/^(?:clean|replacement-[a-f0-9]{64})\.enc$/.test(name))fs.rmSync(path.join(directory,name));
      return journal;
    }
    async function publish(directory,journal){
      const record=journal.record||journal,archive=journalArchive(directory,journal);
      if(!validKey(record.key,config)||await fileChecksum(archive)!==record.sha256)throw Error('OFFSITE_RETENTION_JOURNAL_INVALID');
      const head=await store.head(record.key);
      if(head?.ContentLength!==record.bytes||head?.Metadata?.sha256!==record.sha256){
        await store.remove(record.key+'.json');await store.remove(record.key);
        await store.putFile(record.key,archive,record.sha256);
      }
      const check=path.join(directory,'check.enc');fs.rmSync(check,{force:true});
      await store.download(record.key,check,record.bytes);
      if(await fileChecksum(check)!==record.sha256)throw Error('OFFSITE_CHECKSUM_MISMATCH');
      const marker=await store.record(record.key+'.json');
      if(JSON.stringify(marker)!==JSON.stringify(record)){
        await store.remove(record.key+'.json');await store.putRecord(record.key+'.json',record);
      }
      if(versioned)for(const key of [record.key,record.key+'.json'])await eraseOldObjectVersions(store,key);
      fs.rmSync(directory,{recursive:true,force:true});
    }
    async function rebase(directory,journal){
      const record=journal.record||journal,archive=journalArchive(directory,journal);
      if(!validKey(record.key,config)||record.keyId!==hash(config.key)||await fileChecksum(archive)!==record.sha256)throw Error('OFFSITE_RETENTION_JOURNAL_INVALID');
      const stage=fs.mkdtempSync(path.join(directory,'rebase-'));
      try{
        const current=await store.head(record.key),source=path.join(stage,'source.enc');
        let base=record;
        if(current){
          base={...record,bytes:current.ContentLength,sha256:current.Metadata?.sha256};
          await store.download(record.key,source,base.bytes);
          if(await fileChecksum(source)!==base.sha256)throw Error('OFFSITE_CHECKSUM_MISMATCH');
        }else fs.copyFileSync(archive,source);
        // Rebuild from the CURRENT object. If a failed delete/upload removed it,
        // the durable recovery copy is usable only after ALL erasures are applied.
        const clean=await cleanArchive(source,base,stage);
        return saveReplacement(directory,clean||base,clean?path.join(stage,'clean.enc'):source);
      }finally{fs.rmSync(stage,{recursive:true,force:true});}
    }
    // Another owner's completion must also clean any old local retry copies;
    // otherwise those copies could reintroduce that owner's data on a replay.
    const retentionRoot=path.dirname(work);
    for(const tenant of fs.readdirSync(retentionRoot,{withFileTypes:true}))if(tenant.isDirectory()&&/^[a-f0-9]{64}$/.test(tenant.name)){
      const tenantWork=path.join(retentionRoot,tenant.name);assertRealContainment(deployment.root,tenantWork);
      for(const entry of fs.readdirSync(tenantWork,{withFileTypes:true}))if(entry.isDirectory()){
        const directory=path.join(tenantWork,entry.name),journal=path.join(directory,'replacement.json');assertRealContainment(deployment.root,directory);
        if(fs.existsSync(journal)){
          if(!config.enabled||!store)throw Error('OFFSITE_RETENTION_CONFIG_REQUIRED');
          await publish(directory,await rebase(directory,JSON.parse(fs.readFileSync(journal,'utf8'))));
        }else fs.rmSync(directory,{recursive:true,force:true});
      }
    }
    // Unpublished retries must be redacted too; preserve their original key and
    // source token while updating checksums in the persistent worker state.
    for(const directory of [daily,continuous]){
      const pending=path.join(directory,'pending.enc'),stateFile=path.join(directory,'state.json');
      if(!fs.existsSync(pending))continue;
      if(!config.enabled)throw Error('OFFSITE_RETENTION_CONFIG_REQUIRED');
      const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
      if(!state.pending||!validKey(state.pending.key,config))throw Error('OFFSITE_LOCAL_STATE_INVALID');
      const stage=fs.mkdtempSync(path.join(work,'pending-'));
      try{
        const clean=await cleanArchive(pending,state.pending,stage);
        if(clean)fs.renameSync(path.join(stage,'clean.enc'),pending);
        state.pending={...state.pending,sha256:await fileChecksum(pending),bytes:fs.statSync(pending).size};save(stateFile,state);
      }finally{fs.rmSync(stage,{recursive:true,force:true});}
    }
    if(config.enabled){
      const keys=[...await store.list(config.prefix+'/daily/'),...await store.list(config.prefix+'/continuous/')];
      for(const key of keys.filter(key=>validKey(key,config))){
        const directory=path.join(work,hash(key));fs.mkdirSync(directory,{mode:0o700});
        let durable=false;
        try{
          const record=await store.record(key+'.json'),head=await store.head(key);
          if(!head)continue;
          // Orphan uploads are uncommitted retries, but still contain tenant
          // data. Redact them using the matching persistent pending record.
          let sourceRecord=record;
          if(!sourceRecord)for(const local of [daily,continuous]){
            const stateFile=path.join(local,'state.json');if(fs.existsSync(stateFile)){
              const pending=JSON.parse(fs.readFileSync(stateFile,'utf8')).pending;if(pending?.key===key)sourceRecord={...pending,bytes:head.ContentLength,sha256:head.Metadata?.sha256};
            }
          }
          if(!sourceRecord){
            const id=key.split('/').at(-1).slice(0,-4);
            sourceRecord={version:1,key,keyId:hash(config.key),bytes:head.ContentLength,sha256:head.Metadata?.sha256,
              ...(key.includes('/daily/')?{day:id}:{checkpointId:id,capturedAtMs:Number(id.slice(0,13)),sourceToken:hash('retention-recovered:'+key)})};
          }
          if(sourceRecord.key!==key||sourceRecord.keyId!==hash(config.key))throw Error('OFFSITE_RECORD_INVALID');
          const encrypted=path.join(directory,'source.enc');await store.download(key,encrypted,sourceRecord.bytes);
          if(await fileChecksum(encrypted)!==sourceRecord.sha256)throw Error('OFFSITE_CHECKSUM_MISMATCH');
          const clean=await cleanArchive(encrypted,sourceRecord,directory);
          if(!clean&&record)continue;
          const journal=saveReplacement(directory,clean||sourceRecord,clean?path.join(directory,'clean.enc'):encrypted);durable=true;
          fs.rmSync(encrypted,{force:true});fs.rmSync(path.join(directory,'bundle'),{recursive:true,force:true});
          await publish(directory,journal);
        }finally{if(!durable)fs.rmSync(directory,{recursive:true,force:true});}
      }
      // ListObjectVersions also finds pruned objects hidden by delete markers;
      // current-object LIST alone cannot prove that every copy was erased.
      if(versioned){
        const history=[...await store.listVersions(config.prefix+'/daily/'),...await store.listVersions(config.prefix+'/continuous/')];
        const affected=[...new Set(history.map(v=>v.key))].filter(key=>validKey(key,config)||key.endsWith('.json')&&validKey(key.slice(0,-5),config));
        for(const key of affected)await eraseOldObjectVersions(store,key);
      }
    }
    fs.rmSync(work,{recursive:true,force:true});
  });
}
