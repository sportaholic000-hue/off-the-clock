const path=require('node:path'),cp=require('node:child_process'),fs=require('node:fs');
const root=path.join(__dirname,'engine-finish-20260930'),evidence=path.join(__dirname,'engine-finish-evidence-20260930'),node=path.join(root,'.portable-runtime/node-v22.23.2-win-x64/node.exe');
const env={...process.env,PRICEBOOK_BROWSER_MODULE:'C:/Users/money/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',PRICEBOOK_BROWSER_EXECUTABLE:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',ESBUILD_BINARY_PATH:'C:/Users/money/Documents/Codex/2026-07-19/github-plugin-github-openai-curated-remote-2/work/quote-engine-vnext/node_modules/@esbuild/win32-x64/esbuild.exe'};
const old=JSON.parse(fs.readFileSync(path.join(root,'docs/review/quote-flow-repairs-20260930/FINAL_TEST_RESULTS.json'),'utf8'));
const definitions={
 'tax-before':{args:['verification/engine-independent/owner-tax-settings.mjs','.','$OUT'],expected:1},
 'tax-before-browser':{args:['verification/engine-independent/owner-tax-settings.mjs','.','$OUT','browser'],expected:1},
 'tax-settings':{args:['verification/engine-independent/owner-tax-settings.mjs','.','$OUT']},
 'tiers-before':{args:['client/test/measured-scopes-browser.mjs','.','$OUT','tiers'],expected:1},
 'booking-before':{args:['verification/inspection/quote-booking-review.mjs','.','$OUT'],expected:1},
 'booking-review':{args:['verification/inspection/quote-booking-review.mjs','.','$OUT']},
 'booking-after-claim':{args:['verification/inspection/quote-booking-review.mjs','.','$OUT','--after-write-claim'],expected:1},
 'focused':{args:['--test','--test-concurrency=1','test/measuredScopes.spec.mjs']},
 'booking-focused':{args:['--test','--test-concurrency=1','test/bookingService.spec.mjs']},
 'engine-metadata':{args:['--test','--test-name-pattern','repair 37:','test/quoteEngineVNextRepairs.spec.js']},
 'scopes-matrix':{args:['verification/engine-independent/measured-scopes-arithmetic.mjs','$OUT']},
 'scopes-application':{args:['verification/engine-independent/measured-scopes-application.mjs','.','$OUT']},
 'scope-tiers':{args:['client/test/measured-scopes-browser.mjs','.','$OUT','tiers']},
};
for(const item of old.results){
 const name=item.label.replace(/-final2?$/,'');
 definitions[name]={args:item.args.map(a=>a.includes('quote-flow-repairs-evidence-20260930')?'$OUT':a)};
}
definitions['engine-regression'].args.push('test/measuredScopes.spec.mjs');
for(const group of ['floor_a','floor_b','stairs','siding','concrete','roof','paint'])definitions['browser-'+group.replaceAll('_','-')]={args:['client/test/measured-scopes-browser.mjs','.','$OUT',group]};
for(const name of process.argv.slice(2)){
 const def=definitions[name];if(!def)throw Error('Unknown check '+name);
 const base='finish-'+name;let label=base,index=2;while(fs.existsSync(path.join(evidence,label+'.log')))label=base+'-'+index++;
 const args=def.args.map(a=>a==='$OUT'?path.join(evidence,label):a);
 console.log(JSON.stringify({starting:label}));
 const run=cp.spawnSync(node,['verification/quotedone/run-resume-check.cjs',label,evidence,...args],{cwd:root,env,windowsHide:true,stdio:'inherit'});
 if(run.status!==(def.expected??0)){process.exitCode=1;break;}
}
