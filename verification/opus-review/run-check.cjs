// Run with the already-provisioned Node 22.23.2 runtime. No installs or live stores.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const [source,evidence,label,...requested]=process.argv.slice(2),root=path.resolve(source),out=path.resolve(evidence);
if(!/^[a-z0-9-]+$/.test(label||''))throw Error('Usage: node run-check.cjs source-root evidence-root label [node arguments or full]');
fs.mkdirSync(out,{recursive:true});
const logPath=path.join(out,label+'.log');if(fs.existsSync(logPath))throw Error('Use a new label; preserve original evidence.');
const env={};for(const[k,v]of Object.entries(process.env))if(['path','systemroot','windir','temp','tmp','comspec','pathext','userprofile','localappdata','appdata','pricebook_browser_module','pricebook_browser_executable','esbuild_binary_path','quotedone_tested_source_sha'].includes(k.toLowerCase()))env[k]=v;
Object.assign(env,{OPUS_SOURCE_ROOT:root,OPUS_CASE_EVIDENCE:path.join(out,label+'-cases.json'),NODE_ENV:'test',JWT_SECRET:crypto.randomBytes(32).toString('hex'),DATABASE_PATH:path.join(out,label+'.sqlite'),PRICEBOOK_PATH:path.join(out,label+'-pricebooks'),DOTENV_CONFIG_PATH:path.join(out,'absent.env'),ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',EMAIL_PROVIDER:'console',LOCAL_PREVIEW:'false',PORT:'4594',PRICEBOOK_EDITOR_EVIDENCE_DIR:path.join(out,label+'-editor'),QUOTEDONE_EVIDENCE_DIR:path.join(out,label+'-freshness')});
const args=requested[0]==='full'?['--experimental-test-module-mocks','--test','--test-concurrency=1',...fs.readdirSync(path.join(root,'test')).filter(n=>/\.spec\.(?:js|mjs)$/.test(n)).sort().map(n=>'test/'+n)]:requested;
if(!args.length)throw Error('A verification command is required.');
const hashes={};
function walk(dir,rel){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','dist','data','.portable-runtime','.git'].includes(e.name))continue;const p=rel?rel+'/'+e.name:e.name;if(e.isDirectory())walk(path.join(dir,e.name),p);else if(e.isFile()&&/\.(?:[cm]?js|jsx|json|md)$/.test(e.name))hashes[p]=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,e.name))).digest('hex');}}
for(const p of ['server','client/src','client/test','test','verification'])walk(path.join(root,p),p);
for(const p of ['package.json','package-lock.json','client/package.json','server/package.json'])if(fs.existsSync(path.join(root,p)))hashes[p]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
fs.writeFileSync(path.join(out,label+'.source.json'),JSON.stringify({sourceRoot:root,base:'4df8b23dab66beba557a018d6e351a4b13febd5c',sourceCommit:env.QUOTEDONE_TESTED_SOURCE_SHA||null,args,hashes,liveProviderWrites:false},null,2));
const fd=fs.openSync(logPath,'wx'),started=Date.now(),child=cp.spawn(process.execPath,args,{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});
fs.writeFileSync(path.join(out,label+'.process.json'),JSON.stringify({runner:process.pid,child:child.pid,args}));
const timer=setTimeout(()=>child.kill(),25*60*1000);
child.once('close',(status,signal)=>{clearTimeout(timer);fs.closeSync(fd);const log=fs.readFileSync(logPath,'utf8'),counters=Object.fromEntries([...log.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map(m=>[m[1],+m[2]]));
const result={label,args,status,signal,elapsedMs:Date.now()-started,counters,logSha256:crypto.createHash('sha256').update(log).digest('hex')};fs.writeFileSync(path.join(out,label+'.result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));console.log(log.slice(-2000));process.exitCode=status===0?0:1;});
