import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('..',import.meta.url)),base=join(repo,'verification/quotedone');
const manifest=JSON.parse(readFileSync(join(base,'independent/MANIFEST.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('independent script and decompressed cases retain their original exact bytes',()=>{
 assert.equal(sha(readFileSync(join(base,'independent/precision-regressions.mjs'))),manifest.sha256['precision-regressions.mjs']);
 const data=gunzipSync(readFileSync(join(base,'independent/precision-cases.json.gz')));assert.equal(sha(data),manifest.sha256['precision-cases.json']);assert.equal(JSON.parse(data).length,22);
});
test('original runner still rejects a one-byte fixture change',()=>{
 const dir=mkdtempSync(join(tmpdir(),'otc-precision-negative-'));mkdirSync(join(dir,'independent'));
 writeFileSync(join(dir,'run-precision.mjs'),readFileSync(join(base,'run-precision.mjs')));
 for(const name of ['MANIFEST.json','precision-cases.json.gz','precision-regressions.mjs']){const data=readFileSync(join(base,'independent',name));if(name==='precision-regressions.mjs')data[0]^=1;writeFileSync(join(dir,'independent',name),data);}
 const result=spawnSync(process.execPath,[join(dir,'run-precision.mjs'),repo],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/Original precision asset hash mismatch: precision-regressions.mjs/);assert.doesNotMatch(result.stdout,/Verified original precision assets/);
});
