import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';

const root=path.resolve('.'),out=path.resolve(process.env.RUNNER_TEMP||'..','otc-ci-evidence'),portable=path.join(root,'.portable-runtime','node-v22.23.2-win-x64','node.exe');
if(process.version!=='v22.23.2'||process.versions.modules!=='127')throw Error('Use Node 22.23.2 ABI 127.');
if(fs.existsSync(out))throw Error('Use fresh CI evidence.');
fs.mkdirSync(path.dirname(portable),{recursive:true});
// The historical fixture path is portable; on Linux it contains the same Node ELF executable.
if(fs.realpathSync(process.execPath)!==portable){fs.copyFileSync(process.execPath,portable);fs.chmodSync(portable,0o755);}
const browserModule=process.env.OTC_CI_BROWSER_MODULE;
if(!browserModule||!path.isAbsolute(browserModule))throw Error('Isolated browser runtime required.');
const require=createRequire(path.join(root,'package.json')),{chromium}=require(browserModule);
const env={...process.env,PRICEBOOK_BROWSER_MODULE:browserModule,PRICEBOOK_BROWSER_EXECUTABLE:chromium.executablePath()};
const groups=[
 ['build',['verification/quotedone/build-resume-client.mjs']],
 ['application',["--experimental-test-module-mocks","--test","--test-concurrency=1","test/applicationPersistence.spec.mjs","test/authTokenService.spec.mjs","test/billingConfig.spec.mjs","test/billingRoutes.spec.mjs","test/billingStateService.spec.mjs","test/bookingAdminRoutes.spec.mjs","test/bookingAdminService.spec.mjs","test/bookingCapabilities.spec.mjs","test/bookingPreferenceService.spec.mjs","test/bookingRoutes.spec.mjs","test/bookingService.spec.mjs","test/bookingTokenReceipt.spec.mjs","test/calendarCredentials.spec.mjs","test/calendarOAuthState.spec.mjs","test/corsPolicy.spec.mjs","test/googleCalendarAdapter.spec.mjs","test/onboardingCalendar.spec.mjs","test/onboardingServiceArea.spec.mjs","test/phase2.spec.js","test/phase2Terminology.spec.js","test/planAccess.spec.mjs","test/platformSchema.spec.mjs","test/precisionFixtureIntegrity.spec.mjs","test/priceBookIntegrity.spec.js","test/pricebookPersistence.spec.mjs","test/providerCredentials.spec.mjs","test/quoteApplicationBoundary.spec.mjs","test/quoteOriginStorage.spec.mjs","test/runtimeConfig.spec.mjs","test/serviceArea.spec.mjs","test/tenantAddon.spec.js","test/calendarForm.spec.mjs","test/ownerCalendarService.spec.mjs","test/accountEmail.spec.mjs","test/authSessionService.spec.mjs","test/authSessionHttp.spec.mjs","test/authSessionClient.spec.mjs"]],
 ['engine',['--experimental-test-module-mocks','--test','--test-concurrency=1','test/quoteEngine.spec.js','test/quoteEngineVNext.spec.js','test/quoteEngineVNextAdversarial.spec.js','test/quoteEngineVNextRepairs.spec.js','test/configuredOfferings.spec.mjs']],
 ['transport',['--test','--test-concurrency=1','test/authSessionClient.spec.mjs','client/test/widget-transport.test.mjs','client/test/billing-transport.test.mjs']],
 ['session-browser',['verification/session-security/browser-workflow.mjs','.',path.join(out,'session-browser')]],
 ['same-second-session-browser',['verification/session-security/browser-workflow.mjs','.',path.join(out,'same-second-session-browser'),'same-second']],
 ['account-browser',['verification/auth-email/browser-workflow.mjs','.',path.join(out,'account-browser')]],
 ['response-order-browser',['verification/session-security/response-order-browser.mjs','.',path.join(out,'response-order-browser'),process.env.OTC_CI_SOURCE_SHA||'CI checkout']]
];
let failed=false;
try {
 for(const[label,args]of groups){
  const r=spawnSync(portable,['verification/quotedone/run-resume-check.cjs',label,out,...args],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:660000,maxBuffer:2*1024*1024});
  const resultFile=path.join(out,label+'.result.json');
  const summary=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):{label,status:r.status,signal:r.signal,error:r.error?.code||null};
  console.log(JSON.stringify({label,status:summary.status,signal:summary.signal}));
  if(r.status!==0||r.error){failed=true;break;}
 }
} finally {
 const safe=path.join(out,'sanitized');fs.mkdirSync(safe,{recursive:true});
 const results=[];
 for(const filename of fs.readdirSync(out)){
  if(!filename.endsWith('.result.json'))continue;
  const result=JSON.parse(fs.readFileSync(path.join(out,filename),'utf8')),logFile=path.join(out,result.label+'.log');
  const log=fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8'):'';
  const counters=Object.fromEntries([...log.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map(m=>[m[1],Number(m[2])]));
  const named=log.split(/\r?\n/).filter(line=>/^(ok \d|not ok \d|# (tests|pass|fail|cancelled|skipped|todo) |PASS )/.test(line)).join('\n');
  fs.writeFileSync(path.join(safe,result.label+'.txt'),named);
  results.push({...result,counters,logSha256:crypto.createHash('sha256').update(log).digest('hex')});
 }
 const browserResults={};
 for(const label of ['session-browser','same-second-session-browser','account-browser','response-order-browser']){
  const file=path.join(out,label,'browser-results.json');if(!fs.existsSync(file))continue;
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  browserResults[label]={syntheticOnly:data.syntheticOnly,liveProviderTraffic:data.liveProviderTraffic,rows:data.rows,errors:data.errors};
 }
 const summary={sourceCommit:process.env.OTC_CI_SOURCE_SHA,platform:process.platform,version:process.version,playwrightVersion:require(path.join(browserModule,'package.json')).version,liveProviderTraffic:false,results,browserResults};
 fs.writeFileSync(path.join(safe,'results.json'),JSON.stringify(summary,null,2));
 console.log('OTC_SAFE_RESULT '+JSON.stringify(summary));
 // Private cookies, mail payloads and SQLite stores are intentionally excluded.
}
process.exitCode=failed?1:0;
