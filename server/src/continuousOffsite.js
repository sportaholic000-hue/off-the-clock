import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createSnapshot,restoreBackup} from './backups.js';
import {assertRealContainment} from './deploymentConfig.js';
import {encryptBundle,decryptBundle,fileChecksum,MAX_ARCHIVE_BYTES} from './offsiteArchive.js';
import {readOffsiteConfig,createS3BackupStore,isConflict} from './offsiteStore.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const dayAt=at=>new Date(at).toISOString().slice(0,10);
const idValid=id=>typeof id==='string'&&/^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
const keyFor=(config,id)=>config.prefix+'/continuous/'+id+'.enc';
function validateRecord(record,config,id){
  if(!idValid(id)||!record||record.version!==1||record.checkpointId!==id||record.key!==keyFor(config,id)||
    !Number.isSafeInteger(record.capturedAtMs)||record.capturedAtMs!==Number(id.slice(0,13))||
    !/^[a-f0-9]{64}$/.test(record.sha256)||!/^[a-f0-9]{64}$/.test(record.keyId)||!/^[a-f0-9]{64}$/.test(record.sourceToken)||
    !Number.isSafeInteger(record.bytes)||record.bytes<40||record.bytes>MAX_ARCHIVE_BYTES)throw Error('OFFSITE_RECORD_INVALID');
  return record;
}
async function checkedDownload(store,record,file){
  await store.download(record.key,file,record.bytes);
  if(await fileChecksum(file)!==record.sha256)throw Error('OFFSITE_CHECKSUM_MISMATCH');
}
export async function pruneContinuousBackups(store,config,{now=Date.now()}={}){
  const prefix=config.prefix+'/continuous/',keys=await store.list(prefix);
  let newest;
  // Time-based retention needs only the newest complete recovery point. Reading
  // every retained object's marker/HEAD on each prune would stall replication
  // as thirty days of frequent checkpoints accumulate.
  for(const key of [...keys].sort().reverse()){
    const id=key.slice(prefix.length,-9);
    if(!idValid(id)||key!==keyFor(config,id)+'.json')continue;
    const record=validateRecord(await store.record(key),config,id),head=await store.head(record.key);
    if(head?.ContentLength===record.bytes&&head.Metadata?.sha256===record.sha256){newest=record.checkpointId;break;}
  }
  if(!newest)return;
  const expired=new Set();
  for(const key of keys){
    const suffix=key.endsWith('.enc.json')?9:key.endsWith('.enc')?4:0;
    if(!suffix)continue;
    const id=key.slice(prefix.length,-suffix);
    if(idValid(id)&&id!==newest&&Number(id.slice(0,13))<now-30*86400000&&
      (key===keyFor(config,id)||key===keyFor(config,id)+'.json'))expired.add(id);
  }
  // Preserve the newest complete checkpoint even after a long outage. Failed
  // publication never calls pruning; interrupted marker deletion is retryable.
  for(const id of expired){await store.remove(keyFor(config,id));await store.remove(keyFor(config,id)+'.json');}
}
export async function restoreContinuousBackup({store,config,checkpoint,target,volume}){
  if(!config.enabled||!idValid(checkpoint))throw Error('OFFSITE_RESTORE_CONFIG_INVALID');
  const parent=path.join(volume,'restores');assertRealContainment(volume,parent);fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const stage=fs.mkdtempSync(path.join(parent,'.continuous-'));fs.chmodSync(stage,0o700);
  try{
    const record=validateRecord(await store.record(keyFor(config,checkpoint)+'.json'),config,checkpoint);
    const file=path.join(stage,'encrypted');await checkedDownload(store,record,file);
    const bundle=path.join(stage,'bundle');await decryptBundle(file,bundle,config.key);
    return restoreBackup(bundle,target,{volume});
  }finally{fs.rmSync(stage,{recursive:true,force:true});}
}

// Continuously publish complete, online SQLite recovery copies. A local commit
// or book replacement wakes the worker; one-second polling also catches lost
// filesystem notifications and commits through other SQLite connections. Burst
// writes coalesce, and writes during upload cause another checkpoint. This is
// asynchronous replication, not a claim of zero data loss during an outage.
export function createContinuousOffsiteService(database,deployment,{env=process.env,config=readOffsiteConfig(env),store=config.enabled?createS3BackupStore(config):null,
  now=Date.now,warn=message=>console.warn(message),continuousPollMs=1000,retryMs=60000,closeStore=true,
  takeReplicaSnapshot}={}){
  const directory=path.join(deployment.backupPath,'.offsite-continuous');assertRealContainment(deployment.root,directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const stateFile=path.join(directory,'state.json'),pendingFile=path.join(directory,'pending.enc'),lockFile=path.join(directory,'run.lock'),snapshotPath=path.join(directory,'snapshots');
  for(const file of [stateFile,pendingFile,lockFile]){
    assertRealContainment(deployment.root,file);
    if(fs.existsSync(file)&&(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()))throw Error('OFFSITE_LOCAL_STATE_UNSAFE');
  }
  const destinationId=hash(JSON.stringify([config.endpoint,config.bucket,config.prefix,hash(config.key)]));
  let state={version:1,destinationId,phase:'WAITING',failures:0},invalid=false,active,timer,started=false,closing=false,stopPromise;
  const watchers=[];
  function sourceToken(){
    const stat=file=>{assertRealContainment(deployment.root,file);try{const s=fs.statSync(file,{bigint:true});return [String(s.ino),String(s.size),String(s.mtimeNs),String(s.ctimeNs)];}catch(e){if(e.code==='ENOENT')return null;throw e;}};
    const filename=database.name,files=[];
    if(filename&&filename!==':memory:')for(const suffix of ['','-wal','-journal'])files.push([suffix,stat(filename+suffix)]);
    assertRealContainment(deployment.root,deployment.pricebookPath);
    const books=fs.readdirSync(deployment.pricebookPath).filter(name=>/\.json$|\.unconfirmed$/.test(name)).sort().map(name=>[name,stat(path.join(deployment.pricebookPath,name))]);
    return hash(JSON.stringify([database.prepare('PRAGMA data_version').get(),database.prepare('SELECT total_changes() n').get(),files,books]));
  }
  function readState(){
    const saved=JSON.parse(fs.readFileSync(stateFile,'utf8'));
    if(saved.version!==1||saved.destinationId!==destinationId||!['WAITING','UPLOADING','FAILED','SUCCEEDED'].includes(saved.phase)||!Number.isSafeInteger(saved.failures)||saved.failures<0)throw Error('OFFSITE_LOCAL_STATE_INVALID');
    for(const field of ['lastSuccessAt','lastAttemptAt','nextRetryAt'])if(saved[field]!=null&&(!Number.isSafeInteger(saved[field])||saved[field]<0))throw Error('OFFSITE_LOCAL_STATE_INVALID');
    if(saved.lastCheckpointId&&!idValid(saved.lastCheckpointId))throw Error('OFFSITE_LOCAL_STATE_INVALID');
    if(saved.lastSourceToken&&!/^[a-f0-9]{64}$/.test(saved.lastSourceToken))throw Error('OFFSITE_LOCAL_STATE_INVALID');
    if(saved.lastPruneDay&&(!/^\d{4}-\d{2}-\d{2}$/.test(saved.lastPruneDay)||dayAt(Date.parse(saved.lastPruneDay))!==saved.lastPruneDay))throw Error('OFFSITE_LOCAL_STATE_INVALID');
    if(saved.pending)validateRecord(saved.pending,config,saved.pending.checkpointId);
    if(saved.phase==='UPLOADING'){saved.phase='FAILED';saved.error='OFFSITE_INTERRUPTED';saved.nextRetryAt=0;}
    return saved;
  }
  if(fs.existsSync(stateFile))try{state=readState();}catch{invalid=true;state.phase='FAILED';state.error='OFFSITE_LOCAL_STATE_INVALID';state.failures=1;}
  function save(){
    const temp=stateFile+'.'+randomUUID();
    try{fs.writeFileSync(temp,JSON.stringify(state),{flag:'wx',mode:0o600,flush:true});fs.renameSync(temp,stateFile);const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
    finally{fs.rmSync(temp,{force:true});}
  }
  function status(){
    let pendingChanges=true,sourceError=null;
    try{pendingChanges=sourceToken()!==state.lastSourceToken;}catch{sourceError='OFFSITE_SOURCE_UNAVAILABLE';}
    return {ok:!invalid&&state.phase==='SUCCEEDED'&&!pendingChanges,configured:true,state:state.phase,
      lastCheckpointId:state.lastCheckpointId||null,lastSuccessAt:state.lastSuccessAt!=null?new Date(state.lastSuccessAt).toISOString():null,
      lastAttemptAt:state.lastAttemptAt!=null?new Date(state.lastAttemptAt).toISOString():null,nextRetryAt:state.nextRetryAt!=null?new Date(state.nextRetryAt).toISOString():null,
      consecutiveFailures:state.failures,pendingChanges,pendingCheckpointId:state.pending?.checkpointId||null,error:state.error||sourceError};
  }
  async function perform(){
    const token=randomUUID();
    if(fs.existsSync(lockFile)){
      let prior;try{prior=JSON.parse(fs.readFileSync(lockFile,'utf8'));}catch{throw Error('OFFSITE_LOCK_INVALID');}
      if(!Number.isInteger(prior.pid)||prior.pid<1||typeof prior.token!=='string')throw Error('OFFSITE_LOCK_INVALID');
      try{process.kill(prior.pid,0);throw Error('OFFSITE_BUSY');}catch(e){if(e.code!=='ESRCH')throw e;}
      fs.unlinkSync(lockFile);
    }
    fs.writeFileSync(lockFile,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600,flush:true});
    try{
      if(fs.existsSync(stateFile))try{state=readState();}catch{invalid=true;throw Error('OFFSITE_LOCAL_STATE_INVALID');}
      const current=sourceToken();
      if(!state.pending&&state.phase==='SUCCEEDED'&&state.lastSourceToken===current){
        if(state.lastPruneDay!==dayAt(now())){await pruneContinuousBackups(store,config,{now:now()});state.lastPruneDay=dayAt(now());save();}
        return status();
      }
      state.phase='UPLOADING';state.lastAttemptAt=now();state.error=null;save();
      if(!state.pending){
        const capturedAtMs=now(),checkpointId=String(capturedAtMs).padStart(13,'0')+'-'+randomUUID();
        if(!idValid(checkpointId))throw Error('OFFSITE_CLOCK_INVALID');
        fs.rmSync(pendingFile,{force:true});
        const bundle=await (takeReplicaSnapshot?takeReplicaSnapshot():createSnapshot(database,{...deployment,backupPath:snapshotPath},{now}));
        try{const sealed=await encryptBundle(bundle,pendingFile,config.key);state.pending={version:1,checkpointId,capturedAtMs,key:keyFor(config,checkpointId),keyId:hash(config.key),sourceToken:current,...sealed};save();}
        finally{if(path.dirname(bundle)===snapshotPath){assertRealContainment(deployment.root,bundle);fs.rmSync(bundle,{recursive:true,force:true});}}
      }
      const record=validateRecord(state.pending,config,state.pending.checkpointId);
      if(await fileChecksum(pendingFile)!==record.sha256)throw Error('OFFSITE_LOCAL_CHECKSUM_MISMATCH');
      const marker=record.key+'.json',existing=await store.record(marker);
      if(existing){
        validateRecord(existing,config,record.checkpointId);
        if(JSON.stringify(existing)!==JSON.stringify(record))throw Error('OFFSITE_RECORD_CONFLICT');
      }else try{await store.putFile(record.key,pendingFile,record.sha256);}catch(e){if(!isConflict(e))throw e;}
      const check=path.join(directory,'verify-'+randomUUID());
      try{await checkedDownload(store,record,check);}finally{fs.rmSync(check,{force:true});}
      if(!existing){try{await store.putRecord(marker,record);}catch(e){if(!isConflict(e))throw e;}
        const published=validateRecord(await store.record(marker),config,record.checkpointId);
        if(JSON.stringify(published)!==JSON.stringify(record))throw Error('OFFSITE_RECORD_CONFLICT');}
      if(state.lastPruneDay!==dayAt(now())){await pruneContinuousBackups(store,config,{now:now()});state.lastPruneDay=dayAt(now());}
      state.lastCheckpointId=record.checkpointId;state.lastSourceToken=record.sourceToken;state.lastSuccessAt=now();state.pending=null;state.phase='SUCCEEDED';state.error=null;state.failures=0;state.nextRetryAt=null;save();fs.rmSync(pendingFile,{force:true});
      return status();
    }finally{if(fs.existsSync(lockFile)&&JSON.parse(fs.readFileSync(lockFile,'utf8')).token===token)fs.unlinkSync(lockFile);}
  }
  function run({draining=false}={}){
    if(active)return active;
    if(closing&&!draining)return Promise.reject(Error('OFFSITE_STOPPED'));
    if(invalid)return Promise.reject(Error('OFFSITE_LOCAL_STATE_INVALID'));
    active=perform().catch(error=>{
      state.phase='FAILED';state.failures=Math.min(state.failures+1,1000000);state.error=/^(?:OFFSITE_|BACKUP_)[A-Z0-9_]+$/.test(error.message)?error.message:'OFFSITE_UPLOAD_FAILED';
      state.nextRetryAt=now()+Math.min(30*60000,retryMs*2**Math.min(state.failures-1,10));
      if(!invalid&&!['OFFSITE_BUSY','OFFSITE_LOCK_INVALID'].includes(state.error))try{save();}catch{state.error='OFFSITE_STATUS_WRITE_FAILED';}
      warn('[offsite-replication] '+state.error+'; latest changes are not confirmed off-site.');throw Error(state.error);
    }).finally(()=>{active=null;});return active;
  }
  function schedule(delay){if(!closing&&started){clearTimeout(timer);timer=setTimeout(tick,delay);timer.unref?.();}}
  async function tick(){
    if(closing)return;
    if(!state.nextRetryAt||state.nextRetryAt<=now())await run().catch(()=>{});
    schedule(continuousPollMs);
  }
  function start(){
    if(started||closing)return;started=true;
    for(const directory of new Set([path.dirname(database.name),deployment.pricebookPath]))try{
      const watcher=fs.watch(directory,(_event,name)=>{
        if(directory===deployment.pricebookPath||[path.basename(database.name),path.basename(database.name)+'-wal',path.basename(database.name)+'-journal'].includes(String(name)))schedule(0);
      });watcher.on('error',()=>{});watcher.unref?.();watchers.push(watcher);
    }catch{/* Polling remains authoritative when filesystem notifications fail. */}
    schedule(0);
  }
  function stop(){
    if(stopPromise)return stopPromise;closing=true;clearTimeout(timer);for(const watcher of watchers)watcher.close();
    stopPromise=(async()=>{await active?.catch(()=>{});if(started&&database.open!==false&&status().pendingChanges)await run({draining:true}).catch(()=>{});if(closeStore)store.close?.();})();return stopPromise;
  }
  return {run,start,stop,status};
}
