import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fork,spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {productionEnv} from './helpers/railwayEnv.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function freePort() {const s=net.createServer();s.listen(0);await once(s,'listening');const port=s.address().port;await new Promise(resolve=>s.close(resolve));return port;}
async function child(t,env,registry) {
  const port=await freePort();
  const clean={...process.env,...env,PORT:String(port),DATABASE_PATH:'',PRICEBOOK_PATH:'',RAILWAY_ENVIRONMENT_ID:'',
    GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_CALENDAR_REDIRECT_URI:'',ADMIN_EMAIL:'',ADMIN_PASSWORD_HASH:'',
    LOCAL_PREVIEW_MODE:'false',DEMO_TRUSTED_PROXY_HOPS:undefined};
  delete clean.DEMO_TRUSTED_PROXY_HOPS;delete clean.NODE_TEST_CONTEXT;
  const proc=fork(path.join(project,'test/helpers/railwayProcessFixture.mjs'),[],{cwd:project,env:clean,execPath:process.execPath,execArgv:[],windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  registry?.push(proc);
  let output='',done=false;proc.stdout.on('data',chunk=>{output+=chunk;});proc.stderr.on('data',chunk=>{output+=chunk;});proc.once('exit',()=>{done=true;});
  t.after(async()=>{if(!done){const ended=once(proc,'exit');proc.kill('SIGKILL');await ended;}});
  await new Promise((resolve,reject)=>{
    proc.on('message',message=>{if(message.ready)resolve();});
    proc.once('exit',()=>reject(new Error('Fixture did not start: '+output)));
    setTimeout(()=>reject(new Error('Fixture startup timeout: '+output)),20000).unref();
  });
  const rpc=command=>new Promise((resolve,reject)=>{
    const id=randomUUID(),listener=message=>{if(message.id===id){proc.off('message',listener);message.error?reject(new Error(message.error)):resolve(message.result);}};
    proc.on('message',listener);proc.send({id,command});
  });
  const stop=async()=>{
    const ended=once(proc,'exit');
    if(process.platform==='win32')proc.send({command:'signal'});else proc.kill('SIGTERM');
    const [code,signal]=await ended;assert.equal(code,0,output);assert.equal(signal,null,output);assert.match(output,/requests and workers drained; database closed/);
  };
  return {proc,rpc,stop,env:clean,url:'http://127.0.0.1:'+port};
}
test('production app writes to persistent storage, survives two process restarts, and starts from a CLI-restored backup', {timeout:180000},async t=>{
  const volume=fs.mkdtempSync(path.join(os.tmpdir(),'otc-process-')),processes=[];
  t.after(async()=>{for(const proc of processes)if(proc.exitCode===null&&proc.signalCode===null){const ended=once(proc,'exit');proc.kill('SIGKILL');await ended;}fs.rmSync(volume,{recursive:true,force:true});});
  const env=productionEnv(volume,{DEMO_ALLOWED_ORIGINS:'https://www.offtheclockai.com'});
  const first=await child(t,env,processes);assert.equal((await fetch(first.url+'/api/health')).status,200);
  assert.equal((await fetch(first.url+'/dashboard')).status,200);
  assert.equal((await fetch(first.url+'/signup?plan=QuoteDone')).status,200);
  for(const name of ['widget.js','widget-app.js']){
    const response=await fetch(first.url+'/'+name,{headers:{origin:'https://customer-site.invalid'}});
    assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');
  }
  const demo=await fetch(first.url+'/demo/otc-live-demo.js');assert.equal(demo.status,200);assert.equal(await demo.text(),fs.readFileSync(path.join(project,'server/public/otc-live-demo.js'),'utf8'));
  assert.equal((await fetch(first.url+'/api/demo/session',{method:'POST',headers:{'content-type':'application/json',origin:'https://www.offtheclockai.com'},body:'{"agent":"miles"}'})).status,503);
  for(const url of ['/api/not-real','/.env','/data/off-the-clock.sqlite','/server/src/db.js','/assets/missing.js'])assert.equal((await fetch(first.url+url)).status,404,url);
  await first.rpc('seed');const written=await first.rpc('read'),snapshot=await first.rpc('backup');
  assert.equal(written.databasePath,path.join(volume,'off-the-clock.sqlite'));
  await first.stop();
  const second=await child(t,env),persisted=await second.rpc('read');
  assert.deepEqual(persisted.rows,written.rows);assert.deepEqual(persisted.books,written.books);assert.ok(persisted.snapshots>=1);await second.stop();
  const target=path.join(volume,'restores','drill');
  const restore=spawn(process.execPath,['server/scripts/restore.js','--backup',snapshot.bundle,'--target',target],{cwd:project,env:second.env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let log='';restore.stdout.on('data',chunk=>{log+=chunk;});restore.stderr.on('data',chunk=>{log+=chunk;});
  const [code]=await once(restore,'exit');assert.equal(code,0,log);assert.equal(JSON.parse(log.trim()).destination,target);
  const third=await child(t,{...env,APP_DATA_DIR:target},processes),restored=await third.rpc('read');
  assert.deepEqual(restored.rows,written.rows);assert.deepEqual(restored.books,written.books);
  assert.equal(restored.databasePath,path.join(target,'off-the-clock.sqlite'));await third.stop();
});
