import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';

test('dashboard shows phone forwarding instructions and never a dashboard on/off switch',async t=>{
  const f=await application(t),ownerId='synthetic-a';
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());
  const {ForwardingSetupBanner}=await vite.ssrLoadModule('/src/dashboard.jsx');
  const html=renderToStaticMarkup(React.createElement(ForwardingSetupBanner));
  assert.match(html,/forwarding on your business phone/);
  assert.match(html,/Forwarding setup/);
  assert.doesNotMatch(html,/Operator is off|cannot be routed|role="switch"/);
  for(const enabled of [0,1]){
    f.db.prepare('UPDATE businessProfiles SET operatorEnabled=? WHERE ownerId=?').run(enabled,ownerId);
    const dashboard=await f.request('/api/dashboard');
    const onboarding=await f.request('/api/onboarding/state');
    assert.equal(dashboard.status,200);
    assert.equal(dashboard.body.operator.enabled,onboarding.body.operator.enabled);
    assert.equal(dashboard.body.operator.enabled,Boolean(dashboard.body.operator.eligible));
    assert.equal(dashboard.body.operator.offRouting,undefined);
  }
  assert.equal((await fetch(f.base+'/api/operator/toggle',{method:'POST',headers:{authorization:'Bearer '+f.tokens[ownerId]}})).status,404);
});

test('onboarding status does not claim a configured but expired account is ready to answer',async t=>{
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());
  const {StepRail}=await vite.ssrLoadModule('/src/onboarding.jsx');
  const profile={phoneProvisioningStatus:'provisioned',twilioNumberSid:'PN_SYNTHETIC',knowledgeBase:{about:'[SYNTHETIC] business',hours:'[SYNTHETIC] hours'}};
  const expired=renderToStaticMarkup(React.createElement(StepRail,{step:6,state:{profile,operator:{eligible:false}},onJump:()=>{}}));
  assert.match(expired,/Not live yet/);assert.doesNotMatch(expired,/Ready to answer/);
  const active=renderToStaticMarkup(React.createElement(StepRail,{step:6,state:{profile,operator:{eligible:true}},onJump:()=>{}}));
  assert.match(active,/Ready to answer/);
});

test('empty dashboard call feed describes forwarding and has no dashboard on instruction',()=>{
  const source=readFileSync(new URL('../client/src/dashboard.jsx',import.meta.url),'utf8');
  assert.match(source,/Calls answered at your receptionist number will appear here\./);
  assert.match(source,/Once your account and receptionist setup are ready, forwarded calls will appear here\./);
  assert.doesNotMatch(source,/Your operator is on\. Answered calls will appear here\.|Turn the operator on to start handling calls\./);
  const onboarding=readFileSync(new URL('../client/src/onboarding.jsx',import.meta.url),'utf8');
  assert.match(onboarding,/Set up your receptionist\./);
  assert.doesNotMatch(onboarding,/Put your operator on the line\./);
});

test('calendar still renders saved appointment changes with accurate confirmation copy',async t=>{
  await application(t);
  const vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});t.after(()=>vite.close());
  const {RecordCard}=await vite.ssrLoadModule('/src/calendar.jsx');
  const record={id:'SYNTHETIC-calendar-outcome',serviceType:'SYNTHETIC',bookingMode:'site_visit_first',customer:{name:'[SYNTHETIC] Caller'},location:{},
    startAtUtc:'2026-11-01T13:00:00.000Z',endAtUtc:'2026-11-01T13:45:00.000Z'};
  for(const [status,action,expected] of [['PENDING','reschedule',/Requested new time/],['REJECTED','cancel',/original appointment remains confirmed/],['CONFIRMED','reschedule',/confirmed the new appointment time/],['CONFIRMED','cancel',/confirmed the cancellation/]]){
    const markup=renderToStaticMarkup(React.createElement(RecordCard,{record:{...record,status:status==='PENDING'?'PENDING_CONFIRMATION':action==='cancel'&&status==='CONFIRMED'?'CANCELLED':'CONFIRMED',
      change:{status,action,newSlot:{startAtUtc:'2026-11-01T14:00:00.000Z',endAtUtc:'2026-11-01T14:45:00.000Z'}}},timezone:'America/Moncton'}));
    assert.match(markup,expected);assert.doesNotMatch(markup,/This appointment has not been confirmed/);
  }
});
