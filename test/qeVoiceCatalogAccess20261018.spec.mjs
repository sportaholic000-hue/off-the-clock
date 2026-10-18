import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gates,publish,runtime,quoteEmailFixture,bridge,loadPricebook,date} from './quoteDeliveryBatch20261015Fixture.mjs';
import {customPlantFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {VOICE_TOOL_NAMES,MUTATING_VOICE_TOOLS,validateVoiceToolCall} from '../server/src/voice/toolSchemas.js';
import {voiceToolAllowed} from '../server/src/voice/voicePlanAccess.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {VOICE_RESULT_BYTES} from '../server/src/voice/voiceQuotePresentation.js';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {harness} from './voiceLifecycle20261006Fixture.mjs';

// Independent expectations, written before production changes:
// gate 33: 100 LF * 4000 cents + one 55000-cent installed gate = 455000 cents.
// plant 32: two plants * (4500 labor + 3000 material) = 15000 cents.
// Discovery must never write, change eligibility, or authorize a product/scope.
const toolName='lookupQuoteCatalog';
function gateBook(count=33,length=80){
 const f=gates(length,count);f.customerInputs.gates={['walk_'+count]:1};
 f.ownerPricing.pricing.offeringRates['gate_walk_'+count]=55000;return f;
}
function plantBook(count=32){
 const f=customPlantFixture(),p=f.ownerPricing.pricing;
 p.plantSizes={};p.plantingLaborPerPlant={};p.plantMaterialAllowance={};
 for(let i=1;i<=count;i++){
  const key='plant_'+i;p.plantSizes[key]={name:'[SYNTHETIC] #'+i+' shrub, container',plantType:'shrub',stockType:'container',containerNumber:i};
  p.plantingLaborPerPlant[key]=4500;p.plantMaterialAllowance[key]=3000;
 }
 f.customerInputs.plantsBySize={['plant_'+count]:2};return f;
}
async function opened(t,f,context){
 const h=quoteEmailFixture(t,context?{context}:{}),a=publish(h.c.ownerId,f),v=runtime(h);
 const matched=await v.tool('matchService',{query:f.ownerPricing.service});assert.equal(matched.status,'matched');
 const inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
 const lookup=(field,extra={})=>v.tool(toolName,{serviceHandle:matched.serviceHandle,field,customerInputs:inputs,...extra});
 async function quote(selectedInputs=inputs,confirmed=true){
  const args={serviceHandle:matched.serviceHandle,customerInputs:selectedInputs,customerConfirmed:true,productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(k=>[k,confirmed]))};
  let result=await v.tool('getQuote',args);
  if(result.questionContract?.fields.some(q=>q.confirmationToken)){
   args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(q=>q.confirmationToken).map(q=>[q.field,q.confirmationToken]));
   result=await v.tool('getQuote',args);
  }
  return result;
 }
 return {...h,...v,...a,f,matched,inputs,lookup,quote};
}
test('catalog baseline control: a known 33rd saved gate quotes 455000 cents although the initial list omits it',async t=>{
 const h=await opened(t,gateBook());
 const field=h.matched.questionContract.fields.find(q=>q.field==='gates');
 assert.equal(field.choices.some(c=>c.value==='walk_33'),false);assert.equal(field.moreChoicesAvailable,true);
 const quote=await h.quote();assert.equal(quote.status,'quoted',JSON.stringify(quote));assert.equal(quote.midEstimate,4550);
});
test('catalog discovery: truncated saved-service question advertises a callable read-only lookup',async t=>{
 const h=await opened(t,gateBook());
 assert.equal(h.matched.questionContract.fields.find(q=>q.field==='gates').catalogLookup,toolName);
 assert.ok(VOICE_TOOL_NAMES.includes(toolName));assert.ok(!MUTATING_VOICE_TOOLS.includes(toolName));
 const found=await h.lookup('gates',{query:'walk 33'});assert.deepEqual(found.choices.map(c=>c.value),['walk_33']);
 assert.match(found.choices[0].label,/36 ft opening/);assert.match(found.choices[0].label,/END_GATE_33/);
 const quote=await h.quote({...h.inputs,gates:{[found.choices[0].value]:1}});assert.equal(quote.midEstimate,4550);
});
for(const count of [31,32,33,65])test('catalog pagination: every one of '+count+' saved gates is reachable exactly once',async t=>{
 const h=await opened(t,gateBook(count)),seen=[];let cursor,turns=0;
 do{
  const page=await h.lookup('gates',{limit:16,...(cursor?{cursor}:{})});
  assert.equal(page.status,'choices');assert.ok(page.choices.length>0&&page.choices.length<=16);
  assert.equal(page.moreChoicesAvailable,!!page.nextCursor);assert.ok(Buffer.byteLength(JSON.stringify(page))<VOICE_RESULT_BYTES);
  seen.push(...page.choices.map(c=>c.value));cursor=page.nextCursor;assert.ok(++turns<=Math.ceil(count/16));
 }while(cursor);
 assert.deepEqual(seen,Array.from({length:count},(_,i)=>'walk_'+(i+1)));assert.equal(new Set(seen).size,count);
});
test('catalog planting: later supported plant size is paged, searched, selected and quoted at 15000 cents',async t=>{
 const h=await opened(t,plantBook());
 const first=await h.lookup('plantsBySize',{limit:16});assert.equal(first.choices.length,16);
 const second=await h.lookup('plantsBySize',{limit:16,cursor:first.nextCursor});assert.equal(second.choices.at(-1).value,'plant_32');
 const found=await h.lookup('plantsBySize',{query:'#32 shrub'});assert.deepEqual(found.choices,[{value:'plant_32',label:'[SYNTHETIC] #32 shrub, container'}]);
 const result=await h.quote({...h.inputs,plantsBySize:{[found.choices[0].value]:2}});assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,150);
});
test('catalog planting: maximum supported 160-character Unicode identity remains complete and quotes',async t=>{
 const f=plantBook(),name='[SYNTHETIC] '+'葉'.repeat(135)+'_LAST_PLANT32';assert.equal(name.length,160);
 f.ownerPricing.pricing.plantSizes.plant_32.name=name;
 const h=await opened(t,f),found=await h.lookup('plantsBySize',{query:'_LAST_PLANT32'});
 assert.deepEqual(found.choices,[{value:'plant_32',label:name}]);
 assert.equal(h.matched.questionContract.fields.find(q=>q.field==='plantsBySize').choices.find(c=>c.value==='plant_32').label,name);
 const result=await h.quote({...h.inputs,plantsBySize:{[found.choices[0].value]:2}});
 assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,150);
});
test('catalog search: duplicate descriptions retain distinct keys and widths; missing results invent nothing',async t=>{
 const f=gateBook();for(const gate of Object.values(f.ownerPricing.pricing.offeringDetails.gates))gate.description='[SYNTHETIC] Same installation scope';
 const h=await opened(t,f),page=await h.lookup('gates',{query:'same INSTALLATION',limit:32});
 assert.equal(page.choices.length,32);assert.equal(new Set(page.choices.map(c=>c.value)).size,32);
 assert.match(page.choices[0].label,/4 ft opening/);assert.match(page.choices[1].label,/5 ft opening/);
 const none=await h.lookup('gates',{query:'[SYNTHETIC] absent gate'});assert.deepEqual(none.choices,[]);assert.equal(none.moreChoicesAvailable,false);assert.equal(none.nextCursor,undefined);
});
test('catalog long labels: every complete Unicode gate scope survives byte-bounded pages',async t=>{
 const f=gateBook(33);for(const [key,g] of Object.entries(f.ownerPricing.pricing.offeringDetails.gates).slice(0,3))g.description='[SYNTHETIC] '+('門'.repeat(1800))+' END_'+key;
 const h=await opened(t,f),seen=[],expected=h.definition.customerFields.find(q=>q.name==='gates').options;let cursor;
 do{
  const page=await h.lookup('gates',{limit:32,...(cursor?{cursor}:{})});assert.ok(Buffer.byteLength(JSON.stringify(page))<=20000);
  assert.ok(page.choices.length>0);for(const c of page.choices){assert.equal(c.label,expected[c.value]);if(['walk_1','walk_2','walk_3'].includes(c.value))assert.ok(c.label.includes('門'.repeat(1800)));seen.push(c.value);}
  cursor=page.nextCursor;
 }while(cursor);
 assert.equal(seen.length,33);assert.equal(new Set(seen).size,33);
});
test('catalog authority: lookup is read-only, cursors survive runtime restart, and prices stay private',async t=>{
 const h=await opened(t,gateBook()),before=JSON.stringify(loadPricebook(h.c.ownerId)),changes=h.db.prepare('SELECT total_changes() n').get().n;
 h.db.pragma('query_only = ON');
 const page=await h.lookup('gates',{limit:16});
 const restarted=runtime(h),next=await restarted.tool(toolName,{serviceHandle:h.matched.serviceHandle,field:'gates',customerInputs:h.inputs,limit:16,cursor:page.nextCursor});
 assert.equal(next.choices[0].value,'walk_17');assert.equal(h.db.prepare('SELECT total_changes() n').get().n,changes);
 assert.equal(JSON.stringify(loadPricebook(h.c.ownerId)),before);assert.equal(h.sends(),0);
 assert.doesNotMatch(JSON.stringify([page,next]),/offeringRates|installedLaborPercent|installedMaterialsPercent|markup|calculationRecord|55000/);
 h.db.pragma('query_only = OFF');
});
test('catalog isolation: foreign owner/call handles and cursors, tampering, changed query or scope are rejected',async t=>{
 const h=await opened(t,gateBook()),page=await h.lookup('gates',{limit:16});
 for(const c of [h.context(),h.context('synthetic-b')]){
  if(c.ownerId!==h.c.ownerId)publish(c.ownerId,gateBook());
  const other=runtime({...h,c}),m=await other.tool('matchService',{query:h.f.ownerPricing.service});
  await assert.rejects(other.tool(toolName,{serviceHandle:h.matched.serviceHandle,field:'gates',customerInputs:h.inputs}));
  await assert.rejects(other.tool(toolName,{serviceHandle:m.serviceHandle,field:'gates',customerInputs:h.inputs,limit:16,cursor:page.nextCursor}));
 }
 for(const extra of [{query:'walk'},{field:'fenceType'},{customerInputs:{...h.inputs,fenceHeight:8}},{limit:8},{cursor:page.nextCursor.slice(0,-1)+(page.nextCursor.endsWith('A')?'B':'A')}]){
  await assert.rejects(h.lookup('gates',{limit:16,cursor:page.nextCursor,...extra}));
 }
});
test('catalog revision: a saved-book edit invalidates both old handle and cursor without changing the book again',async t=>{
 const h=await opened(t,gateBook()),page=await h.lookup('gates',{limit:16});
 const draft=bridge.readApplicationBook(h.c.ownerId);draft.services[0].pricing.offeringRates.gate_walk_33=600;
 bridge.saveApplicationBook(h.c.ownerId,draft,date);const saved=JSON.stringify(loadPricebook(h.c.ownerId));
 await assert.rejects(h.lookup('gates'));await assert.rejects(h.lookup('gates',{limit:16,cursor:page.nextCursor}));
 assert.equal(JSON.stringify(loadPricebook(h.c.ownerId)),saved);
});
test('catalog authority: expiry and another saved service reject continuation even on the same owner and call',async t=>{
 const h=await opened(t,gateBook()),draft=bridge.readApplicationBook(h.c.ownerId),second=structuredClone(draft.services[0]);
 draft.services[0].service='[SYNTHETIC] Alpha compound boundary enclosure';
 second.id=randomUUID();second.service='[SYNTHETIC] Beta yard perimeter construction';
 for(const key of ['origin','approvedValues','quoteDoneApproval','zeroPricePolicy','startingValueState','startingValueAdoptions','dependentLineState'])delete second[key];
 draft.services.push(second);bridge.saveApplicationBook(h.c.ownerId,draft,date);
 bridge.approveApplicationService(h.c.ownerId,draft.services[0].id,{revision:bridge.readApplicationBook(h.c.ownerId).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
 bridge.approveApplicationService(h.c.ownerId,second.id,{revision:bridge.readApplicationBook(h.c.ownerId).revision,confirmConfiguration:true,confirmLegacySettings:true},date);
 const first=await h.tool('matchService',{query:draft.services[0].service}),other=await h.tool('matchService',{query:second.service});
 assert.equal(first.status,'matched');assert.equal(other.status,'matched');assert.notEqual(first.serviceHandle,other.serviceHandle);
 const args={serviceHandle:first.serviceHandle,field:'gates',customerInputs:h.inputs,limit:16},page=await h.tool(toolName,args);
 await assert.rejects(h.tool(toolName,{...args,serviceHandle:other.serviceHandle,cursor:page.nextCursor}));
 h.advance(3*60*60*1000);
 await assert.rejects(h.voice(h.c)({name:toolName,args:{...args,cursor:page.nextCursor}}));
});
test('catalog scope: selected fence type controls section gates and lookup never confirms a product',async t=>{
 const f=fourTypes();f.ownerPricing.pricing.fenceOfferings.aluminum.offeringDetails.gates.walk.description='[SYNTHETIC] Aluminum-only installation';
 const h=await opened(t,f),page=await h.lookup('fenceRuns');assert.match(page.choices[0].label,/Aluminum-only/);
 const wood=await h.lookup('fenceRuns',{customerInputs:{...h.inputs,fenceType:'wood'}});assert.doesNotMatch(wood.choices[0].label,/Aluminum-only/);
 const missing=await h.lookup('fenceRuns',{customerInputs:{}});assert.deepEqual(missing.choices,[]);
 const unconfirmed=await h.quote(h.inputs,false);assert.equal(unconfirmed.status,'needs_details');assert.equal(unconfirmed.midEstimate,undefined);
});
test('catalog schemas and projection: no mutation ID required, plan gate and existing input/output guards apply',()=>{
 assert.equal(voiceToolAllowed(toolName,{receptionist:true,phoneQuoting:false}),false);
 assert.equal(voiceToolAllowed(toolName,{receptionist:true,phoneQuoting:true}),true);
 const args={serviceHandle:'a'.repeat(43),field:'gates',customerInputs:{},query:'',limit:32};
 assert.equal(validateVoiceToolCall(toolName,args).limit,32);
 for(const extra of [{limit:0},{limit:33},{query:'x'.repeat(501)},{ownerId:'foreign'},{customerInputs:{offeringId:'invented'}},{field:'__proto__'},{cursor:'not-a-cursor'}])assert.throws(()=>validateVoiceToolCall(toolName,{...args,...extra}));
 const result={status:'choices',field:'gates',choices:[{value:'walk',label:'Walk — 4 ft opening; [SYNTHETIC] installed'}],moreChoicesAvailable:false};
 assert.deepEqual(projectVoiceToolResult(toolName,result),result);
 for(const extra of [{rates:{gate:100}},{choices:[{value:'walk',label:'Walk',rate:100}]},{nextCursor:'invalid'},{choices:Array.from({length:33},()=>({value:'walk',label:'Walk'}))}])assert.throws(()=>projectVoiceToolResult(toolName,{...result,...extra}));
});
test('catalog question projection: duplicate display labels remain separate stable choices',()=>{
 const service={id:randomUUID()},definition={customerFields:[{name:'selection',label:'Selection',type:'enum',values:['a','b'],options:{a:'Same display',b:'Same display'}}]};
 const q=voiceQuestionContract(service,definition).fields[0];assert.deepEqual(q.choices,[{value:'a',label:'Same display'},{value:'b',label:'Same display'}]);
});
test('catalog compiled instructions describe bounded continuation, exact identity and retained confirmation rules',()=>{
 const prompt=compileVoiceSystemInstruction({guideText:readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8'),
  business:{businessName:'[SYNTHETIC] Catalog business',agentName:'[SYNTHETIC] Assistant'},services:[{serviceType:'FENCING_INSTALL',serviceLabel:'[SYNTHETIC] Fencing',active:true,status:'QUOTING LIVE',offerings:[]}]});
 assert.match(prompt,/lookupQuoteCatalog/);assert.match(prompt,/Follow nextCursor/);assert.match(prompt,/opening width and installation scope/);
 assert.match(prompt,/never treat a lookup as product or scope confirmation/);assert.match(prompt,/read back EVERY numeric measurement/);
});
for(const [name,factory,field,query,key,count,expected] of [
 ['gate',gateBook,'gates','walk 33','walk_33',1,4550],
 ['plant',plantBook,'plantsBySize','#32 shrub','plant_32',2,150]
])test('catalog production fake-provider session: later '+name+' can be discovered, confirmed and quoted',async t=>{
 const f=factory();let config;
 const h=await harness(t,{beforeInstall:({db})=>{
  db.prepare("UPDATE users SET plan='QuoteDone' WHERE id='synthetic-a'").run();publish('synthetic-a',f);
 },onConnect:input=>{config=input.config;}});
 const call=await h.connect();assert.ok(JSON.stringify(config.tools).includes(toolName));
 assert.match(JSON.stringify(config.systemInstruction),/lookupQuoteCatalog/);
 const matched=await h.tool(call.callback,'matchService',{query:f.ownerPricing.service});assert.equal(matched.status,'matched',JSON.stringify(matched));
 const inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
 const found=await h.tool(call.callback,toolName,{serviceHandle:matched.serviceHandle,field,customerInputs:inputs,query});
 assert.equal(found.status,'choices',JSON.stringify(found));assert.deepEqual(found.choices.map(c=>c.value),[key]);
 const args={serviceHandle:matched.serviceHandle,customerInputs:{...inputs,[field]:{[found.choices[0].value]:count}},customerConfirmed:true,
  productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(k=>[k,true]))};
 let result=await h.tool(call.callback,'getQuote',args);
 if(result.questionContract?.fields.some(q=>q.confirmationToken)){
  args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(q=>q.confirmationToken).map(q=>[q.field,q.confirmationToken]));
  result=await h.tool(call.callback,'getQuote',args);
 }
 assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,expected);
 assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE ownerId=?').get(h.owner).n,1);
 assert.deepEqual(h.writes,[]);assert.deepEqual(h.errors,[]);
});
