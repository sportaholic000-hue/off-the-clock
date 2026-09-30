// Source-bound final verification report. Run only after the final checks pass.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.join(__dirname,'engine-finish-20260930'),evidence=path.join(__dirname,'engine-finish-evidence-20260930'),dest=path.join(root,'docs/review/engine-finish-20260930');
const testedCommit=process.argv[2];assert.match(testedCommit||'',/^[a-f0-9]{40}$/);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function hash(file){const fd=fs.openSync(file,'r'),h=crypto.createHash('sha256'),b=Buffer.alloc(65536);try{let n;while(n=fs.readSync(fd,b,0,b.length,null))h.update(b.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}}
const required=['focused','booking-focused','scopes-matrix','production-build','browser-paint','scope-tiers','booking-review','scopes-application','engine-regression','application-regression','pricebook-browser','arithmetic-matrix','whole-request','widget-booking','widget-transport','application-browser','owner-widget','fractional-editor','browser-roof','browser-floor-a','browser-floor-b','browser-stairs','browser-siding','browser-concrete','tax-settings','integration-boundary'];
const all=fs.readdirSync(evidence).filter(n=>n.endsWith('.result.json')).map(n=>read(path.join(evidence,n)));
const selected=required.map(name=>{const re=new RegExp('^finish-'+name+'(?:-(\\d+))?$');const matches=all.filter(r=>re.test(r.label)).sort((a,b)=>Number(re.exec(a.label)[1]||1)-Number(re.exec(b.label)[1]||1));assert.ok(matches.length,'Missing '+name);const r=matches.at(-1);assert.equal(r.status,0,'Latest run failed '+r.label);return {...r,logSha256:hash(path.join(evidence,r.log)),sourceBindingSha256:hash(path.join(evidence,r.label+'.source.json'))};});
const canonical=read(path.join(__dirname,'engine-finish-candidate-manifest.json')).filter(r=>!r.path.startsWith('docs/review/engine-finish-20260930/')&&r.path!=='specs/BUILD_STATUS.md');
for(const row of canonical){const data=fs.readFileSync(path.join(root,row.path));assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+data.length+'\0'),data])).digest('hex'),row.sha,'Manifest stale '+row.path);row.sha256=hash(path.join(root,row.path));}
for(const r of selected){const log=fs.readFileSync(path.join(evidence,r.log),'utf8');r.tapCounts={};for(const key of ['tests','pass','fail','cancelled','skipped','todo']){const hits=[...log.matchAll(new RegExp('^# '+key+' (\\d+)(canonical.map(r=>[r.path,r.sha256]));
const bindings=selected.map(r=>{
 const wrapper=read(path.join(evidence,r.label+'.source.json'));const file=path.join(evidence,r.label,'source-binding.json');const sources=fs.existsSync(file)?read(file).files:wrapper.sourceHashes;
 const differences=Object.entries(sources).filter(([p,h])=>byPath.has(p)&&byPath.get(p)!==h).map(([p])=>p);
 // A later, isolated route fix does not retroactively change an earlier run.
 // Record every difference; final HTTP/browser checks must cover that route.
 assert.ok(differences.every(p=>['server/src/server.js','client/test/measured-scopes-browser.mjs'].includes(p)),r.label+' unexpected source changes '+differences.join(','));
 return {label:r.label,binding:file.replaceAll('\\','/'),differencesFromFinalSource:differences};
});
const assets=[];function scan(dir,rel,target){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=rel?rel+'/'+entry.name:entry.name,p=path.join(dir,entry.name);if(entry.isDirectory())scan(p,name,target);else if(entry.isFile())target.push({path:name,bytes:fs.statSync(p).size,sha256:hash(p)});}}
scan(path.join(root,'client/dist'),'client/dist',assets);
const inventory=[];scan(evidence,'',inventory);
fs.mkdirSync(dest,{recursive:true});
const write=(name,data)=>fs.writeFileSync(path.join(dest,name),JSON.stringify(data,null,2)+'\n');
write('FINAL_TEST_RESULTS.json',{testedCommit,results:selected,countsOverlap:true});
write('FINAL_SOURCE_BINDING.json',{testedCommit,note:'Evidence is bound by file hashes. Any earlier run differences are explicit; historical wrapper base fields are not this tested commit.',canonical,bindings,builtAssets:assets});
write('EVIDENCE_INDEX.json',{rawEvidenceLocation:evidence,rawEvidenceUploaded:false,note:'Local synthetic HTTP responses, SQLite records, screenshots and original failures. GitHub contains source, reproducers and sanitized reports; no claim that raw archives are uploaded.',files:inventory});
function latest(name){return selected.find(r=>new RegExp('^finish-'+name+'(?:-\\d+)?$').test(r.label));}
for(const [name,out]of [['booking-review','BOOKING_AFTER.json'],['tax-settings','TAX_AFTER.json']]){
 const dir=path.join(evidence,latest(name).label),file=['summary.json','report.json','REVIEW_RESULTS.json'].map(n=>path.join(dir,n)).find(fs.existsSync);assert.ok(file,name+' summary');write(out,read(file));
}
for(const [name,out]of [['finish-booking-before','BOOKING_BEFORE.json'],['finish-tax-before','TAX_HTTP_BEFORE.json'],['finish-tax-before-browser','TAX_BROWSER_BEFORE.json']]){
 const dir=path.join(evidence,name),file=['summary.json','report.json','REVIEW_RESULTS.json'].map(n=>path.join(dir,n)).find(fs.existsSync);assert.ok(file,name+' summary');write(out,read(file));
}
const afterClaim=read(path.join(evidence,'finish-booking-after-claim/REVIEW_RESULTS.json'));assert.equal(afterClaim.failed,1);assert.ok(afterClaim.results.some(r=>r.name==='crash-after-write-marker-before-request'&&!r.passed));write('BOOKING_OPEN_AFTER_CLAIM.json',afterClaim);
const appRows=read(path.join(evidence,latest('scopes-application').label,'results.json'));
write('APPLICATION_RESULTS.json',{testedCommit,rows:appRows.map(row=>({id:row.id,channel:row.channel,httpStatus:row.response.status,resultType:row.response.result.resultType,midEstimate:row.response.result.midEstimate,originalSubmissionRetained:row.receipt?JSON.stringify(JSON.parse(row.receipt.originalSubmissionJson))===JSON.stringify(row.submission):null}))});
const readme=`# Quote engine completion repairs — September 30, 2026

Verified application source: \`${testedCommit}\`. The later report-only commit contains these reports; its exact SHA is on draft PR #3. File hashes and any earlier-run differences are in [FINAL_SOURCE_BINDING.json](FINAL_SOURCE_BINDING.json). This is completion of the reproduced quoting defects described below, not approval to launch the entire product or a claim that finite tests prove universal 100% accuracy.

Open launch blocker: a crash after the calendar-write marker but before the request is sent can leave confirmation pending and the slot blocked. The separate final-source reproduction is in [BOOKING_OPEN_AFTER_CLAIM.json](BOOKING_OPEN_AFTER_CLAIM.json). This was not fixed by the earlier PREPARING-state repair.

## Repaired and verified

- Fixed custom services, fractional unit charges, configured ranges, fencing and painting offerings remain quotable from the owner's saved prices. The previous fixes are covered by the full regression.
- Added explicit owner configuration and measured customer inputs for flooring underlayment; installed or itemized stairs; laying flooring over an existing floor; siding removal and trim; existing-concrete demolition and exposed aggregate; roof-underlayment purchases; commercial flat-roof insulation and cover board; and finish paint, primer, preparation, ceilings and installed trim. Missing facts are requested; complete supported requests return prices.
- Package quantities use exact arithmetic, aggregate matching product usage before rounding to whole purchases, and reject conflicting descriptions of the same product. Installed selling prices are not marked up twice. Itemized labor/material/disposal classifications retain owner tax and markup rules. Measured partial areas must agree exactly with any supplied percentage.
- Owner configuration saves, reloads, approves and previews. The normal form and embedded widget use the same saved definitions. Corrected roofing map controls, duplicate ceiling-primer fields and missing scope overrides in Good/Better/Best tiers. Unit-rate overrides retain fractional cents; purchase amounts reject fractional cents.
- Booking now prevents multiple active appointments for one quote intent, including competing holds/new request keys. A restart before a provider-write claim releases an interrupted preparation; the abandoned original handler cannot write afterward. Exact idempotent replay, pending-provider handling and strict provider confirmation checks remain intact.
- Onboarding now validates and honors explicit owner tax settings even when the location has a preset. Presets still work when no explicit settings are submitted. Invalid settings reject without changing the saved book; a second tenant remains unchanged. The lookup table and tax formulas were not changed.

## Findings that did not justify product changes

- Legacy scalar scope prices already have explicit review-only guidance; they were not silently advertised as complete offerings.
- The full engine regression's one old failure asserted superseded help text. It now checks that incomplete legacy pricing is clearly identified and both configured offering modes remain available. Pricing expectations were unchanged.
- The older controlled-transport editor tests omitted the current customer metadata. Their fixtures now include that metadata; their decimal/save/reopen/response-ordering assertions remain. This test fixture is not represented as real authenticated HTTP coverage.
- An initial painting browser run failed with a connection reset during synthetic login. The unchanged-source retry passed; its initial failure is retained, with cause unproven.

## Verification and evidence

[FINAL_TEST_RESULTS.json](FINAL_TEST_RESULTS.json) records exact commands, outcomes and log hashes. Counts overlap across focused and broad suites. Real workflow tests retain complete requests/responses, original submissions, SQLite records and screenshots in the local evidence directory indexed by [EVIDENCE_INDEX.json](EVIDENCE_INDEX.json). Source and reproducible tests are on GitHub. Raw databases, tokens and the earlier restricted audit archive were not uploaded; their presence on this computer is not a GitHub backup.

Independent expected amounts are in \`test/measuredScopeFixtures.mjs\`, \`verification/engine-independent/measured-scopes-arithmetic.mjs\` and \`verification/engine-independent/owner-tax-settings.mjs\`. [APPLICATION_RESULTS.json](APPLICATION_RESULTS.json) provides the compact HTTP outcome matrix. The tax probes use synthetic owner choices to test input fidelity; they are not tax-rate advice.

Original failures, including failed harness attempts, remain indexed. Booking before/after reports and tax before/after reports are included alongside this document. Reproduce the tax defect using the server from \`3dd3b1a084df2c6739ba65547876d034bbfa004f\` with the final tax verifier. Reproduce the two booking defects using \`e2ccbda447425c4a46426f218332ef64e8c93d8a\` with the final booking verifier. Use new isolated synthetic data directories, never production data.

## Remaining product and launch boundaries

- No known reproduced quote defect listed above is left open. Independent review can still discover cases outside this evidence; no universal accuracy percentage is asserted.
- Voice runtime/telephony and ON/OFF work were not implemented here. The original voice guide is unchanged. Other agents' email-delivery work and later branches are not certified by this report.
- Real provider credentials, calendar account behavior, message/email delivery, billing and production deployment require their separate launch verification. Calendar evidence here uses a synthetic provider with real application HTTP, auth and SQLite.
- If the process dies after claiming a provider write, its outcome can be ambiguous. The system keeps that booking pending until an exact confirmed provider event can be established; it does not fabricate confirmation or release a potentially booked slot.
- The current GitHub workflow only triggers on its configured historical branch. No green GitHub Actions run for this repair branch was observed. Local source-bound verification is identified as such.
- No merge, deployment, live-data mutation, voice implementation, dependency upgrade or environment-permission expansion was performed. PR #3 remains draft; the full public-launch gate remains open.

## Reproduction

Use Node 22.23.2 and the repository's locked dependencies. The real application harness rejects a different Node ABI. Set \`PRICEBOOK_BROWSER_MODULE\` and \`PRICEBOOK_BROWSER_EXECUTABLE\` to an installed Playwright module and browser, plus the installed esbuild binary when required. Build the website/widget using the exact build command in FINAL_TEST_RESULTS, then run each listed command from the repository root with a fresh evidence directory outside the repository. The wrapper \`verification/quotedone/run-resume-check.cjs\` isolates environment, credentials, database and price-book paths and disables live provider writes. Calendar verifiers explicitly intercept provider traffic with synthetic fixtures.
`;
fs.writeFileSync(path.join(dest,'README.md'),readme);
console.log(JSON.stringify({testedCommit,results:selected.length,canonical:canonical.length,evidenceFiles:inventory.length,report:dest}));
,'gm'))];if(hits.length)r.tapCounts[key]=Number(hits.at(-1)[1]);}}
const byPath=new Map(canonical.map(r=>[r.path,r.sha256]));
const bindings=selected.map(r=>{
 const wrapper=read(path.join(evidence,r.label+'.source.json'));const file=path.join(evidence,r.label,'source-binding.json');const sources=fs.existsSync(file)?read(file).files:wrapper.sourceHashes;
 const differences=Object.entries(sources).filter(([p,h])=>byPath.has(p)&&byPath.get(p)!==h).map(([p])=>p);
 // A later, isolated route fix does not retroactively change an earlier run.
 // Record every difference; final HTTP/browser checks must cover that route.
 assert.ok(differences.every(p=>['server/src/server.js','client/test/measured-scopes-browser.mjs'].includes(p)),r.label+' unexpected source changes '+differences.join(','));
 return {label:r.label,binding:file.replaceAll('\\','/'),differencesFromFinalSource:differences};
});
const assets=[];function scan(dir,rel,target){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const name=rel?rel+'/'+entry.name:entry.name,p=path.join(dir,entry.name);if(entry.isDirectory())scan(p,name,target);else if(entry.isFile())target.push({path:name,bytes:fs.statSync(p).size,sha256:hash(p)});}}
scan(path.join(root,'client/dist'),'client/dist',assets);
const inventory=[];scan(evidence,'',inventory);
fs.mkdirSync(dest,{recursive:true});
const write=(name,data)=>fs.writeFileSync(path.join(dest,name),JSON.stringify(data,null,2)+'\n');
write('FINAL_TEST_RESULTS.json',{testedCommit,results:selected,countsOverlap:true});
write('FINAL_SOURCE_BINDING.json',{testedCommit,note:'Evidence is bound by file hashes. Any earlier run differences are explicit; historical wrapper base fields are not this tested commit.',canonical,bindings,builtAssets:assets});
write('EVIDENCE_INDEX.json',{rawEvidenceLocation:evidence,rawEvidenceUploaded:false,note:'Local synthetic HTTP responses, SQLite records, screenshots and original failures. GitHub contains source, reproducers and sanitized reports; no claim that raw archives are uploaded.',files:inventory});
function latest(name){return selected.find(r=>new RegExp('^finish-'+name+'(?:-\\d+)?$').test(r.label));}
for(const [name,out]of [['booking-review','BOOKING_AFTER.json'],['tax-settings','TAX_AFTER.json']]){
 const dir=path.join(evidence,latest(name).label),file=['summary.json','report.json','REVIEW_RESULTS.json'].map(n=>path.join(dir,n)).find(fs.existsSync);assert.ok(file,name+' summary');write(out,read(file));
}
for(const [name,out]of [['finish-booking-before','BOOKING_BEFORE.json'],['finish-tax-before','TAX_HTTP_BEFORE.json'],['finish-tax-before-browser','TAX_BROWSER_BEFORE.json']]){
 const dir=path.join(evidence,name),file=['summary.json','report.json','REVIEW_RESULTS.json'].map(n=>path.join(dir,n)).find(fs.existsSync);assert.ok(file,name+' summary');write(out,read(file));
}
const appRows=read(path.join(evidence,latest('scopes-application').label,'results.json'));
write('APPLICATION_RESULTS.json',{testedCommit,rows:appRows.map(row=>({id:row.id,channel:row.channel,httpStatus:row.response.status,resultType:row.response.result.resultType,midEstimate:row.response.result.midEstimate,originalSubmissionRetained:row.receipt?JSON.stringify(JSON.parse(row.receipt.originalSubmissionJson))===JSON.stringify(row.submission):null}))});
const readme=`# Quote engine completion repairs — September 30, 2026

Verified application source: \`${testedCommit}\`. The later report-only commit contains these reports; its exact SHA is on draft PR #3. File hashes and any earlier-run differences are in [FINAL_SOURCE_BINDING.json](FINAL_SOURCE_BINDING.json). This is completion of the reproduced quoting defects described below, not approval to launch the entire product or a claim that finite tests prove universal 100% accuracy.

## Repaired and verified

- Fixed custom services, fractional unit charges, configured ranges, fencing and painting offerings remain quotable from the owner's saved prices. The previous fixes are covered by the full regression.
- Added explicit owner configuration and measured customer inputs for flooring underlayment; installed or itemized stairs; laying flooring over an existing floor; siding removal and trim; existing-concrete demolition and exposed aggregate; roof-underlayment purchases; commercial flat-roof insulation and cover board; and finish paint, primer, preparation, ceilings and installed trim. Missing facts are requested; complete supported requests return prices.
- Package quantities use exact arithmetic, aggregate matching product usage before rounding to whole purchases, and reject conflicting descriptions of the same product. Installed selling prices are not marked up twice. Itemized labor/material/disposal classifications retain owner tax and markup rules. Measured partial areas must agree exactly with any supplied percentage.
- Owner configuration saves, reloads, approves and previews. The normal form and embedded widget use the same saved definitions. Corrected roofing map controls, duplicate ceiling-primer fields and missing scope overrides in Good/Better/Best tiers. Unit-rate overrides retain fractional cents; purchase amounts reject fractional cents.
- Booking now prevents multiple active appointments for one quote intent, including competing holds/new request keys. A restart before a provider-write claim releases an interrupted preparation; the abandoned original handler cannot write afterward. Exact idempotent replay, pending-provider handling and strict provider confirmation checks remain intact.
- Onboarding now validates and honors explicit owner tax settings even when the location has a preset. Presets still work when no explicit settings are submitted. Invalid settings reject without changing the saved book; a second tenant remains unchanged. The lookup table and tax formulas were not changed.

## Findings that did not justify product changes

- Legacy scalar scope prices already have explicit review-only guidance; they were not silently advertised as complete offerings.
- The full engine regression's one old failure asserted superseded help text. It now checks that incomplete legacy pricing is clearly identified and both configured offering modes remain available. Pricing expectations were unchanged.
- The older controlled-transport editor tests omitted the current customer metadata. Their fixtures now include that metadata; their decimal/save/reopen/response-ordering assertions remain. This test fixture is not represented as real authenticated HTTP coverage.
- An initial painting browser run failed with a connection reset during synthetic login. The unchanged-source retry passed; its initial failure is retained, with cause unproven.

## Verification and evidence

[FINAL_TEST_RESULTS.json](FINAL_TEST_RESULTS.json) records exact commands, outcomes and log hashes. Counts overlap across focused and broad suites. Real workflow tests retain complete requests/responses, original submissions, SQLite records and screenshots in the local evidence directory indexed by [EVIDENCE_INDEX.json](EVIDENCE_INDEX.json). Source and reproducible tests are on GitHub. Raw databases, tokens and the earlier restricted audit archive were not uploaded; their presence on this computer is not a GitHub backup.

Independent expected amounts are in \`test/measuredScopeFixtures.mjs\`, \`verification/engine-independent/measured-scopes-arithmetic.mjs\` and \`verification/engine-independent/owner-tax-settings.mjs\`. [APPLICATION_RESULTS.json](APPLICATION_RESULTS.json) provides the compact HTTP outcome matrix. The tax probes use synthetic owner choices to test input fidelity; they are not tax-rate advice.

Original failures, including failed harness attempts, remain indexed. Booking before/after reports and tax before/after reports are included alongside this document. Reproduce the tax defect using the server from \`3dd3b1a084df2c6739ba65547876d034bbfa004f\` with the final tax verifier. Reproduce the two booking defects using \`e2ccbda447425c4a46426f218332ef64e8c93d8a\` with the final booking verifier. Use new isolated synthetic data directories, never production data.

## Remaining product and launch boundaries

- No known reproduced quote defect listed above is left open. Independent review can still discover cases outside this evidence; no universal accuracy percentage is asserted.
- Voice runtime/telephony and ON/OFF work were not implemented here. The original voice guide is unchanged. Other agents' email-delivery work and later branches are not certified by this report.
- Real provider credentials, calendar account behavior, message/email delivery, billing and production deployment require their separate launch verification. Calendar evidence here uses a synthetic provider with real application HTTP, auth and SQLite.
- If the process dies after claiming a provider write, its outcome can be ambiguous. The system keeps that booking pending until an exact confirmed provider event can be established; it does not fabricate confirmation or release a potentially booked slot.
- The current GitHub workflow only triggers on its configured historical branch. No green GitHub Actions run for this repair branch was observed. Local source-bound verification is identified as such.
- No merge, deployment, live-data mutation, voice implementation, dependency upgrade or environment-permission expansion was performed. PR #3 remains draft; the full public-launch gate remains open.

## Reproduction

Use Node 22.23.2 and the repository's locked dependencies. The real application harness rejects a different Node ABI. Set \`PRICEBOOK_BROWSER_MODULE\` and \`PRICEBOOK_BROWSER_EXECUTABLE\` to an installed Playwright module and browser, plus the installed esbuild binary when required. Build the website/widget using the exact build command in FINAL_TEST_RESULTS, then run each listed command from the repository root with a fresh evidence directory outside the repository. The wrapper \`verification/quotedone/run-resume-check.cjs\` isolates environment, credentials, database and price-book paths and disables live provider writes. Calendar verifiers explicitly intercept provider traffic with synthetic fixtures.
`;
fs.writeFileSync(path.join(dest,'README.md'),readme);
console.log(JSON.stringify({testedCommit,results:selected.length,canonical:canonical.length,evidenceFiles:inventory.length,report:dest}));
