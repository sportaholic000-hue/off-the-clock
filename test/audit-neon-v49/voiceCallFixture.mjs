// End-to-end phone-call fixture (Neon re-audit of v49): a published mowing
// service, a real booking service and the real voice runtime, so a test can
// run quote -> captureLead -> checkAvailability -> bookAppointment ->
// modifyAppointment as one call. Service and defaults follow
// test/travelZones20261020.spec.mjs (copied, not imported: that file is a
// spec and would run its own tests).
import '../pricebookTestEnv.mjs';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {convertPricebookMoney} from '../../server/priceBookMoney.js';
import {approveApplicationService,readApplicationBook,saveApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {migrateDatabase} from '../../server/src/migrations.js';
import {createVoiceToolRuntime} from '../../server/src/voice/voiceToolRuntime.js';
import {createBookingService} from '../../server/src/bookingService.js';

process.env.JWT_SECRET ||= 'SYNTHETIC_V49_SIGNING_KEY_NEVER_LIVE';
export const MOWING_SERVICE_ID='11111111-2222-4333-8444-555555555555';
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
export function mowingServiceCents(ownerId,pricing={}){
  return {id:MOWING_SERVICE_ID,serviceType:'LANDSCAPING_MOWING',service:'Lawn Mowing',source:'MANUAL',active:true,
    origin:{serviceId:MOWING_SERVICE_ID,serviceType:'LANDSCAPING_MOWING',source:'MANUAL',ownerId,operationId:'22222222-2222-4222-8222-222222222222',createdAt:'2026-10-20T00:00:00.000Z'},
    pricing:{mowingBaseRatePerSqft:2,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1.1,monthly:1.2,one_time:1.25},
      overgrowthMultipliers:{maintained:1,overgrown:1.5,severe:2},baggingSurchargePercent:10,edgingPerLinearFoot:10,...pricing},
    feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},
    priceBasisByCategory:Object.fromEntries(categories.map(c=>[c,'sell_price'])),
    taxabilityByCategory:Object.fromEntries(categories.map(c=>[c,false])),tiers:[]};
}
export function defaultsCents(overrides={}){
  return {currency:'CAD',quoteTimeZone:'America/Moncton',markupMode:'markup',markupPercent:0,markupApplies:Object.fromEntries(categories.map(c=>[c,false])),
    overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,peakMonths:[],peakSurchargePercent:0,...overrides};
}
// 3,000 sq ft x 2 cents x 1.25 (one time) = 7,500; edging 300 LF x 10 = 3,000; total 10,500 cents.
export const MOWING_INPUTS={yardSqft:3000,sqftMethod:'exact',serviceFrequency:'one_time',grassCondition:'maintained',bagClippings:false,edgingIncluded:true,edgingLengthLF:300};
export const ADDRESS={line1:'10 King St',city:'Saint John',region:'NB',postalCode:'E2L 4L1',country:'CA'};

export function voiceCallFixture(t,{nowIso='2026-06-15T13:00:00.000Z',pricing={},defaults={},horizonDays=14}={}){
  const ownerId='owner-v49-'+crypto.randomUUID();
  const initial=readApplicationBook(ownerId);
  const {origin,...service}=convertPricebookMoney({services:[mowingServiceCents(ownerId,pricing)]},'toDollars').services[0];
  const saved=saveApplicationBook(ownerId,{revision:initial.revision,services:[service],defaults:convertPricebookMoney({defaults:defaultsCents(defaults)},'toDollars').defaults});
  approveApplicationService(ownerId,MOWING_SERVICE_ID,{revision:saved.revision,confirmConfiguration:true,source:'MANUAL',zeroClassification:{freeCompleteService:false,freeTiers:[],includedPrices:{}}});
  const db=new Database(':memory:');t.after(()=>db.close());migrateDatabase(db);
  db.prepare(`INSERT INTO users (id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt)
    VALUES (?,?,'hash','Owner','Synthetic business','QuoteDone','active','America/Moncton','owner',?)`).run(ownerId,ownerId+'@example.com',nowIso);
  db.prepare('INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,?,?)').run(ownerId,JSON.stringify({serviceArea:{mode:'all',cities:[]}}),nowIso);
  db.prepare(`INSERT INTO bookingSettings(ownerId,revision,timezone,provider,calendarId,weeklyAvailabilityJson,blackoutsJson,
    bookingHorizonDays,minimumNoticeMinutes,slotIncrementMinutes,bufferBeforeMinutes,bufferAfterMinutes,directBookingEnabled,updatedAt)
    VALUES(?,'settings-1','America/Moncton','google','primary',?,'[]',?,60,60,0,0,1,?)`)
    .run(ownerId,JSON.stringify(Object.fromEntries(['mon','tue','wed','thu','fri'].map(day=>[day,[{start:'09:00',end:'17:00'}]]))),horizonDays,nowIso);
  db.prepare(`INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt)
    VALUES(?,?,'policy-1','site_visit_first',60,1,?)`).run(ownerId,MOWING_SERVICE_ID,nowIso);
  db.prepare("INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)").run(ownerId,'cus_synthetic_'+ownerId,nowIso,nowIso,nowIso);
  const events=[];
  const booking=createBookingService({db,clock:()=>new Date(nowIso),slotTokenSecret:'v49-booking-slot-secret-at-least-32-bytes',calendar:{
    listBusy:async()=>[],
    createEvent:async req=>{events.push(req);return {eventId:req.eventId,status:'CONFIRMED',startAtUtc:req.startAtUtc,endAtUtc:req.endAtUtc};},
    changeEvent:async req=>({eventId:req.eventId,status:req.action==='cancel'?'CANCELLED':'CONFIRMED',startAtUtc:req.startAtUtc,endAtUtc:req.endAtUtc})}});
  function call(from){
    const callId=crypto.randomUUID(),callSid='CA'+crypto.randomBytes(16).toString('hex'),accountSid='AC'+'cd'.repeat(16);
    const context={ownerId,callSid,accountSid,from,to:'+15065550188'};
    db.prepare(`INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,duration,spamFiltered,createdAt)
      VALUES(?,?,?,?,?,?,'in-progress',0,0,?)`).run(callId,ownerId,callSid,accountSid,from,context.to,nowIso);
    const runtime=createVoiceToolRuntime({database:db,callContext:context,handleSecret:'voice-v49-test-secret-at-least-32-bytes',bookingService:booking,providers:{modifyAppointment:input=>booking.modifyAppointment(input)},clock:()=>new Date(nowIso)});
    return (name,args)=>runtime.handlers[name]({context,args});
  }
  return {db,ownerId,nowIso,booking,events,call};
}
