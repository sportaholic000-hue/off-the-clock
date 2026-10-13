import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const passingTap='TAP version 13\n# Subtest: SYNTHETIC runner control\nok 1 - SYNTHETIC runner control\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n';

// Copies the actual entry points byte-for-byte. Only the selected child is
// substituted with an isolated real Node process; never recursively run npm test.
export function runFixture({name,kind='checker',tap=passingTap,childExit=0,mode='normal',known=''}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-ci-runner-'));
  const write=(file,text)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);};
  try {
    for(const file of ['scripts/test-full.mjs','.github/scripts/check-test-results.mjs'])write(file,fs.readFileSync(path.join(project,file)));
    write('.github/known-test-failures.txt',known);
    write('scripts/testSelection.mjs',"export const allSpecFiles=()=>['test/SYNTHETIC-only.spec.mjs'];\n");
    if (mode !== 'missing-input') write('input.tap',tap);
    for(const file of ['index.html','widget.js','widget-app.js'])write('client/dist/'+file,'');
    write('package.json','{"type":"module"}\n');
    write('synthetic-child.mjs',`import fs from 'node:fs';\nfs.writeSync(1,${JSON.stringify(tap)});\n${mode==='child-signal'?"process.kill(process.pid,'SIGTERM');":`process.exitCode=${childExit};`}\n`);
    write('fixture-preload.mjs',`import cp from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const mode=${JSON.stringify(mode)},spawn=cp.spawn,spawnSync=cp.spawnSync,createWriteStream=fs.createWriteStream;
cp.spawn=(command,args,options)=>{
  fs.writeFileSync('selected-command.json',JSON.stringify({command,args}));
  if(mode==='spawn-throw')throw Error('SYNTHETIC_SYNCHRONOUS_SPAWN_FAILURE');
  if(mode==='spawn-error')return spawn('./SYNTHETIC_MISSING_EXECUTABLE',args,options);
  return spawn(process.execPath,['synthetic-child.mjs'],options);
};
cp.spawnSync=(command,args,options)=>{
  if(mode==='checker-spawn-error')return spawnSync('./SYNTHETIC_MISSING_CHECKER',args,options);
  if(mode==='checker-signal')return spawnSync(process.execPath,['-e',"process.kill(process.pid,'SIGTERM')"],options);
  if(mode==='checker-exit')return spawnSync(process.execPath,['-e','process.exit(9)'],options);
  return spawnSync(command,args,options);
};
if(mode==='output-write-error'||mode==='output-close-error')fs.createWriteStream=(filename)=>createWriteStream(filename,{fs:{
  open:fs.open,
  write(fd,buffer,offset,length,position,callback){
    if(mode==='output-write-error')callback(Object.assign(Error('SYNTHETIC_DISK_FULL'),{code:'ENOSPC'}));
    else fs.write(fd,buffer,offset,length,position,callback);
  },
  close(fd,callback){fs.close(fd,error=>callback(error||(mode==='output-close-error'?Object.assign(Error('SYNTHETIC_CLOSE_FAILURE'),{code:'EIO'}):null)));}
}});
syncBuiltinESMExports();\n`);
    const env={...process.env,TEST_RESULTS_FILE:'test-results.tap'};
    if(mode==='output-open-error') {fs.mkdirSync(path.join(root,'blocked-output'));env.TEST_RESULTS_FILE='blocked-output';}
    if(mode==='spawn-error') write('test-results.tap',passingTap); // stale passing report must not qualify this run.
    delete env.NODE_TEST_CONTEXT;
    const args=kind==='checker'?['.github/scripts/check-test-results.mjs','input.tap']:['--import','./fixture-preload.mjs','scripts/test-full.mjs'];
    const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    const selected=fs.existsSync(path.join(root,'selected-command.json'))?JSON.parse(fs.readFileSync(path.join(root,'selected-command.json'),'utf8')):null;
    const captured=fs.existsSync(path.join(root,'test-results.tap'))?fs.readFileSync(path.join(root,'test-results.tap'),'utf8'):null;
    if(process.env.CI_RUNNER_EVIDENCE_DIR) {
      const directory=path.join(process.env.CI_RUNNER_EVIDENCE_DIR,name);fs.mkdirSync(directory,{recursive:true});
      for(const [file,text] of [['input.tap',tap],['stdout.log',result.stdout||''],['stderr.log',result.stderr||''],['child.mjs',fs.readFileSync(path.join(root,'synthetic-child.mjs'),'utf8')],['preload.mjs',fs.readFileSync(path.join(root,'fixture-preload.mjs'),'utf8')]])fs.writeFileSync(path.join(directory,file),text,{flag:'wx'});
      if(captured!==null)fs.writeFileSync(path.join(directory,'captured.tap'),captured,{flag:'wx'});
      fs.writeFileSync(path.join(directory,'execution.json'),JSON.stringify({name,kind,mode,childExit,command:[process.execPath,...args],cwd:root,node:process.version,status:result.status,signal:result.signal,error:result.error?{code:result.error.code,message:result.error.message}:null,selected},null,2)+'\n',{flag:'wx'});
    }
    return {...result,selected,captured};
  } finally {fs.rmSync(root,{recursive:true,force:true});}
}
