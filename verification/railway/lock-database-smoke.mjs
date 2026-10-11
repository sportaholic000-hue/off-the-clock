// Separate proof so docker-smoke.mjs changes only its authorized cleanup.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const image=process.argv[2]||'otc-receptionist:synthetic';
const work=fs.mkdtempSync(path.join(os.tmpdir(),'otc-lock-database-proof-'));
const volume=path.join(work,'volume'),envFile=path.join(work,'production.env');
fs.mkdirSync(volume);
const env={NODE_ENV:'production',PORT:'3000',APP_DATA_DIR:'/data/app',RAILWAY_VOLUME_MOUNT_PATH:'/data',
  RAILWAY_ENVIRONMENT_ID:'synthetic-lock-database-proof',TRUST_PROXY:'railway',RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'120',SHUTDOWN_TIMEOUT_SECONDS:'110',
  JWT_SECRET:randomBytes(48).toString('hex'),BOOKING_SLOT_TOKEN_SECRET:randomBytes(48).toString('hex'),CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('hex'),
  PUBLIC_BASE_URL:'https://app.offtheclockai.com',CLIENT_URL:'https://app.offtheclockai.com',CORS_ALLOWED_ORIGINS:'https://app.offtheclockai.com',
  ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',EMAIL_DELIVERY_ENABLED:'false',OUTBOUND_WEBHOOKS_ENABLED:'false',
  DEMO_ENABLED:'false',DEMO_ALLOWED_ORIGINS:'https://www.offtheclockai.com',BACKUP_INTERVAL_SECONDS:'21600',BACKUP_RETENTION_DAYS:'30'};
fs.writeFileSync(envFile,Object.entries(env).map(([key,value])=>key+'='+value).join('\n'),{mode:0o600});
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:180000,stdio:['ignore','pipe','pipe']}).trim();
const node=(name,code)=>docker('exec',name,'node','--input-type=module','-e',code);
const suffix=randomBytes(6).toString('hex'),containers=[],checks=[],observations=[];
async function ready(name){
  for(let attempt=0;attempt<120;attempt++){
    assert.equal(docker('inspect','--format','{{.State.Running}}',name),'true');
    try{node(name,"const r=await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(2000)});if(r.status!==200)process.exit(1);");return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw Error('Lock-database production readiness timed out');
}
async function start(label,root='/data/app'){
  const name='otc-lock-'+suffix+'-'+label;containers.push(name);
  docker('run','-d','--network','none','--name',name,'--env-file',envFile,'-e','APP_DATA_DIR='+root,
    '--mount','type=bind,source='+volume+',target=/data',image);
  await ready(name);return name;
}
function stop(name){docker('stop','--time','120',name);assert.equal(docker('inspect','--format','{{.State.ExitCode}}',name),'0');}
const imports=`import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {deploymentConfig as config} from './server/src/deploymentEnvironment.js';
import {retentionLockFile,withBackupRetentionLockSync} from './server/src/backupRetentionLock.js';`;
function probe(name,label){
  const child=`import {deploymentConfig as config} from './server/src/deploymentEnvironment.js';import {withBackupRetentionLockSync} from './server/src/backupRetentionLock.js';try{withBackupRetentionLockSync(config,()=>{});process.exit(2);}catch(error){if(error.message!=='OFFSITE_BUSY')throw error;console.log('OFFSITE_BUSY');}`;
  const result=JSON.parse(node(name,imports+`
    const file=retentionLockFile(config)+'.sqlite';
    assert.equal(file,'/data/backups/.tenant-erasure.lock.sqlite');assert.ok(fs.existsSync(file));
    const before=fs.statSync(file),directory=fs.statSync('/data/backups');
    const serverUid=Number(fs.readFileSync('/proc/1/status','utf8').match(/^Uid:\\s+(\\d+)/m)[1]);
    assert.equal(process.getuid(),serverUid);assert.equal(process.getuid(),0);assert.equal(process.getgid(),0);
    assert.equal(before.uid,process.getuid());assert.equal(before.gid,process.getgid());
    assert.equal(before.mode&0o777,0o600);assert.equal(directory.mode&0o777,0o700);
    withBackupRetentionLockSync(config,()=>{
      const other=spawnSync(process.execPath,['--input-type=module','-e',${JSON.stringify(child)}],{encoding:'utf8',timeout:10000});
      assert.equal(other.status,0,other.stderr);assert.equal(other.stdout.trim(),'OFFSITE_BUSY');
    });
    assert.equal(fs.statSync(file).ino,before.ino);
    console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),serverUid,file,ino:before.ino,dev:before.dev,mode:before.mode&0o777,parentMode:directory.mode&0o777}));`));
  if(observations.length)assert.deepEqual(result,observations[0].lock);
  observations.push({label,lock:result});checks.push(label+': production user acquires existing private mutex; child is excluded; inode unchanged');
}
let outcome;
try{
  assert.equal(docker('image','inspect','--format','{{.Config.User}}',image),'','Production Dockerfile uses the image default root user');
  const first=await start('first');probe(first,'initial startup');
  const bundle=node(first,`import {db} from './server/src/db.js';import {deploymentConfig as config} from './server/src/deploymentEnvironment.js';import {createSnapshot} from './server/src/backups.js';console.log(await createSnapshot(db,config));db.close();`).split('\n').at(-1);
  stop(first);docker('start',first);await ready(first);probe(first,'normal restart');stop(first);
  const redeployed=await start('redeployed');probe(redeployed,'fresh-container redeploy');
  node(redeployed,imports+`
    withBackupRetentionLockSync(config,()=>{
      const blocked=spawnSync(process.execPath,['server/scripts/restore.js','--backup',${JSON.stringify(bundle)},'--target','/data/restores/drill'],{encoding:'utf8',timeout:10000});
      assert.equal(blocked.status,1);assert.match(blocked.stderr,/RESTORE_FAILED/);assert.equal(fs.existsSync('/data/restores/drill'),false);
    });`);
  const restored=JSON.parse(docker('exec',redeployed,'node','server/scripts/restore.js','--backup',bundle,'--target','/data/restores/drill'));
  assert.equal(restored.destination,'/data/restores/drill');probe(redeployed,'actual restore CLI after release');
  checks.push('actual restore CLI: blocked while mutex held without creating a target; succeeds after release as unchanged production user');
  stop(redeployed);
  const freshRestored=await start('restored','/data/restores/drill');probe(freshRestored,'restored-root startup');stop(freshRestored);
  outcome={passed:true,sourceCommit:process.env.GITHUB_SHA||null,imageId:docker('image','inspect','--format','{{.Id}}',image),network:'none',checks,observations};
}finally{
  for(const name of containers){try{docker('rm','-f',name);}catch{}}
  // Only this proof's temporary bind mount; never delete a running app's mutex.
  docker('run','--rm','--network','none','--entrypoint','node','--mount','type=bind,source='+volume+',target=/cleanup',image,'-e',
    "const fs=require('fs');for(const p of ['/cleanup/app','/cleanup/restores','/cleanup/backups'])fs.rmSync(p,{recursive:true,force:true});");
  fs.rmSync(work,{recursive:true,force:true});
}
fs.mkdirSync('verification/railway/results',{recursive:true});
fs.writeFileSync('verification/railway/results/lock-database-proof.json',JSON.stringify(outcome,null,2));
console.log(JSON.stringify(outcome,null,2));
