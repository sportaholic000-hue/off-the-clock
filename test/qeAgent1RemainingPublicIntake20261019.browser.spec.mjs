import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CASES} from '../verification/qe-agent1-remaining-public-intake-20261019/cases.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('qe-agent1 remaining twelve services use Chromium and real public HTTP',{timeout:600_000},async t=>{
 const temp=mkdtempSync(path.join(tmpdir(),'qe-agent1-remaining-')),out=path.join(temp,'evidence');
 t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const run=spawnSync(process.execPath,[path.join(root,'verification/qe-agent1-remaining-public-intake-20261019/browser-audit.mjs'),root,out],{cwd:root,env:{...process.env},encoding:'utf8',maxBuffer:20*1024*1024,timeout:570_000});
 assert.equal(run.signal,null,run.stderr||run.stdout);assert.ok([0,1].includes(run.status),run.stderr||run.stdout);
 const result=JSON.parse(readFileSync(path.join(out,'result.json'),'utf8'));
 // Preserve source-bound evidence in the ordinary hosted log without changing
 // workflows. Each chunk is bounded; the bundle contains exact JSON bytes and
 // screenshots for failed cases. Successful screenshots stay in direct runs.
 const evidenceRows=JSON.parse(readFileSync(path.join(out,'results.json'),'utf8'));
 const failedImages=new Set(evidenceRows.filter(r=>r.status==='failed').map(r=>r.screenshot));
 const files=Object.fromEntries(readdirSync(out).filter(name=>name.endsWith('.json')||failedImages.has(name)).map(name=>{const encoding=name.endsWith('.json')?'utf8':'base64';return [name,{encoding,content:readFileSync(path.join(out,name)).toString(encoding)}];}));
 const bundle=gzipSync(JSON.stringify(files)).toString('base64'),chunks=bundle.match(/.{1,6000}/g)||[];
 for(let i=0;i<chunks.length;i++)t.diagnostic(`A1_REVIEW_EVIDENCE ${i+1}/${chunks.length} ${chunks[i]}`);
 assert.notEqual(result.status,'fatal',result.error||run.stderr);
 const rows=JSON.parse(readFileSync(path.join(out,'results.json'),'utf8'));
 assert.equal(result.serviceCount,12);assert.equal(rows.length,88);
 for(const type of CASES.map(r=>r.type))assert.equal(rows.filter(r=>r.type===type).length>=7,true,type);
 // Report each independent case, including every failure; one defect does not
 // prevent execution or assertions for the remaining registered services.
 for(const row of rows)await t.test(row.type+' '+row.stage,()=>assert.equal(row.status,'passed',JSON.stringify(row.error)));
 assert.equal(result.failed,0,'See individual failing cases');assert.equal(run.status,0,run.stderr||run.stdout);
});
