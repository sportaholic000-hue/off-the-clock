import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createSnapshot,restoreBackup} from './backups.js';
import {assertRealContainment} from './deploymentConfig.js';
import {encryptBundle,decryptBundle,fileChecksum,MAX_ARCHIVE_BYTES} from './offsiteArchive.js';
import {readOffsiteConfig,createS3BackupStore,isConflict} from './offsiteStore.js';

const dayAt=now=>new Date(now).toISOString().slice(0,10);
const dayValid=day=>typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && dayAt(Date.parse(day))===day;
const objectKey=(config,day)=>config.prefix+'/daily/'+day+'.enc';
const recordKey=(config,day)=>objectKey(config,day)+'.json';
const digest=text=>createHash('sha256').update(text).digest('hex');
function validateRecord(record,config,day) {
  if(!record || record.version!==1 || !dayValid(day) || record.day!==day || record.key!==objectKey(config,day) || !/^[a-f0-9]{64}$/.test(record.sha256) || !Number.isSafeInteger(record.bytes) || record.bytes<40 || record.bytes>MAX_ARCHIVE_BYTES || !/^[a-f0-9]{64}$/.test(record.keyId))throw Error('OFFSITE_RECORD_INVALID');
  return record;
}
async function checkedDownload(store,record,file) {
  await store.download(record.key,file,record.bytes);
  if(await fileChecksum(file)!==record.sha256)throw Error('OFFSITE_CHECKSUM_MISMATCH');
}
export async function pruneOffsiteBackups(store,config) {
  const prefix=config.prefix+'/daily/', candidates=[], keys=await store.list(prefix);
  for(const key of keys) {
    const day=key.slice(prefix.length,-9);
    if(key!==recordKey(config,day) || !dayValid(day))continue;
    const record=validateRecord(await store.record(key),config,day);
    const head=await store.head(record.key);
    if(head?.ContentLength===record.bytes && head.Metadata?.sha256===record.sha256)candidates.push(record);
  }
  candidates.sort((a,b)=>b.day.localeCompare(a.day));
  if(candidates.length>=30) {
    const cutoff=candidates[29].day;
    // Delete the data first. If deleting its marker fails, a later prune still
    // discovers the marker and finishes cleanup. Old uncommitted uploads are
    // also safe to remove once thirty newer complete backups exist.
    const expired=new Set();
    for(const key of keys) {
      const suffix=key.endsWith('.enc.json')?9:key.endsWith('.enc')?4:0;
      if(!suffix)continue;
      const day=key.slice(prefix.length,-suffix);
      if(dayValid(day) && day<cutoff && (key===objectKey(config,day)||key===recordKey(config,day)))expired.add(day);
    }
    for(const day of expired) {await store.remove(objectKey(config,day));await store.remove(recordKey(config,day));}
  }
  return Math.min(candidates.length,30);
}
export async function restoreOffsiteBackup({store,config,day,target,volume}) {
  if(!config.enabled || !dayValid(day))throw Error('OFFSITE_RESTORE_CONFIG_INVALID');
  assertRealContainment(volume,path.join(volume,'restores'));
  const parent=path.join(volume,'restores');fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const stage=fs.mkdtempSync(path.join(parent,'.offsite-'));fs.chmodSync(stage,0o700);
  try {
    const record=validateRecord(await store.record(recordKey(config,day)),config,day);
    const file=path.join(stage,'encrypted');await checkedDownload(store,record,file);
    const bundle=path.join(stage,'bundle');await decryptBundle(file,bundle,config.key);
    return restoreBackup(bundle,target,{volume});
  } finally {fs.rmSync(stage,{recursive:true,force:true});}
}
export function createOffsiteBackupService(database,deployment,{env=process.env,config=readOffsiteConfig(env),store=config.enabled?createS3BackupStore(config):null,now=Date.now,
  takeSnapshot=()=>createSnapshot(database,deployment),warn=message=>console.warn(message),retryMs=60000,pollMs=60000}={}) {
  if(!config.enabled) {
    if(deployment.production)warn('[offsite-backup] WARNING: off-site backups are NOT configured; losing the volume loses business data. '+config.reason+(config.missing?.length?' Missing: '+config.missing.join(', '):''));
    return {run:async()=>{throw Error(config.reason);},start:()=>{},stop:async()=>{},status:()=>({ok:false,configured:false,state:'NOT_CONFIGURED',error:config.reason,missing:config.missing||[]})};
  }
  const directory=path.join(deployment.backupPath,'.offsite');assertRealContainment(deployment.root,directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const stateFile=path.join(directory,'state.json'),file=path.join(directory,'pending.enc'),lockFile=path.join(directory,'run.lock');
  for(const name of [stateFile,file,lockFile]){assertRealContainment(deployment.root,name);if(fs.existsSync(name) && (!fs.lstatSync(name).isFile() || fs.lstatSync(name).isSymbolicLink()))throw Error('OFFSITE_LOCAL_STATE_UNSAFE');}
  const destinationId=digest(JSON.stringify([config.endpoint,config.bucket,config.prefix,digest(config.key)]));
  let state={version:1,destinationId,phase:'WAITING',failures:0},active,timer,stopped=false,stateInvalid=false;
  if(fs.existsSync(stateFile)) {
    try {
      state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
      if(state.version!==1 || state.destinationId!==destinationId || !Number.isSafeInteger(state.failures) || state.failures<0 || !['WAITING','UPLOADING','FAILED','SUCCEEDED'].includes(state.phase))throw Error();
      for(const field of ['lastSuccessAt','lastAttemptAt','nextRetryAt'])if(state[field]!=null && (!Number.isSafeInteger(state[field]) || state[field]<0))throw Error();
      if(state.lastBackupDay && !dayValid(state.lastBackupDay))throw Error();
      if(state.pending)validateRecord(state.pending,config,state.pending.day);
      if(state.phase==='UPLOADING'){state.phase='FAILED';state.error='OFFSITE_INTERRUPTED';state.nextRetryAt=0;}
    }
    catch {stateInvalid=true;state={version:1,destinationId,phase:'FAILED',error:'OFFSITE_LOCAL_STATE_INVALID',failures:1};warn('[offsite-backup] OFFSITE_LOCAL_STATE_INVALID; preserve the pending artifact and correct configuration/state before retrying.');}
  }
  const save=()=>{
    const temp=stateFile+'.'+randomUUID();
    try {fs.writeFileSync(temp,JSON.stringify(state),{flag:'wx',mode:0o600,flush:true});fs.renameSync(temp,stateFile);const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
    finally {fs.rmSync(temp,{force:true});}
  };
  const status=()=>({ok:state.phase!=='FAILED' && Boolean(state.lastSuccessAt) && now()-state.lastSuccessAt<26*3600000,configured:true,state:state.phase,
    lastSuccessAt:state.lastSuccessAt?new Date(state.lastSuccessAt).toISOString():null,lastBackupDay:state.lastBackupDay||null,lastAttemptAt:state.lastAttemptAt?new Date(state.lastAttemptAt).toISOString():null,
    nextRetryAt:state.nextRetryAt?new Date(state.nextRetryAt).toISOString():null,consecutiveFailures:state.failures,error:state.error||null,pendingDay:state.pending?.day||null});
  async function perform() {
    if(stateInvalid)throw Error('OFFSITE_LOCAL_STATE_INVALID');
    // One writer per persistent volume; a live process's lock is never stolen.
    if(fs.existsSync(lockFile)) {
      const pid=Number(fs.readFileSync(lockFile,'utf8'));if(!Number.isInteger(pid)||pid<1)throw Error('OFFSITE_LOCK_INVALID');
      try {process.kill(pid,0);throw Error('OFFSITE_BUSY');}catch(error){if(error.code!=='ESRCH')throw error;}
      fs.unlinkSync(lockFile);
    }
    fs.writeFileSync(lockFile,String(process.pid),{flag:'wx',mode:0o600,flush:true});
    try {
      state.lastAttemptAt=now();state.phase='UPLOADING';state.error=null;save();
      const day=state.pending?.day||dayAt(now());
      const existing=await store.record(recordKey(config,day));
      let record;
      if(existing) {
        record=validateRecord(existing,config,day);
        if(record.keyId!==digest(config.key))throw Error('OFFSITE_KEY_CHANGED');
      } else {
        if(!state.pending) {
          fs.rmSync(file,{force:true});
          const bundle=await takeSnapshot(),sealed=await encryptBundle(bundle,file,config.key);
          state.pending={version:1,day,key:objectKey(config,day),keyId:digest(config.key),...sealed};save();
        }
        record=validateRecord(state.pending,config,day);
        if(await fileChecksum(file)!==record.sha256)throw Error('OFFSITE_LOCAL_CHECKSUM_MISMATCH');
        try {await store.putFile(record.key,file,record.sha256);}catch(error){if(!isConflict(error))throw error;}
      }
      const check=path.join(directory,'verify-'+randomUUID());
      try {await checkedDownload(store,record,check);}finally {fs.rmSync(check,{force:true});}
      if(!existing) {
        try {await store.putRecord(recordKey(config,day),record);}catch(error){if(!isConflict(error))throw error;}
        const published=validateRecord(await store.record(recordKey(config,day)),config,day);
        if(published.sha256!==record.sha256 || published.bytes!==record.bytes || published.keyId!==record.keyId)throw Error('OFFSITE_RECORD_CONFLICT');
      }
      await pruneOffsiteBackups(store,config);
      state.lastSuccessAt=now();state.lastBackupDay=day;state.pending=null;state.phase='SUCCEEDED';state.error=null;state.failures=0;state.nextRetryAt=null;save();fs.rmSync(file,{force:true});
      return status();
    } finally {fs.rmSync(lockFile,{force:true});}
  }
  function run() {
    if(active)return active;
    if(stopped)return Promise.reject(Error('OFFSITE_STOPPED'));
    if(stateInvalid)return Promise.reject(Error('OFFSITE_LOCAL_STATE_INVALID'));
    if(state.lastBackupDay===dayAt(now()) && !state.pending && state.phase==='SUCCEEDED')return Promise.resolve(status());
    active=perform().catch(error=>{
      state.phase='FAILED';state.failures=Math.min(state.failures+1,1000000);state.error=/^(?:OFFSITE_|BACKUP_)[A-Z0-9_]+$/.test(error.message)?error.message:'OFFSITE_UPLOAD_FAILED';
      state.nextRetryAt=now()+Math.min(30*60000,retryMs*2**Math.min(state.failures-1,10));
      if(!['OFFSITE_BUSY','OFFSITE_LOCK_INVALID'].includes(state.error)) {try {save();}catch {state.error='OFFSITE_STATUS_WRITE_FAILED';}}
      warn('[offsite-backup] '+state.error+'; backup is not confirmed. Retry scheduled.');throw Error(state.error);
    }).finally(()=>{active=null;});
    return active;
  }
  function start() {
    if(timer || stopped)return;
    const tick=async()=>{
      if(stopped)return;
      if(!state.nextRetryAt || state.nextRetryAt<=now())await run().catch(()=>{});
      if(!stopped){timer=setTimeout(tick,pollMs);timer.unref?.();}
    };
    timer=setTimeout(tick,0);timer.unref?.();
  }
  async function stop() {stopped=true;clearTimeout(timer);await active?.catch(()=>{});store.close?.();}
  return {run,start,stop,status};
}
export function installOffsiteBackupStatusRoute(app,{service,requireAuth}) {
  app.get('/api/admin/backups/offsite',requireAuth(['admin']),(_req,res)=>{const status=service.status();res.set('Cache-Control','no-store').status(status.ok?200:503).json(status);});
}
