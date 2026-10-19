import '../qe-agent1-activation-parity-review-20261019/application.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cases} from '../qe-agent1-activation-parity-review-20261019/cases.mjs';
import {application} from '../qe-agent1-activation-parity-review-20261019/application.mjs';
import {convertApplicationBook,calculateApplicationQuote} from '../../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../../server/priceBookService.js';
import {generateQuoteVNext,validatePricingStructuresDetailed} from '../../server/quote-engine-vnext/index.js';
const dir=path.dirname(new URL(import.meta.url).pathname),name=process.argv[2]||'run-01',out=path.resolve(dir,name);
if(fs.existsSync(out))throw Error('Never overwrite a previous execution');fs.mkdirSync(out,{recursive:true});
const all=process.env.REPAIR_CASES?(await import('./cases.mjs')).cases():cases(),selected=process.env.CASE_FILTER?all.filter(c=>new RegExp(process.env.CASE_FILTER).test(c.id)):all;
const write=(file,x)=>fs.writeFileSync(path.join(out,file),JSON.stringify(x,null,2));
const zipped=(file,x)=>fs.writeFileSync(path.join(out,file+'.json.gz'),gzipSync(JSON.stringify(x,null,2)));
// Snapshot and hash independent expectations BEFORE the first application comparison.
write('expectations.json',selected.map(({id,serviceType,variant,expected,note})=>({id,serviceType,variant,expected,note})));
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const productionBase='2b452feeb1af7c288c19b12bea5b95e48b81920e';
// Branch ownership is qualified separately with qualify-source.mjs BASE HEAD.
// Behavioral regressions run against the current tree, including approved merges.
if(process.env.CAPTURE&&execFileSync('git',['diff','--','server'],{encoding:'utf8'}))throw Error('Capture requires pristine production');
write('production-diff.json',{diff:execFileSync('git',['diff',productionBase,'--','server'],{encoding:'utf8'})});
write('binding.json',{source,productionBase,node:process.version,started:new Date().toISOString(),expectationsSha256:createHash('sha256').update(fs.readFileSync(path.join(out,'expectations.json'))).digest('hex'),providers:'synthetic only',selected:selected.length});
const cleanup=[],t={after:fn=>cleanup.unshift(fn)},results=[];
const cents=r=>r?.pricedEstimate?cents(r.pricedEstimate):r?.options?.length?r.options.map(o=>Math.round(o.midEstimate*100)):typeof r?.midEstimate==='number'?[Math.round(r.midEstimate*100)]:[];
try{
 const app=await application(t);
 for(let i=0;i<Number(process.env.CAPTURE_CONTEXT_OFFSET||0);i++)app.owner('synthetic-capture-offset-'+i);
 for(const [index,row] of selected.entries()){
  const owner='audit-'+path.basename(name)+'-'+index,voice=app.owner(owner),wire=[],data={id:row.id,expected:row.expected,input:row.input},faults=[];
  async function call(method,url,body,publicRequest=false){const response=await app.request(owner,url,{method,body,publicRequest});wire.push({method,url,request:body??null,...response});return response;}
  async function ok(method,url,body,publicRequest=false){const r=await call(method,url,body,publicRequest);if(r.status!==200)throw Error(method+' '+url+' HTTP'+r.status+' '+JSON.stringify(r.body));return r.body;}
  try{
   const f=row.input,service=structuredClone(f.ownerPricing);service.id=randomUUID();service.validationInputs=structuredClone(f.customerInputs);
   const initial=await ok('GET','/api/pricebook/'+owner),converted=convertApplicationBook({services:[service],defaults:f.businessDefaults},'toDollars');
   await ok('POST','/api/pricebook/save',{...initial,services:converted.services,defaults:converted.defaults});
   let saved=await ok('GET','/api/pricebook/'+owner);data.initialSaved=loadPricebook(owner);
   // Owner consciously confirms exactly the new starting values shown by save.
   for(let pass=0;pass<3;pass++){
    const s=saved.services[0],start=Object.keys(s.startingValueState||{}),dependent=Object.keys(s.dependentLineState||{});
    if(!start.length&&!dependent.length)break;
    if(start.length)s.startingValueActions={confirmPaths:start};
    if(dependent.length)s.dependentLineActions={reenteredIds:dependent,confirmIds:dependent};
    await ok('POST','/api/pricebook/save',saved);saved=await ok('GET','/api/pricebook/'+owner);
   }
   const access=await ok('POST','/api/quotedone/access',{allowedOrigins:[app.base]}),publicPath='/api/public/quote/'+access.publicKey;
   data.beforeApprovalCatalog=await ok('GET',publicPath,undefined,true);
   data.beforeApprovalVoice=await voice.tool('matchService',{query:service.service});
   data.beforeApproval=(await ok('POST','/api/pricebook/validate',saved)).statuses[0];
   data.approve=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:data.beforeApproval.confirmationFields||[]});
   saved=await ok('GET','/api/pricebook/'+owner);data.book=loadPricebook(owner);
   data.ownerValidation=(await ok('POST','/api/pricebook/validate',saved)).statuses[0];
   data.structureDiagnostics=validatePricingStructuresDetailed(f.serviceType,data.book.services[0].pricing);
   app.db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run(owner,service.id,'2026-10-06T12:00:00.000Z');
   data.catalog=await ok('GET',publicPath,undefined,true);
   const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:f.customerInputs,customerFeeSelections:{},additionalWork:[],contact:{email:'caller@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
   data.applicationCalculation=calculateApplicationQuote(data.book,data.book.services[0],body,{ownerId:owner,preparingIntake:true,timeZone:'UTC',quoteInstant:'2026-10-06T12:00:00.000Z'});
   data.direct=data.applicationCalculation.internalResult||data.applicationCalculation.customerResult;
   if(data.applicationCalculation.request){const diagnostic=structuredClone(data.applicationCalculation.request);diagnostic.ownerPricing.active=true;data.selectionOnly=generateQuoteVNext(diagnostic);}
   data.prepare=await call('POST',publicPath+'/prepare',body,true);
   if(data.prepare.body.status==='ready')body.intakeConfirmation=data.prepare.body.confirmation;else body.reviewRequested=true;
   data.widget=await call('POST',publicPath,body,true);
   data.widgetRequest=structuredClone(body);data.widgetReceipt=app.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,body.requestId)||null;
   data.voiceContext=voice.c;data.matchArgs={query:service.service};data.matchToolCallId=randomUUID();data.match=await voice.tool('matchService',data.matchArgs,data.matchToolCallId);
   if(data.match.status==='matched'){
    const inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
    const args={serviceHandle:data.match.serviceHandle,customerInputs:inputs,customerConfirmed:true,additionalWork:[],productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(k=>[k,true]))};
    data.voiceToolCallId=randomUUID();data.voiceRequests=[structuredClone(args)];data.voice=await voice.tool('getQuote',args,data.voiceToolCallId);data.voiceFirst=structuredClone(data.voice);
    if(data.voice.questionContract?.fields.some(f=>f.confirmationToken)){args.scopeConfirmations=Object.fromEntries(data.voice.questionContract.fields.filter(f=>f.confirmationToken).map(f=>[f.field,f.confirmationToken]));data.voiceToolCallId=randomUUID();data.voiceRequests.push(structuredClone(args));data.voice=await voice.tool('getQuote',args,data.voiceToolCallId);}
   }else data.voice={unreachable:true,reason:'actual matchService did not expose service'};
   data.voiceReceipts=app.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId<>?').all(owner,body.requestId);
   if(process.env.CAPTURE){data.tables={};for(const table of ['users','billingAccounts','businessProfiles','bookingPolicies','calls','quotes','quoteSubmissions','voiceOpaqueHandles','voiceToolIdempotencyReceipts','voiceQuoteNarrations'])data.tables[table]=app.db.prepare(`SELECT * FROM ${table} WHERE ${table==='users'?'id':'ownerId'}=? ORDER BY rowid`).all(owner);data.owner=owner;}
   data.bookUnchanged=JSON.stringify(loadPricebook(owner))===JSON.stringify(data.book);data.providerSends=voice.sends();
   if(process.env.REPAIR_CASES&&['missing-unknown--low','missing-removal--low'].includes(row.id)){
    const approval=structuredClone(data.book.services[0].quoteDoneApproval);
    await ok('POST','/api/pricebook/save',saved);saved=await ok('GET','/api/pricebook/'+owner);
    if(JSON.stringify(loadPricebook(owner).services[0].quoteDoneApproval)!==JSON.stringify(approval))faults.push('ordinary save renewed approval');
    saved.services[0].pricing.laborPerSquare.asphalt_shingle+=.01;
    await ok('POST','/api/pricebook/save',saved);
    const staleBook=loadPricebook(owner);data.stale={book:staleBook,catalog:await ok('GET',publicPath,undefined,true),match:await voice.tool('matchService',{query:service.service})};
    if(data.stale.catalog.services.length||data.stale.match.status==='matched')faults.push('stale configuration discoverable');
    const fresh={...body,requestId:randomUUID(),reviewRequested:true};delete fresh.intakeConfirmation;
    data.stale.freshWidget=await call('POST',publicPath,fresh,true);
    if(data.stale.freshWidget.status!==201||data.stale.freshWidget.body.resultType!=='ESTIMATE_REQUIRES_REVIEW'||cents(data.stale.freshWidget.body).length)faults.push('stale fresh widget priced');
    data.stale.replayWidget=await call('POST',publicPath,body,true);
    if(data.stale.replayWidget.status!==200||JSON.stringify(data.stale.replayWidget.body)!==JSON.stringify(data.widget.body))faults.push('historical widget changed after stale save');
    if(JSON.stringify(loadPricebook(owner))!==JSON.stringify(staleBook)||JSON.stringify(staleBook.services[0].quoteDoneApproval)!==JSON.stringify(approval))faults.push('stale quote renewed approval/book');
   }
   if(!data.bookUnchanged)faults.push('quoting changed saved book');
   if(data.beforeApprovalCatalog.services.length)faults.push('visible before explicit approval');
   if(data.beforeApprovalVoice.status==='matched')faults.push('voice visible before explicit approval');
   if(data.ownerValidation.approvalCurrent!==row.expected.approval)faults.push('approval');
   if((data.catalog.services.length>0)!==row.expected.catalog)faults.push('catalog');
   for(const [channel,value] of [['direct',data.direct],['widget',data.widget.body],['voice',data.voice]]){
    const ready=channel==='voice'?value.status==='quoted':['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(value.resultType);
    if(ready!==row.expected.ready)faults.push(channel+': readiness');
    if(row.expected.ready){const actual=cents(value),expected=row.expected.allCents||Array(row.expected.options||1).fill(row.expected.cents);if(JSON.stringify(actual)!==JSON.stringify(expected))faults.push(channel+': cents/options '+JSON.stringify(actual)+' != '+JSON.stringify(expected));}
    else if(cents(value).length)faults.push(channel+': review leaked amount');
    if(row.expected.excluded&&!/excluded|not included|separate estimate|skippedAddons/i.test(JSON.stringify(value)))faults.push(channel+': missing exclusion');
   }
  }catch(e){data.error=e.stack;data.errorCode=e.code;faults.push('execution: '+e.message);}
  const result={id:row.id,serviceType:row.serviceType,variant:row.variant,faults,approval:data.ownerValidation?.approvalCurrent,ownerStatus:data.ownerValidation?.status,catalog:data.catalog?.services.length,direct:data.direct?.resultType,widget:data.widget?.body?.resultType,voice:data.voice?.status,amounts:{direct:cents(data.direct),widget:cents(data.widget?.body),voice:cents(data.voice)}};
  results.push(result);zipped(row.id,{...data,wire,result});write('results.json',results);
  console.log(JSON.stringify(result));
 }
 zipped('server-log',app.log());
}catch(error){write('fatal.json',{error:error.stack});console.error(error.stack);process.exitCode=1;}
finally{for(const fn of cleanup)try{await fn();}catch(e){console.error(e.stack);process.exitCode=1;}}
write('summary.json',{executed:results.length,matched:results.filter(r=>!r.faults.length).length,mismatched:results.filter(r=>r.faults.length).length,ended:new Date().toISOString()});
if(results.some(r=>r.faults.length))process.exitCode=1;
