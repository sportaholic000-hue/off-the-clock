import {randomUUID} from 'node:crypto';
import {usageOwnerQuery} from './billingUsagePolicy.js';
import {ownerUtcInstant} from './ownerDate.js';
import {storedObject} from './ownerRecordViews.js';
import {recordWorkflow} from './ownerWorkflowViews.js';
import {leadFollowUpView,quoteFollowUpView} from './leadCaptureRepair20261006FollowUp.js';
import {savedQuoteValue} from './ownerReportService.js';
const problem=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const kinds=new Set(['leads','quotes']);
const actions=new Set(['CALL_BACK','BOOK','COMPLETE_FOLLOW_UP','DISMISS','REOPEN','REVIEW','SENT','VIEWED','ACCEPTED','INVOICED']);
const safeText=(value,max=4000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!value.includes('\u0000');
// At the owner dollar boundary only. Stored invoice amounts remain integer cents.
export function ownerAmountCents(value) {
  if(typeof value!=='string'||!/^\d{1,10}(?:\.\d{1,2})?$/.test(value))throw problem('Enter a non-negative amount with at most two decimal places.');
  const [whole,decimal='']=value.split('.');const cents=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
  if(cents>999999999999n)throw problem('Amount exceeds the supported limit.');
  return Number(cents);
}
export function createOwnerWorkflowService({database,ownerQuery=usageOwnerQuery(database),clock=()=>new Date()}) {
  const q=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Owner workflow tenant binding required');return ownerQuery(sql);};
  function record(ownerId,kind,id){
    if(!kinds.has(kind))throw problem('Record not found.',404);
    const row=q(`SELECT * FROM ${kind} WHERE ownerId=? AND id=?`).get(ownerId,id);
    if(!row)throw problem('Record not found.',404);return row;
  }
  function view(ownerId,kind,id,role='owner'){
    const row=record(ownerId,kind,id);
    return kind==='leads'?leadFollowUpView(q,row,role):quoteFollowUpView(q,row,role);
  }
  function act({ownerId,actorId,role='owner',kind,id,body}) {
    return database.transaction(()=>{
      const row=record(ownerId,kind,id);
      if(!['owner','staff'].includes(role))throw problem('Forbidden',403);
      // Bind the author as well as the target. Callers cannot impersonate another
      // staff member or smuggle an actor ID in the request body.
      const actor=q("SELECT id FROM users WHERE id=? AND ((id=? AND role='owner' AND ownerId IS NULL) OR (ownerId=? AND role='staff')) AND role=?").get(actorId,ownerId,ownerId,role);
      if(!actor)throw problem('Forbidden',403);
      if(!object(body)||Object.keys(body).some(key=>!['action','version','idempotencyKey','note','dueAt','estimate','tierName','invoiceAmount','attested'].includes(key)))throw problem('Unsupported record action fields.');
      if(!actions.has(body.action)||!safeText(body.idempotencyKey,128)||!Number.isSafeInteger(body.version)||body.version<0)throw problem('Choose a valid action, revision and request key.');
      if(['REVIEW','INVOICED'].includes(body.action)&&role!=='owner')throw problem('Only the owner can approve an estimate or record a final invoice.',403);
      const requestJson=JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a],[b])=>a.localeCompare(b))));
      const previous=q('SELECT requestJson,responseJson FROM ownerRecordEvents WHERE ownerId=? AND kind=? AND recordId=? AND idempotencyKey=?').get(ownerId,kind,id,body.idempotencyKey);
      if(previous){if(previous.requestJson!==requestJson)throw problem('This request key was already used for a different action.',409);return JSON.parse(previous.responseJson);}
      const workflow=recordWorkflow(q,ownerId,kind,id);
      if(workflow.version!==body.version)throw problem('This record changed. Refresh before saving your action.',409);
      if(!safeText(body.note))throw problem('Record the reason or follow-up note.');
      const now=clock().toISOString(),next={...workflow,version:workflow.version+1,note:body.note.trim(),updatedAt:now};
      let status=row.status,payload={};
      if(['CALL_BACK','BOOK'].includes(body.action)){
        if(body.dueAt!==undefined&&body.dueAt!==null&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(body.dueAt)||!ownerUtcInstant(body.dueAt)||ownerUtcInstant(body.dueAt)<=now))throw problem('Choose a future follow-up time.');
        next.followUpAction=body.action;next.followUpStatus='OPEN';next.dueAt=body.dueAt||null;
      }else if(body.action==='COMPLETE_FOLLOW_UP'){
        if(workflow.followUpStatus!=='OPEN')throw problem('There is no open follow-up to complete.',409);
        next.followUpStatus='COMPLETED';next.dueAt=null;
      }else if(body.action==='DISMISS'){
        if(['ACCEPTED','INVOICED','SUPERSEDED','REVIEWED','DISMISSED'].includes(status))throw problem('This record cannot be dismissed at its current stage.',409);
        status='DISMISSED';next.followUpStatus='DISMISSED';next.dueAt=null;
      }else if(body.action==='REOPEN'){
        if(status!=='DISMISSED')throw problem('Only a dismissed record can be reopened.',409);
        const dismissal=q("SELECT fromStatus,toStatus FROM ownerRecordEvents WHERE ownerId=? AND kind=? AND recordId=? AND action='DISMISS' ORDER BY rowid DESC LIMIT 1").get(ownerId,kind,id);
        if(!dismissal||dismissal.toStatus!=='DISMISSED'||!safeText(dismissal.fromStatus,128)||dismissal.fromStatus==='DISMISSED')throw problem('The stage before dismissal is unavailable. This record cannot be reopened without its dismissal history.',409);
        status=dismissal.fromStatus;next.followUpStatus=null;next.dueAt=null;
      }else if(body.action==='REVIEW'){
        if(['ACCEPTED','INVOICED','SUPERSEDED','DISMISSED','REVIEWED'].includes(status)||workflow.reviewedQuoteId)throw problem('This record is not available for owner review.',409);
        const estimate=body.estimate;
        if(!object(estimate)||Object.keys(estimate).some(key=>!['low','high','currency','scope','qualifications','taxTreatment','priceUnit'].includes(key)))throw problem('Supply the complete reviewed estimate.');
        const low=ownerAmountCents(estimate.low),high=ownerAmountCents(estimate.high);
        if(high<low||!['CAD','USD'].includes(estimate.currency)||!safeText(estimate.scope)||!safeText(estimate.qualifications)||!['Includes applicable tax.','No tax added.','Tax excluded; added to the invoice.'].includes(estimate.taxTreatment)||!['per job','per visit'].includes(estimate.priceUnit))throw problem('Specify an ordered range, currency, priced scope, material qualifications, tax treatment and price basis.');
        const source=view(ownerId,kind,id,role),quoteId=randomUUID();
        const prior=source.result?.pricedEstimate||source.result;
        const qualifications=[...new Set([...(Array.isArray(prior?.materialQualifications)?prior.materialQualifications:[]),...(prior?.disclaimer?[prior.disclaimer]:[]),estimate.qualifications.trim()])];
        const result={resultType:'INSTANT_ESTIMATE_READY',quoteId,lowEstimate:low/100,highEstimate:high/100,currency:estimate.currency,priceUnit:estimate.priceUnit,taxTreatment:estimate.taxTreatment,
          pricedScope:{service:estimate.scope.trim(),facts:[],fees:[]},priceDrivers:[body.note.trim()],materialQualifications:qualifications,
          disclaimer:qualifications.join(' '),scopeNotice:'Owner-reviewed estimate covers only the priced scope listed here. Other requested work is excluded.',fullJobTotal:null};
        const originalSubmission={contact:source.contact,location:source.location,customerInputs:source.customerInputs,context:source.context,explicitUnknowns:source.explicitUnknowns};
        const receipt={customerResult:result,originalSubmission,ownerReview:{sourceKind:kind,sourceId:id,actorId,reviewedAt:now,note:body.note.trim()}};
        const service=kind==='quotes'?row.serviceType:storedObject(row.collectedInputsJson).applicationOutcome?.request?.serviceType||row.describedService||'CUSTOM';
        // Never propagate a corrupt cross-tenant call link into a new receipt.
        const call=row.callId?q('SELECT id FROM calls WHERE ownerId=? AND id=?').get(ownerId,row.callId):null;
        q('INSERT INTO quotes(id,ownerId,callId,serviceType,status,resultJson,createdAt) VALUES(?,?,?,?,?,?,?)').run(quoteId,ownerId,call?.id||null,service,'INSTANT',JSON.stringify(receipt),now);
        next.reviewedQuoteId=quoteId;next.followUpStatus='COMPLETED';next.dueAt=null;status=kind==='leads'?'REVIEWED':'SUPERSEDED';payload={reviewedQuoteId:quoteId};
      }else {
        if(kind!=='quotes')throw problem('Quote progression requires a saved quote.');
        const transitions={SENT:['INSTANT'],VIEWED:['SENT'],ACCEPTED:['SENT','VIEWED'],INVOICED:['ACCEPTED']};
        if(!transitions[body.action]?.includes(status))throw problem('That transition is not available from the current quote stage.',409);
        if(body.attested!==true)throw problem('Confirm that this event actually happened outside the app. No customer message will be sent.');
        const saved=storedObject(row.resultJson),result=(saved.applicationOutcome||saved).customerResult;
        const estimate=result?.pricedEstimate||result;
        if(!estimate||!['CAD','USD'].includes(estimate.currency))throw problem('Review this quote before recording progression; its stored currency is missing.',409);
        if(savedQuoteValue({resultJson:JSON.stringify({customerResult:estimate})}).excluded)throw problem('Review this quote before recording progression; its saved price is incomplete or incompatible.',409);
        if(body.action==='ACCEPTED'){
          const options=estimate.options;
          if(Array.isArray(options)&&options.length){
            const selected=options.length===1?options[0]:typeof body.tierName==='string'&&options.filter(option=>option.tierName===body.tierName).length===1?options.find(option=>option.tierName===body.tierName):null;
            if(!selected||(body.tierName!==undefined&&body.tierName!==selected.tierName))throw problem('Select the exact accepted quote option.');
            q('UPDATE quotes SET tierChosen=? WHERE ownerId=? AND id=?').run(selected.tierName,ownerId,id);payload.tierName=selected.tierName;
          }else if(body.tierName!==undefined)throw problem('This quote has no selectable tier.');
        }
        if(body.action==='INVOICED'){
          const cents=ownerAmountCents(body.invoiceAmount);q('UPDATE quotes SET finalInvoiceAmount=? WHERE ownerId=? AND id=?').run(cents,ownerId,id);
          payload={invoiceCents:cents,currency:estimate.currency,scope:'Owner-recorded final invoice; not collected revenue'};
        }
        status=body.action;
      }
      q(`UPDATE ${kind} SET status=? WHERE ownerId=? AND id=?`).run(status,ownerId,id);
      q(`INSERT INTO ownerRecordWorkflows(ownerId,kind,recordId,version,followUpAction,followUpStatus,dueAt,note,reviewedQuoteId,updatedAt)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ownerId,kind,recordId) DO UPDATE SET version=excluded.version,followUpAction=excluded.followUpAction,
        followUpStatus=excluded.followUpStatus,dueAt=excluded.dueAt,note=excluded.note,reviewedQuoteId=excluded.reviewedQuoteId,updatedAt=excluded.updatedAt`)
        .run(ownerId,kind,id,next.version,next.followUpAction,next.followUpStatus,next.dueAt,next.note,next.reviewedQuoteId,now);
      const event={id:randomUUID(),action:body.action,fromStatus:row.status,toStatus:status,note:next.note,actorId,details:payload,createdAt:now};
      const response={id,status,workflow:{...next,history:[...workflow.history,event]}};
      q(`INSERT INTO ownerRecordEvents(id,ownerId,kind,recordId,idempotencyKey,requestJson,action,fromStatus,toStatus,note,actorId,payloadJson,responseJson,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(event.id,ownerId,kind,id,body.idempotencyKey,requestJson,body.action,row.status,status,next.note,actorId,JSON.stringify(payload),JSON.stringify(response),now);
      return response;
    }).immediate();
  }
  return {act,view};
}
