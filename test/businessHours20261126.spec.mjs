import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {db,ownerQuery} from '../server/src/db.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {saveKnowledgeBase,saveVoice,getBusinessProfile} from '../server/src/onboardingService.js';
import {createBookingAdminService} from '../server/src/bookingAdminService.js';
import {createOwnerReportService} from '../server/src/ownerReportService.js';
import {transferDecision} from '../server/src/voice/voiceSettings.js';
import {businessHoursText,knowledgeHoursText,validateBusinessHours,BUSINESS_HOURS_REQUIRED,BUSINESS_HOURS_MISSING_FOR_SYNC} from '../server/src/businessHours.js';

// One set of business hours feeds the receptionist's hours text, transfer
// hours, booking availability and the after-hours report. Transfer and booking
// can choose different hours. Synthetic owners on the shared test database.
// HANDWRITTEN EXPECTATIONS, before execution:
// - Mon–Fri 08:00–17:00, Sat 09:00–12:00, Sun closed reads
//   "Monday to Friday: 8:00 AM to 5:00 PM. Saturday: 9:00 AM to 12:00 PM. Sunday: closed.";
//   with the note "Emergency calls 24/7." it is that line, a newline, then the note;
// - a blank row, overlap, closing before opening, 24:00 and a fifth window are refused;
// - a knowledge save with the week writes the hours text; an empty week and no note is refused;
// - transfer set to follow: transfer windows become the week, and change when the week changes;
//   a call Tuesday 12:00 UTC is inside, Sunday is outside;
// - transfer set to different hours keeps its own windows when the week changes;
// - booking set to follow: availability becomes the week, now and after the week changes;
//   set to different hours keeps its own;
// - following before any business hours exist is refused with the "Set your business hours" message;
// - the report reads the business hours;
// - a save without the week (older clients) keeps the saved week and the text as sent.
const WEEK={mon:[{start:'08:00',end:'17:00'}],tue:[{start:'08:00',end:'17:00'}],wed:[{start:'08:00',end:'17:00'}],thu:[{start:'08:00',end:'17:00'}],fri:[{start:'08:00',end:'17:00'}],sat:[{start:'09:00',end:'12:00'}],sun:[]};
const LATER={...WEEK,mon:[{start:'07:00',end:'12:00'},{start:'13:00',end:'18:00'}]};
const TEXT='Monday to Friday: 8:00 AM to 5:00 PM. Saturday: 9:00 AM to 12:00 PM. Sunday: closed.';
const base={voiceId:'female',agentName:'Synthetic',greeting:'[SYNTHETIC] Thanks for calling.'};
const knowledge=(extra={})=>({about:'[SYNTHETIC] Fence installer',services:'',policies:'',faqs:'',prices:'',neverSay:[],reviewContact:{name:'Pat',role:'owner'},fromSettings:true,...extra});
let n=0;
function owner(){
  migrateDatabase(db);const id='synthetic-hours-'+(++n)+'-'+Date.now(),created=new Date().toISOString();
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Fence','Operator','active','UTC','owner',?)").run(id,id+'@example.invalid',created);
  const line=String(1000000+n*97+Date.now()%900000).slice(-7);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,existingPhoneNumber,twilioNumber,updatedAt) VALUES(?,'{}',?,?,?)").run(id,'+1902'+line,'+1782'+line,created);
  return id;
}
const kb=id=>JSON.parse(db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(id).knowledgeBaseJson);
const availability=id=>JSON.parse(db.prepare('SELECT weeklyAvailabilityJson FROM bookingSettings WHERE ownerId=?').get(id).weeklyAvailabilityJson);
const booking=()=>createBookingAdminService({db,loadServiceCatalog:()=>({services:[]})});
const settingsBody={timezone:'UTC',blackouts:[],bookingHorizonDays:30,minimumNoticeMinutes:60,slotIncrementMinutes:30,bufferBeforeMinutes:0,bufferAfterMinutes:0,directBookingEnabled:false};

test('hours text groups days with the same hours and adds the note on its own line',()=>{
  assert.equal(businessHoursText(validateBusinessHours(WEEK)),TEXT);
  assert.equal(knowledgeHoursText(WEEK,' Emergency calls 24/7. '),TEXT+'\nEmergency calls 24/7.');
  assert.equal(businessHoursText(validateBusinessHours({...WEEK,sat:[],sun:[{start:'00:00',end:'23:59'}]})),'Monday to Friday: 8:00 AM to 5:00 PM. Saturday: closed. Sunday: open 24 hours.');
  assert.equal(businessHoursText(validateBusinessHours(LATER)).split('. ')[0],'Monday: 7:00 AM to 12:00 PM and 1:00 PM to 6:00 PM');
  assert.equal(knowledgeHoursText({mon:[]},'By appointment only.'),'By appointment only.');
  assert.equal(businessHoursText(validateBusinessHours({...WEEK,sat:[]})),'Monday to Friday: 8:00 AM to 5:00 PM. Saturday and Sunday: closed.');
});
test('business hours refuse blank, overlapping, backwards, 24:00 and too many windows',()=>{
  for(const [label,week,pattern] of [
    ['blank',{mon:[{start:'',end:'17:00'}]},/Enter an opening and closing time for Monday/],
    ['overlap',{tue:[{start:'08:00',end:'12:00'},{start:'11:00',end:'13:00'}]},/Tuesday hours must not overlap/],
    ['backwards',{wed:[{start:'17:00',end:'09:00'}]},/Wednesday closing time must be after the opening time/],
    ['24:00',{thu:[{start:'08:00',end:'24:00'}]},/Thursday hours must use times like 08:00/],
    ['five windows',{fri:['01','03','05','07','09'].map(h=>({start:h+':00',end:h+':30'}))},/Friday can have at most 4/]
  ])assert.throws(()=>validateBusinessHours(week),error=>error.statusCode===400&&pattern.test(error.message),label);
});

test('knowledge save writes the hours text from the week; an empty week with no note is refused',()=>{
  const id=owner();
  saveKnowledgeBase(id,knowledge({weeklyHours:WEEK,hoursNote:'Emergency calls 24/7.'}));
  const saved=kb(id);
  assert.deepEqual(saved.weeklyHours,validateBusinessHours(WEEK));
  assert.equal(saved.hours,TEXT+'\nEmergency calls 24/7.');
  assert.throws(()=>saveKnowledgeBase(id,knowledge({weeklyHours:{},hoursNote:''})),error=>error.message===BUSINESS_HOURS_REQUIRED);
  // Older clients send only text: the saved week stays.
  saveKnowledgeBase(id,knowledge({hours:'[SYNTHETIC] Weekdays'}));
  assert.deepEqual(kb(id).weeklyHours,validateBusinessHours(WEEK));assert.equal(kb(id).hours,'[SYNTHETIC] Weekdays');
});

test('transfer hours follow business hours, or keep their own',()=>{
  const id=owner();
  assert.throws(()=>saveVoice(id,{...base,fromSettings:true,transferNumber:'+19025550188',transferUsesBusinessHours:true}),error=>error.statusCode===400&&error.message===BUSINESS_HOURS_MISSING_FOR_SYNC);
  saveKnowledgeBase(id,knowledge({weeklyHours:WEEK,hoursNote:''}));
  saveVoice(id,{...base,fromSettings:true,transferNumber:'+19025550188',transferUsesBusinessHours:true});
  assert.equal(kb(id).transferUsesBusinessHours,true);assert.deepEqual(kb(id).transferWindows,validateBusinessHours(WEEK));
  // 2026-10-06T12:00Z is a Tuesday; 2026-10-11T12:00Z a Sunday.
  assert.equal(transferDecision(db,id,new Date('2026-10-06T12:00:00Z')).allowed,true);
  assert.equal(transferDecision(db,id,new Date('2026-10-11T12:00:00Z')).allowed,false);
  saveKnowledgeBase(id,knowledge({weeklyHours:LATER,hoursNote:''}));
  assert.deepEqual(kb(id).transferWindows,validateBusinessHours(LATER),'changed with the business hours');
  assert.equal(transferDecision(db,id,new Date('2026-10-05T12:30:00Z')).allowed,false,'Monday lunch is now closed');
  const own={mon:[{start:'10:00',end:'11:00'}],tue:[],wed:[],thu:[],fri:[],sat:[],sun:[]};
  saveVoice(id,{...base,fromSettings:true,transferNumber:'+19025550188',transferUsesBusinessHours:false,transferWindows:own});
  saveKnowledgeBase(id,knowledge({weeklyHours:WEEK,hoursNote:''}));
  assert.equal(kb(id).transferUsesBusinessHours,false);assert.deepEqual(kb(id).transferWindows.mon,own.mon,'own transfer hours kept');
  assert.equal(getBusinessProfile(id).knowledgeBase.hours,TEXT);
});

test('booking availability follows business hours, or keeps its own',()=>{
  const id=owner(),service=booking();
  assert.throws(()=>service.updateSettings({ownerId:id,body:{...settingsBody,weeklyAvailability:WEEK,usesBusinessHours:true}}),error=>error.statusCode===400&&error.message===BUSINESS_HOURS_MISSING_FOR_SYNC);
  saveKnowledgeBase(id,knowledge({weeklyHours:WEEK,hoursNote:''}));
  const empty={sun:[],mon:[],tue:[],wed:[],thu:[],fri:[],sat:[]};
  const configuration=service.updateSettings({ownerId:id,body:{...settingsBody,weeklyAvailability:empty,usesBusinessHours:true}});
  assert.deepEqual(configuration.businessHours,{weeklyHours:validateBusinessHours(WEEK),usesBusinessHours:true});
  assert.deepEqual(availability(id).mon,WEEK.mon);assert.deepEqual(availability(id).sun,[]);
  const revision=db.prepare('SELECT revision FROM bookingSettings WHERE ownerId=?').get(id).revision;
  saveKnowledgeBase(id,knowledge({weeklyHours:LATER,hoursNote:''}));
  assert.deepEqual(availability(id).mon,LATER.mon,'changed with the business hours');
  assert.notEqual(db.prepare('SELECT revision FROM bookingSettings WHERE ownerId=?').get(id).revision,revision);
  const own={...empty,wed:[{start:'10:00',end:'14:00'}]};
  service.updateSettings({ownerId:id,body:{...settingsBody,weeklyAvailability:own,usesBusinessHours:false}});
  saveKnowledgeBase(id,knowledge({weeklyHours:WEEK,hoursNote:''}));
  assert.deepEqual(availability(id),own,'own availability kept');assert.equal(kb(id).bookingUsesBusinessHours,false);
  // A save without the choice (older clients) leaves it as it was.
  service.updateSettings({ownerId:id,body:{...settingsBody,weeklyAvailability:own}});assert.equal(kb(id).bookingUsesBusinessHours,false);
  assert.throws(()=>service.updateSettings({ownerId:id,body:{...settingsBody,weeklyAvailability:own,usesBusinessHours:'yes'}}),error=>error.statusCode===400);
});

// 2026-11-26: an owner whose transfers and booking follow business hours clears the
// week and describes the hours only in the note. Before the fix both followed the
// empty week: no transfer was ever allowed and no time could be booked, with no notice.
// HANDWRITTEN EXPECTATIONS, before execution:
// - the note-only save is accepted and the hours text is the note;
// - transfers keep Mon–Fri 08:00–17:00 as their own hours (Tuesday 12:00 UTC still
//   transfers) and transferUsesBusinessHours is false;
// - booking keeps the same availability as its own and bookingUsesBusinessHours is false;
// - a later week is not followed until the owner chooses that again.
test('a note-only week leaves transfers and booking on the hours they had, as their own',()=>{
  const id=owner(),service=booking(),empty={sun:[],mon:[],tue:[],wed:[],thu:[],fri:[],sat:[]};
  saveKnowledgeBase(id,knowledge({weeklyHours:WEEK,hoursNote:''}));
  saveVoice(id,{...base,fromSettings:true,transferNumber:'+19025550188',transferUsesBusinessHours:true});
  service.updateSettings({ownerId:id,body:{...settingsBody,weeklyAvailability:empty,usesBusinessHours:true}});
  const tuesdayNoon=new Date('2026-10-06T12:00:00Z'),revision=db.prepare('SELECT revision FROM bookingSettings WHERE ownerId=?').get(id).revision;
  saveKnowledgeBase(id,knowledge({weeklyHours:{},hoursNote:'By appointment only.'}));
  const saved=kb(id);
  assert.equal(saved.hours,'By appointment only.');
  assert.equal(saved.transferUsesBusinessHours,false);assert.deepEqual(saved.transferWindows,validateBusinessHours(WEEK));
  assert.equal(transferDecision(db,id,tuesdayNoon).allowed,true,'transfers keep the hours they had');
  assert.equal(saved.bookingUsesBusinessHours,false);assert.deepEqual(availability(id).mon,WEEK.mon);assert.deepEqual(availability(id).sat,WEEK.sat);
  assert.equal(db.prepare('SELECT revision FROM bookingSettings WHERE ownerId=?').get(id).revision,revision,'booking settings untouched');
  assert.deepEqual(service.getConfiguration({ownerId:id}).businessHours,{weeklyHours:null,usesBusinessHours:false});
  saveKnowledgeBase(id,knowledge({weeklyHours:LATER,hoursNote:''}));
  assert.deepEqual(kb(id).transferWindows,validateBusinessHours(WEEK),'not followed again without the owner choosing it');
  assert.deepEqual(availability(id).mon,WEEK.mon);
});

test('the after-hours report reads the business hours',()=>{
  const id=owner(),reports=createOwnerReportService({ownerQuery});
  assert.equal(reports.settings(id).weeklyHours,null);
  saveKnowledgeBase(id,knowledge({weeklyHours:WEEK,hoursNote:''}));
  const settings=reports.settings(id);
  assert.equal(settings.source,'business');assert.deepEqual(settings.weeklyHours.sat,WEEK.sat);assert.deepEqual(Object.keys(settings.weeklyHours).sort(),['fri','mon','sat','sun','thu','tue','wed']);
});
