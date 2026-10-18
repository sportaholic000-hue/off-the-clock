import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const base='21f0ccf9ba3cd6859697483745bd4c8152274169',file='server/quote-engine-vnext/templates.js';
const old=execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8'}),current=readFileSync(file,'utf8');
const split=s=>{const a=s.indexOf('function calculateRoofReplacementAdopted('),b=s.indexOf('\nfunction calculateRoofRepair(',a);return [s.slice(0,a),s.slice(a,b),s.slice(b)];};
const a=split(old),b=split(current);assert.equal(a[0],b[0]);assert.equal(a[2],b[2]);
assert.equal((a[1].match(/allowZero:true/g)||[]).length,(b[1].match(/allowZero:true/g)||[]).length);
assert.equal((b[1].match(/p\.additionalLayerRemovalFactor===0\?\{allowZero:true\}/g)||[]).length,2);
assert.equal((b[1].match(/Factors\[band\]===0\?\{allowZero:true\}/g)||[]).length,2);
assert.equal((b[1].match(/exactValue:storyAddition/g)||[]).length,3);assert.equal((b[1].match(/exactValue:complexityAddition/g)||[]).length,1);
assert.doesNotMatch(b[1],/value:story-1|value:complexity-1/);
const changed=execFileSync('git',['diff','--name-only',base],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const allowed=new Set(['server/quote-engine-vnext/templates.js','server/quote-engine-vnext/engine.js','server/src/runtimeConfig.js','test/qeRoofExactSubtraction20261018.spec.mjs','test/qeRoofZeroAdjustments20261018.spec.mjs','test/finalIntegrationMetadata20261017Fixture.mjs','test/quoteReviewFixes.spec.mjs','test/quoteStartingValues20261017.spec.mjs','test/quoteStartingValues20261017.browser.spec.mjs','test/qeAccuracyIntegration20261018.spec.mjs','test/releaseProductionEngineGuard.spec.mjs','test/backupRestoreRehearsal.spec.mjs','test/qeRoofUnderlaymentAccuracy20261018.spec.mjs']);
for(const path of changed)assert.ok(allowed.has(path)||path.startsWith('verification/qe-roof-exact-subtraction-20261018/'),path);
for(const path of ['server/quote-engine-vnext/engine.js','server/src/runtimeConfig.js']){
 const prior=execFileSync('git',['show',base+':'+path],{encoding:'utf8'});
 assert.equal(readFileSync(path,'utf8'),prior.replace('quote-engine-vnext-accuracy-20261018-v9','quote-engine-vnext-accuracy-20261018-v10'));
}
const result={base,legacyAndOtherCalculators:'byte-identical',genericGuards:'byte-identical',zeroOptIns:4,exactStoryDeltas:3,exactShapeDeltas:1,productionVersionEditsOnly:true,files:changed.filter(f=>allowed.has(f))};
writeFileSync(new URL('./scope-check.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
writeFileSync(new URL('./source-hashes.json',import.meta.url),JSON.stringify(Object.fromEntries([...allowed].map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')])),null,2)+'\n');
console.log(JSON.stringify(result));
