import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleGenAiLiveSessionOpener} from '../server/src/voice/googleGenAiLiveAdapter.js';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {customerHistory} from '../server/src/customerHistoryService.js';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';

const tick=async()=>{await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));};
function live(options={}){
 const connections=[],events=[];
 const client={live:{connect:async input=>{
  const row={input,audio:[],tools:[],closes:0};connections.push(row);
  return {sendRealtimeInput:value=>row.audio.push(value),sendToolResponse:value=>row.tools.push(value),close:()=>{row.closes++;}};
 }}};
 const opener=createGoogleGenAiLiveSessionOpener({client,model:'synthetic-live-model',systemInstruction:'[SYNTHETIC] receptionist',toolDeclarations:[{name:'captureLead',description:'Synthetic',parameters:{type:'OBJECT',properties:{}}}],...options});
 const callbacks={onAudio:async value=>events.push(['audio',value]),onInterruption:async()=>{},onTranscript:async value=>events.push(['text',value]),onToolCall:async value=>events.push(['tool',value]),onError:async()=>events.push(['error']),onClose:async()=>events.push(['close'])};
 return {connections,events,open:()=>opener({context:{ownerId:'synthetic-a'},session:{callRecordId:'synthetic'},audio:{inputMimeType:'audio/pcm;rate=16000',outputMimeType:'audio/pcm;rate=24000'},callbacks})};
}
const handle=(row,value,resumable=true)=>row.input.callbacks.onmessage({sessionResumptionUpdate:{newHandle:value,resumable}});
const audio=(s,n)=>s.sendAudio({data:Buffer.from([n,0]),mimeType:'audio/pcm;rate=16000'});

test('goAway while a turn is active retains the last handle and drains speech until turnComplete',async()=>{
 const h=live(),s=await h.open(),old=h.connections[0];handle(old,'h1');
 old.input.callbacks.onmessage({sessionResumptionUpdate:{resumable:false}});
 old.input.callbacks.onmessage({goAway:{timeLeft:'10s'}});
 old.input.callbacks.onmessage({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:'AAEC'}}]}}});
 await tick();assert.equal(h.connections.length,1);assert.deepEqual(h.events.filter(e=>e[0]==='audio').map(e=>e[1].data),['AAEC']);
 old.input.callbacks.onmessage({serverContent:{turnComplete:true}});
 await tick();assert.equal(h.connections.length,2);assert.equal(h.connections[1].input.config.sessionResumption.handle,'h1');
 assert.deepEqual(h.events.filter(e=>e[0]==='error'),[]);await s.close();
});
test('a fresh resumable handle during goAway is used after the current speech',async()=>{
 const h=live(),s=await h.open(),old=h.connections[0];handle(old,'h1');old.input.callbacks.onmessage({sessionResumptionUpdate:{resumable:false}});
 old.input.callbacks.onmessage({goAway:{timeLeft:'10s'}});
 await new Promise(resolve=>setTimeout(resolve,5));handle(old,'h2');await tick();
 assert.equal(h.connections.length,2);assert.equal(h.connections[1].input.config.sessionResumption.handle,'h2');await s.close();
});
test('idle goAway reconnects immediately; warning deadline uses last good handle',async()=>{
 const idle=live(),s1=await idle.open(),one=idle.connections[0];handle(one,'h1');one.input.callbacks.onmessage({goAway:{timeLeft:'10s'}});await tick();assert.equal(idle.connections.length,2);await s1.close();
 const active=live(),s2=await active.open(),old=active.connections[0];handle(old,'h1');old.input.callbacks.onmessage({sessionResumptionUpdate:{resumable:false}});old.input.callbacks.onmessage({goAway:{timeLeft:'1s'}});await tick();assert.equal(active.connections.length,2);assert.equal(active.connections[1].input.config.sessionResumption.handle,'h1');await s2.close();
});
test('transparent resumption replays unconsumed caller audio once in order',async()=>{
 const h=live({transparentSessionResumption:true}),s=await h.open(),old=h.connections[0];
 assert.equal(old.input.config.sessionResumption.transparent,true);
 await audio(s,1);await audio(s,2);handle(old,'h1');
 old.input.callbacks.onmessage({sessionResumptionUpdate:{resumable:true,lastConsumedClientMessageIndex:'0'}});
 old.input.callbacks.onmessage({goAway:{timeLeft:'10s'}});
 const pending=audio(s,3);await pending;await tick();
 assert.equal(h.connections.length,2);
 const received=h.connections[1].audio.map(item=>Buffer.from(item.audio.data,'base64')[0]);
 assert.deepEqual(received,[2,3]);assert.deepEqual(h.events.filter(e=>e[0]==='error'),[]);await s.close();
});

function savedCaller(f){
 const old=f.context(),v=f.voice(old);
 return v.tool('captureLead',{name:'Sally Synthetic',description:'[SYNTHETIC] private deck repair'});
}
async function identity(f,turn,answer){
 await savedCaller(f);const c=f.context(),v=f.voice(c),first=await v.tool('getCustomerContext',{});
 assert.equal(first.status,'identity_unconfirmed');
 const transcript=[{role:'assistant',text:turn||`Hello. Am I speaking with Sally${turn===null?'':'?'}`,final:true}];
 for(const piece of answer)transcript.push({role:'caller',text:piece,final:true});
 f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify(transcript),c.ownerId,c.callSid);
 return v.tool('getCustomerContext',{callerConfirmedIdentity:true});
}
for(const [name,turn,parts] of [
 ['greeting plus question','Hello! Am I speaking with Sally?',['Yes.']],
 ['missing punctuation','Am I speaking with Sally',['Yes.']],
 ['yeah that is me','Hello, Sally?',['Yeah, that\'s me.']],
 ['yes it is me','Am I speaking with Sally?',['Yes, it\'s me.']],
 ['pieces','Am I speaking with Sally?',['Yes',' it is.']],
 ['intro','Hello! Am I speaking with Sally?',['Hi, yes, this is Sally.']],
 ['yup','Am I speaking with Sally?',['Yup.']],
 ['self naming','Am I speaking with Sally?',["I'm Sally."]],
 ])test(`identity accepts ${name}`,async t=>{
 const result=await identity(fixture(t),turn,parts);assert.equal(result.status,'found');assert.ok(result.openLeads.some(x=>/deck/.test(x.description)));
 });
test('no-name question uses approved wording and a clear yes releases history',async t=>{
 const f=fixture(t),old=f.context();f.ownerQuery('UPDATE calls SET status=?,createdAt=?,transcriptJson=? WHERE ownerId=? AND id=?').run('FAILED',new Date(Date.parse(at)-60000).toISOString(),JSON.stringify([{role:'caller',text:'[SYNTHETIC] deck'}]),old.ownerId,old.callSid);
 const c=f.context(),v=f.voice(c),first=await v.tool('getCustomerContext',{});
 assert.equal(first.message,'Have you called us before from this number?');
 f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:'Hi. Have you called us before from this number?',final:true},{role:'caller',text:'Yes.',final:true}]),c.ownerId,c.callSid);
 assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'found');
});
test('silence is retryable and a subsequent clear yes confirms',async t=>{
 const f=fixture(t);await savedCaller(f);const c=f.context(),v=f.voice(c);await v.tool('getCustomerContext',{});
 f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:'Hi, am I speaking with Sally?',final:true}]),c.ownerId,c.callSid);
 assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'identity_unconfirmed');
 f.ownerQuery('UPDATE calls SET transcriptJson=? WHERE ownerId=? AND id=?').run(JSON.stringify([{role:'assistant',text:'Hi, am I speaking with Sally?',final:true},{role:'caller',text:'Yes.',final:true}]),c.ownerId,c.callSid);
 assert.equal((await v.tool('getCustomerContext',{callerConfirmedIdentity:true})).status,'found');
});
for(const [name,answer] of [['no',"No, this isn't Sally."],['unclear',"Maybe, who's asking?"]])test(`identity ${name} reveals nothing`,async t=>{
 const result=await identity(fixture(t),'Am I speaking with Sally?',[answer]);assert.equal(result.status,'not_found');assert.doesNotMatch(JSON.stringify(result),/deck|Sally/);
});

test('previous speech redacts every receptionist number and all caller money forms, retaining measurements',t=>{
 const f=fixture(t),old=f.context();const lines=[
  {role:'assistant',text:'Between 4,820 and 5,840 dollars.'},
  {role:'model',text:'About forty-eight hundred dollars.'},
  {role:'assistant',text:'Roughly twelve hundred bucks for the deck.'},
  {role:'model',text:'It would be 875 for the railing.'},
  {role:'caller',text:'It was $875, 900 dollars, twelve hundred bucks, and 5 grand for the 10 foot deck.'},
  {role:'caller',text:'I measured 12 feet by 10 feet.'}
 ];
 f.ownerQuery('UPDATE calls SET status=?,createdAt=?,transcriptJson=? WHERE ownerId=? AND id=?').run('FAILED',new Date(Date.parse(at)-60000).toISOString(),JSON.stringify(lines),old.ownerId,old.callSid);
 const c=f.context(),result=customerHistory(f.db,c,{now:Date.parse(at),ownerQuery:f.ownerQuery});const excerpt=result.previousCall.transcriptExcerpt;
 assert.doesNotMatch(excerpt.filter(x=>x.role==='receptionist').map(x=>x.text).join(' '),/\d|forty|hundred|twelve/);
 assert.doesNotMatch(excerpt.filter(x=>x.role==='caller').map(x=>x.text).join(' '),/875|900|hundred|grand|\$|5 grand/);
 assert.match(excerpt.at(-1).text,/12 feet by 10 feet/);
});

const calculate=(listing,quantity='10')=>calculateSavedListedPrice({prices:listing},{listedItem:listing,quantity,customerConfirmed:true});
for(const [listing,expected] of [
 ['Pressure-treated 2x4 $3.50 each.','35.00'],['2x4 stud $3.50 each.','35.00'],
 ['Grade 2 lumber $5 each','50.00'],['3/4 inch plywood $5 each','50.00'],['#2 lumber $5 each','50.00']
])test(`numeric product name: ${listing}`,()=>{
 const result=calculate(listing);assert.equal(result.status,'calculated');assert.equal(result.extendedAmount,expected);assert.equal(result.listedItem,listing);
});
for(const listing of ['Lumber $5 each, 10 or more $4 each','Lumber $5 each or 2 for $9','Lumber pack of 6 $5 each','Lumber first 3 $5 each','Lumber per 100 $5 each','Lumber min 5 $5 each'])test(`quantity condition refused: ${listing}`,()=>{
 assert.equal(calculate(listing).status,'needs_review');
});
