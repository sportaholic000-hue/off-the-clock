import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {eraseTenantRows,eraseTenantPricebookFiles} from './billingTenantErasure.js';
import {verifyBackup,drainSnapshots} from './backups.js';
import {encryptBundle,decryptBundle,fileChecksum} from './offsiteArchive.js';
import {assertRealContainment} from './deploymentConfig.js';
import {withBackupRetentionLock} from './backupRetentionLock.js';
import {usageOwnerQuery} from './billingUsagePolicy.js';

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
  if(hasManifest&&!fs.existsSync(journal))verifyBackup(bundle);
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
function assertNoWorker(directory){
  const file=path.join(directory,'run.lock');if(!fs.existsSync(file))return;
  const saved=JSON.parse(fs.readFileSync(file,'utf8')),pid=typeof saved==='number'?saved:saved.pid;
  if(!Number.isInteger(pid)||pid<1)throw Error('OFFSITE_LOCK_INVALID');
  try{process.kill(pid,0);throw Error('OFFSITE_BUSY');}catch(error){if(error.code!=='ESRCH')throw error;}
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
    localBundles(deployment.backupPath,ownerId,at);
    localBundles(path.join(continuous,'snapshots'),ownerId,at);
    if(deployment.volume){assertRealContainment(deployment.volume,path.join(deployment.volume,'restores'));localBundles(path.join(deployment.volume,'restores'),ownerId,at);}
    const work=path.join(deployment.backupPath,'.retention',hash(ownerId));assertRealContainment(deployment.root,work);
    fs.mkdirSync(work,{recursive:true,mode:0o700});
    async function cleanArchive(source,record,directory){
      const bundle=path.join(directory,'bundle');await decryptBundle(source,bundle,config.key);
      if(!scrubBundle(bundle,ownerId,at))return null;
      const clean=path.join(directory,'clean.enc'),metadata=await encryptBundle(bundle,clean,config.key);
      return {...record,...metadata};
    }
    async function publish(directory,record){
      if(!validKey(record.key,config)||await fileChecksum(path.join(directory,'clean.enc'))!==record.sha256)throw Error('OFFSITE_RETENTION_JOURNAL_INVALID');
      const head=await store.head(record.key);
      if(head?.ContentLength!==record.bytes||head?.Metadata?.sha256!==record.sha256){
        await store.remove(record.key+'.json');await store.remove(record.key);
        await store.putFile(record.key,path.join(directory,'clean.enc'),record.sha256);
      }
      const check=path.join(directory,'check.enc');fs.rmSync(check,{force:true});
      await store.download(record.key,check,record.bytes);
      if(await fileChecksum(check)!==record.sha256)throw Error('OFFSITE_CHECKSUM_MISMATCH');
      const marker=await store.record(record.key+'.json');
      if(JSON.stringify(marker)!==JSON.stringify(record)){
        await store.remove(record.key+'.json');await store.putRecord(record.key+'.json',record);
      }
      fs.rmSync(directory,{recursive:true,force:true});
    }
    // Finish any durable clean replacement before discovering remote objects.
    for(const entry of fs.readdirSync(work,{withFileTypes:true}))if(entry.isDirectory()){
      const directory=path.join(work,entry.name),journal=path.join(directory,'replacement.json');
      if(fs.existsSync(journal)){
        if(!config.enabled||!store)throw Error('OFFSITE_RETENTION_CONFIG_REQUIRED');
        await publish(directory,JSON.parse(fs.readFileSync(journal,'utf8')));
      }else fs.rmSync(directory,{recursive:true,force:true});
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
          if(!clean)continue;
          fs.rmSync(encrypted);fs.rmSync(path.join(directory,'bundle'),{recursive:true,force:true});
          save(path.join(directory,'replacement.json'),clean);durable=true;
          await publish(directory,clean);
        }finally{if(!durable)fs.rmSync(directory,{recursive:true,force:true});}
      }
    }
    fs.rmSync(work,{recursive:true,force:true});
  });
}
