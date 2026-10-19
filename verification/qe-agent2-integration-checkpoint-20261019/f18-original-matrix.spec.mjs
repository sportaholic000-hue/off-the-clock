import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {customerReceiptPresentation,ADDITIONAL_WORK_NOTICE,SELECTED_WORK_NOTICE} from '../../server/src/quoteScopeDisclosure.js';
import {projectVoiceQuote,projectSavedQuoteContext} from '../../server/src/voice/voiceQuotePresentation.js';

// Projection-only synthetic receipts; expectations are in EXPECTED.md.
const folder=new URL('./',import.meta.url);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>structuredClone(value);
const digest=value=>createHash('sha256').update(value).digest('hex');
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const base=(skippedAddons=['Door sides'])=>({tierName:'Base',lowEstimate:1000.01,midEstimate:1064.02,highEstimate:1100.03,currency:'CAD',taxTreatment:'No tax added',priceUnit:'per job',skippedAddons,disclaimer:'[PLACEHOLDER] Base written scope. '+(skippedAddons.length?'Not included: '+skippedAddons.join('; ')+'.':'All selected extras included.'),rangeBufferUsed:17});
const complete=(skippedAddons=[])=>({tierName:'Complete',lowEstimate:1100.04,midEstimate:1164.05,highEstimate:1200.06,currency:'CAD',taxTreatment:'No tax added',priceUnit:'per job',skippedAddons,disclaimer:'[PLACEHOLDER] Complete written scope. '+(skippedAddons.length?'Not included: '+skippedAddons.join('; ')+'.':'All selected extras included.'),rangeBufferUsed:19});
const generated=description=>({source:'unpriced_surface_work',description});
const genuine={source:'additionalWork[0]',description:'[PLACEHOLDER] Repair the detached fence.'};
const sameLabel={source:'additionalWork[0]',description:'Door sides'};
function estimate(options){
  const first=(Array.isArray(options)?options.find(option=>record(option)&&typeof option.lowEstimate==='number'&&typeof option.highEstimate==='number'&&option.lowEstimate<=option.highEstimate):null)||base();
  return {resultType:'INSTANT_ESTIMATE_READY',quoteId:'[PLACEHOLDER]-f18',...Object.fromEntries(['lowEstimate','midEstimate','highEstimate','currency','taxTreatment','priceUnit','skippedAddons'].map(key=>[key,clone(first[key])])),...(options===undefined?{}:{options:clone(options)}),priceDrivers:['[PLACEHOLDER] Painted area'],disclaimer:'[PLACEHOLDER] Preliminary selected-service estimate.',rangeBufferUsed:17,jobSummary:{bookRevision:'PRIVATE_JOB_BOOK_REVISION'}};
}
const scope=()=>({pricedScope:{service:'[PLACEHOLDER] Painting',facts:[{label:'Requested door sides',value:2}],fees:[],serviceId:'PRIVATE_SCOPE_SERVICE_ID',serviceType:'PRIVATE_SCOPE_SERVICE_TYPE',bookRevision:'PRIVATE_SCOPE_BOOK_REVISION'},scopeNotice:SELECTED_WORK_NOTICE,submittedDetails:{requestedWork:'[PLACEHOLDER] Paint the selected room.'},fullJobTotal:null});
function historical(options,additionalWork=[generated('Door sides')]){return {resultType:'PARTIAL_ESTIMATE_READY',quoteId:'[PLACEHOLDER]-f18',pricedEstimate:estimate(options),...scope(),additionalWork:clone(additionalWork),additionalWorkStatus:'ON_SITE_ESTIMATE_REQUIRED',customerMessage:ADDITIONAL_WORK_NOTICE};}
const cases=[];
function add(id,receipt,resultType,work,policy={}){cases.push({id,receipt,expected:{resultType,work,...policy}});}
add('single-excluded',historical([base()]),'PARTIAL_ESTIMATE_READY',[generated('Door sides')]);
add('single-included',historical([base([])]),'INSTANT_ESTIMATE_READY',[]);
add('mixed-options',historical([base(),complete()]),'INSTANT_ESTIMATE_READY',[]);
add('shared-intersection',historical([base(['Door sides','Windows']),complete(['Door sides'])],[generated('Door sides'),generated('Windows')]),'PARTIAL_ESTIMATE_READY',[generated('Door sides')]);
add('shared-every-option',historical([base(['Door sides','Windows']),complete(['Windows','Door sides'])],[generated('Door sides'),generated('Windows')]),'PARTIAL_ESTIMATE_READY',[generated('Door sides'),generated('Windows')]);
add('genuine-mixed',historical([base(),complete()],[generated('Door sides'),genuine]),'PARTIAL_ESTIMATE_READY',[genuine]);
add('genuine-same-label',historical([base(),complete()],[generated('Door sides'),sameLabel]),'PARTIAL_ESTIMATE_READY',[sameLabel]);
add('genuine-and-shared',historical([base(),complete(['Door sides'])],[generated('Door sides'),genuine]),'PARTIAL_ESTIMATE_READY',[genuine,generated('Door sides')]);
add('single-without-options',historical(undefined),'PARTIAL_ESTIMATE_READY',[generated('Door sides')]);
add('already-ready-mixed',{...estimate([base(),complete()]),...scope()},'INSTANT_ESTIMATE_READY',[]);
add('malformed-before-single',historical([null,'invalid',base()]),'PARTIAL_ESTIMATE_READY',[generated('Door sides')],{liveMayReject:true});
add('malformed-after-single',historical([base(),false,0,[]]),'PARTIAL_ESTIMATE_READY',[generated('Door sides')],{liveMayReject:true});
add('malformed-with-two-shared',historical([base(),null,complete(['Door sides'])]),'PARTIAL_ESTIMATE_READY',[generated('Door sides')],{liveMayReject:true});
add('malformed-mixed-genuine',historical([null,base(),complete()],[generated('Door sides'),genuine]),'PARTIAL_ESTIMATE_READY',[genuine],{liveMayReject:true});
add('malformed-empty-object',historical([{},base()]),'PARTIAL_ESTIMATE_READY',[generated('Door sides')],{liveMayReject:true,savedMayReject:true});
add('malformed-reversed-range',historical([base(),{...complete([]),lowEstimate:300,midEstimate:250,highEstimate:200}]),'PARTIAL_ESTIMATE_READY',[generated('Door sides')],{liveMayReject:true,savedMayReject:true});
add('malformed-all-options',historical([null,'invalid',false]),'PARTIAL_ESTIMATE_READY',[generated('Door sides')],{liveMayReject:true,savedMayReject:true,noValidOptions:true});
add('malformed-options-container',historical({wrong:'[PLACEHOLDER] invalid container'}),'PARTIAL_ESTIMATE_READY',[generated('Door sides')],{liveMustReject:true,savedMustReject:true});

const databasePath=fileURLToPath(new URL('receipts.sqlite',folder));
const seed=new DatabaseSync(databasePath);
seed.exec('CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, customerResponseJson TEXT NOT NULL); DELETE FROM receipts;');
const insert=seed.prepare('INSERT INTO receipts(id,customerResponseJson) VALUES(?,?)');
for(const item of cases)insert.run(item.id,JSON.stringify(item.receipt));
seed.close();
const storedBytes=readFileSync(databasePath),storedHash=digest(storedBytes);
const database=new DatabaseSync(databasePath,{readOnly:true});
const stored=id=>database.prepare('SELECT customerResponseJson FROM receipts WHERE id=?').get(id).customerResponseJson;
const projections={customerReceiptPresentation,projectVoiceQuote:value=>projectVoiceQuote(value,'placeholder-f18-quote-handle-123456'),projectSavedQuoteContext};
const invoke=(fn,input)=>{try{return {kind:'returned',value:fn(input)};}catch(error){return {kind:'rejected',name:error.name,message:error.message};}};
const amountKeys=['lowEstimate','midEstimate','highEstimate'];
const contextKeys=['currency','taxTreatment','priceUnit'];
const validOption=option=>record(option)&&[option.lowEstimate,option.highEstimate].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)&&option.lowEstimate<=option.highEstimate;
const pricePart=value=>value.resultType==='PARTIAL_ESTIMATE_READY'&&value.pricedEstimate?value.pricedEstimate:value;
const internalKeys=new Set(['rangeBufferUsed','serviceId','serviceType','bookRevision']);
function assertNoInternal(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){assert.equal(internalKeys.has(key),false,'internal key '+key);assertNoInternal(child);}}
function assertAmounts(output,receipt,projector){
  const source=receipt.pricedEstimate||receipt,target=projector==='customerReceiptPresentation'?pricePart(output):output;
  for(const key of [...amountKeys,...contextKeys])assert.equal(target[key],source[key],key+' changed');
  if(projector==='customerReceiptPresentation'){
    const expected=clone(source.options);if(Array.isArray(expected))for(const option of expected)if(record(option))delete option.rangeBufferUsed;
    assert.deepEqual(target.options,expected,'customer clone changed historical options beyond private metadata');
  }else if(Array.isArray(source.options)){
    const expected=source.options.filter(validOption);
    assert.equal(target.options?.length,expected.length,'voice must retain valid options without publishing malformed options');
    for(let i=0;i<expected.length;i++){
      const before=expected[i],after=target.options[i];
      for(const key of [...amountKeys,'tierName',...contextKeys])assert.equal(after[key],before[key],`option ${i} ${key} changed`);
      assert.deepEqual(after.skippedAddons,before.skippedAddons);
      assert.equal(after.writtenDisclosure,before.disclaimer);
    }
  }else assert.equal(target.options,undefined);
  assert.ok(output.fullJobTotal===undefined||output.fullJobTotal===null,'invented full-job amount');
}
function assertScope(outcome,item,name){
  const policy=item.expected;
  const mustReject=name==='projectVoiceQuote'&&policy.liveMustReject||name==='projectSavedQuoteContext'&&policy.savedMustReject;
  const mayReject=name==='projectVoiceQuote'&&policy.liveMayReject||name==='projectSavedQuoteContext'&&policy.savedMayReject;
  if(mustReject){assert.equal(outcome.kind,'rejected','malformed option container was accepted');return;}
  if(mayReject&&outcome.kind==='rejected')return;
  assert.equal(outcome.kind,'returned',JSON.stringify(outcome));
  const output=outcome.value;
  assert.equal(output.resultType,policy.resultType,'scope classification changed');
  const expected=name==='customerReceiptPresentation'?policy.work:policy.work.map(work=>work.description);
  if(expected.length)assert.deepEqual(output.additionalWork,expected,'lost, invented, or reclassified additional work');
  else assert.equal(output.additionalWork,undefined,'false global additional work');
  if(name==='projectVoiceQuote')assert.equal(/Separate additional work is excluded/.test(output.voiceSummary),expected.length>0);
  if(name==='projectSavedQuoteContext'&&policy.resultType==='PARTIAL_ESTIMATE_READY')assert.equal(output.fullJobTotal,null);
}

const observations=[];
for(const item of cases){
  const originalJson=stored(item.id),input=freeze(JSON.parse(originalJson));
  const outcomes=Object.fromEntries(Object.entries(projections).map(([name,fn])=>[name,invoke(fn,input)]));
  const normalized=outcomes.customerReceiptPresentation;
  const repeat=Object.fromEntries(Object.entries(projections).map(([name,fn])=>[name,invoke(fn,input)]));
  const normalizedOutcomes=normalized.kind==='returned'?Object.fromEntries(Object.entries(projections).map(([name,fn])=>[name,invoke(fn,normalized.value)])):null;
  const financialInput=clone(input),financialPart=financialInput.pricedEstimate||financialInput;
  for(const target of [financialInput,financialPart,...(Array.isArray(financialPart.options)?financialPart.options.filter(record):[])])Object.assign(target,{lineItems:[{rate:'PRIVATE_RATE_SENTINEL'}],materialCost:'PRIVATE_MATERIAL_SENTINEL',markupPercent:'PRIVATE_MARKUP_SENTINEL',margin:'PRIVATE_MARGIN_SENTINEL',internalResult:{secret:'PRIVATE_INTERNAL_SENTINEL'}});
  const privacy=Object.fromEntries(Object.entries(projections).filter(([name])=>name!=='customerReceiptPresentation').map(([name,fn])=>[name,invoke(fn,freeze(financialInput))]));
  observations.push({id:item.id,expected:item.expected,input:clone(input),outcomes,repeat,normalizedOutcomes,voicePrivacyOutcomes:privacy});
  for(const [name,outcome] of Object.entries(outcomes))test(item.id+' / '+name+' / scope',()=>assertScope(outcome,item,name));
  test(item.id+' / amounts, options and private fields',()=>{
    const failures=[];
    for(const [name,outcome] of Object.entries(outcomes))if(outcome.kind==='returned'){
      try{assertAmounts(outcome.value,input,name);assertNoInternal(outcome.value);}catch(error){failures.push(name+': '+error.message);}
    }
    for(const [name,outcome] of Object.entries(privacy))if(outcome.kind==='returned'){
      try{assert.doesNotMatch(JSON.stringify(outcome.value),/PRIVATE_|lineItems|materialCost|markupPercent|internalResult|"margin"/);}catch(error){failures.push(name+' privacy: '+error.message);}
    }
    assert.deepEqual(failures,[]);
  });
  test(item.id+' / stable projections, frozen input and unchanged stored receipt',()=>{
    assert.deepEqual(repeat,outcomes);
    assert.deepEqual(normalizedOutcomes,outcomes);
    assert.equal(JSON.stringify(input),originalJson);
    assert.equal(stored(item.id),originalJson);
    for(const fn of Object.values(projections)){
      const fresh=invoke(fn,input);if(fresh.kind!=='returned')continue;
      const target=pricePart(fresh.value),option=target.options?.find?.(record);
      if(option){option.skippedAddons?.push('[PLACEHOLDER] output mutation');option.lowEstimate=0;}
      assert.equal(JSON.stringify(input),originalJson,'projection output aliases input');
    }
    assert.equal(database.prepare('SELECT total_changes() AS changes').get().changes,0);
  });
}
test('all stored receipt bytes remain unchanged',()=>{
  assert.equal(digest(readFileSync(databasePath)),storedHash);
  for(const item of cases)assert.equal(stored(item.id),JSON.stringify(item.receipt));
});
writeFileSync(new URL('observations.json',folder),JSON.stringify({commit:'03b29925437e73acb24b916ba6e69e5a002dfff1',node:process.version,sqliteReadOnly:true,storedReceiptFileSha256:storedHash,cases:observations},null,2)+'\n');
after(()=>database.close());
