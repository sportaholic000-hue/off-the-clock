import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=mkdtempSync(join(tmpdir(),'otc-book-failure-'));
process.env.PRICEBOOK_PATH=root;
const {savePricebook,loadPricebook}=await import('../server/priceBookService.js');
const ownerId='synthetic-atomic-owner';
const original={services:[{id:'94c7912f-54b4-4e97-abd6-476eb2661b82',serviceType:'LANDSCAPING_MOWING',source:'MANUAL',active:false,pricing:{mowingBaseRatePerSqft:0.5,minimumServiceCharge:20001}}],defaults:{markupPercent:1200}};
const saved=savePricebook(ownerId,original).pricebook;
const file=join(root,ownerId+'.json'),before=readFileSync(file,'utf8');
test('a partial operating-system write failure leaves the previous price book intact',()=>{
 const write=fs.writeFileSync;let injected=false;
 fs.writeFileSync=function(target,data,...args){if(!injected && String(target).includes(root)){injected=true;write(target,String(data).slice(0,23),...args);const error=new Error('Synthetic disk write failure');error.code='EIO';throw error;}return write(target,data,...args);};syncBuiltinESMExports();
 try{assert.throws(()=>savePricebook(ownerId,{...original,defaults:{markupPercent:30}}),/Synthetic disk write failure/);assert.equal(injected,true);assert.equal(readFileSync(file,'utf8'),before);assert.deepEqual(loadPricebook(ownerId),saved);}
 finally{fs.writeFileSync=write;syncBuiltinESMExports();}
});
test('a corrected save reloads complete exact values and disabled intent',()=>{
 const next={...original,defaults:{markupPercent:99.9,markupMode:'margin'}};
 const result=savePricebook(ownerId,next);assert.equal(result.success,true);const loaded=loadPricebook(ownerId);assert.deepEqual(loaded,result.pricebook);assert.deepEqual(loaded.services,original.services);assert.deepEqual(loaded.defaults,next.defaults);assert.equal(fs.readdirSync(root).length,1);
});

test('a failed replacement preserves the accepted file and removes only its own temporary file',()=>{
 const old=readFileSync(file,'utf8');const rename=fs.renameSync;let injected=false;
 fs.renameSync=function(){injected=true;const error=new Error('Synthetic rename failure');error.code='EACCES';throw error;};syncBuiltinESMExports();
 try{assert.throws(()=>savePricebook(ownerId,{...original,defaults:{markupPercent:0}}),/Synthetic rename failure/);assert.equal(injected,true);assert.equal(readFileSync(file,'utf8'),old);assert.deepEqual(fs.readdirSync(root),[ownerId+'.json']);}
 finally{fs.renameSync=rename;syncBuiltinESMExports();}
});
test('serialization failure cannot disturb existing owner data',()=>{
 const old=readFileSync(file,'utf8');const invalid={...original};invalid.loop=invalid;
 assert.throws(()=>savePricebook(ownerId,invalid),/circular/i);assert.equal(readFileSync(file,'utf8'),old);assert.deepEqual(fs.readdirSync(root),[ownerId+'.json']);
});
