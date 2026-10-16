import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture as voiceFixture,at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {fixture as quoteFixture} from '../verification/engine-independent/fixtures.mjs';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {approveApplicationService,bookRevision} from '../server/src/quoteDoneBridge.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';

// Expected BEFORE execution: a caller-confirmed approximate12×12×8 room,
//1door/2windows at100c labor/30c material per coat,2coats,10%paint waste,
// produces988.44 and the existing exact on-site line through the real runtime.
// No live provider is configured or contacted.
test('surface voice Oct16: confirmed estimated room dimensions quote through the actual tool runtime',async t=>{
 const h=voiceFixture(t),c=h.context(),f=quoteFixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2}],wallHeight:'standard',surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
 f.ownerPricing.priceBasisByCategory.material='sell_price';delete f.ownerPricing.origin;
 savePricebook(c.ownerId,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}});
 const book=loadPricebook(c.ownerId);approveApplicationService(c.ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC',quoteInstant:at});
 process.env.JWT_SECRET='SYNTHETIC_SURFACE_VOICE_KEY_NEVER_LIVE'.padEnd(64,'x');
 const runtime=createVoiceToolRuntime({database:h.db,callContext:c,handleSecret:secret,clock:()=>new Date(at)});
 const invoke=async(name,args)=>projectVoiceToolResult(name,await runtime.handlers[name]({context:c,args}));
 const matched=await invoke('matchService',{query:f.ownerPricing.service});assert.ok(matched.serviceHandle);
 const response=await invoke('getQuote',{serviceHandle:matched.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true,callerMeasurementsEstimated:true});
 assert.equal(response.status,'quoted',JSON.stringify(response));assert.equal(response.midEstimate,988.44);assert.equal(response.callerMeasurementsEstimated,true);
 assert.ok(response.voiceSummary.includes('This price is based on the measurements you gave us. The business will confirm them on site.'));
 assert.doesNotMatch(JSON.stringify(response),/laborPerWallSqftPerCoat|wallAdditionalCoatRatio|exactUnroundedCents/);
});
test('surface voice Oct16: service-specific blocks preserve shared instructions and require independent surfaces',()=>{
 const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
 const services=['INTERIOR_PAINTING','SIDING_REPLACEMENT'].map(serviceType=>({serviceType,serviceLabel:'[SYNTHETIC] '+serviceType,active:true,status:'QUOTING LIVE',offerings:[]}));
 const text=compileVoiceSystemInstruction({guideText,business:{businessName:'[SYNTHETIC] Business',agentName:'[SYNTHETIC] Receptionist'},services});
 assert.match(text,/Painting owner ruling \(October 16, 2026\)/);assert.match(text,/Siding owner ruling \(October 16, 2026\)/);assert.match(text,/separately for walls, selected ceilings and selected trim/);assert.match(text,/callerMeasurementsEstimated=true/);assert.doesNotMatch(text,/wallAdditionalCoatRatio/);
});
