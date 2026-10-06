import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {productionEnv} from './helpers/railwayEnv.mjs';

// Expected before execution: current v7 listens; stale/empty versions exit
// nonzero before listening. No money or provider operations in these tests.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bridgeUrl=new URL('../server/src/quoteDoneBridge.js',import.meta.url).href;
const serverUrl=new URL('../server/src/server.js',import.meta.url).href;
async function launch(t,version) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'otc-engine-guard-'));
  const entry=path.join(directory,'start.mjs');
  fs.writeFileSync(entry,version===undefined?`await import(${JSON.stringify(serverUrl)});`:
    `import {mock} from 'node:test';
     const actual=await import(${JSON.stringify(bridgeUrl)});
     mock.module(${JSON.stringify(bridgeUrl)},{namedExports:{...actual,ENGINE_VERSION:${JSON.stringify(version)}}});
     await import(${JSON.stringify(serverUrl)});`);
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const env={...process.env,...productionEnv(directory),PORT:String(port),DATABASE_PATH:'',PRICEBOOK_PATH:'',
    LOCAL_PREVIEW_MODE:'false',DEMO_VOICE_AUDITION:'false',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',
    GOOGLE_CALENDAR_REDIRECT_URI:'',ADMIN_EMAIL:'',ADMIN_PASSWORD_HASH:'',RAILWAY_ENVIRONMENT_ID:''};
  delete env.NODE_TEST_CONTEXT;
  const child=spawn(process.execPath,['--experimental-test-module-mocks',entry],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');let output='';
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk);
  t.after(async()=>{
    if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await exited;}
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const deadline=Date.now()+15000;
  while(child.exitCode===null&&!output.includes('Off The Clock AI server listening')){
    if(Date.now()>deadline){child.kill('SIGKILL');throw Error('Synthetic startup timed out: '+output);}
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  return {child,output,listening:output.includes('Off The Clock AI server listening')};
}
test('release guard: production starts with the current compiled v7 engine',async t=>{
  const result=await launch(t);assert.equal(result.listening,true,result.output);
});
for(const version of ['quote-engine-vnext-launch-fixes-20261005-v6','']) {
  test('release guard: production refuses compiled engine '+JSON.stringify(version),async t=>{
    const result=await launch(t,version);
    assert.equal(result.listening,false,result.output);
    assert.notEqual(result.child.exitCode,0,result.output);
    assert.match(result.output,/QUOTE_ENGINE_VERSION_MISMATCH/);
    assert.match(result.output,/quote-engine-vnext-date-context-20261006-v7/);
  });
}
