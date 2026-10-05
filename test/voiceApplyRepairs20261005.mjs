import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
// Temporary, exact-source codemod for the authorized isolated repair worktree.
// Removed from the final source checkpoint; it never runs against live data.
export function applyVoiceRepairs(root){
  const expected={
    'server/src/server.js':'d85f80e84a1f5b6755cf2b9292c5fc3806adde17',
    'server/src/voiceRuntimeRoutes.js':'c4e2034bc6276d535d444834724ad60141308987',
    'server/src/voice/voiceToolRuntime.js':'b5670a5246fa8c23966b101cc73fd37b8934d393',
    'server/src/voice/geminiMediaBridge.js':'79b7da7beb957155b597efb5ac2bc2541565658e',
    'test/voiceWebSocketServer.spec.mjs':'055c8543ddfc30484956830fc608a06711940aea'
  };
  const files=new Map();
  for(const [name,hash] of Object.entries(expected)){const source=readFileSync(path.join(root,name),'utf8');const actual=createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');if(actual!==hash)throw Error('Refusing to patch changed source: '+name);files.set(name,source);}
  function replace(name,before,after){const s=files.get(name);if(s.split(before).length!==2)throw Error('Patch does not match exactly once: '+name+' '+before.slice(0,100));files.set(name,s.replace(before,after));}
  function section(name,start,end,replacement){const s=files.get(name),a=s.indexOf(start),b=s.indexOf(end,a);if(a<0||b<0||s.indexOf(start,a+1)>=0)throw Error('Section mismatch: '+name);files.set(name,s.slice(0,a)+replacement+s.slice(b));}
  const runtime='server/src/voice/voiceToolRuntime.js';
  replace(runtime,"import {quoteDateContext} from '../quoteDate.js';","import {quoteDateContext} from '../quoteDate.js';\nimport {voiceQuestionContract,bindVoiceQuoteInputs} from './voiceQuoteContract.js';\nimport {projectVoiceQuote} from './voiceQuotePresentation.js';");
  replace(runtime,'  applicationStatus,','  cachedApplicationStatus,\n  applicationServiceDefinition,');
  replace(runtime,'    status: applicationStatus,',"    status: (service,book)=>cachedApplicationStatus(service,book,{quick:true}),\n    definition: service=>{try{return applicationServiceDefinition(service);}catch{return {customerFields:[]};}},");
  section(runtime,'function projectQuoteResult(response, quoteHandle, followUps = []) {','function completeAddress(address)',`function projectQuoteResult(response, quoteHandle, followUps = []) {
  return projectVoiceQuote(response, quoteHandle, followUps);
}

`);
  replace(runtime,'      serviceName: selected.name,\n      confidence:','      serviceName: selected.name,\n      questionContract: voiceQuestionContract(selected.service,quoteApp.definition(selected.service)),\n      confidence:');
  section(runtime,'    if (Array.isArray(args.feeSelectionHandles) && args.feeSelectionHandles.length) {','    const requestFingerprint = json({','');
  replace(runtime,'      customerInputs: args.customerInputs,\n      additionalWork:','      customerInputs: args.customerInputs,\n      productConfirmations: args.productConfirmations || {},\n      customerFeeSelections: args.customerFeeSelections || {},\n      additionalWork:');
  replace(runtime,'    const service = matches[0];\n    const submission = {',`    const service = matches[0];
    const definition=quoteApp.definition(service);
    const bound=bindVoiceQuoteInputs(service,definition,args);
    if(bound.followUps.length)return {status:'needs_details',resultType:'ESTIMATE_REQUIRES_REVIEW',followUps:bound.followUps,questionContract:voiceQuestionContract(service,definition)};
    const submission = {`);
  replace(runtime,'      customerInputs: args.customerInputs,\n      customerFeeSelections: {},','      customerInputs: bound.customerInputs,\n      customerFeeSelections: bound.customerFeeSelections,');
  replace(runtime,"      if (!record(slot) || typeof slot.slotId !== 'string' || !slot.slotId) return [];","      if (!record(slot) || typeof slot.slotId !== 'string' || !slot.slotId || typeof slot.label !== 'string' || !slot.label.trim() || slot.label.length > 200) return [];");
  section(runtime,'      const projected = { slotHandle };','      return [projected];','      const projected = { slotHandle, label: slot.label };\n');
  const routes='server/src/voiceRuntimeRoutes.js';
  section(routes,'function streamTwiml(url) {','function nonceDigest(nonce)',`function streamTwiml(url, resumeUrl = null) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response><Connect><Stream url="' + xmlText(url) + '"/></Connect>' +
    (resumeUrl ? '<Redirect method="POST">' + xmlText(resumeUrl) + '</Redirect>' : '') + '</Response>';
}

`);
  replace(routes,'  formParser,\n} = {}) {','  formParser,\n  resumeFallback = false,\n  fallbackPath: fallbackPathValue,\n  loadSessionByNonceHash,\n} = {}) {');
  replace(routes,'  const parseForm =',`  const fallbackPath=exactPath(fallbackPathValue,'/api/twilio/voice/fallback');
  if(typeof resumeFallback!=='boolean'||resumeFallback&&typeof loadSessionByNonceHash!=='function')fail('VOICE_RESUME_FALLBACK_REQUIRED');
  const parseForm =`);
  replace(routes,'      return sendXml(response, streamTwiml(streamUrl(base, streamPath, issued.nonce)));',"      return sendXml(response, streamTwiml(streamUrl(base, streamPath, issued.nonce),resumeFallback?base.origin+fallbackPath+'/'+issued.nonce:null));");
  replace(routes,'  return Object.freeze({ incomingPath, streamPath });',`  if(resumeFallback)app.post(fallbackPath+'/:nonce',parseForm,async(request,response)=>{
    try{
      const parameters=normalizedFormParameters(request.body);
      const validation=await twilioValidator.validateHttp({signature:request.get('x-twilio-signature'),requestPath:responsePath(request),params:parameters});
      const call=normalizeIncomingCall(parameters,validation?.accountSid,accountAllowlist);
      const nonce=request.params.nonce;
      if(!NONCE.test(nonce))fail('INVALID_SESSION_NONCE',403);
      const tenant=await tenantResolver.resolveByCalledNumber({To:call.to});
      const stored=await loadSessionByNonceHash({sessionKey:nonceDigest(nonce)});
      const context=stored?.context;
      if(!context||context.ownerId!==tenant.ownerId||context.callSid!==call.callSid||context.accountSid!==call.accountSid||context.from!==call.from||context.to!==call.to)fail('FALLBACK_BINDING_MISMATCH',403);
      return sendXml(response,await resolveFallbackTwiml({resolveFallback,recordFallback,context,tenant,reason:'VOICE_SESSION_UNAVAILABLE'}));
    }catch(error){return sendBoundaryFailure(response,error);}
  });
  return Object.freeze({ incomingPath, streamPath });`);
  const media='server/src/voice/geminiMediaBridge.js';
  replace(media,'  maxToolJsonBytes: 32 * 1024,','  maxToolJsonBytes: 32 * 1024,\n  maxToolResultJsonBytes: 256 * 1024,');
  replace(media,'function validateJsonValue(value, { maxBytes, code }) {','function validateJsonValue(value, { maxBytes, code, maxNodes = 2000 }) {');
  replace(media,'if (nodes > 2_000 || depth > 12)','if (nodes > maxNodes || depth > 12)');
  replace(media,'              maxBytes: limits.maxToolJsonBytes,\n              code: "INVALID_TOOL_RESPONSE",','              maxBytes: limits.maxToolResultJsonBytes,\n              maxNodes: 20000,\n              code: "INVALID_TOOL_RESPONSE",');
  const placeholder=`app.post('/api/twilio/voice/incoming', (_req, res) => {
  res.type('text/xml').send('<Response><Say>Your Off The Clock operator connection is ready.</Say></Response>');
});`;
  const bootstrap=`const {installProductionVoice} = await import('./voice/productionVoiceRuntime.js');
installProductionVoice({app,database:db,bookingService,runtimeConfig});`;
  replace('server/src/server.js',placeholder,bootstrap);
  replace('test/voiceWebSocketServer.spec.mjs','../server/src/voiceWebSocketServer.js','../server/src/voice/voiceWebSocketServer.js');
  const restored=files.get('server/src/server.js').replace(bootstrap,placeholder),hash=createHash('sha1').update('blob '+Buffer.byteLength(restored)+'\0').update(restored).digest('hex');
  if(hash!==expected['server/src/server.js'])throw Error('Other server.js content changed.');
  for(const [name,source] of files)writeFileSync(path.join(root,name),source);
  return [...files.keys()];
}
