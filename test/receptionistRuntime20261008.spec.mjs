import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,symlinkSync,mkdirSync,writeFileSync,existsSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {syntheticVoiceEnvironment} from '../verification/receptionist-20261008/docker-voice-smoke.mjs';
test('receptionist 1 production runtime-stage layout starts voice on without specs and returns health 200',async t=>{
 const root=mkdtempSync(join(tmpdir(),'synthetic-receptionist-runtime-'));
 let child;
 // Expected teardown order: server exits before its data volume is removed.
 // Otherwise a startup backup can recreate a directory during rmSync.
 t.after(async()=>{
  if(child&&child.exitCode===null&&child.signalCode===null){const closed=once(child,'close');child.kill('SIGTERM');await closed;}
  rmSync(root,{recursive:true,force:true});
 });
 cpSync('server',join(root,'server'),{recursive:true,filter:source=>!source.split('/').includes('node_modules')&&!source.split('/').includes('data')});
 cpSync('package.json',join(root,'package.json'));symlinkSync(resolve('node_modules'),join(root,'node_modules'),'dir');
 mkdirSync(join(root,'client','dist'),{recursive:true});cpSync('client/package.json',join(root,'client/package.json'));
 for(const name of ['index.html','widget.js','widget-app.js'])writeFileSync(join(root,'client','dist',name),name==='index.html'?'<!doctype html><title>Synthetic startup proof</title>':'// synthetic static asset');
 assert.equal(existsSync(join(root,'specs')),false);
 const portServer=createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 mkdirSync(join(root,'data'),{recursive:true});
 const env={...process.env,...syntheticVoiceEnvironment(join(root,'data')),PORT:String(port),TRUST_PROXY:'none',RAILWAY_ENVIRONMENT_ID:''};
 child=spawn(process.execPath,['server/src/server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v);
 let healthy=false;for(let i=0;i<120&&child.exitCode===null;i++){
  try{healthy=(await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(1000)})).status===200;if(healthy)break;}catch{}
  await new Promise(r=>setTimeout(r,50));
 }
 assert.ok(healthy,output);assert.doesNotMatch(output,/ENOENT|VOICE_SETTINGS_INVALID/);
});
test('receptionist 1 CI builds and probes the network-isolated Docker runtime',()=>{
 const workflow=readFileSync('.github/workflows/ci.yml','utf8'),script=readFileSync('verification/receptionist-20261008/docker-voice-smoke.mjs','utf8');
 assert.match(workflow,/voice-docker-startup:/);assert.match(workflow,/docker build --tag otc-receptionist:synthetic/);assert.match(workflow,/docker-voice-smoke\.mjs/);
 assert.match(script,/'--network','none'/);assert.match(script,/voiceRouteReadiness\(\)\.ready,true/);assert.match(script,/\/api\/health/);
});
