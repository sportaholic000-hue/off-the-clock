const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[3]||'');
if(!process.argv[3]||out===root||out.startsWith(root+path.sep))throw Error('Supply an evidence directory outside the repository');fs.mkdirSync(out,{recursive:true});
const env={};for(const[k,v]of Object.entries(process.env))if(['path','systemroot','windir','temp','tmp','comspec','pathext','userprofile','localappdata','appdata'].includes(k.toLowerCase()))env[k]=v;
Object.assign(env,{NODE_ENV:'test',JWT_SECRET:crypto.randomBytes(32).toString('hex'),DATABASE_PATH:path.join(out,'candidate-application.sqlite'),PRICEBOOK_PATH:path.join(out,'pricebooks'),DOTENV_CONFIG_PATH:path.join(out,'absent.env'),ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',EMAIL_PROVIDER:'console',LOCAL_PREVIEW:'false',PRICEBOOK_BROWSER_MODULE:process.env.PRICEBOOK_BROWSER_MODULE||'playwright',PRICEBOOK_BROWSER_EXECUTABLE:process.env.PRICEBOOK_BROWSER_EXECUTABLE||'',PORT:'4594'});
const label=process.argv[2];if(!/^[a-z0-9-]+$/.test(label))throw Error('Label required');
if(label.includes('pricebook-browser'))Object.assign(env,{PRICEBOOK_EDITOR_EVIDENCE_DIR:path.join(out,label+'-editor'),QUOTEDONE_EVIDENCE_DIR:path.join(out,label+'-preview-order')});
const file=path.join(out,label+'.log');if(fs.existsSync(file))throw Error('Preserve existing evidence '+label);
if(process.env.ESBUILD_BINARY_PATH)env.ESBUILD_BINARY_PATH=process.env.ESBUILD_BINARY_PATH;
const args=process.argv.slice(4),binding={backend:'3d2eedb74f31494eb2086abcfa1f0702b094d7b7',frontend:'5adc1ecf0aaa5ee41129e5115576182135194f3d'};
const hashes={};for(const name of [...fs.readdirSync(path.join(root,'server/src')).filter(x=>x.endsWith('.js')).map(x=>'server/src/'+x),...fs.readdirSync(path.join(root,'server/src/voice')).filter(x=>x.endsWith('.js')).map(x=>'server/src/voice/'+x)])hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
fs.writeFileSync(path.join(out,label+'.source.json'),JSON.stringify({base:binding,sourceHashes:hashes,args,providerWrites:false},null,2));
const log=fs.openSync(file,'wx'),start=Date.now();
const child=cp.spawn(process.env.QUOTEDONE_NODE||path.join(root,'.portable-runtime/node-v22.23.2-win-x64/node.exe'),args,{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});
const timer=setTimeout(()=>child.kill(),600000);
child.on('close',(code,signal)=>{clearTimeout(timer);fs.closeSync(log);const result={label,args,status:code,signal,elapsedMs:Date.now()-start,log:label+'.log'};fs.writeFileSync(path.join(out,label+'.result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));console.log(fs.readFileSync(file,'utf8').slice(-2400));process.exitCode=code===0?0:1;});

