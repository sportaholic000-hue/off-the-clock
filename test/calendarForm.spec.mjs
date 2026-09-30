import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingForm,settingsPayload,changeFormTimezone,blackoutForForm,blackoutValues} from '../client/src/calendarForm.js';

const configuration={owner:{timezone:'America/Halifax'},settings:{timezone:'America/Halifax',weeklyAvailability:{mon:[{start:'09:00',end:'17:00'}]},blackouts:[],bookingHorizonDays:14,minimumNoticeMinutes:0,slotIncrementMinutes:30,bufferBeforeMinutes:15,bufferAfterMinutes:30,directBookingEnabled:true}};
test('New owner fields remain blank instead of becoming invented availability',()=>{
 const form=bookingForm({owner:{timezone:'UTC'},settings:null});
 for(const key of ['bookingHorizonDays','minimumNoticeMinutes','slotIncrementMinutes','bufferBeforeMinutes','bufferAfterMinutes'])assert.equal(form[key],'');
 assert.equal(Object.values(form.weeklyAvailability).flat().length,0);
 assert.throws(()=>settingsPayload(form),/whole number/);
});
test('Saved settings round trip with zero notice and independent working-hour edits',()=>{
 const form=bookingForm(configuration),payload=settingsPayload(form);
 assert.equal(payload.minimumNoticeMinutes,0);assert.equal(payload.bufferBeforeMinutes,15);assert.equal(payload.bufferAfterMinutes,30);
 form.weeklyAvailability.mon[0].start='11:00';assert.equal(configuration.settings.weeklyAvailability.mon[0].start,'09:00');
 assert.throws(()=>settingsPayload({...form,slotIncrementMinutes:'1.5'}),/whole number/);
 assert.throws(()=>settingsPayload({...form,minimumNoticeMinutes:''}),/whole number/);
});
test('Unchanged blackout keeps exact seconds and absolute instant through timezone changes',()=>{
 const row={startAtUtc:'2026-10-01T15:12:45.123Z',endAtUtc:'2026-10-01T16:13:46.456Z'};
 const form={...bookingForm(configuration),blackouts:[blackoutForForm(row,'America/Halifax')]};
 assert.equal(form.blackouts[0].startLocal,'2026-10-01T12:12');
 assert.deepEqual(settingsPayload(form).blackouts,[row]);
 const changed=changeFormTimezone(form,'America/Vancouver');assert.equal(changed.blackouts[0].startLocal,'2026-10-01T08:12');
 assert.deepEqual(settingsPayload(changed).blackouts,[row]);
});
test('Edited blackout uses the business timezone rather than the browser timezone',()=>{
 const result=blackoutValues([{startLocal:'2026-10-01T12:00',endLocal:'2026-10-01T13:00'}],'America/Halifax');
 assert.deepEqual(result,[{startAtUtc:'2026-10-01T15:00:00.000Z',endAtUtc:'2026-10-01T16:00:00.000Z'}]);
});
test('Clock-change gaps and repeated local times require an editable correction',()=>{
 for(const time of ['2026-03-08T02:30','2026-11-01T01:30'])assert.throws(()=>blackoutValues([{startLocal:time,endLocal:time}],'America/Halifax'),/skipped or repeated/);
 assert.throws(()=>blackoutValues([{startLocal:'',endLocal:''}],'UTC'),/start and end/);
 const row={startAtUtc:'2026-11-01T04:30:00.000Z',endAtUtc:'2026-11-01T06:30:00.000Z'};
 assert.deepEqual(blackoutValues([blackoutForForm(row,'America/Halifax')],'America/Halifax'),[row]);
});
