import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]||'.');
const object=(type,b)=>crypto.createHash('sha1').update(Buffer.concat([Buffer.from(type+' '+b.length+'\0'),b])).digest('hex');
const blob=p=>object('blob',fs.readFileSync(path.join(root,p)));
let engineFiles=0;
function tree(dir){const entries=fs.readdirSync(dir,{withFileTypes:true}).map(e=>{assert.ok(e.isFile()||e.isDirectory(),'No linked frozen files');const full=path.join(dir,e.name);if(e.isFile())engineFiles++;return {name:e.name,dir:e.isDirectory(),sha:e.isDirectory()?tree(full):object('blob',fs.readFileSync(full))};}).sort((a,b)=>Buffer.compare(Buffer.from(a.name+(a.dir?'/':'')),Buffer.from(b.name+(b.dir?'/':''))));const payload=Buffer.concat(entries.map(e=>Buffer.concat([Buffer.from((e.dir?'40000':'100644')+' '+e.name+'\0'),Buffer.from(e.sha,'hex')])));return object('tree',payload);}
const frozenEngineTree=tree(path.join(root,'server/quote-engine-vnext'));const scope=JSON.parse(fs.readFileSync(path.join(root,'verification/quotedone/offerings-engine-boundary.json'),'utf8'));
assert.equal(engineFiles,20);
const actualNames=fs.readdirSync(path.join(root,'server/quote-engine-vnext')).sort();
assert.deepEqual(actualNames,[...Object.keys(scope.originalBlobs),...scope.authorizedAddedFiles].sort());
for(const [name,sha] of Object.entries(scope.originalBlobs))if(!scope.authorizedModifiedFiles.includes(name))assert.equal(blob('server/quote-engine-vnext/'+name),sha,'Unrelated engine file changed: '+name);
const voiceGuide=blob('specs/voice_quote_flows.md');assert.equal(voiceGuide,'7329bde3db8e3b38916e1cd6fbe1ca3fffaffaa5');
const runtime=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','quote-engine-vnext','scripts'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.[cm]?js$/.test(f))runtime.push(f);}}walk(path.join(root,'server'));
const imports=runtime.filter(f=>/(?:from\s*|import\s*\()['"][^'"]*quote-engine-vnext\//.test(fs.readFileSync(f,'utf8'))).map(f=>path.relative(root,f).replaceAll('\\','/'));assert.deepEqual(imports,['server/src/quoteDoneBridge.js']);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');const bridge=read(imports[0]),routes=read('server/src/quoteDoneRoutes.js'),server=read('server/src/server.js');
assert.ok(bridge.includes('generateQuoteVNext(request)'));assert.ok(bridge.includes('sanitizeForCustomerVNext(internalResult)'));assert.ok(!/from ['"].*(?:quoteEngine|quoteTemplates)\.js/.test(bridge));
assert.ok(!/generateQuote\s*\(/.test(server+routes+bridge));assert.ok(routes.includes('}).immediate()'));assert.ok(routes.includes("requireAuth(['owner'])"));assert.ok(routes.includes("requireAuth(['owner','staff'])"));assert.ok(!/res\.json\(.*internalResult/.test(routes));
const baseline=JSON.parse(read('verification/quotedone/resume-dependency-baseline.json'));for(const[p,sha]of Object.entries(baseline))assert.equal(blob(p),sha,'Dependency/config file changed since the preserved September 29 source: '+p);
for(const p of ['server/src/voice/googleGenAiLiveAdapter.js','server/src/voice/voicePromptCompiler.js','server/src/voiceWebSocketServer.js'])assert.equal(fs.existsSync(path.join(root,p)),false,'Excluded voice implementation unexpectedly present');
const files={};function bind(dir,prefix=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','dist','data','.portable-runtime'].includes(e.name))continue;const relative=prefix?prefix+'/'+e.name:e.name;if(e.isDirectory())bind(path.join(dir,e.name),relative);else if(e.isFile())files[relative]={gitBlob:blob(relative),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')};}}
for(const dir of ['server','client/src','client/public','client/test','test','specs','verification'])bind(path.join(root,dir),dir);
console.log(JSON.stringify({passed:true,frozenEngineTree,engineFiles,voiceGuide,allowedApplicationImports:imports,dependencyBaseline:baseline,files,note:'Exact Git object identities computed from the tested snapshot. Five original engine files and one new offering module are authorized for owner-defined fencing/painting. All fourteen unrelated original engine files remain identical. Dependencies compared with preserved September 29 source, not the earlier historical dependency freeze. No voice implementation added.'},null,2));
