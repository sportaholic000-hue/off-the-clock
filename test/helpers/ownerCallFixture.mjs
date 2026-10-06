import Database from 'better-sqlite3';
import {migrateDatabase} from '../../server/src/migrations.js';
import {createOwnerCallService} from '../../server/src/ownerCallService.js';

export const at='2026-10-06T00:00:00.000Z';
export function ownerCallFixture(filename=':memory:') {
  const db=new Database(filename);db.pragma('foreign_keys=ON');migrateDatabase(db);
  for(const owner of ['synthetic-a','synthetic-b']) {
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','Synthetic Call Co','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',at);
    db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(owner,'cus_'+owner,at,at,at);
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(owner);
    const callId=owner+'-call',recordId=owner+'-quote',leadId=owner+'-lead';
    db.prepare('INSERT INTO calls(id,ownerId,callerNumber,status,outcome,summaryText,transcriptJson,duration,createdAt) VALUES(?,?,?,?,?,?,?,?,?)').run(callId,owner,'+19025550100','COMPLETED','CALL_ENDED','[SYNTHETIC] '+owner+' gate repair',JSON.stringify([{role:'caller',text:'[SYNTHETIC] '+owner+' repair my gate.',final:true},{role:'assistant',text:'[SYNTHETIC] The estimate is $221.23.',final:true}]),120,at);
    const result={resultType:'INSTANT_QUOTE',lowEstimate:221.23,highEstimate:221.23,priceDrivers:['[SYNTHETIC] '+owner+' measured gate labor'],pricedScope:{service:'Gate repair',facts:[{label:'Gate width',value:'4 ft'}]}};
    db.prepare('INSERT INTO quotes(id,ownerId,callId,serviceType,status,resultJson,createdAt) VALUES(?,?,?,?,?,?,?)').run(recordId,owner,callId,'CUSTOM','INSTANT',JSON.stringify({voiceVersion:1,applicationOutcome:{customerResult:result,request:{customerInputs:{gateWidth:4}},internalResult:{cost:100}}}),at);
    db.prepare('INSERT INTO leads(id,ownerId,callId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(leadId,owner,callId,'[SYNTHETIC] '+owner+' Alex','+19025550100','Gate repair',JSON.stringify({voiceVersion:1,contact:{name:'[SYNTHETIC] Alex',email:owner+'@example.invalid'},address:{city:'Synthetic City'}}),'voice_lead','CAPTURED',at);
    db.prepare('INSERT INTO appointments(id,ownerId,quoteId,status,startAtUtc,endAtUtc,timezone,serviceType,createdAt) VALUES(?,?,?,?,?,?,?,?,?)').run(owner+'-booking',owner,recordId,'CONFIRMED','2026-10-08T09:00:00.000Z','2026-10-08T10:00:00.000Z','UTC','Gate repair',at);
    const intent=owner+'-intent';
    db.prepare('INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(intent,owner,owner+'-hash','lead',leadId,'synthetic-service','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-10-09T00:00:00.000Z',at);
    db.prepare('INSERT INTO appointments(id,ownerId,bookingIntentId,status,startAtUtc,createdAt) VALUES(?,?,?,?,?,?)').run(owner+'-lead-booking',owner,intent,'PENDING_CONFIRMATION','2026-10-09T09:00:00.000Z',at);
    db.prepare('INSERT INTO bookingPreferences(id,ownerId,intentId,preferredWindowsJson,customerJson,locationJson,note,status,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner+'-request',owner,intent,JSON.stringify([{date:'2026-10-10',time:'09:00'}]),'{}','{}','[SYNTHETIC] Morning request','REQUESTED',at,at);
    db.prepare('INSERT INTO quoteRequests(id,ownerId,callId,describedService,createdAt) VALUES(?,?,?,?,?)').run(owner+'-quote-request',owner,callId,'[SYNTHETIC] Gate repair',at);
    db.prepare('INSERT INTO calls(id,ownerId,status,outcome,transcriptJson,createdAt) VALUES(?,?,?,?,?,?)').run(owner+'-review-call',owner,'COMPLETED','CALL_ENDED','[]',at);
    const review=owner+'-review';
    db.prepare('INSERT INTO leads(id,ownerId,callId,collectedInputsJson,type,status,createdAt) VALUES(?,?,?,?,?,?,?)').run(review,owner,owner+'-review-call',JSON.stringify({voiceVersion:1,applicationOutcome:{customerResult:{resultType:'ESTIMATE_REQUIRES_REVIEW',customerMessage:'Request saved.'},internalResult:{reviewReason:'[SYNTHETIC] Height needs confirmation.'}}}),'quote_review','NEEDS REVIEW',at);
    db.prepare('INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(owner,owner+'-submission','digest',review,'ESTIMATE_REQUIRES_REVIEW','revision',JSON.stringify({customerInputs:{height:4},explicitUnknowns:'[SYNTHETIC] Height uncertain'}),'{}','{}',at);
    db.prepare('INSERT INTO calls(id,ownerId,status,outcome,failureCode,transcriptJson,createdAt) VALUES(?,?,?,?,?,?,?)').run(owner+'-fallback',owner,'FALLBACK','VOICE_DISABLED','VOICE_DISABLED','[]',at);
  }
  db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES('synthetic-staff','synthetic-a','staff@example.invalid','synthetic','Synthetic','Synthetic','Operator','active','UTC','staff',?)").run(at);
  // Valid SQLite foreign keys with deliberately wrong tenant ownership.
  db.prepare('INSERT INTO appointments(id,ownerId,quoteId,status,createdAt) VALUES(?,?,?,?,?)').run('foreign-booking','synthetic-b','synthetic-a-quote','CONFIRMED',at);
  db.prepare('INSERT INTO appointments(id,ownerId,quoteId,status,createdAt) VALUES(?,?,?,?,?)').run('wrong-source-booking','synthetic-a','synthetic-b-quote','CONFIRMED',at);
  db.prepare('INSERT INTO appointments(id,ownerId,bookingIntentId,status,createdAt) VALUES(?,?,?,?,?)').run('wrong-intent-booking','synthetic-a','synthetic-b-intent','CONFIRMED',at);
  const ownerQuery=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Unscoped query');return db.prepare(sql);};
  return {db,service:createOwnerCallService({ownerQuery})};
}
