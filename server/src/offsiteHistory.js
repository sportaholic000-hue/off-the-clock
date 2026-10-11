import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {assertRealContainment} from './deploymentConfig.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
export const offsiteDestinationId=config=>hash(JSON.stringify([config.endpoint,config.bucket,config.prefix,hash(config.key)]));
export function saveRetentionJson(file,value){
  const temporary=file+'.'+randomUUID();
  try{
    fs.writeFileSync(temporary,JSON.stringify(value),{flag:'wx',mode:0o600,flush:true});fs.renameSync(temporary,file);
    const fd=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }finally{fs.rmSync(temporary,{force:true});}
}
function directory(deployment){
  const directory=path.join(deployment.backupPath,'.offsite-history');
  assertRealContainment(deployment.root,directory);return directory;
}
function rememberUploadHistory(deployment,row){
  const root=directory(deployment);fs.mkdirSync(root,{recursive:true,mode:0o700});
  const remember=(suffix,value)=>{
    const file=path.join(root,row.destinationId+suffix);assertRealContainment(deployment.root,file);
    try{fs.writeFileSync(file,JSON.stringify(value),{flag:'wx',mode:0o600,flush:true});}
    catch(error){if(error.code!=='EEXIST')throw error;}
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    if(saved.version!==1||saved.destinationId!==row.destinationId)throw Error('OFFSITE_HISTORY_INVALID');
    const fd=fs.openSync(root,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  };
  remember('.json',{version:1,destinationId:row.destinationId,firstAttemptAt:row.firstAttemptAt});
  if(row.firstSuccessfulUploadAt)remember('.success.json',{version:1,destinationId:row.destinationId,firstSuccessfulUploadAt:row.firstSuccessfulUploadAt});
}
// The intent closes the crash window between an accepted upload and saving its
// success receipt. Neither record is pruned with the rotating backup state.
export function recordOffsiteUpload(deployment,config,at,{confirmed=false}={}){
  rememberUploadHistory(deployment,{destinationId:offsiteDestinationId(config),firstAttemptAt:new Date(at).toISOString(),
    firstSuccessfulUploadAt:confirmed?new Date(at).toISOString():null});
}
export function offsiteUploadHistory(deployment){
  const result=new Map(),root=directory(deployment);
  if(fs.existsSync(root))for(const name of fs.readdirSync(root)){
    if(!/^[a-f0-9]{64}(?:\.success)?\.json$/.test(name))throw Error('OFFSITE_HISTORY_INVALID');
    const file=path.join(root,name);assertRealContainment(deployment.root,file);
    const row=JSON.parse(fs.readFileSync(file,'utf8'));
    if(row.version!==1||row.destinationId!==name.slice(0,64)||!Number.isFinite(Date.parse(name.endsWith('.success.json')?row.firstSuccessfulUploadAt:row.firstAttemptAt)))throw Error('OFFSITE_HISTORY_INVALID');
    result.set(row.destinationId,{...result.get(row.destinationId),...row});
  }
  // Upgrade old deployments before deciding "never uploaded". Successful
  // worker receipts and ambiguous upload intents are durable evidence too.
  for(const name of ['.offsite','.offsite-continuous']){
    const file=path.join(deployment.backupPath,name,'state.json');assertRealContainment(deployment.root,file);
    if(!fs.existsSync(file))continue;
    let state;try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('OFFSITE_HISTORY_INVALID');}
    if(state.lastSuccessAt!=null||state.pending||state.lastAttemptAt!=null){
      if(!/^[a-f0-9]{64}$/.test(state.destinationId))throw Error('OFFSITE_HISTORY_INVALID');
      if(!result.has(state.destinationId))result.set(state.destinationId,{version:1,destinationId:state.destinationId,
        firstAttemptAt:new Date(state.lastAttemptAt??state.lastSuccessAt).toISOString(),
        firstSuccessfulUploadAt:state.lastSuccessAt!=null?new Date(state.lastSuccessAt).toISOString():null});
    }
  }
  return [...result.values()];
}
export function requireOffsiteErasureInventory(deployment,config,store){
  const history=offsiteUploadHistory(deployment);
  for(const row of history)rememberUploadHistory(deployment,row);
  if(history.length&&(!config.enabled||!store))throw Error('OFFSITE_RETENTION_CONFIG_REQUIRED');
  if(config.enabled&&history.some(row=>row.destinationId!==offsiteDestinationId(config)))throw Error('OFFSITE_RETENTION_DESTINATION_REQUIRED');
  return history;
}

export function backupErasureStatus(deployment){
  if(!deployment.backupPath)return {ok:true,pendingOwners:0,error:null};
  const root=path.join(deployment.backupPath,'.retention');
  try{
    assertRealContainment(deployment.root,root);
    const pending=fs.existsSync(root)?fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()&&/^[a-f0-9]{64}$/.test(entry.name)):[];
    return {ok:!pending.length,pendingOwners:pending.length,error:pending.length?'OFFSITE_RETENTION_PENDING':null};
  }catch{return {ok:false,pendingOwners:null,error:'OFFSITE_RETENTION_STATUS_UNAVAILABLE'};}
}

const validOwner=row=>row&&typeof row.ownerId==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(row.ownerId)&&Number.isFinite(Date.parse(row.at));
export function rememberBackupErasure(deployment,ownerId,at){
  if(!validOwner({ownerId,at}))throw Error('OFFSITE_RETENTION_OWNER_INVALID');
  const root=path.join(deployment.backupPath,'.retention'),legacy=path.join(root,'owners.json'),directory=path.join(root,'erased-owners');
  for(const file of [legacy,directory])assertRealContainment(deployment.root,file);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  function publish(row){
    const file=path.join(directory,hash(row.ownerId)+'.json'),temporary=path.join(root,'.owner-receipt-'+randomUUID());
    assertRealContainment(deployment.root,file);
    try{
      fs.writeFileSync(temporary,JSON.stringify({version:1,...row}),{flag:'wx',mode:0o600,flush:true});
      // Publish a complete fsynced receipt without replacing any existing inode.
      // Different owners cannot overwrite each other; the first same-owner
      // receipt wins. A crash before link has not acknowledged an erasure.
      try{fs.linkSync(temporary,file);}catch(error){if(error.code!=='EEXIST')throw error;}
      const saved=JSON.parse(fs.readFileSync(file,'utf8'));
      if(saved.version!==1||!validOwner(saved)||saved.ownerId!==row.ownerId)throw Error('OFFSITE_RETENTION_LEDGER_INVALID');
      const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    }finally{fs.rmSync(temporary,{force:true});}
  }
  // Idempotent migration: retain the legacy file as read-only recovery evidence.
  // Never rewrite or delete it. Interrupted/concurrent migrations can only add
  // complete receipts, and retries import every legacy owner again safely.
  if(fs.existsSync(legacy)){
    const ledger=JSON.parse(fs.readFileSync(legacy,'utf8'));
    if(ledger.version!==1||!Array.isArray(ledger.owners)||ledger.owners.some(row=>!validOwner(row)))throw Error('OFFSITE_RETENTION_LEDGER_INVALID');
    for(const row of ledger.owners)publish(row);
  }
  publish({ownerId,at});
  const parent=fs.openSync(root,'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
  return fs.readdirSync(directory).sort().map(name=>{
    const file=path.join(directory,name);assertRealContainment(deployment.root,file);
    if(!/^[a-f0-9]{64}\.json$/.test(name))throw Error('OFFSITE_RETENTION_LEDGER_INVALID');
    const row=JSON.parse(fs.readFileSync(file,'utf8'));
    if(row.version!==1||!validOwner(row)||name!==hash(row.ownerId)+'.json')throw Error('OFFSITE_RETENTION_LEDGER_INVALID');
    return {ownerId:row.ownerId,at:row.at};
  });
}
