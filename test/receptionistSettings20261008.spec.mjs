import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {db} from '../server/src/db.js';
import {harness} from './voiceLifecycle20261006Fixture.mjs';
import {saveKnowledgeBase,saveVoice,updateOnboardingAccount,updateBusinessProfile} from '../server/src/onboardingService.js';
import {readApplicationBook,saveApplicationBook,approveApplicationService,applicationStatus,digest} from '../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {materializeVNextService} from '../server/quote-engine-vnext/index.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {readFileSync} from 'node:fs';
let sequence=100;
const owner='synthetic-a';
const stored=()=>db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner).knowledgeBaseJson;
const bad=(fn,field)=>assert.throws(fn,error=>error.statusCode===400&&error.message.includes(field));
async function signedSave(t,save,verify=()=>{}){
 const connections=[];
 const h=await harness(t,{filename:process.env.DATABASE_PATH,beforeInstall:save,onConnect:input=>connections.push(input)});
 const serial=++sequence;await h.connect(serial,'+1902555'+String(serial).padStart(4,'0'));
 assert.equal(connections.length,1);assert.equal(h.errors.includes('VOICE_SETTINGS_INVALID'),false);
 const prompt=connections[0].config.systemInstruction;verify(JSON.parse(prompt.match(/<OWNER_FACTS_JSON>\n([\s\S]*?)\n<\/OWNER_FACTS_JSON>/)[1]));
 return h;
}
for(const name of ['$99 Synthetic Plumbing','Low Cost Roofing 24/7','5 Dollar Fence Co','Best Rate Painting 2','X'.repeat(500)])test('receptionist 5 save identity and signed call: '+name.slice(0,40),async t=>{
 await signedSave(t,()=>{updateOnboardingAccount(owner,{firstName:'Synthetic',businessName:name});saveVoice(owner,{agentName:name,voiceId:'female',greeting:'Synthetic greeting'});},facts=>{assert.equal(facts.business.businessName,name);assert.equal(facts.business.agentName,name);});
});
test('receptionist 5 identity boundaries reject controls and 501 before changing saved profile',async t=>{
 await signedSave(t,()=>{
  updateOnboardingAccount(owner,{firstName:'Synthetic',businessName:'Synthetic identity'});
  saveVoice(owner,{agentName:'Synthetic agent',voiceId:'female',greeting:'Synthetic greeting'});
  for(const name of ['X'.repeat(501),'Synthetic\u0000name','Synthetic\nname']){
   bad(()=>updateOnboardingAccount(owner,{firstName:'Synthetic',businessName:name}),'Business name');
   bad(()=>saveVoice(owner,{agentName:name,voiceId:'female',greeting:'Synthetic greeting'}),'Agent name');
   bad(()=>updateBusinessProfile(owner,{agentName:name}),'Agent name');
  }
 },facts=>{assert.equal(facts.business.businessName,'Synthetic identity');assert.equal(facts.business.agentName,'Synthetic agent');});
});
for(const [field,label] of Object.entries({about:'About & area',hours:'Hours',services:'Services',policies:'Policies',faqs:'FAQs',prices:'Your prices'}))test('receptionist 5 '+field+' 20000 accepted, 20001 rejected, signed call keeps saved knowledge',async t=>{
 const value='X'.repeat(20000);
 await signedSave(t,()=>{
  saveKnowledgeBase(owner,{[field]:value});const previous=stored();
  bad(()=>saveKnowledgeBase(owner,{[field]:value+'X'}),label);assert.equal(stored(),previous);
 },facts=>assert.equal(facts.knowledge[field],value));
});
test('receptionist 5 never-say 200 lines accepted, 201 rejected, signed call keeps saved knowledge',async t=>{
 const lines=Array.from({length:200},(_,i)=>'Synthetic forbidden phrase '+i);
 await signedSave(t,()=>{saveKnowledgeBase(owner,{neverSay:lines});const previous=stored();bad(()=>saveKnowledgeBase(owner,{neverSay:[...lines,'Extra']}),'Never say');bad(()=>saveKnowledgeBase(owner,{neverSay:lines.join('\n')+'\nExtra'}),'Never say');assert.equal(stored(),previous);},facts=>assert.deepEqual(facts.knowledge.neverSay,lines));
});
test('receptionist 5 never-say line 20000 accepted, 20001 rejected, signed call',async t=>{
 const line='X'.repeat(20000);
 await signedSave(t,()=>{saveKnowledgeBase(owner,{neverSay:[line]});const previous=stored();bad(()=>saveKnowledgeBase(owner,{neverSay:[line+'X']}),'Never say');assert.equal(stored(),previous);},facts=>assert.equal(facts.knowledge.neverSay[0],line));
});
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(true),peakMonths:[],peakSurchargePercent:0};
const custom=()=>({serviceType:'CUSTOM',service:'Synthetic service',source:'MANUAL',active:true,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},tiers:[]});
function resetBook(services){savePricebook(owner,{...loadPricebook(owner),defaults,services:[]});saveApplicationBook(owner,{...readApplicationBook(owner),defaults,services});}
function approve(id){return approveApplicationService(owner,id,{revision:readApplicationBook(owner).revision,confirmConfiguration:true,confirmLegacySettings:true});}
function seedApprovedCopies(template,book,count){
 // Build synthetic historical receipts, then verify them through the real
 // application status check. Approval boundary operations below are real.
 return Array.from({length:count},()=>{
  const copy=structuredClone(template);copy.id=crypto.randomUUID();copy.origin.serviceId=copy.id;copy.quoteDoneApproval.serviceId=copy.id;
  const {quoteDoneApproval,...raw}=copy;const service=materializeVNextService(raw);delete service.active;delete service.confirmedFields;delete service.approvedValues;
  copy.quoteDoneApproval.contentDigest=digest({service,businessDefaults:book.defaults,legacySettings:[],ownerFeeSelections:{}});
  return copy;
 });
}
test('receptionist 5 service and product pricing labels are rejected at save without altering the book',async t=>{
 await signedSave(t,()=>{
  resetBook([custom()]);const previous=readApplicationBook(owner);
  for(const value of ['$95 service','Low Cost Roof 20','Rate 20','X'.repeat(501),'Bad\u0000name']){
   const changed=structuredClone(previous);changed.services[0].service=value;bad(()=>saveApplicationBook(owner,changed),'Service name');assert.deepEqual(readApplicationBook(owner),previous);
  }
  for(const key of ['rate_20','cost_10','p'.repeat(501)]){
   const changed=structuredClone(previous);changed.services[0].knownOfferings={kind:{[key]:crypto.randomUUID()}};bad(()=>saveApplicationBook(owner,changed),'Product name');assert.deepEqual(readApplicationBook(owner),previous);
  }
  approve(previous.services[0].id);db.prepare("UPDATE users SET plan='QuoteDone' WHERE id=?").run(owner);
 },facts=>assert.equal(facts.activeServices.length,1));
});
test('receptionist 5 1000 registered products accepted, 1001 rejected across fields, signed call',async t=>{
 await signedSave(t,()=>{
  const products=Object.fromEntries(Array.from({length:1000},(_,i)=>['product_'+i,crypto.randomUUID()]));
  // An unapproved catalog remains editable while ordinary answering stays on.
  resetBook([{...custom(),active:false,knownOfferings:{kind:products}}]);
  const previous=readApplicationBook(owner),changed=structuredClone(previous);changed.services[0].knownOfferings.other={extra:crypto.randomUUID()};
  bad(()=>saveApplicationBook(owner,changed),'1,000 registered products');assert.deepEqual(readApplicationBook(owner),previous);
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  const offerings=Object.keys(products).map(value=>({field:'kind',value,label:value.replaceAll('_',' ')}));
  const input={guideText,business:{businessName:'Synthetic',agentName:'Synthetic'},services:[{serviceType:'CUSTOM',serviceLabel:'Synthetic service',active:true,status:'QUOTING LIVE',offerings}]};
  assert.doesNotThrow(()=>compileVoiceSystemInstruction(input));
  input.services[0].offerings.push({field:'other',value:'extra',label:'Extra'});
  assert.throws(()=>compileVoiceSystemInstruction(input),error=>error.setting==='Registered products');
 },facts=>assert.equal(facts.activeServices.length,0));
});
test('receptionist 5 1000 live services accepted, 1001st approval and activation refused, signed call',async t=>{
 await signedSave(t,()=>{
  resetBook([custom()]);approve(readApplicationBook(owner).services[0].id);
  const book=loadPricebook(owner),template=book.services[0];book.services=seedApprovedCopies(template,book,1000);
  assert.equal(applicationStatus(book.services[0],book).status,'QUOTING LIVE');assert.equal(applicationStatus(book.services.at(-1),book).status,'QUOTING LIVE');
  savePricebook(owner,book);
  // Saving 1,000 live services is valid, as is another unapproved draft.
  saveApplicationBook(owner,readApplicationBook(owner));
  const draft=readApplicationBook(owner);draft.services.push(custom());saveApplicationBook(owner,draft);
  let before=readApplicationBook(owner);bad(()=>approve(before.services.at(-1).id),'1,000 services');assert.deepEqual(readApplicationBook(owner),before);
  // Legacy disabled approval becoming active must enforce the same ceiling.
  const legacy=loadPricebook(owner);legacy.services.push(...seedApprovedCopies(template,legacy,1).map(s=>({...s,active:false})));savePricebook(owner,legacy);
  before=readApplicationBook(owner);const activation=structuredClone(before);activation.services.at(-1).active=true;
  bad(()=>saveApplicationBook(owner,activation),'1,000 services');assert.deepEqual(readApplicationBook(owner),before);
  db.prepare("UPDATE users SET plan='QuoteDone' WHERE id=?").run(owner);
 },facts=>assert.equal(facts.activeServices.length,1000));
});
test('receptionist 5 compilation failure names the setting in durable dashboard and email alerts, isolated by tenant',async t=>{
 const messages=[];
 const h=await harness(t,{fail:true,beforeInstall:f=>f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({hours:'X'.repeat(20001)}),owner)});
 await h.connect();assert.equal(h.callbacks.length,0);assert.ok(h.errors.includes('VOICE_SETTINGS_INVALID'));
 const service=createOwnerAlertService({database:h.db,ready:()=>true,send:async message=>{messages.push(message);return {accepted:true,id:'synthetic-email'};}});
 const alert=service.list({ownerId:owner}).alerts.find(a=>a.eventType==='voice.settings_invalid');assert.ok(alert);assert.match(alert.settingMessage,/Hours/);
 assert.ok(h.service.dashboard(owner).notifications.some(a=>a.id===alert.id&&a.settingMessage.includes('Hours')));
 assert.equal(service.list({ownerId:'synthetic-b'}).alerts.length,0);await service.dispatchOnce();await service.dispatchOnce();
 const settingEmails=messages.filter(message=>message.subject.includes('Receptionist setting'));assert.equal(settingEmails.length,1);assert.match(settingEmails[0].text,/Hours/);assert.equal(settingEmails[0].to,'synthetic-a@example.invalid');assert.equal(service.list({ownerId:owner}).alerts.find(a=>a.id===alert.id).status,'ACCEPTED');
});
test('oversized preexisting receptionist prompt raises settings invalid before the provider opens',async t=>{
 const knowledge={about:'Synthetic work',neverSay:Array.from({length:10},(_,i)=>`${i}:`+'z'.repeat(19998))};
 const h=await harness(t,{fail:true,beforeInstall:f=>f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify(knowledge),owner)});
 await h.connect();assert.equal(h.callbacks.length,0);assert.ok(h.errors.includes('VOICE_SETTINGS_INVALID'));
 const alert=createOwnerAlertService({database:h.db,ready:()=>false}).list({ownerId:owner}).alerts.find(a=>a.eventType==='voice.settings_invalid');
 assert.ok(alert);assert.match(alert.settingMessage,/Business knowledge/);
});
