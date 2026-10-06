import {isVoiceCaller} from './callerIdentity.js';
import { createHash } from 'node:crypto';
import {projectVoiceOptions,conciseVoiceSummary,VOICE_WRITTEN_LIMIT,VOICE_RESULT_BYTES} from './voiceQuotePresentation.js';
import {MUTATING_VOICE_TOOLS,isForbiddenVoiceField,validateVoiceToolCall} from './toolSchemas.js';

const E164=/^\+[1-9]\d{7,14}$/;
const CALL_SID=/^CA[0-9a-fA-F]{32}$/;
const ACCOUNT_SID=/^AC[0-9a-fA-F]{32}$/;
const OWNER_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const HANDLE=/^[A-Za-z0-9_-]{24,200}$/;
const TOOL_CALL_ID=/^[A-Za-z0-9_.:-]{1,200}$/;
const INTERNAL_OUTPUT_KEYS=new Set(['booksnapshot','applicationeligibility','providerresponse','calendarresponse','calendareventid','internalresult','calculationrecord','calculationrecords','approvedvalues','confirmedfields','lineitems','breakdown','request','ownerenvelope']);
export class VoiceToolDispatchError extends Error {
  constructor(code,statusCode=400){super('The voice action could not be completed safely.');this.name='VoiceToolDispatchError';this.code=code;this.statusCode=statusCode;}
}
const fail=(code,statusCode)=>{throw new VoiceToolDispatchError(code,statusCode);};
function assertPlainObject(value,code='INVALID_DISPATCH_OBJECT'){
  if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).some(key=>typeof key!=='string'))fail(code);
  for(const key of Object.keys(value))if(!('value' in Object.getOwnPropertyDescriptor(value,key)))fail(code);
}
function assertClosed(value,allowed,required=[],code='INVALID_DISPATCH_OBJECT'){
  assertPlainObject(value,code);if(Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))fail(code);
}
function normalizeCallContext(value){
  const keys=['ownerId','callSid','from','to','accountSid'];assertClosed(value,keys,keys,'INVALID_CALL_CONTEXT');
  const context=Object.fromEntries(keys.map(key=>[key,typeof value[key]==='string'?value[key].trim():'']));
  if(!OWNER_ID.test(context.ownerId)||!CALL_SID.test(context.callSid)||!isVoiceCaller(context.from)||!E164.test(context.to)||!ACCOUNT_SID.test(context.accountSid))fail('INVALID_CALL_CONTEXT');
  return Object.freeze(context);
}
function scanCustomerSafe(value,depth=0,budget={nodes:0},keyPath=''){
  if(++budget.nodes>20000||depth>12)fail('UNSAFE_TOOL_RESULT',502);
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='string'){const limit=/(?:^|\.)(?:writtenDisclosure|disclaimer)$/.test(keyPath)?VOICE_WRITTEN_LIMIT:4000;if(value.length>limit)fail('UNSAFE_TOOL_RESULT',502);return;}
  if(typeof value==='number'){if(!Number.isFinite(value))fail('UNSAFE_TOOL_RESULT',502);return;}
  if(Array.isArray(value)){if(value.length>100)fail('UNSAFE_TOOL_RESULT',502);value.forEach((item,index)=>scanCustomerSafe(item,depth+1,budget,keyPath+'.'+index));return;}
  assertPlainObject(value,'UNSAFE_TOOL_RESULT');if(Object.keys(value).length>100)fail('UNSAFE_TOOL_RESULT',502);
  for(const key of Object.keys(value)){
    if(isForbiddenVoiceField(key)||INTERNAL_OUTPUT_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g,'')))fail('UNSAFE_TOOL_RESULT',502);
    scanCustomerSafe(value[key],depth+1,budget,keyPath+'.'+key);
  }
}
function resultText(value,max=2000){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('INVALID_TOOL_RESULT',502);return value.trim();}
function resultHandle(value){if(typeof value!=='string'||!HANDLE.test(value))fail('INVALID_TOOL_RESULT',502);return value;}
function resultMoney(value){if(typeof value==='number'&&Number.isFinite(value)&&value>=0)return value;if(typeof value==='string'&&/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value))return value;fail('INVALID_TOOL_RESULT',502);}
function resultTextList(value,maxItems=30){if(!Array.isArray(value)||value.length>maxItems)fail('INVALID_TOOL_RESULT',502);return value.map(item=>resultText(item,1000));}
function copyIf(result,output,key,reader){if(Object.hasOwn(result,key))output[key]=reader(result[key]);}
function baseResult(result){assertPlainObject(result,'INVALID_TOOL_RESULT');scanCustomerSafe(result);if(Buffer.byteLength(JSON.stringify(result),'utf8')>VOICE_RESULT_BYTES)fail('UNSAFE_TOOL_RESULT',502);return {status:resultText(result.status,80)};}
function publicQuestionContract(value){
  assertClosed(value,['fields','customerFees'],['fields','customerFees'],'INVALID_TOOL_RESULT');
  if(!Array.isArray(value.fields)||value.fields.length>64||!Array.isArray(value.customerFees)||value.customerFees.length>4)fail('INVALID_TOOL_RESULT',502);
  const fields=value.fields.map(field=>{
    assertClosed(field,['field','label','type','unit','required','min','max','showWhen','requiredWhen','applicableWhen','choices','moreChoicesAvailable','productConfirmationRequired'],['field','label','type'],'INVALID_TOOL_RESULT');
    for(const key of ['field','label','type'])resultText(field[key],1000);return structuredClone(field);
  });
  const customerFees=value.customerFees.map(fee=>{
    assertClosed(fee,['field','label','type'],['field','label','type'],'INVALID_TOOL_RESULT');
    if(!['travel','disposal','permit','overhead'].includes(fee.field)||fee.type!=='boolean')fail('INVALID_TOOL_RESULT',502);
    resultText(fee.label,200);return {...fee};
  });return {fields,customerFees};
}
const PROJECTORS=Object.freeze({
  matchService(result){
    const output=baseResult(result);
    copyIf(result,output,'serviceHandle',resultHandle);copyIf(result,output,'serviceName',value=>resultText(value,200));copyIf(result,output,'clarification',value=>resultText(value,500));copyIf(result,output,'questionContract',publicQuestionContract);
    if(result.confidence!==undefined){if(typeof result.confidence!=='number'||result.confidence<0||result.confidence>1)fail('INVALID_TOOL_RESULT',502);output.confidence=result.confidence;}return output;
  },
  getQuote(result){
    const output=baseResult(result); // Inspect all fields before projection; hidden rates are rejected, not silently dropped.
    copyIf(result,output,'quoteHandle',resultHandle);copyIf(result,output,'resultType',value=>resultText(value,80));
    for(const key of ['lowEstimate','midEstimate','highEstimate','fullJobTotal'])copyIf(result,output,key,key==='fullJobTotal'?value=>value===null?null:resultMoney(value):resultMoney);
    for(const key of ['priceDrivers','pricedScope','additionalWork','followUps','skippedAddons'])copyIf(result,output,key,resultTextList);
    for(const key of ['customerMessage','additionalWorkStatus','currency','taxTreatment','priceUnit'])copyIf(result,output,key,value=>resultText(value,2000));
    copyIf(result,output,'questionContract',publicQuestionContract);
    try{
      if(result.options!==undefined)output.options=projectVoiceOptions(result.options);
      const written=result.writtenDisclosure??result.disclaimer;if(written!==undefined){resultText(written,VOICE_WRITTEN_LIMIT);output.writtenDisclosure=written;}
      output.voiceSummary=conciseVoiceSummary(output);output.disclaimer=output.voiceSummary;
    }catch(error){if(error instanceof VoiceToolDispatchError)throw error;fail('INVALID_TOOL_RESULT',502);}
    return output;
  },
  checkAvailability(result){
    const output=baseResult(result);copyIf(result,output,'message',value=>resultText(value,1000));
    if(result.slotOptions!==undefined){if(!Array.isArray(result.slotOptions)||result.slotOptions.length>10)fail('INVALID_TOOL_RESULT',502);
      output.slotOptions=result.slotOptions.map(slot=>{assertClosed(slot,['slotHandle','label'],['slotHandle','label'],'INVALID_TOOL_RESULT');return {slotHandle:resultHandle(slot.slotHandle),label:resultText(slot.label,200)};});}
    return output;
  },
  bookAppointment(result){const output=baseResult(result);copyIf(result,output,'appointmentHandle',resultHandle);copyIf(result,output,'confirmation',value=>resultText(value,1000));copyIf(result,output,'message',value=>resultText(value,1000));return output;},
  captureLead(result){const output=baseResult(result);copyIf(result,output,'leadHandle',resultHandle);copyIf(result,output,'message',value=>resultText(value,1000));return output;},
  logQuoteRequest(result){const output=baseResult(result);copyIf(result,output,'requestHandle',resultHandle);copyIf(result,output,'message',value=>resultText(value,1000));return output;},
  sendSms(result){const output=baseResult(result);copyIf(result,output,'message',value=>resultText(value,1000));return output;},
  flagUrgent(result){const output=baseResult(result);copyIf(result,output,'caseHandle',resultHandle);copyIf(result,output,'message',value=>resultText(value,1000));return output;},
  transferCall(result){const output=baseResult(result);copyIf(result,output,'message',value=>resultText(value,1000));copyIf(result,output,'callbackSaved',value=>{if(typeof value!=='boolean')fail('INVALID_TOOL_RESULT',502);return value;});return output;},
  modifyAppointment(result){const output=baseResult(result);copyIf(result,output,'appointmentHandle',resultHandle);copyIf(result,output,'confirmation',value=>resultText(value,1000));copyIf(result,output,'message',value=>resultText(value,1000));return output;},
  getCustomerContext(result){const output=baseResult(result);copyIf(result,output,'customerHandle',resultHandle);copyIf(result,output,'greetingName',value=>resultText(value,120));copyIf(result,output,'recentAppointments',value=>resultTextList(value,10));copyIf(result,output,'message',value=>resultText(value,1000));return output;}
});
export function projectVoiceToolResult(name,result){const projector=PROJECTORS[name];if(typeof projector!=='function')fail('UNKNOWN_VOICE_TOOL');return Object.freeze(projector(result));}
function requestDigest(name,args){return createHash('sha256').update(JSON.stringify({name,args}),'utf8').digest('hex');}

/** Durable idempotency is mandatory: exact retries replay; conflicting reuse fails. */
export function createVoiceToolDispatcher({handlers,callContext,idempotencyStore}={}){
  if(!handlers||typeof handlers!=='object'||Array.isArray(handlers))fail('TOOL_HANDLERS_REQUIRED',500);
  if(!idempotencyStore||typeof idempotencyStore.run!=='function')fail('IDEMPOTENCY_STORE_REQUIRED',500);
  const context=normalizeCallContext(callContext);
  const scope=createHash('sha256').update(`${context.ownerId}\0${context.callSid}`,'utf8').digest('hex');
  let mutationTail=Promise.resolve();
  function invoke(name,args){
    const handler=handlers[name];if(typeof handler!=='function')fail('TOOL_UNAVAILABLE',503);
    return Promise.resolve().then(()=>handler({context,args})).then(result=>projectVoiceToolResult(name,result)).catch(error=>{if(error instanceof VoiceToolDispatchError)throw error;fail('TOOL_EXECUTION_FAILED',502);});
  }
  function enqueueMutation(task){const current=mutationTail.then(task,task);mutationTail=current.then(()=>undefined,()=>undefined);return current;}
  return Object.freeze({get context(){return context;},async dispatch(request){
    assertClosed(request,['name','args','toolCallId'],['name','args']);const {name}=request,args=validateVoiceToolCall(name,request.args),mutating=MUTATING_VOICE_TOOLS.includes(name);
    if(!mutating)return invoke(name,args);if(typeof request.toolCallId!=='string'||!TOOL_CALL_ID.test(request.toolCallId))fail('TOOL_CALL_ID_REQUIRED');
    const digest=requestDigest(name,args);
    return enqueueMutation(async()=>{
      let outcome;try{outcome=await idempotencyStore.run({scope,key:request.toolCallId,digest,execute:()=>invoke(name,args)});}catch(error){if(error instanceof VoiceToolDispatchError)throw error;fail('IDEMPOTENCY_STORE_FAILED',503);}
      if(outcome?.status==='conflict')fail('IDEMPOTENCY_CONFLICT',409);if(!['executed','replayed'].includes(outcome?.status))fail('INVALID_IDEMPOTENCY_RESULT',500);
      return projectVoiceToolResult(name,outcome.value);
    });
  }});
}
