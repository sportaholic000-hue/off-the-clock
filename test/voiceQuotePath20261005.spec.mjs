import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateVoiceToolCall } from '../server/src/voice/toolSchemas.js';
import { createVoiceToolDispatcher, projectVoiceToolResult } from '../server/src/voice/toolDispatcher.js';

// Baseline characterization only. This commit precedes production repairs.
// Every source inspected below is bound to the requested starting checkpoint.
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const runtime = source('server/src/voice/voiceToolRuntime.js');
const server = source('server/src/server.js');
const handle = 's'.repeat(43);
const context = { ownerId:'synthetic-owner', callSid:'CA'+'a'.repeat(32), accountSid:'AC'+'b'.repeat(32), from:'+19025550100', to:'+19025550101' };
const blob = text => createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');

test('baseline source is the exact requested voice/runtime checkpoint', () => {
  assert.equal(blob(runtime), 'b5670a5246fa8c23966b101cc73fd37b8934d393');
  assert.equal(blob(server), 'd85f80e84a1f5b6755cf2b9292c5fc3806adde17');
});

test('baseline finding 1: executable incoming handler is a placeholder', () => {
  const match = server.match(/app\.post\('\/api\/twilio\/voice\/incoming',[\s\S]*?\n\}\);/);
  assert.ok(match);
  let handler;
  Function('app', match[0])({post(_path, fn) {handler=fn;}});
  let response;
  handler({}, {type(){return this;},send(value){response=value;}});
  assert.equal(response, '<Response><Say>Your Off The Clock operator connection is ready.</Say></Response>');
  assert.doesNotMatch(response, /<Connect|<Dial|<Record/);
});

test('baseline finding 2: schema and guarded runtime have no compatible getQuote invocation', async () => {
  assert.match(runtime, /if \(args.customerConfirmed !== true\) throw runtimeError\('CUSTOMER_CONFIRMATION_REQUIRED'\)/);
  assert.throws(() => validateVoiceToolCall('getQuote',{serviceHandle:handle,customerInputs:{},customerConfirmed:true}), {code:'EXTRA_TOOL_FIELD'});
  const dispatcher=createVoiceToolDispatcher({callContext:context,handlers:{getQuote({args}){assert.equal(args.customerConfirmed, undefined);throw Error('CUSTOMER_CONFIRMATION_REQUIRED');}},idempotencyStore:{async run({execute}){return {status:'executed',value:await execute()};}}});
  await assert.rejects(dispatcher.dispatch({name:'getQuote',toolCallId:'synthetic-quote',args:{serviceHandle:handle,customerInputs:{}}}),{code:'TOOL_EXECUTION_FAILED'});
  assert.throws(() => validateVoiceToolCall('checkAvailability',{quoteHandle:handle,leadHandle:handle}),{code:'EXTRA_TOOL_FIELD'});
  for(const args of [{slotHandle:handle,leadHandle:handle,action:'hold',customerConfirmed:true},{holdHandle:handle,action:'confirm',customerConfirmed:true}]) assert.throws(()=>validateVoiceToolCall('bookAppointment',args));
});

test('baseline finding 3: dispatcher drops two-tier options', () => {
  const options=[{tierName:'Basic',lowEstimate:100,highEstimate:120,currency:'CAD',taxTreatment:'Includes applicable tax.',skippedAddons:['Lawn edging']},{tierName:'Complete',lowEstimate:150,highEstimate:180,currency:'CAD',taxTreatment:'Includes applicable tax.',skippedAddons:[]}];
  const output=projectVoiceToolResult('getQuote',{status:'quoted',lowEstimate:100,highEstimate:120,options});
  assert.equal(output.options,undefined);
  const body=runtime.slice(runtime.indexOf('function projectQuoteResult('),runtime.indexOf('function completeAddress('));
  assert.doesNotMatch(body,/estimate\?\.options|estimate\.options/);
});

test('baseline finding 4: matched service lacks the current questions and registered choices', () => {
  const body=runtime.slice(runtime.indexOf('async function matchService('),runtime.indexOf('async function getQuote('));
  assert.doesNotMatch(body,/customerFields|knownOfferings|questionContract/);
  assert.match(body,/serviceName: selected.name/);
  assert.match(runtime,/customerInputs: args.customerInputs/);
});

test('baseline finding 5: fee handles are refused and the quote submission has no fee answers', () => {
  assert.match(runtime,/Customer-selectable fee handles are not available/);
  assert.match(runtime,/customerFeeSelections: \{\}/);
});

test('baseline finding 6: a priced result fails at a 2001 character disclosure', () => {
  assert.doesNotThrow(()=>projectVoiceToolResult('getQuote',{status:'quoted',lowEstimate:100,highEstimate:120,disclaimer:'x'.repeat(2000)}));
  assert.throws(()=>projectVoiceToolResult('getQuote',{status:'quoted',lowEstimate:100,highEstimate:120,disclaimer:'x'.repeat(2001)}),{code:'INVALID_TOOL_RESULT'});
});

test('baseline finding 7: primitive and object __proto__ values are accepted', () => {
  for(const value of ['0','null','"bad"','{"sentinel":true}']) {
    const inputs=JSON.parse('{"__proto__":'+value+'}');
    const output=validateVoiceToolCall('getQuote',{serviceHandle:handle,customerInputs:inputs});
    assert.equal(Object.hasOwn(output.customerInputs,'__proto__'),false);
    if(value.includes('sentinel')) assert.equal(output.customerInputs.sentinel,true);
  }
  assert.equal({}.sentinel,undefined);
});

test('baseline finding 8: phone catalog invokes full uncached readiness', () => {
  assert.match(runtime,/status: applicationStatus/);
  assert.doesNotMatch(runtime,/cachedApplicationStatus/);
  assert.match(runtime,/quoteApp.status\(service, book\)/);
});

test('baseline finding 9: all nine tolerated failures and three missing imports are present', () => {
  const known=source('.github/known-test-failures.txt').trim().split('\n');
  assert.equal(known.length,9);
  for(const name of ['googleGenAiLiveAdapter','voicePromptCompiler','voiceWebSocketServer']) {
    assert.ok(known.includes('test/'+name+'.spec.mjs'));
    assert.equal(existsSync(new URL('../server/src/voice/'+name+'.js',import.meta.url)),false);
    assert.match(source('test/'+name+'.spec.mjs'),new RegExp('voice/'+name+'\\.js'));
  }
});
