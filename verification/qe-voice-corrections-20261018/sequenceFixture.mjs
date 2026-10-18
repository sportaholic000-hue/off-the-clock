import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {harness} from '../../test/voiceLifecycle20261006Fixture.mjs';
import {publish,bridge,date,loadPricebook} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';
import {retainHistoricalStartingValues} from '../../test/historicalStartingValuesFixture.mjs';
import {flooring} from '../engine-independent/fixtures.mjs';

export const expected=Object.freeze({laminate:852,area250:1065,hardwood:1940,narrow:1152,wide:1332,revised200:1068,revised250:1335,secondService:1072});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const privateKeys=new Set(['pricing','scopeRates','laborPerSqft','materialPerSqft','rateCents','unitRate','lineItems','calculation','internalOutcomeJson','originalSubmissionJson','startingValueState','markupPercent','marginPercent','ownerId','serviceId','bookRevision','costCents']);
export function assertPublic(value){
  if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)){
    assert.equal(privateKeys.has(key),false,'Private pricing/internal key in provider-visible result: '+key);
    assertPublic(item);
  }
  assert.doesNotMatch(JSON.stringify(value),/scopeRates\.|laborPerSqft\.|materialPerSqft\./);
}
export function floorFixture({second=false,material=200}={}){
  const f=flooring('laminate',200),p=f.ownerPricing.pricing;
  f.ownerPricing.service=second?'[SYNTHETIC] Orchard installation':'[SYNTHETIC] Harbor flooring';
  delete p.perStepPrice;
  Object.assign(p,{
    laborPerSqft:{laminate:second?200:100,hardwood:300},materialPerSqft:{laminate:material,hardwood:400},
    scopeDetails:{
      floor_underlayment_laminate:{description:'[SYNTHETIC] laminate foam',mode:'installed_area_sell_price'},
      floor_underlayment_hardwood:{description:'[SYNTHETIC] hardwood plywood',mode:'installed_area_sell_price'},
      stairs__narrow:{description:'[SYNTHETIC] narrow complete stair package',mode:'installed',category:'labor',flooringType:'laminate',maximumWidthLF:3,underlaymentIncluded:true,removalIncluded:false,disposalIncluded:false},
      stairs__wide:{description:'[SYNTHETIC] wide complete stair package',mode:'installed',category:'labor',flooringType:'laminate',minimumWidthLF:3,maximumWidthLF:4,underlaymentIncluded:true,removalIncluded:false,disposalIncluded:false}
    },
    scopeRates:{floor_underlayment_laminate:100,floor_underlayment_hardwood:200,stairs__narrow_installed:7500,stairs__wide_installed:12000}
  });
  delete f.customerInputs.confirmedFacts;
  return f;
}
export function publishPair(owner,a,b){
  publish(owner,a);
  const current=bridge.readApplicationBook(owner),service=structuredClone(b.ownerPricing);delete service.origin;
  const converted=bridge.convertApplicationBook({services:[service],defaults:b.businessDefaults},'toDollars').services[0];
  bridge.saveApplicationBook(owner,{...current,services:[...current.services,converted]},date);
  retainHistoricalStartingValues(owner,service);
  for(const id of [a.ownerPricing.id,b.ownerPricing.id])bridge.approveApplicationService(owner,id,{revision:bridge.readApplicationBook(owner).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  assert.ok(bridge.bookStatuses(loadPricebook(owner),date).every(s=>s.status==='QUOTING LIVE'));
}
export {publish,bridge};
export async function sequence(t,{pair=false}={}){
  const directory=mkdtempSync(join(tmpdir(),'qe-voice-corrections-')),filename=join(directory,'synthetic.sqlite');
  const cleanup=[],f=floorFixture(),other=pair?floorFixture({second:true}):null,sessions=[];
  let h;
  t.after(async()=>{try{if(h)assert.deepEqual(h.writes,[],'No provider writes');}finally{try{for(const close of cleanup)await close();}finally{rmSync(directory,{recursive:true,force:true});}}});
  h=await harness({after:fn=>cleanup.push(fn)},{filename,onConnect(input){assertPublic(input.config);sessions.push(input.config);},beforeInstall({db}){
    db.prepare("UPDATE users SET plan='QuoteDone' WHERE id='synthetic-a'").run();
    if(pair)publishPair('synthetic-a',f,other);else publish('synthetic-a',f);
  }});
  let serial=0;
  const rows=()=>h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? ORDER BY rowid').all(h.owner);
  const quotes=()=>h.db.prepare('SELECT * FROM quotes WHERE ownerId=? ORDER BY rowid').all(h.owner);
  function committed(){const reader=new Database(filename,{readonly:true,fileMustExist:true});try{assert.deepEqual(reader.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? ORDER BY rowid').all(h.owner),rows());assert.deepEqual(reader.prepare('SELECT * FROM quotes WHERE ownerId=? ORDER BY rowid').all(h.owner),quotes());}finally{reader.close();}}
  function snapshot(){committed();return {receipts:rows(),quotes:quotes()};}
  function unchanged(saved){committed();assert.deepEqual(rows().slice(0,saved.receipts.length),saved.receipts,'Original receipts immutable');assert.deepEqual(quotes().slice(0,saved.quotes.length),saved.quotes,'Original quote rows immutable');}
  function counts(n){assert.equal(rows().length,n,'Persisted submission count');assert.equal(quotes().length,n,'Persisted quote count');committed();}
  async function tool(c,name,args,id='correction-'+(++serial)){
    // The shared helper retains its response map. Remove the old entry so a
    // repeated ID actually waits for the real dispatcher, not cached test data.
    h.responses.delete(id);
    const result=await h.tool(c.callback,name,args,id);assertPublic(result);
    t.diagnostic(JSON.stringify({tool:name,id,call:c.params.CallSid,status:result.status,low:result.lowEstimate,mid:result.midEstimate,high:result.highEstimate,receiptCount:rows().length,receiptHashes:rows().map(hash),quoteHashes:quotes().map(hash)}));
    return result;
  }
  async function say(c,text){c.callback.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] '+text}}});await new Promise(resolve=>setImmediate(resolve));}
  async function match(c,fixture=f){const m=await tool(c,'matchService',{query:fixture.ownerPricing.service});assert.equal(m.status,'matched');return m.serviceHandle;}
  function args(handle,inputs=f.customerInputs){return {serviceHandle:handle,customerInputs:structuredClone(inputs),customerConfirmed:true};}
  function receiptInputs(index){return JSON.parse(rows()[index].originalSubmissionJson).customerInputs;}
  return {...h,f,other,sessions,tool,say,match,args,rows,quotes,snapshot,unchanged,counts,receiptInputs};
}
export function token(result,field,description){
  assert.equal(result.status,'needs_details');
  const q=result.questionContract?.fields.find(q=>q.field===field);assert.ok(q,'Explicit question '+field);
  assert.ok(q.details?.some(detail=>detail.includes(description)),JSON.stringify(q));
  assert.match(q.confirmationToken,/^[A-Za-z0-9_-]{43}$/);
  return q.confirmationToken;
}
export function confirm(args,field,value){
  return {...structuredClone(args),customerInputs:{...args.customerInputs,[field]:true},scopeConfirmations:{...args.scopeConfirmations,[field]:value}};
}
export function denied(result){
  assert.equal(result.status,'needs_details',JSON.stringify(result));
  for(const key of ['quoteHandle','lowEstimate','midEstimate','highEstimate','options'])assert.equal(result[key],undefined,'Denied request cannot expose '+key);
}
export function amount(result,expectedAmount){
  assert.equal(result.status,'quoted',JSON.stringify(result));
  assert.deepEqual([result.lowEstimate,result.midEstimate,result.highEstimate],[expectedAmount,expectedAmount,expectedAmount]);
  assert.match(result.quoteHandle,/^[A-Za-z0-9_-]{43}$/);assertPublic(result);
}
