import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {rewriteKnowledgeText} from '../server/src/voice/knowledgeText.js';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import {validateVoiceToolCall} from '../server/src/voice/toolSchemas.js';
import {voiceRouteReadiness} from '../server/src/voice/voiceReadiness.js';
import {createGoogleGenAiLiveSessionOpener} from '../server/src/voice/googleGenAiLiveAdapter.js';
import {validateRuntimeConfig} from '../server/src/runtimeConfig.js';
import {syntheticVoiceEnvironment} from '../verification/receptionist-20261008/docker-voice-smoke.mjs';
import {db} from '../server/src/db.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {saveKnowledgeBase} from '../server/src/onboardingService.js';

const guide=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const prompt=(knowledge={})=>compileVoiceSystemInstruction({guideText:guide,business:{businessName:'Synthetic Works',agentName:'Nova'},services:[{serviceType:'LANDSCAPING_SOD',serviceLabel:'Sod installation',active:true,status:'QUOTING LIVE',offerings:[]}],knowledge});

test('system 1 work requests use the live engine ahead of a matching product listing',()=>{
 const text=prompt({prices:'Sod pickup: $4 per roll.'});
 assert.match(text,/caller wants work done[\s\S]*matchService(?:\s*\/\s*| and )getQuote/i);
 assert.match(text,/buying or picking up[\s\S]*listed price/i);
 assert.match(text,/unclear[\s\S]*ask one question/i);
 assert.doesNotMatch(text,/If the caller asks about something that is not listed, use matchService/);
});

test('system 2 contact-only lines vanish in prompt and calculation without touching price or discount',()=>{
 const prices='Window washing: $6 each.\nText us for a quote.\n\nCall to book.\n\nText us for a 10% discount.';
 const cleaned=rewriteKnowledgeText(prices);
 assert.equal(cleaned,'Window washing: $6 each.\n\nText us for a 10% discount.');
 const facts=JSON.parse(prompt({prices}).match(/<OWNER_FACTS_JSON>\n([\s\S]*?)\n<\/OWNER_FACTS_JSON>/)[1]);
 assert.equal(facts.knowledge.prices,cleaned);
 const quote=calculateSavedListedPrice({prices},{listedItem:'Window washing: $6 each.',quantity:'10',customerConfirmed:true});
 assert.equal(quote.extendedAmount,'60.00');assert.doesNotMatch(quote.voiceSummary,/call|text|email|message us/i);
 assert.equal(rewriteKnowledgeText('Text us for a 10% discount.'),'Text us for a 10% discount.');
 assert.equal(rewriteKnowledgeText('Email us for more details. Message us to schedule a visit.'),'');
});

test('system 3 caller-estimated measurements retain exact geometry, quote and owner warning',async()=>{
 const {calculateVoiceArea}=await import('../server/src/voice/measurementArea.js');
 assert.deepEqual(calculateVoiceArea({length:'10.25',width:'10.1',customerConfirmed:true}),{status:'calculated',areaSqft:'103.525'});
 assert.throws(()=>calculateVoiceArea({length:'10',width:'10',customerConfirmed:false}));
 const args={serviceHandle:'x'.repeat(43),customerInputs:{sodSqft:150},customerConfirmed:true,callerMeasurementsEstimated:true};
 assert.equal(validateVoiceToolCall('getQuote',args).callerMeasurementsEstimated,true);
 const source={resultType:'INSTANT_ESTIMATE_READY',lowEstimate:100,highEstimate:120,currency:'CAD'};
 const q=projectVoiceToolResult('getQuote',projectVoiceQuote(source,'x'.repeat(43),[],{callerMeasurementsEstimated:true}));
 assert.match(q.quoteNarration,/This price is based on the measurements you gave us\. The business will confirm them on site\. This is a preliminary estimate/);
 assert.match(q.voiceSummary,/This price is based on the measurements you gave us/);
 assert.match(prompt(),/about 150 feet[\s\S]*caller('s|’s) estimate[\s\S]*confirm/i);
 assert.doesNotMatch(prompt(),/Missing or uncertain measurements for the selected work block a released quote/);
});

test('system 4 identity answers accurately and does not name the provider',()=>{
 const text=prompt();
 assert.match(text,/digital employee of (?:the business|\[business name\]|business\.businessName)/i);
 assert.match(text,/If asked whether that means AI, say yes/i);
 assert.match(text,/Never volunteer being AI/i);
 assert.match(text,/Never name the technology/i);
 assert.doesNotMatch(text,/Never call yourself the AI or the operator/);
 assert.match(text,/never say "price book" to a caller/i);
});

test('system 5 confirmed booking projects local time, zone and service address',()=>{
 const result=projectVoiceToolResult('bookAppointment',{status:'confirmed',appointmentHandle:'x'.repeat(43),message:'The appointment is confirmed.',startLocal:'2026-10-09T09:00:00',endLocal:'2026-10-09T09:30:00',timezone:'America/Halifax',serviceAddress:{line1:'10 Synthetic Road',city:'Halifax',region:'NS',postalCode:'B3H 1A1',country:'CA'}});
 assert.equal(result.startLocal,'2026-10-09T09:00:00');assert.equal(result.endLocal,'2026-10-09T09:30:00');assert.equal(result.timezone,'America/Halifax');assert.equal(result.serviceAddress.line1,'10 Synthetic Road');
 assert.match(prompt(),/After bookAppointment confirms success, clearly repeat its returned date, time and address/);
});

test('system 6 oversized saved knowledge is rejected before storage with characters to cut',()=>{
 migrateDatabase(db);const owner='synthetic-system-limit';
 db.prepare("INSERT OR IGNORE INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Works','Operator','active','UTC','owner','2026-10-08T00:00:00.000Z')").run(owner,owner+'@example.invalid');
 const knowledge={about:'Synthetic service',neverSay:Array.from({length:10},(_,i)=>`${i}:`+'z'.repeat(19998))};
 assert.ok(knowledge.neverSay.join('').length>190000);
 assert.throws(()=>saveKnowledgeBase(owner,knowledge),error=>error.statusCode===400&&/cut\s+(?:at least\s+)?[\d,]+\s+characters?/i.test(error.message));
 assert.notDeepEqual(db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(owner)?.knowledgeBaseJson,JSON.stringify(knowledge));
});

test('system 7 startup, readiness and adapter agree on explicit Live model names',()=>{
 const env=syntheticVoiceEnvironment('/tmp/synthetic-system-model');
 assert.equal(voiceRouteReadiness({env,runtimeConfig:{voiceRuntime:true,providerWrites:true}}).ready,true);
 validateRuntimeConfig(env);
 const bogus={...env,GEMINI_MODEL:'synthetic-model'};
 assert.equal(voiceRouteReadiness({env:bogus,runtimeConfig:{voiceRuntime:true,providerWrites:true}}).ready,false);
 assert.throws(()=>validateRuntimeConfig(bogus),/explicit Gemini Live model/);
 assert.throws(()=>createGoogleGenAiLiveSessionOpener({client:{live:{connect(){}}},model:bogus.GEMINI_MODEL,systemInstruction:'Synthetic',toolDeclarations:[{name:'synthetic'}]}),{code:'GOOGLE_LIVE_MODEL_REQUIRED'});
});
