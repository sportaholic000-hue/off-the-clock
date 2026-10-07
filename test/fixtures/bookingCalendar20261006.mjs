import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {migrateDatabase} from '../../server/src/migrations.js';
import {createBookingService} from '../../server/src/bookingService.js';
import {createOwnerCalendarService} from '../../server/src/ownerCalendarService.js';
import {createOwnerCallService} from '../../server/src/ownerCallService.js';

export const SECRET='[SYNTHETIC]-booking-calendar-secret-20261006';
export const LOCATION={addressLine1:'[SYNTHETIC] 1 Test Street',addressLine2:'',city:'Moncton',region:'NB',postalCode:'E1A 0A1',country:'CA'};
export const CUSTOMER={name:'[SYNTHETIC] Caller',email:'booking@example.invalid',phone:'+15065550123'};
export const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
export const providerResult=request=>({status:'CONFIRMED',eventId:request.eventId,startAtUtc:request.startAtUtc,endAtUtc:request.endAtUtc});
export function fixture(t,{now='2026-10-06T12:00:00.000Z',date='2026-10-07',timezone='America/Moncton',duration=45,window={start:'09:00',end:'12:00'}}={}) {
  const directory=mkdtempSync(join(tmpdir(),'booking-calendar-')),path=join(directory,'synthetic.sqlite');
  const db=new Database(path);db.pragma('foreign_keys = ON');db.pragma('journal_mode = WAL');migrateDatabase(db);
  let nowMs=Date.parse(now);const clock=()=>new Date(nowMs),events=new Map(),writes=[];
  const eventKey=r=>`${r.ownerId}:${r.calendarId}:${r.eventId}`;
  const calendar={idempotentCreateByEventId:true,
    async listBusy(r){return [...events.values()].filter(e=>e.ownerId===r.ownerId&&e.calendarId===r.calendarId&&e.status==='CONFIRMED'&&e.startAtUtc<r.timeMaxUtc&&e.endAtUtc>r.timeMinUtc).map(e=>({startAtUtc:e.startAtUtc,endAtUtc:e.endAtUtc}));},
    async createEvent(r){writes.push(structuredClone(r));if(!events.has(eventKey(r)))events.set(eventKey(r),{...r,...providerResult(r)});return providerResult(events.get(eventKey(r)));},
    async getEvent(r){const e=events.get(eventKey(r));return e?providerResult(e):null;}
  };
  const connections=[db];
  function service(connection=db){return createBookingService({db:connection,calendar,clock,slotTokenSecret:SECRET});}
  for(const owner of ['synthetic-a','synthetic-b']){
    db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,'[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',?,'owner',?)`).run(owner,owner+'@example.invalid','not-a-real-password',timezone,now);
    db.prepare('INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,?,?)').run(owner,JSON.stringify({serviceArea:{mode:'all',cities:[]}}),now);
    db.prepare(`INSERT INTO bookingSettings(ownerId,revision,timezone,provider,calendarId,weeklyAvailabilityJson,blackoutsJson,bookingHorizonDays,minimumNoticeMinutes,slotIncrementMinutes,bufferBeforeMinutes,bufferAfterMinutes,directBookingEnabled,updatedAt) VALUES(?,'s1',?,'google','primary',?,'[]',366,0,15,0,0,1,?)`).run(owner,timezone,JSON.stringify(Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[window]]))),now);
    db.prepare(`INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,'synthetic-service','p1','site_visit_first',?,1,?)`).run(owner,duration,now);
    db.prepare(`INSERT INTO calendarConnections(ownerId,provider,status,calendarId,createdAt,updatedAt) VALUES(?,'google','connected','primary',?,?)`).run(owner,now,now);
    db.prepare('INSERT INTO calls(id,ownerId,callerNumber,status,createdAt) VALUES(?,?,?,\'COMPLETED\',?)').run(owner+'-call',owner,CUSTOMER.phone,now);
    db.prepare('INSERT INTO quoteAccessKeys(ownerId,publicKey,allowedOriginsJson,createdAt) VALUES(?,?,?,?)').run(owner,owner,JSON.stringify(['https://synthetic.invalid']),now);
  }
  const booking=service(),ownerQuery=sql=>db.prepare(sql);
  const ownerCalendar=createOwnerCalendarService({ownerQuery,calendar,clock});
  const ownerCalls=createOwnerCallService({ownerQuery});
  function intent(ownerId='synthetic-a'){
    const sourceId=randomUUID();db.prepare('INSERT INTO quotes(id,ownerId,callId,createdAt) VALUES(?,?,?,?)').run(sourceId,ownerId,ownerId+'-call',clock().toISOString());
    return {...booking.createIntent({ownerId,sourceType:'quote',sourceId,serviceId:'synthetic-service',resultType:'INSTANT_ESTIMATE_READY',expiresAtUtc:new Date(nowMs+370*86400000).toISOString()}),ownerId};
  }
  async function slots(i,fromDate=date,b=booking){return (await b.availability({...i,filters:{fromDate,days:1,location:LOCATION}})).body.slots||[];}
  function hold(i,slot,b=booking,key=randomUUID()){return b.hold({...i,slotId:slot.slotId,idempotencyKey:key});}
  function request(i,held){return {...i,idempotencyKey:randomUUID(),body:{holdId:held.body.holdId,confirmedSlotId:held.body.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:{...CUSTOMER},location:{...LOCATION}}};}
  async function ready(i=intent()){const [slot]=await slots(i);return {i,slot,held:hold(i,slot)};}
  function restart(){const connection=new Database(path);connection.pragma('foreign_keys = ON');connections.push(connection);return service(connection);}
  t.after(()=>{for(const connection of connections)connection.close();rmSync(directory,{recursive:true,force:true});});
  return {db,path,booking,calendar,events,writes,ownerCalendar,ownerCalls,intent,slots,hold,request,ready,restart,clock,advance:ms=>{nowMs+=ms;},date};
}
