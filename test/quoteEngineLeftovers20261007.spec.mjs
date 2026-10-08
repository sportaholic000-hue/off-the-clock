import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {savedDisplayFixture} from './quoteDisplayFixtures20261006.mjs';
import {quoteEmailFixture} from './quoteEmailFixture.mjs';
import {fixture,at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {voiceQuestionContract,bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {validateVoiceToolCall} from '../server/src/voice/toolSchemas.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {customerHistory} from '../server/src/customerHistoryService.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {approveApplicationService,bookRevision} from '../server/src/quoteDoneBridge.js';
import {extractWebsitePrices} from '../server/src/websitePriceExtraction.js';
import {createWebsitePriceImporter} from '../server/src/websitePriceImport.js';

process.env.JWT_SECRET='SYNTHETIC_LEFTOVERS_SIGNING_KEY_NEVER_LIVE';
// Handwritten expectations: verification/engine-leftovers/EXPECTATIONS.md.
function laminate(){
 const f=flooring('laminate');delete f.ownerPricing.pricing.perStepPrice;
 Object.assign(f.ownerPricing.pricing,{laborPerSqft:{laminate:100},materialPerSqft:{laminate:200},scopeDetails:{
  floor_underlayment_hardwood:{description:'[SYNTHETIC] hardwood plywood',mode:'installed_area_sell_price'},
  floor_underlayment_laminate:{description:'[SYNTHETIC] laminate foam',mode:'installed_area_sell_price'}},
  scopeRates:{floor_underlayment_hardwood:100,floor_underlayment_laminate:100}});
 f.customerInputs.underlaymentScopeConfirmed=true;return f;
}
test('leftovers scope: resolved phone question identifies selected laminate, not first hardwood',()=>{
 const f=laminate(),a=savedDisplayFixture(f);
 assert.equal(a.quote(f.customerInputs).customerResult.midEstimate,852);
 const q=voiceQuestionContract(a.service,a.definition,f.customerInputs).fields.find(x=>x.field==='underlaymentScopeConfirmed');
 assert.match(q.details.join(' '),/laminate foam/);assert.doesNotMatch(q.details.join(' '),/hardwood plywood/);
});
test('leftovers scope: approved phone calculation refuses an unbound scope boolean',async t=>{
 const h=quoteEmailFixture(t),f=laminate();delete f.ownerPricing.origin;
 savePricebook(h.c.ownerId,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}});
 const book=loadPricebook(h.c.ownerId);approveApplicationService(h.c.ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC',quoteInstant:at});
 const runtime=createVoiceToolRuntime({database:h.db,callContext:h.c,handleSecret:secret,clock:()=>new Date(at)});
 const invoke=async(name,args)=>projectVoiceToolResult(name,await runtime.handlers[name]({context:h.c,args}));
 const match=await invoke('matchService',{query:f.ownerPricing.service}),inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
 const result=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true});
 assert.equal(result.status,'needs_details');assert.equal(result.midEstimate,undefined);
 assert.match(result.questionContract.fields.find(x=>x.field==='underlaymentScopeConfirmed').details.join(' '),/laminate foam/);
 const unanswered=structuredClone(inputs);delete unanswered.underlaymentScopeConfirmed;
 const question=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerInputs:unanswered,customerConfirmed:true});
 assert.equal(question.status,'needs_details');assert.ok(question.questionContract.fields.find(x=>x.field==='underlaymentScopeConfirmed').confirmationToken);
 const token=result.questionContract.fields.find(x=>x.field==='underlaymentScopeConfirmed').confirmationToken;
 assert.ok(token);
 const confirmed=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,scopeConfirmations:{underlaymentScopeConfirmed:token}});
 assert.equal(confirmed.status,'quoted');assert.equal(confirmed.midEstimate,852);
 const forged=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,scopeConfirmations:{underlaymentScopeConfirmed:'forged-confirmation'}});
 assert.equal(forged.status,'needs_details');assert.equal(forged.midEstimate,undefined);
});
test('leftovers scope: confirmations bind selected presentation, call, and configuration revision',()=>{
 const f=laminate(),a=savedDisplayFixture(f),authority={secret,binding:'synthetic-owner/call/revision-1'};
 const field='underlaymentScopeConfirmed',inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
 const unresolved=voiceQuestionContract(a.service,a.definition).fields.find(q=>q.field===field);
 assert.doesNotMatch(unresolved.label,/hardwood plywood|laminate foam/);assert.equal(unresolved.confirmationToken,undefined);
 const q=voiceQuestionContract(a.service,a.definition,inputs,authority).fields.find(q=>q.field===field);
 assert.ok(q.details.some(detail=>detail.includes('laminate foam')));
 const args={customerInputs:inputs,scopeConfirmations:{[field]:q.confirmationToken}};
 assert.deepEqual(bindVoiceQuoteInputs(a.service,a.definition,args,authority).followUps,[]);
 for(const changed of [{...authority,binding:'synthetic-other-call/revision-1'},{...authority,binding:'synthetic-owner/call/revision-2'}]){
  assert.ok(bindVoiceQuoteInputs(a.service,a.definition,args,changed).followUps.length);
 }
 const changedDefinition=structuredClone(a.definition);
 const target=changedDefinition.customerFields.find(q=>q.name===field);
 for(const variant of target.presentationVariants)if(variant.details.some(detail=>detail.includes('laminate foam')))variant.details=['[SYNTHETIC] replacement acoustic membrane'];
 assert.ok(bindVoiceQuoteInputs(a.service,changedDefinition,args,authority).followUps.length);
});
function receipt(){return {resultType:'INSTANT_ESTIMATE_READY',lowEstimate:100,midEstimate:100,highEstimate:100,currency:'CAD',priceUnit:'per visit',taxTreatment:'No tax added.',skippedAddons:['[SYNTHETIC] bagging excluded'],disclaimer:'[SYNTHETIC] Access must be clear; material allowance only.',options:[{tierName:'Base',lowEstimate:100,midEstimate:100,highEstimate:100,currency:'CAD',priceUnit:'per visit',taxTreatment:'No tax added.',skippedAddons:['[SYNTHETIC] bagging excluded'],disclaimer:'[SYNTHETIC] Allowance does not include disposal.'}]};}
function savedHistory(f,c,value,id='synthetic-saved'){
 f.db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES(?,?,?,?,'INSTANT',?)").run(id,c.ownerId,c.callSid,JSON.stringify({customerResult:value,privateCost:'PRIVATE_MUST_NOT_LEAK'}),at);
}
test('leftovers history: service retains saved material qualifications and option exclusions',t=>{
 const f=fixture(t),c=f.context();savedHistory(f,c,receipt());
 const q=customerHistory(f.db,c).recentQuotes[0];assert.equal(q.midEstimate,100);
 assert.equal(q.priceUnit,'per visit');assert.equal(q.taxTreatment,'No tax added.');
 assert.deepEqual(q.skippedAddons,receipt().skippedAddons);assert.match(q.writtenDisclosure,/material allowance/);
 assert.match(q.options[0].writtenDisclosure,/does not include disposal/);
});
test('leftovers history: dispatched partial receipt retains priced scope and separate work',async t=>{
 const f=fixture(t),c=f.context();savedHistory(f,c,{resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:receipt(),pricedScope:{service:'[SYNTHETIC] Mowing',facts:[{label:'Area',value:'5000 sqft'}]},additionalWork:[{description:'[SYNTHETIC] stump removal'}],fullJobTotal:null});
 const result=await f.voice(c).tool('getCustomerContext',{}),q=result.recentQuotes[0];
 assert.equal(q.fullJobTotal,null);assert.ok(q.pricedScope.includes('Area: 5000 sqft'));
 assert.deepEqual(q.additionalWork,['[SYNTHETIC] stump removal']);assert.equal(q.options[0].priceUnit,'per visit');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_MUST_NOT_LEAK/);
});
test('leftovers history: authoritative frozen receipt retains long and per-option qualifications',async t=>{
 const f=fixture(t),c=f.context(),saved=receipt();saved.disclaimer='[SYNTHETIC] '+('saved condition '.repeat(500))+'MATERIAL_TAIL';
 Object.assign(saved.options[0],{priceUnit:'per package',taxTreatment:'Tax included in this saved option.',skippedAddons:['[SYNTHETIC] delivery excluded']});
 savedHistory(f,c,{...receipt(),priceUnit:'STALE_FALLBACK'},'authoritative');
 f.db.prepare("INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,'synthetic-history','synthetic','authoritative','INSTANT_ESTIMATE_READY','old-revision','{}','{}',?,?)").run(c.ownerId,JSON.stringify(saved),at);
 const q=(await f.voice(c).tool('getCustomerContext',{})).recentQuotes[0];
 assert.equal(q.midEstimate,100);assert.equal(q.priceUnit,'per visit');assert.equal(q.writtenDisclosure,saved.disclaimer);
 assert.equal(q.options[0].priceUnit,'per package');assert.equal(q.options[0].taxTreatment,saved.options[0].taxTreatment);
 assert.deepEqual(q.options[0].skippedAddons,saved.options[0].skippedAddons);assert.doesNotMatch(JSON.stringify(q),/STALE_FALLBACK/);
});
for(const [label,change] of [['oversize disclosure',r=>r.disclaimer='x'.repeat(65537)],['invalid exclusion',r=>r.skippedAddons=[{description:'must not vanish'}]],['missing separate scope',r=>Object.assign(r,{resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:receipt(),additionalWork:[{}]})]]){
 test('leftovers history: '+label+' withholds all amounts instead of dropping qualifications',async t=>{
  const f=fixture(t),c=f.context(),saved=receipt();change(saved);savedHistory(f,c,saved);
  const q=(await f.voice(c).tool('getCustomerContext',{})).recentQuotes[0];
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(q.midEstimate,undefined);assert.equal(q.options,undefined);assert.match(q.customerMessage,/complete saved quote qualifications/);
 });
}
const visible='[SYNTHETIC] Visible item $20';
test('leftovers website: stylesheet hidden price is absent from direct extraction',()=>{
 const out=extractWebsitePrices('<style>.retired {display:none}</style><p class="retired">[SYNTHETIC] Old price $999</p><p>'+visible+'</p>');
 assert.deepEqual(out.entries.map(e=>e.excerpt),[visible]);
});
test('leftovers website: real HTTP import excludes stylesheet-hidden ancestor prices',async t=>{
 const server=http.createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<style>#old {visibility:hidden}</style><div id="old"><p>[SYNTHETIC] Old price $999</p></div><p>'+visible+'</p>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 const importer=createWebsitePriceImporter({lookup:async()=>[{address:'8.8.8.8',family:4}],request:(url,options,callback)=>http.request(new URL(url.pathname,'http://127.0.0.1:'+server.address().port),{...options,lookup:undefined},callback)});
 assert.equal((await importer('http://synthetic.example/')).prices,visible);
});
for(const [selector,rule,html] of [
 ['.catalog .retired','display:none','<div class="catalog"><p class="retired">$999</p></div>'],
 ['#catalog > p.retired[data-retired="yes"]','visibility:hidden','<div id="catalog"><p class="retired" data-retired="yes">$999</p></div>'],
 ['.retired','opacity:0','<p class="retired">$999</p>'],
 ['.retired','content-visibility:hidden','<p class="retired">$999</p>'],
 ['.retired','text-decoration:line-through','<p class="retired">$999</p>'],
 ['.retired','color:#0000','<p class="retired">$999</p>'],
 ['.retired','color:rgb(0 0 0 / 0)','<p class="retired">$999</p>'],
 ['.retired','font-size:0.0px','<p class="retired">$999</p>']
])test('leftovers website: bounded stylesheet selector '+selector+' / '+rule,()=>{
 const out=extractWebsitePrices('<style>'+selector+'{'+rule+'}</style>'+html+'<p>'+visible+'</p>');assert.deepEqual(out.entries.map(e=>e.excerpt),[visible]);
});
for(const css of ['@media screen {.retired{display:none}}','.retired:not(.current){display:none}','.retired{display:var(--state)}','@import url("/other.css");','.retired{font-size-adjust:0}','.retired{color:white;background-color:white}']){
 test('leftovers website: unresolved CSS never becomes a visible-price assumption: '+css,()=>{
  const out=extractWebsitePrices('<style>'+css+'</style><p class="retired">$999</p><p>'+visible+'</p>');assert.deepEqual(out.entries,[]);assert.equal(out.visibilityUnverified,true);assert.equal(out.limited,true);
 });
}
async function cssImport(t,{href='/prices.css',css='.retired{display:none}',type='text/css',limits}={}){
 const requested=[];
 const server=http.createServer((req,res)=>{requested.push(req.url);res.setHeader('content-type',req.url==='/prices.css'?type:'text/html');res.end(req.url==='/prices.css'?css:'<link rel="stylesheet" href="'+href+'"><script src="/never.js"></script><p class="retired">[SYNTHETIC] Hidden $999</p><p>'+visible+'</p>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 const importer=createWebsitePriceImporter({limits,lookup:async()=>[{address:'8.8.8.8',family:4}],request:(url,options,callback)=>http.request(new URL(url.pathname,'http://127.0.0.1:'+server.address().port),{...options,lookup:undefined},callback)});
 return {result:await importer('http://synthetic.example/'),requested};
}
test('leftovers website: same-host linked CSS uses the bounded transport and preserves visible price',async t=>{
 const {result,requested}=await cssImport(t);assert.equal(result.prices,visible);assert.equal(result.websiteImport.visibilityUnverified,false);assert.deepEqual(requested,['/','/prices.css']);
});
for(const [label,options] of [['foreign host',{href:'https://other.example/prices.css'}],['private address',{href:'http://127.0.0.1/prices.css'}],['wrong content type',{type:'application/javascript'}],['unresolved nested CSS',{css:'@import url("/nested.css");'}],['shared request budget',{limits:{requests:1}}]]){
 test('leftovers website: '+label+' fails visibility closed',async t=>{
  const {result,requested}=await cssImport(t,options);assert.equal(result.prices,'');assert.equal(result.websiteImport.visibilityUnverified,true);assert.equal(result.websiteImport.limited,true);assert.ok(requested.length<=2);assert.ok(!requested.includes('/never.js'));
 });
}
test('leftovers listed prices: prompt delegates multiplication to server only',()=>{
 const prompt=compileVoiceSystemInstruction({guideText:fs.readFileSync(new URL('../specs/voice_quote_flows.md',import.meta.url),'utf8'),business:{businessName:'Synthetic',agentName:'Synthetic receptionist'},services:[],knowledge:{prices:'[SYNTHETIC] Widget $0.10 each'}});
 assert.doesNotMatch(prompt,/you may multiply/);assert.match(prompt,/calculateListedPrice/);
});
test('leftovers listed prices: server tool accepts listing identity and quantity, never a supplied rate',()=>{
 assert.doesNotThrow(()=>validateVoiceToolCall('calculateListedPrice',{listedItem:'[SYNTHETIC] Widget $0.10 each',quantity:'3',customerConfirmed:true}));
 assert.throws(()=>validateVoiceToolCall('calculateListedPrice',{listedItem:'[SYNTHETIC] Widget $0.10 each',quantity:'3',customerConfirmed:true,unitPrice:0.1}));
});
for(const [rate,quantity,expected] of [['$0.10','3','0.30'],['$2','500','1000.00'],['$19.99','3','59.97'],['$0.035','1000','35.00'],['$0.10','0.2','0.02'],['$0.005','3','0.015'],['$1,234.50','2','2469.00']]){
 test('leftovers listed prices: dispatched exact product '+rate+' × '+quantity+' = '+expected,async t=>{
  const f=fixture(t),c=f.context(),listedItem='[SYNTHETIC] Widget '+rate+' each. Pickup only.';
  f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({prices:listedItem}),c.ownerId);
  const v=f.voice(c),before=f.db.prepare('SELECT total_changes() n').get().n,args={listedItem,quantity,customerConfirmed:true};
  const result=await v.tool('calculateListedPrice',args);assert.equal(result.status,'calculated');assert.equal(result.extendedAmount,expected);assert.equal(result.listedItem,listedItem);assert.ok(result.voiceSummary.includes('$'+expected));assert.match(result.voiceSummary,/Pickup only/);
  assert.deepEqual(await v.tool('calculateListedPrice',args),result);assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM quotes').get().n,0);
 });
}
for(const listing of ['[SYNTHETIC] Widget from $0.10 each','[SYNTHETIC] Widget $0.10 each; minimum 10 items','[SYNTHETIC] Widget $0.10 each; first 10 only','[SYNTHETIC] Widget $0.10 each; $2 delivery','[SYNTHETIC] Widget $0.10','[SYNTHETIC] Widget $0.10 each; discount over 20']){
 test('leftovers listed prices: no arithmetic for ambiguous or nonlinear listing '+listing,async t=>{
  const f=fixture(t),c=f.context();f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({prices:listing}),c.ownerId);
  const result=await f.voice(c).tool('calculateListedPrice',{listedItem:listing,quantity:'3',customerConfirmed:true});assert.equal(result.status,'needs_review');assert.equal(result.extendedAmount,undefined);
 });
}
test('leftovers listed prices: current owner listing is authoritative across tenants, edits, and draft state',async t=>{
 const f=fixture(t),c=f.context(),v=f.voice(c),listedItem='[SYNTHETIC] Widget $0.10 each',args={listedItem,quantity:'3',customerConfirmed:true};
 const save=(owner,value)=>f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify(value),owner);
 save('synthetic-b',{prices:listedItem});assert.equal((await v.tool('calculateListedPrice',args)).status,'needs_review');
 save(c.ownerId,{prices:listedItem,draft:true});assert.equal((await v.tool('calculateListedPrice',args)).status,'needs_review');
 save(c.ownerId,{prices:listedItem});assert.equal((await v.tool('calculateListedPrice',args)).extendedAmount,'0.30');
 save(c.ownerId,{prices:listedItem+'; new access condition'});assert.equal((await v.tool('calculateListedPrice',args)).status,'needs_review');
 save(c.ownerId,{prices:listedItem+'\n\n'+listedItem});assert.equal((await v.tool('calculateListedPrice',args)).status,'needs_review');
});
for(const quantity of [3,'-1','1e3','1/2','NaN','Infinity','1.0000001','1000000000000'])test('leftovers listed prices: invalid quantity '+String(quantity)+' cannot reach arithmetic',()=>{
 assert.throws(()=>validateVoiceToolCall('calculateListedPrice',{listedItem:'[SYNTHETIC] Widget $0.10 each',quantity,customerConfirmed:true}));
});
test('leftovers listed prices: zero quantity and over-limit products have no invented result',async t=>{
 const f=fixture(t),c=f.context(),v=f.voice(c),listedItem='[SYNTHETIC] Widget $999999999999 each';
 f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({prices:listedItem}),c.ownerId);
 await assert.rejects(()=>v.tool('calculateListedPrice',{listedItem,quantity:'0',customerConfirmed:true}),{code:'INVALID_TOOL_NUMBER'});
 const r=await v.tool('calculateListedPrice',{listedItem,quantity:'2',customerConfirmed:true});assert.equal(r.status,'needs_review');assert.equal(r.extendedAmount,undefined);
});
