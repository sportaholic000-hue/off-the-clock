import {resolveCustomer} from './customerIdentityService.js';
import {quoteDateContext,registerQuoteDateDatabase} from './quoteDate.js';
import {guardTenantRequest} from './tenantRequest.js';
import crypto from 'node:crypto';
import { db, ownerQuery } from './db.js';
import { requireAuth } from './auth.js';
import { loadPricebook } from '../priceBookService.js';
import { hasCallbackContact, invalidCallbackFields } from './quoteContact.js';
import { JOB_DETAILS_FLOW, validIntakeConfirmation } from './quoteIntake.js';
import { declaredAdditionalWork, customerReceiptPresentation } from './quoteScopeDisclosure.js';
import {leadFollowUpView,quoteFollowUpView} from './leadCaptureRepair20261006FollowUp.js';
import {createOwnerCallService} from './ownerCallService.js';
import {createOwnerWorkflowService} from './ownerWorkflowService.js';
import { loadBookingCapability, loadPublicBranding } from './bookingCapabilities.js';
import { openBookingTokenReceipt, sealBookingTokenReceipt } from './bookingTokens.js';
import {
  ENGINE_VERSION, problem, digest, bookRevision, bookStatuses, readApplicationBook,
  saveApplicationBook, approveApplicationService, previewApplicationQuote, validateApplicationDraft,
  calculateApplicationQuote, prepareApplicationIntake, applicationMetadata, sanitizeForCustomerVNext, applicationServiceMatches, applicationServiceName,
  requireApplicationPricingEnvelope, applicationServiceDefinition, bookQuoteStatuses } from './quoteDoneBridge.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const limitedText = value => typeof value === 'string' ? value : null;
const PUBLIC_CONTRACT_VERSION = '2026-09-29.1';
const BOOKING_CONTEXT_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const budgets = new Map();
export function parseStoredQuoteOrigins(value) {
  try {
    const parsed=JSON.parse(value);
    if(!Array.isArray(parsed)||parsed.length<1||parsed.length>20)return [];
    const seen=new Set();
    for(const origin of parsed) {
      if(typeof origin!=='string'||seen.has(origin))return [];
      let url;try{url=new URL(origin);}catch{return [];}
      const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if(url.origin!==origin||url.username||url.password||
          !(url.protocol==='https:'||(process.env.NODE_ENV!=='production'&&loopback&&url.protocol==='http:')))return [];
      seen.add(origin);
    }
    return [...seen];
  } catch {
    return [];
  }
}
function publicLimit(req,res,next) {
  const key=req.tenantOwnerId+':'+req.ip,now=Date.now();
  const prior=budgets.get(key);const budget=prior&&now-prior.startedAt<60000?prior:{startedAt:now,count:0};
  budget.count++;budgets.set(key,budget);
  if(budgets.size>10000)for(const [id,value] of budgets)if(now-value.startedAt>60000)budgets.delete(id);
  if(budget.count>60)return res.status(429).json({error:'Please wait before trying again.'});
  next();
}
function publicContext(req,res,next) {
  // Public-key lookup establishes tenant authentication context, analogous to
  // the existing user/JWT identity lookup. All subsequent tenant queries filter
  // by this resolved ownerId; no caller ownerId is used.
  const access=db.prepare('SELECT ownerId, allowedOriginsJson FROM quoteAccessKeys WHERE publicKey = ?').get(req.params.publicKey);
  if(!access)return res.status(404).json({error:'Quote link not found.'});
  let origin=req.get('Origin');
  // Same-origin browser GETs omit Origin. Only that read path may use the
  // browser's same-origin Fetch Metadata plus Referer, still checked against
  // the owner's exact allowlist. Never infer authorization from Host or proxy
  // headers. A supplied Origin always wins, including a denied/null origin.
  if(!origin&&req.method==='GET'&&req.get('Sec-Fetch-Site')==='same-origin') {
    try { origin=new URL(req.get('Referer')).origin; } catch { /* deny below */ }
  }
  if(!origin||!parseStoredQuoteOrigins(access.allowedOriginsJson).includes(origin))return res.status(403).json({error:'This website is not authorized for this quote link.'});
  req.tenantOwnerId=access.ownerId;
  if(!guardTenantRequest(req,res,req.tenantOwnerId))return;
  next();
}
function serviceFor(book,body) {
  if(typeof body.serviceId!=='string')return null;
  const matches=applicationServiceMatches(book,body.serviceId);return matches.length===1?matches[0]:null;
}
function requireSavedQuoteService(req,res,next) {
  // Existing owner-bound submissions are immutable receipts. submitQuote checks
  // their exact content digest before returning anything, even during recovery.
  if(['/api/public/quote/:publicKey','/api/quote/calculate'].includes(req.route?.path)&&uuid(req.body?.requestId)&&
    ownerQuery('SELECT requestId FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(req.tenantOwnerId,req.body.requestId))return next();
  if(!serviceFor(loadPricebook(req.tenantOwnerId),req.body||{}))return res.status(404).json({error:'Service not found.'});
  next();
}
function customerCatalogService(service,metadata,bookingCapability) {
  const definition=applicationServiceDefinition(service);
  const knownOfferings={};
  for(const field of definition?.customerFields||[])if(field.type==='slug') {
    const values=service.knownOfferings?.[field.name];
    if(object(values))knownOfferings[field.name]=Object.fromEntries(Object.entries(values).filter(([key,id])=>/^[a-z][a-z0-9_]*$/.test(key)&&uuid(id)));
  }
  return {
    id:service.id,
    serviceType:service.serviceType,
    name:applicationServiceName(service),
    customerFields:definition?.customerFields||[],
    ...(definition?.offeringSummary?{offeringSummary:definition.offeringSummary}:{}),
    knownOfferings,
    customerFees:metadata.feeNames.filter(name=>service.feeRules?.[name]==='customer_selected'),
    quoteCapability:'LIVE_OR_REVIEW',
    bookingCapability
  };
}
function unresolvedResult(reason) {
  const quoteId=crypto.randomUUID();
  return {customerResult:sanitizeForCustomerVNext({resultType:'ESTIMATE_REQUIRES_REVIEW',quoteId}),applicationReview:{reason,quoteId},request:null,internalResult:null,leadEnvelope:null};
}
function allowedTierNames(response) {
  const estimate=response?.resultType==='PARTIAL_ESTIMATE_READY'?response.pricedEstimate:response;
  return [...new Set((Array.isArray(estimate?.options)?estimate.options:[])
    .map(option=>typeof option?.tierName==='string'?option.tierName.trim():'')
    .filter(Boolean))];
}
export function submitQuote(ownerId,body,{bookingService,bookingTokenSecret=process.env.BOOKING_SLOT_TOKEN_SECRET}={}) {
  if(!object(body)||!uuid(body.requestId))throw problem('A stable request UUID is required.');
  const contentDigest=digest(body);
  return db.transaction(()=>{
    const existing=ownerQuery(`SELECT contentDigest, customerResponseJson,
      bookingIntentId, bookingTokenReceipt
      FROM quoteSubmissions WHERE ownerId = ? AND requestId = ?`).get(ownerId,body.requestId);
    if(existing) {
      if(existing.contentDigest!==contentDigest)throw problem('This request ID already belongs to different submitted details.',409);
      const response=customerReceiptPresentation(JSON.parse(existing.customerResponseJson));
      if(existing.bookingTokenReceipt) {
        const receipt=openBookingTokenReceipt(existing.bookingTokenReceipt,bookingTokenSecret);
        if(receipt.ownerId!==ownerId||receipt.intentId!==existing.bookingIntentId) {
          throw problem('The stored booking receipt does not match this request.',500);
        }
        response.bookingToken=receipt.bookingToken;
      }
      return {status:200,response};
    }
    requireApplicationPricingEnvelope(body);
    // Owner ruling 2026-09-27: every estimate request needs contact, including
    // instant estimates. Exact retries above are immutable historical receipts.
    if(!hasCallbackContact(body.contact))throw problem('Enter a valid email address or phone number before submitting an estimate request.',422);
    const contactFields=invalidCallbackFields(body.contact);
    if(contactFields.length)throw problem('Correct the '+contactFields.join(' and ')+' field, or leave an unused contact channel blank. Keep any work instructions in Additional project details.',422,{fields:contactFields});
    const book=loadPricebook(ownerId),service=serviceFor(book,body);
    if(body.intakeFlow===JOB_DETAILS_FLOW&&body.reviewRequested!==true&&!validIntakeConfirmation(ownerId,bookRevision(book),body)) {
      throw problem('The job details or business pricing changed. Check the current details before submitting.',409);
    }
    let calculated;
    if(!service)calculated=unresolvedResult('The requested saved service is missing or has a duplicate ID. Resolve its identity and verify the complete supplied service request.');
    else {
      try { calculated=calculateApplicationQuote(book,service,body,{ownerId,...quoteDateContext(db,ownerId)}); }
      catch(error) { calculated=unresolvedResult(error.message); }
    }
    const response=calculated.customerResult;
    const recordId=crypto.randomUUID(),createdAt=new Date().toISOString();
    const customer=resolveCustomer(db,{ownerId,phone:body.contact?.phone,createdAt});
    const internal={ownerId,customerId:customer?.id??null,selectedServiceId:service?.id??null,requestedServiceId:body.serviceId??null,bookRevision:bookRevision(book),bookSnapshot:book,originalSubmission:body,...calculated};
    const contact=object(body.contact)?body.contact:{};
    const describedService=limitedText(body.serviceRequest)||service?.service||'Customer service request';
    const partial=response.resultType==='PARTIAL_ESTIMATE_READY';
    if(response.resultType==='INSTANT_ESTIMATE_READY'||partial) {
      ownerQuery(`INSERT INTO quotes (id,ownerId,quoteId,serviceType,customerInputsJson,resultJson,status,callerType,createdAt)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(recordId,ownerId,response.quoteId,service?.serviceType??null,JSON.stringify(body.customerInputs??null),JSON.stringify(internal),partial?'PARTIAL':'INSTANT','customer',createdAt);
      if(partial)ownerQuery(`INSERT INTO leads (id,ownerId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(recordId,ownerId,limitedText(contact.name),limitedText(contact.phone),describedService,JSON.stringify({...internal,linkedQuoteId:recordId}),'additional_work','NEEDS REVIEW',createdAt);
    } else {
      ownerQuery(`INSERT INTO leads (id,ownerId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(recordId,ownerId,limitedText(contact.name),limitedText(contact.phone),describedService,JSON.stringify(internal),'quote_review','NEEDS REVIEW',createdAt);
    }
    ownerQuery('INSERT INTO quoteRequests (id,ownerId,describedService,estimatedValue,createdAt) VALUES (?,?,?,?,?)').run(recordId,ownerId,describedService,null,createdAt);
    const bookingCapability=service?loadBookingCapability(db,ownerId,service.id):'NONE';
    let customerResponse={...response,bookingCapability};
    let storedResponse=customerResponse;
    let bookingIntentId=null;
    let bookingTokenReceipt=null;
    if(bookingCapability!=='NONE') {
      if(!bookingService)throw problem('Booking is temporarily unavailable.',503);
      const expiresAtUtc=new Date(Date.now()+BOOKING_CONTEXT_DURATION_MS).toISOString();
      const booking=bookingService.createIntent({
        ownerId,
        sourceType:['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(response.resultType)?'quote':'lead',
        sourceId:recordId,
        serviceId:service.id,
        resultType:response.resultType,
        allowedTierNames:allowedTierNames(response),
        expiresAtUtc
      });
      bookingIntentId=booking.intentId;
      bookingTokenReceipt=sealBookingTokenReceipt({
        kind:'booking-token-receipt',
        ownerId,
        intentId:booking.intentId,
        bookingToken:booking.bookingToken,
        expiresAtUtc:booking.expiresAtUtc
      },bookingTokenSecret);
      customerResponse={
        ...customerResponse,
        bookingToken:booking.bookingToken,
        bookingTokenExpiresAt:booking.expiresAtUtc
      };
      storedResponse={
        ...storedResponse,
        bookingTokenExpiresAt:booking.expiresAtUtc
      };
    }
    ownerQuery(`INSERT INTO quoteSubmissions (
      ownerId,requestId,contentDigest,recordId,resultType,bookRevision,
      originalSubmissionJson,internalOutcomeJson,customerResponseJson,
      bookingIntentId,bookingTokenReceipt,createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      ownerId,body.requestId,contentDigest,recordId,response.resultType,bookRevision(book),
      JSON.stringify(body),JSON.stringify(internal),JSON.stringify(storedResponse),
      bookingIntentId,bookingTokenReceipt,createdAt
    );
    // Returning from this transaction commits every row before the route sends
    // an acknowledgement. A constraint/write/commit failure returns no success.
    return {status:201,response:customerResponse};
  }).immediate();
}
function leadView(row,role) {
  return leadFollowUpView(ownerQuery,row,role);
}
export function installQuoteDoneRoutes(app,{asyncHandler,requireQuoteDonePlan,bookingService,bookingTokenSecret}) {
  registerQuoteDateDatabase(db);
  const owner=[requireAuth(['owner']),requireQuoteDonePlan];
  const team=[requireAuth(['owner','staff']),requireQuoteDonePlan];
  const leadTeam=[requireAuth(['owner','staff'])]; // CRM is included on Operator.
  app.get('/api/pricebook/meta',requireAuth(['owner']),(_req,res)=>res.json(applicationMetadata()));
  app.get('/api/pricebook/:ownerId',...owner,(req,res)=>{
    if(req.params.ownerId!==req.tenantOwnerId)return res.status(403).json({error:'Forbidden'});
    res.json(readApplicationBook(req.tenantOwnerId));
  });
  app.post('/api/pricebook/save',...owner,asyncHandler(async(req,res)=>res.json(saveApplicationBook(req.tenantOwnerId,req.body,quoteDateContext(db,req.tenantOwnerId)))));
  app.post('/api/pricebook/validate',...owner,asyncHandler(async(req,res)=>res.json(validateApplicationDraft(req.tenantOwnerId,req.body,quoteDateContext(db,req.tenantOwnerId)))));
  app.post('/api/pricebook/preview',...owner,asyncHandler(async(req,res)=>res.json(previewApplicationQuote(req.tenantOwnerId,req.body,quoteDateContext(db,req.tenantOwnerId)))));
  app.post('/api/pricebook/services/:serviceId/approve',...owner,asyncHandler(async(req,res)=>res.json(approveApplicationService(req.tenantOwnerId,req.params.serviceId,req.body,quoteDateContext(db,req.tenantOwnerId)))));
  app.post('/api/quotedone/access',...owner,asyncHandler(async(req,res)=>{
    const origins=req.body?.allowedOrigins;
    if(!Array.isArray(origins)||!origins.length||origins.length>20)throw problem('Choose the website origins allowed to use this quote link.');
    for(const origin of origins) {
      let url;try{url=new URL(origin);}catch{throw problem('Each allowed website must be a valid origin.');}
      const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if(url.origin!==origin||url.username||url.password||!(url.protocol==='https:'||(process.env.NODE_ENV!=='production'&&loopback&&url.protocol==='http:')))throw problem('Use an HTTPS origin; local HTTP is allowed only for non-production verification.');
    }
    let access=ownerQuery('SELECT publicKey FROM quoteAccessKeys WHERE ownerId = ?').get(req.tenantOwnerId);
    if(!access) {
      access={publicKey:crypto.randomBytes(24).toString('base64url')};
      ownerQuery('INSERT INTO quoteAccessKeys (ownerId,publicKey,allowedOriginsJson,createdAt) VALUES (?,?,?,?)').run(req.tenantOwnerId,access.publicKey,JSON.stringify([...new Set(origins)]),new Date().toISOString());
    }else ownerQuery('UPDATE quoteAccessKeys SET allowedOriginsJson = ? WHERE ownerId = ?').run(JSON.stringify([...new Set(origins)]),req.tenantOwnerId);
    res.json({...access,allowedOrigins:origins});
  }));
  app.get('/api/quotedone/access',...owner,(req,res)=>{
    const row=ownerQuery('SELECT publicKey,allowedOriginsJson FROM quoteAccessKeys WHERE ownerId = ?').get(req.tenantOwnerId);
    res.json(row?{publicKey:row.publicKey,allowedOrigins:parseStoredQuoteOrigins(row.allowedOriginsJson)}:{publicKey:null,allowedOrigins:[]});
  });
  app.get('/api/public/quote/:publicKey',publicContext,publicLimit,requireQuoteDonePlan,(req,res)=>{
    const book=loadPricebook(req.tenantOwnerId),meta=applicationMetadata();
    const statuses=new Map(bookQuoteStatuses(book,quoteDateContext(db,req.tenantOwnerId)).map(status=>[status.serviceId,status]));
    const services=book.services
      .filter(service=>uuid(service.id)&&meta.services.some(m=>m.serviceType===service.serviceType)&&statuses.get(service.id)?.status==='QUOTING LIVE')
      .map(service=>customerCatalogService(
        service,
        meta,
        loadBookingCapability(db,req.tenantOwnerId,service.id)
      ));
    res.json({
      contractVersion:PUBLIC_CONTRACT_VERSION,
      capabilities:{
        quoteEnvelope:'pricing-only-v2',
        booking:'booking-v1',
        postQuoteIdentity:true,
        serverPricingOnly:true
      },
      branding:loadPublicBranding(db,req.tenantOwnerId),
      services
    });
  });
  app.post('/api/public/quote/:publicKey',publicContext,publicLimit,requireQuoteDonePlan,requireSavedQuoteService,asyncHandler(async(req,res)=>{
    const result=submitQuote(req.tenantOwnerId,req.body,{bookingService,bookingTokenSecret});res.status(result.status).json(result.response);
  }));
  app.post('/api/public/quote/:publicKey/prepare',publicContext,publicLimit,requireQuoteDonePlan,requireSavedQuoteService,asyncHandler(async(req,res)=>{
    res.json(prepareApplicationIntake(req.tenantOwnerId,req.body,quoteDateContext(db,req.tenantOwnerId)));
  }));
  app.post('/api/quote/prepare',...team,requireSavedQuoteService,asyncHandler(async(req,res)=>{
    res.json(prepareApplicationIntake(req.tenantOwnerId,req.body,quoteDateContext(db,req.tenantOwnerId)));
  }));
  app.post('/api/quote/calculate',...team,requireSavedQuoteService,asyncHandler(async(req,res)=>{
    const result=submitQuote(req.tenantOwnerId,req.body,{bookingService,bookingTokenSecret});res.status(result.status).json(result.response);
  }));
  const activity=createOwnerCallService({ownerQuery});
  app.get('/api/leads/activity',...leadTeam,(req,res)=>res.json(activity.dashboard(req.tenantOwnerId)));
  app.get('/api/leads',...leadTeam,(req,res)=>res.json({leads:ownerQuery('SELECT * FROM leads WHERE ownerId = ? ORDER BY createdAt DESC,id').all(req.tenantOwnerId).map(row=>leadView(row,req.role))}));
  app.get('/api/leads/:id',...leadTeam,(req,res)=>{
    const row=ownerQuery('SELECT * FROM leads WHERE ownerId = ? AND id = ?').get(req.tenantOwnerId,req.params.id);
    if(!row)return res.status(404).json({error:'Lead not found.'});res.json(leadView(row,req.role));
  });
  app.patch('/api/leads/:id',...leadTeam,(req,res)=>{
    if(!['NEEDS REVIEW','DISMISSED'].includes(req.body?.status))throw problem('Choose a supported lead status.');
    const workflow=createOwnerWorkflowService({database:db,ownerQuery}),current=workflow.view(req.tenantOwnerId,'leads',req.params.id,req.role);
    if(current.status!==req.body.status)workflow.act({ownerId:req.tenantOwnerId,actorId:req.userId,role:req.role,kind:'leads',id:req.params.id,
      body:{action:req.body.status==='DISMISSED'?'DISMISS':'REOPEN',version:current.workflow.version,idempotencyKey:crypto.randomUUID(),note:'Owner team changed the lead status.'}});
    res.json({success:true});
  });
  app.get('/api/quotes',...team,(req,res)=>{
    const quotes=ownerQuery('SELECT id,ownerId,callId,serviceType,status,tierChosen,createdAt,resultJson FROM quotes WHERE ownerId = ? ORDER BY createdAt DESC,id').all(req.tenantOwnerId).map(row=>quoteFollowUpView(ownerQuery,row,req.role));res.json({quotes});
  });
}
