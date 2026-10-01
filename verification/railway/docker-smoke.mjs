import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';

const image=process.argv[2] || 'otc-railway-proof';
const work=fs.mkdtempSync(path.join(os.tmpdir(),'otc-docker-proof-'));
const volume=path.join(work,'volume');fs.mkdirSync(volume);
const envFile=path.join(work,'production.env');
const suffix=randomBytes(6).toString('hex'), containers=[], checks=[];
const env={
 NODE_ENV:'production',PORT:'3000',APP_DATA_DIR:'/data/app',RAILWAY_VOLUME_MOUNT_PATH:'/data',
 RAILWAY_ENVIRONMENT_ID:'isolated-docker-proof',TRUST_PROXY:'railway',
 RAILWAY_DEPLOYMENT_DRAINING_SECONDS:'120',SHUTDOWN_TIMEOUT_SECONDS:'110',
 JWT_SECRET:randomBytes(48).toString('hex'),BOOKING_SLOT_TOKEN_SECRET:randomBytes(48).toString('hex'),
 CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('hex'),PUBLIC_BASE_URL:'https://app.offtheclockai.com',
 CLIENT_URL:'https://app.offtheclockai.com',CORS_ALLOWED_ORIGINS:'https://app.offtheclockai.com',
 ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',
 EMAIL_DELIVERY_ENABLED:'false',OUTBOUND_WEBHOOKS_ENABLED:'false',DEMO_ENABLED:'false',
 DEMO_ALLOWED_ORIGINS:'https://www.offtheclockai.com',BACKUP_INTERVAL_SECONDS:'21600',BACKUP_RETENTION_DAYS:'30'
};
fs.writeFileSync(envFile,Object.entries(env).map(([k,v])=>k+'='+v).join('\n'),{mode:0o600});
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:180000,stdio:['ignore','pipe','pipe']}).trim();
const runNode=(name,code)=>docker('exec',name,'node','--input-type=module','-e',code);
async function ready(name) {
 const port=docker('port',name,'3000/tcp').split(':').at(-1),url='http://127.0.0.1:'+port;
 for(let i=0;i<120;i++) {
  try{if((await fetch(url+'/api/health',{signal:AbortSignal.timeout(2000)})).status===200)return url;}catch{}
  if(docker('inspect','--format','{{.State.Running}}',name)!=='true'){const logs=spawnSync('docker',['logs',name],{encoding:'utf8'});throw new Error('Container stopped before readiness: '+docker('inspect','--format','{{json .State}}',name)+' '+logs.stdout+' '+logs.stderr);}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 throw new Error('Readiness timeout');
}
async function start(label,root='/data/app') {
 const name='otc-'+suffix+'-'+label;containers.push(name);
 docker('run','-d','--name',name,'--env-file',envFile,'-e','APP_DATA_DIR='+root,
 '--mount','type=bind,source='+volume+',target=/data','-p','127.0.0.1::3000',image);
 return {name,url:await ready(name)};
}
function stop(name) {
 docker('stop','--time','120',name);
 assert.equal(docker('inspect','--format','{{.State.ExitCode}}',name),'0');
 assert.match(docker('logs',name),/requests and workers drained; database closed/);
}
const modules=`import {db} from './server/src/db.js';import {deploymentConfig as config} from './server/src/deploymentEnvironment.js';import {savePricebook,loadPricebook} from './server/priceBookService.js';`;
const read=`console.log(JSON.stringify({rows:db.prepare('SELECT * FROM deploymentProof ORDER BY ownerId,kind').all(),books:{a:loadPricebook('a'),b:loadPricebook('b')},path:db.name}));db.close();`;
let outcome;
try {
 const first=await start('first');
 assert.equal((await fetch(first.url+'/dashboard')).status,200);
 const index=await (await fetch(first.url+'/signup?plan=QuoteDone')).text();assert.ok(!index.includes('COMMITTED_DIST_POISON'));
 for(const asset of ['widget.js','widget-app.js']){
  const response=await fetch(first.url+'/'+asset,{headers:{origin:'https://customer.invalid'}});
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');
 }
 const demo=await (await fetch(first.url+'/demo/otc-live-demo.js')).text();
 assert.equal(createHash('sha256').update(demo).digest('hex'),createHash('sha256').update(fs.readFileSync('server/public/otc-live-demo.js')).digest('hex'));
 assert.equal((await fetch(first.url+'/api/demo/session',{method:'POST',headers:{origin:'https://www.offtheclockai.com','content-type':'application/json'},body:'{"agent":"miles"}'})).status,503);
 for(const target of ['/api/not-real','/.env','/data/off-the-clock.sqlite','/server/src/db.js'])assert.equal((await fetch(first.url+target)).status,404);
 assert.equal(runNode(first.name,`import fs from 'node:fs';console.log(fs.existsSync('/app/node_modules/COMMITTED_DEPENDENCIES_POISON'));`),'false');
 checks.push('clean lockfile dependencies and rebuilt bundles; existing demo bytes/routes preserved; private files inaccessible');
 runNode(first.name,modules+`db.exec('CREATE TABLE deploymentProof(ownerId TEXT,kind TEXT,value TEXT,PRIMARY KEY(ownerId,kind))');for(const owner of ['a','b']){for(const kind of ['lead','quote','booking'])db.prepare('INSERT INTO deploymentProof VALUES(?,?,?)').run(owner,kind,owner+'-'+kind+'-retained');savePricebook(owner,{services:[],defaults:{},marker:owner+'-approved-price-book'});}db.close();`);
 const before=JSON.parse(runNode(first.name,modules+read));
 assert.equal(before.path,'/data/app/off-the-clock.sqlite');
 const bundle=runNode(first.name,modules+`import {createSnapshot} from './server/src/backups.js';console.log(await createSnapshot(db,config));db.close();`).split('\n').at(-1);
 stop(first.name);docker('start',first.name);await ready(first.name);
 assert.deepEqual(JSON.parse(runNode(first.name,modules+read)),before);stop(first.name);
 checks.push('real Linux SIGTERM drains HTTP/workers and closes SQLite; same-container restart retains database and price books');
 const redeployed=await start('redeployed');assert.deepEqual(JSON.parse(runNode(redeployed.name,modules+read)),before);
 const restore=JSON.parse(docker('exec',redeployed.name,'node','server/scripts/restore.js','--backup',bundle,'--target','/data/restores/drill'));
 assert.equal(restore.destination,'/data/restores/drill');stop(redeployed.name);
 const restored=await start('restored','/data/restores/drill');const recovered=JSON.parse(runNode(restored.name,modules+read));
 assert.deepEqual(recovered.rows,before.rows);assert.deepEqual(recovered.books,before.books);
 assert.equal(recovered.path,'/data/restores/drill/off-the-clock.sqlite');stop(restored.name);
 checks.push('fresh container redeploy retains data; actual restore CLI creates verified new root; fresh production process reads restored data');
 const bad='otc-'+suffix+'-unmounted';containers.push(bad);
 let refused=false;try{docker('run','--name',bad,'--env-file',envFile,'-e','RAILWAY_VOLUME_MOUNT_PATH=/app','-e','APP_DATA_DIR=/app/persistent',image);}catch{refused=true;}
 assert.ok(refused);assert.match(docker('logs',bad),/not an actual mounted volume/);
 const dev='otc-'+suffix+'-development';containers.push(dev);
 refused=false;try{docker('run','--name',dev,'--env-file',envFile,'-e','NODE_ENV=development',image);}catch{refused=true;}
 assert.ok(refused);assert.match(docker('logs',dev),/Railway requires NODE_ENV=production/);
 checks.push('startup refuses missing actual mount and Railway development-mode override');
 outcome={passed:true,sourceCommit:process.env.GITHUB_SHA||null,imageId:docker('image','inspect','--format','{{.Id}}',image),checks};
 console.log(JSON.stringify(outcome,null,2));
} catch(error) {outcome={passed:false,sourceCommit:process.env.GITHUB_SHA||null,checks,error:error.message};console.error(JSON.stringify(outcome,null,2));process.exitCode=1;}
finally {
 for(const name of containers){try{docker('rm','-f',name);}catch{}}
 fs.mkdirSync('verification/railway/results',{recursive:true});
 fs.writeFileSync('verification/railway/results/docker-proof.json',JSON.stringify(outcome,null,2));
 fs.rmSync(work,{recursive:true,force:true});
}
