import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';
import {operatorOffRouting} from '../server/src/voice/operatorOffRouting.js';

test('dashboard off-state copy agrees with verified inbound routing and exposes phone setup when unconfirmed',async t=>{
  const f=await application(t),ownerId='synthetic-a';
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());
  const {OperatorOffBanner}=await vite.ssrLoadModule('/src/dashboard.jsx');
  const {RecordCard}=await vite.ssrLoadModule('/src/calendar.jsx');
  const record={id:'SYNTHETIC-calendar-outcome',serviceType:'SYNTHETIC',bookingMode:'site_visit_first',customer:{name:'[SYNTHETIC] Caller'},location:{},
    startAtUtc:'2026-11-01T13:00:00.000Z',endAtUtc:'2026-11-01T13:45:00.000Z'};
  for(const [status,action,expected] of [['PENDING','reschedule',/Requested new time/],['REJECTED','cancel',/original appointment remains confirmed/],['CONFIRMED','reschedule',/confirmed the new appointment time/],['CONFIRMED','cancel',/confirmed the cancellation/]]){
    const html=renderToStaticMarkup(React.createElement(RecordCard,{record:{...record,status:status==='PENDING'?'PENDING_CONFIRMATION':action==='cancel'&&status==='CONFIRMED'?'CANCELLED':'CONFIRMED',
      change:{status,action,newSlot:{startAtUtc:'2026-11-01T14:00:00.000Z',endAtUtc:'2026-11-01T14:45:00.000Z'}}},timezone:'America/Moncton'}));
    assert.match(html,expected);assert.doesNotMatch(html,/This appointment has not been confirmed/);
  }
  for(const scenario of [
    {label:'carrier updated, no pending operation',carrier:'updated',confirmed:true},
    {label:'carrier queued',carrier:'queued',confirmed:false},
    {label:'carrier not started',carrier:'not_started',confirmed:false},
    {label:'off confirmed and idle',carrier:'updated',coverage:{confirmedEnabled:0,phase:'idle'},confirmed:true},
    {label:'on still confirmed',carrier:'updated',coverage:{confirmedEnabled:1,phase:'idle'},confirmed:false},
    {label:'coverage applying',carrier:'updated',coverage:{confirmedEnabled:0,phase:'applying'},confirmed:false},
    {label:'coverage ambiguous',carrier:'updated',coverage:{confirmedEnabled:0,phase:'unknown'},confirmed:false},
    {label:'business number missing',carrier:'updated',number:null,confirmed:false},
    {label:'business number loops to forwarding number',carrier:'updated',number:'+15065550124',confirmed:false},
    {label:'configured on but unavailable',carrier:'updated',enabled:1,confirmed:false}
  ]){
    const number=Object.hasOwn(scenario,'number')?scenario.number:'+15065550123',enabled=scenario.enabled??0;
    f.db.prepare('UPDATE businessProfiles SET carrierSetupStatus=?,existingPhoneNumber=?,twilioNumber=?,operatorEnabled=? WHERE ownerId=?')
      .run(scenario.carrier,number,'+15065550124',enabled,ownerId);
    f.db.prepare('DELETE FROM operatorCoverageOperations WHERE ownerId=?').run(ownerId);
    if(scenario.coverage){
      const {confirmedEnabled,phase}=scenario.coverage,active=phase!=='idle';
      f.db.prepare(`INSERT INTO operatorCoverageOperations(ownerId,desiredEnabled,confirmedEnabled,phase,carrierStatus,createdAt,updatedAt,
        activeOperationId,activeEnabled,activeRevision,activeExistingNumber,activeTwilioNumber) VALUES(?,0,?,?,'updated',0,0,?,?,?,?,?)`)
        .run(ownerId,confirmedEnabled,phase,active?'[SYNTHETIC]-routing-operation':null,active?0:null,active?1:null,active?'+15065550123':null,active?'+15065550124':null);
    }
    const dashboard=await f.request('/api/dashboard');assert.equal(dashboard.status,200,scenario.label);
    assert.equal(dashboard.body.operator.offRouting.confirmed,scenario.confirmed,scenario.label);
    assert.equal(dashboard.body.operator.offRouting.setupStep,4);
    const onboarding=await f.request('/api/onboarding/state');assert.deepEqual(onboarding.body.operator.offRouting,dashboard.body.operator.offRouting);
    const route=operatorOffRouting({profile:{operatorEnabled:enabled,carrierSetupStatus:scenario.carrier,existingPhoneNumber:number},coverage:scenario.coverage,destinationNumber:'+15065550124'});
    assert.equal(route?.mode==='forward',scenario.confirmed,scenario.label);
    const html=renderToStaticMarkup(React.createElement(OperatorOffBanner,{routing:dashboard.body.operator.offRouting}));
    if(scenario.confirmed){assert.match(html,/ring your phone/);assert.doesNotMatch(html,/Finish phone setup/);}
    else{assert.match(html,/cannot be routed to your phone yet/);assert.match(html,/Finish phone setup/);assert.doesNotMatch(html,/ring your phone/);}
    assert.equal((await f.request('/api/dashboard',{owner:'synthetic-b'})).body.operator.offRouting.confirmed,false);
  }
});
